import type { Fragment, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState } from '@tiptap/pm/state'
import {
  isLocalImeLocalWindowCapableDoc,
  isLocalImeLocalWindowCapableParagraph,
} from './localImeLocalWindowCapability'
import { resolveLocalImeLocalWindowCaretCapability } from './localImeLocalWindowCaretCapability'

/**
 * LOCAL-WINDOW-BOUNDED1 sizing authority.
 *
 * 1135 x 829 CSS px の focused fixture では、短い paragraph が 30--31件、
 * 608px 幅の長文を含む場合が15件、marks / link / Ruby / TCY を含むfixtureが
 * 24件 viewport と交差した。全件を local PM へ複製せず、通常の連続入力に十分な
 * 12 block を capture 上限、そこから 50% の split 余裕を持つ18 blockをgrowth
 * hard capとする。minimum 3はP0互換、fallback 9はviewport proofが得られない
 * 場合にもfixed-3より広い保守的working setを与える。
 */
export const LOCAL_IME_LOCAL_WINDOW_MIN_BLOCKS = 3 as const
export const LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS = 12 as const
export const LOCAL_IME_LOCAL_WINDOW_GROWTH_HARD_CAP = 18 as const
export const LOCAL_IME_LOCAL_WINDOW_MEASURED_FALLBACK_BLOCKS = 9 as const

export type LocalImeLocalWindowAcquisitionMode =
  | 'viewport-relative'
  | 'measured-fixed-fallback'

export type LocalImeLocalWindowCapturePlan = {
  readonly mode: LocalImeLocalWindowAcquisitionMode
  readonly startIndex: number
  readonly endIndex: number
  readonly currentIndex: number
  readonly viewportIntersectingBlockCount: number
  readonly logicalGuardCount: number
}

export type LocalImeLocalWindowRange = { from: number; to: number }

export type LocalImeLocalWindowCapture = {
  range: LocalImeLocalWindowRange
  startIndex: number
  originalFragment: Fragment
  localDoc: ProseMirrorNode
  localSelection: TextSelection
  plan: LocalImeLocalWindowCapturePlan
}

export type LocalImeLocalWindowBase<DomProof> = {
  documentIdentity: string
  controllerGeneration: number
  hostContentGeneration: number
  hostDoc: ProseMirrorNode
  range: LocalImeLocalWindowRange
  originalFragment: Fragment
  domProof: DomProof
}

export type LocalImeLocalWindowCaptureResult =
  | { ok: true; capture: LocalImeLocalWindowCapture }
  | {
      ok: false
      reason:
        | 'selection-kind'
        | 'selection-depth'
        | 'selection-not-collapsed'
        | 'special-inline-caret'
        | 'stored-marks'
        | 'paragraph-count'
        | 'paragraph-shape'
        | 'selection-outside-window'
        | 'selection-map'
    }


export function listLocalImeLocalWindowTopLevelRanges(
  doc: ProseMirrorNode,
): LocalImeLocalWindowRange[] {
  const ranges: LocalImeLocalWindowRange[] = []
  doc.forEach((node, offset) => ranges.push({ from: offset, to: offset + node.nodeSize }))
  return ranges
}

export function resolveLocalImeLocalWindowBlockIndex(
  doc: ProseMirrorNode,
  pos: number,
): number | null {
  const ranges = listLocalImeLocalWindowTopLevelRanges(doc)
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]
    if (pos >= range.from && pos <= range.to) return index
  }
  return null
}

function clampCenteredRange(input: {
  start: number
  end: number
  current: number
  maximum: number
}): { start: number; end: number } {
  const available = input.end - input.start + 1
  if (available <= input.maximum) return { start: input.start, end: input.end }
  const before = Math.floor((input.maximum - 1) / 2)
  let start = input.current - before
  let end = start + input.maximum - 1
  if (start < input.start) {
    start = input.start
    end = start + input.maximum - 1
  }
  if (end > input.end) {
    end = input.end
    start = end - input.maximum + 1
  }
  return { start, end }
}

/**
 * PM index / capability / viewport交差boolだけでbounded rangeを決めるpure planner。
 * DOM identityとrectの取得はDOM proof側に残し、座標からPM positionを逆算しない。
 */
export function planLocalImeLocalWindowCapture(input: {
  currentIndex: number
  eligibleBlocks: readonly boolean[]
  viewportIntersectingBlocks: readonly boolean[] | null
}): LocalImeLocalWindowCapturePlan | null {
  const { currentIndex, eligibleBlocks } = input
  if (
    currentIndex < 0 || currentIndex >= eligibleBlocks.length ||
    eligibleBlocks[currentIndex] !== true ||
    input.viewportIntersectingBlocks !== null &&
      input.viewportIntersectingBlocks.length !== eligibleBlocks.length
  ) return null

  let runStart = currentIndex
  let runEnd = currentIndex
  while (runStart > 0 && eligibleBlocks[runStart - 1]) runStart -= 1
  while (runEnd + 1 < eligibleBlocks.length && eligibleBlocks[runEnd + 1]) runEnd += 1

  const viewport = input.viewportIntersectingBlocks
  const currentIntersects = viewport?.[currentIndex] === true
  if (!viewport || !currentIntersects) {
    const fixed = clampCenteredRange({
      start: runStart,
      end: runEnd,
      current: currentIndex,
      maximum: LOCAL_IME_LOCAL_WINDOW_MEASURED_FALLBACK_BLOCKS,
    })
    return {
      mode: 'measured-fixed-fallback',
      startIndex: fixed.start,
      endIndex: fixed.end,
      currentIndex,
      viewportIntersectingBlockCount: 0,
      logicalGuardCount: 0,
    }
  }

  const visible: number[] = []
  for (let index = runStart; index <= runEnd; index += 1) {
    if (viewport[index]) visible.push(index)
  }
  if (visible.length === 0) return null
  const visibleStart = Math.min(currentIndex, visible[0]!)
  const visibleEnd = Math.max(currentIndex, visible[visible.length - 1]!)
  // 前後guard 1件ぶんを先に予約し、viewport coreが上限を独占しないようにする。
  const coreMaximum = Math.max(1, LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS - 2)
  const core = clampCenteredRange({
    start: visibleStart,
    end: visibleEnd,
    current: currentIndex,
    maximum: coreMaximum,
  })
  let start = core.start
  let end = core.end
  let logicalGuardCount = 0
  if (start > runStart) { start -= 1; logicalGuardCount += 1 }
  if (end < runEnd) { end += 1; logicalGuardCount += 1 }

  const naturalSize =
    Math.min(runEnd, visibleEnd + 1) - Math.max(runStart, visibleStart - 1) + 1
  const desiredSize = Math.min(
    LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS,
    runEnd - runStart + 1,
    Math.max(LOCAL_IME_LOCAL_WINDOW_MIN_BLOCKS, naturalSize),
  )
  // 文書端で片側guardが存在しない場合は、存在する側へ決定的に寄せる。
  while (end - start + 1 < desiredSize) {
    if (end < runEnd) end += 1
    else if (start > runStart) start -= 1
    else break
  }
  const viewportIntersectingBlockCount = viewport
    .slice(start, end + 1)
    .filter(Boolean).length
  return {
    mode: 'viewport-relative',
    startIndex: start,
    endIndex: end,
    currentIndex,
    viewportIntersectingBlockCount,
    logicalGuardCount,
  }
}

/** bounded planの連続eligible paragraphをlocal PMへlossless captureする。 */
export function captureLocalImeLocalWindow(
  state: EditorState,
  requestedPlan?: LocalImeLocalWindowCapturePlan,
): LocalImeLocalWindowCaptureResult {
  // LOCAL-WINDOW-SPECIALINLINE1: document capabilityとは別のposition-aware判定。
  // Ruby / TCYが同じparagraphに居るだけでは拒否せず、内部 / NodeSelection /
  // exactな直前・直後だけをfail-closedにする。
  const caret = resolveLocalImeLocalWindowCaretCapability(state)
  if (!caret.safe) {
    if (caret.reason === 'selection-kind' || caret.reason === 'node-selection') {
      return { ok: false, reason: 'selection-kind' }
    }
    if (caret.reason === 'selection-depth') return { ok: false, reason: 'selection-depth' }
    if (caret.reason === 'selection-not-collapsed') {
      return { ok: false, reason: 'selection-not-collapsed' }
    }
    return { ok: false, reason: 'special-inline-caret' }
  }
  if (!(state.selection instanceof TextSelection)) return { ok: false, reason: 'selection-kind' }
  if ((state.storedMarks?.length ?? 0) !== 0) return { ok: false, reason: 'stored-marks' }
  const currentIndex = resolveLocalImeLocalWindowBlockIndex(state.doc, state.selection.head)
  if (currentIndex === null) return { ok: false, reason: 'selection-depth' }
  const eligibleBlocks = Array.from(
    { length: state.doc.childCount },
    (_, index) => isLocalImeLocalWindowCapableParagraph(state.doc.child(index)),
  )
  if (!eligibleBlocks[currentIndex]) return { ok: false, reason: 'paragraph-shape' }
  const plan = requestedPlan ?? planLocalImeLocalWindowCapture({
    currentIndex,
    eligibleBlocks,
    viewportIntersectingBlocks: null,
  })
  if (
    !plan || plan.currentIndex !== currentIndex ||
    plan.startIndex < 0 || plan.endIndex >= state.doc.childCount ||
    plan.startIndex > currentIndex || plan.endIndex < currentIndex ||
    plan.endIndex - plan.startIndex + 1 > LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS
  ) return { ok: false, reason: 'paragraph-count' }
  const startIndex = plan.startIndex
  const ranges = listLocalImeLocalWindowTopLevelRanges(state.doc)
  const range = {
    from: ranges[startIndex].from,
    to: ranges[plan.endIndex].to,
  }
  for (let index = startIndex; index <= plan.endIndex; index += 1) {
    if (!eligibleBlocks[index]) {
      return { ok: false, reason: 'paragraph-shape' }
    }
  }
  if (state.selection.from < range.from || state.selection.to > range.to) {
    return { ok: false, reason: 'selection-outside-window' }
  }
  const originalFragment = state.doc.slice(range.from, range.to).content
  const localDoc = state.schema.topNodeType.create(null, originalFragment)
  // capture時とcommit時で契約が分岐しないよう、組み上げたlocal doc全体も同じ述語で再検証する。
  if (!isLocalImeLocalWindowCapableDoc(localDoc)) return { ok: false, reason: 'paragraph-shape' }
  try {
    const localSelection = TextSelection.create(
      localDoc,
      state.selection.anchor - range.from,
      state.selection.head - range.from,
    )
    return {
      ok: true,
      capture: { range, startIndex, originalFragment, localDoc, localSelection, plan },
    }
  } catch {
    return { ok: false, reason: 'selection-map' }
  }
}

export function proveLocalImeLocalWindowBaseIsCurrent<DomProof>(input: {
  base: LocalImeLocalWindowBase<DomProof>
  hostState: EditorState
  documentIdentity: string
  controllerGeneration: number
  hostContentGeneration: number
  validateDomProof: () => boolean
}): boolean {
  const { base } = input
  if (base.documentIdentity !== input.documentIdentity) return false
  if (base.controllerGeneration !== input.controllerGeneration) return false
  if (base.hostContentGeneration !== input.hostContentGeneration) return false
  if (base.hostDoc !== input.hostState.doc) return false
  let current: Fragment
  try {
    current = input.hostState.doc.slice(base.range.from, base.range.to).content
  } catch {
    return false
  }
  return current.eq(base.originalFragment) && input.validateDomProof()
}
