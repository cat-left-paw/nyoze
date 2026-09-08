import { Selection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

type LogPush = (event: string, detail: string) => void

export type PageUpDownDirection = 'pageUp' | 'pageDown'
export type PageUpDownWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'
export type PageUpDownAxis = 'vertical' | 'horizontal'

type ScrollHost = HTMLElement & {
  scrollTop: number
  scrollLeft: number
  clientHeight: number
  clientWidth: number
  scrollHeight: number
  scrollWidth: number
}

type TargetPoint = {
  left: number
  top: number
}

type PageScrollPlan = {
  axis: PageUpDownAxis
  currentOffset: number
  targetOffset: number
  delta: number
  viewportSpan: number
}

export type PageUpDownNavigationScrollOffset = {
  readonly scrollTop: number
  readonly scrollLeft: number
}

export type PageUpDownNavigationCommandPlan = {
  readonly expectedDoc: ProseMirrorNode
  readonly expectedSelection: Selection
  readonly expectedTransactionCount: 0 | 1
  readonly expectedScrollOffset: PageUpDownNavigationScrollOffset
  readonly moved: boolean
  readonly boundaryNoop: boolean
}

export type PageUpDownNavigationCommandResult =
  | ({ readonly handled: true } & PageUpDownNavigationCommandPlan)
  | { readonly handled: false }

type HandlePageUpDownKeyOptions = {
  getIsComposing: () => boolean
  pushLog: LogPush
  /** test / typed handoff用。production既定は常に `view.dispatch()`。 */
  dispatchTransaction?: (transaction: Transaction) => void
}

function isBarePageKey(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function midpoint(start: number, end: number): number {
  return start + (end - start) / 2
}

function clampToRect(value: number, start: number, end: number): number {
  const min = start + 1
  const max = end - 1
  if (!Number.isFinite(value)) return midpoint(start, end)
  if (max < min) return midpoint(start, end)
  return clamp(value, min, max)
}

/** 通常PMと同じscroll host解決。rollback観測もこの単一定義だけを使う。 */
export function resolvePageUpDownScrollHost(view: EditorView): HTMLElement | null {
  return view.dom.closest('.editor-surface') as HTMLElement | null
}

function resolveScrollHost(view: EditorView): ScrollHost | null {
  return resolvePageUpDownScrollHost(view) as ScrollHost | null
}

function resolveCaretAnchorPoint(view: EditorView, pos: number): TargetPoint | null {
  try {
    const coords = view.coordsAtPos(pos)
    return {
      left: midpoint(coords.left, coords.right),
      top: midpoint(coords.top, coords.bottom),
    }
  } catch {
    return null
  }
}

function readScrollOffset(host: ScrollHost, axis: PageUpDownAxis): number {
  return axis === 'vertical' ? host.scrollTop : host.scrollLeft
}

function writeScrollOffset(host: ScrollHost, axis: PageUpDownAxis, offset: number): void {
  if (axis === 'vertical') {
    host.scrollTop = offset
    return
  }
  host.scrollLeft = offset
}

function resolveSelectionForPoint(
  view: EditorView,
  points: readonly TargetPoint[],
  direction: PageUpDownDirection,
): Selection | null {
  const bias = direction === 'pageDown' ? 1 : -1
  const maxPos = view.state.doc.content.size
  for (const point of points) {
    const resolved = view.posAtCoords(point)
    if (!resolved) continue
    const clampedPos = clampDocPosition(maxPos, resolved.pos)
    return Selection.near(view.state.doc.resolve(clampedPos), bias)
  }
  return null
}

export function resolvePageUpDownDirection(key: string): PageUpDownDirection | null {
  if (key === 'PageUp') return 'pageUp'
  if (key === 'PageDown') return 'pageDown'
  return null
}

export function resolvePageUpDownWritingMode(view: EditorView): PageUpDownWritingMode {
  const writingMode =
    view.dom?.ownerDocument?.defaultView?.getComputedStyle?.(view.dom).writingMode ?? ''
  if (writingMode.startsWith('vertical-lr')) return 'vertical-lr'
  if (writingMode.startsWith('vertical')) return 'vertical-rl'
  return 'horizontal-tb'
}

export function resolvePageScrollPlan(
  host: Pick<
    ScrollHost,
    'scrollTop' | 'scrollLeft' | 'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'
  >,
  direction: PageUpDownDirection,
  writingMode: PageUpDownWritingMode,
): PageScrollPlan {
  if (writingMode === 'horizontal-tb') {
    const max = Math.max(0, host.scrollHeight - host.clientHeight)
    const current = host.scrollTop
    const delta = direction === 'pageDown' ? host.clientHeight : -host.clientHeight
    const target = clamp(current + delta, 0, max)
    return {
      axis: 'vertical',
      currentOffset: current,
      targetOffset: target,
      delta: target - current,
      viewportSpan: host.clientHeight,
    }
  }

  const max = Math.max(0, host.scrollWidth - host.clientWidth)
  const current = host.scrollLeft
  const delta =
    direction === 'pageDown'
      ? writingMode === 'vertical-rl'
        ? -host.clientWidth
        : host.clientWidth
      : writingMode === 'vertical-rl'
        ? host.clientWidth
        : -host.clientWidth

  const minOffset = writingMode === 'vertical-rl' ? -max : 0
  const maxOffset = writingMode === 'vertical-rl' ? 0 : max
  const target = clamp(current + delta, minOffset, maxOffset)

  return {
    axis: 'horizontal',
    currentOffset: current,
    targetOffset: target,
    delta: target - current,
    viewportSpan: host.clientWidth,
  }
}

export function resolvePageTargetPoints(
  surfaceRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  caretPoint: TargetPoint,
  axis: PageUpDownAxis,
): TargetPoint[] {
  const primary = {
    left: clampToRect(caretPoint.left, surfaceRect.left, surfaceRect.right),
    top: clampToRect(caretPoint.top, surfaceRect.top, surfaceRect.bottom),
  }
  const center = {
    left: midpoint(surfaceRect.left, surfaceRect.right),
    top: midpoint(surfaceRect.top, surfaceRect.bottom),
  }

  if (axis === 'vertical') {
    return [primary, { left: center.left, top: primary.top }]
  }
  return [primary, { left: primary.left, top: center.top }]
}

export function clampDocPosition(maxPos: number, pos: number): number {
  return clamp(pos, 0, maxPos)
}

export function runPageUpDownNavigationCommand(
  view: EditorView,
  event: KeyboardEvent,
  options: HandlePageUpDownKeyOptions,
): PageUpDownNavigationCommandResult {
  const { getIsComposing, pushLog } = options
  const direction = resolvePageUpDownDirection(event.key)
  if (!direction) return { handled: false }
  if (!isBarePageKey(event)) return { handled: false }
  if (getIsComposing() || event.isComposing) return { handled: false }
  if (!view.state.selection.empty) return { handled: false }

  const scrollHost = resolveScrollHost(view)
  if (!scrollHost) return { handled: false }

  const writingMode = resolvePageUpDownWritingMode(view)
  const plan = resolvePageScrollPlan(scrollHost, direction, writingMode)
  if (plan.viewportSpan <= 0) return { handled: false }
  const expectedDoc = view.state.doc
  const initialSelection = view.state.selection
  const initialScrollOffset = {
    scrollTop: scrollHost.scrollTop,
    scrollLeft: scrollHost.scrollLeft,
  }
  if (plan.delta === 0) {
    event.preventDefault()
    pushLog('pageNav', `${direction} boundary offset=${plan.currentOffset}`)
    return {
      handled: true,
      expectedDoc,
      expectedSelection: initialSelection,
      expectedTransactionCount: 0,
      expectedScrollOffset: initialScrollOffset,
      moved: false,
      boundaryNoop: true,
    }
  }

  const caretPoint = resolveCaretAnchorPoint(view, view.state.selection.from)
  if (!caretPoint) return { handled: false }

  const surfaceRect = scrollHost.getBoundingClientRect()
  const targetPoints = resolvePageTargetPoints(surfaceRect, caretPoint, plan.axis)
  const originalOffset = readScrollOffset(scrollHost, plan.axis)

  try {
    writeScrollOffset(scrollHost, plan.axis, plan.targetOffset)
    const nextSelection = resolveSelectionForPoint(view, targetPoints, direction)
    if (!nextSelection) {
      writeScrollOffset(scrollHost, plan.axis, originalOffset)
      return { handled: false }
    }

    const moved = !nextSelection.eq(initialSelection)
    event.preventDefault()
    const from = view.state.selection.from
    const transaction = view.state.tr.setSelection(nextSelection)
    const dispatchTransaction = options.dispatchTransaction ?? ((tr: Transaction) => view.dispatch(tr))
    dispatchTransaction(transaction)
    writeScrollOffset(scrollHost, plan.axis, plan.targetOffset)
    // 実 scroll offset は device pixel へ snap されるので、`devicePixelRatio` が非整数の
    // 環境（Windows 125% 表示など）では読み戻し値が `targetOffset` と一致しない。
    // scroll 軸の期待値は host command 自身が最後に確立した実 offset を正本にする。
    // 書いていない交差軸は開始値のまま固定し、command 後の scroll 干渉検出は緩めない。
    const achievedOffset = readScrollOffset(scrollHost, plan.axis)
    const expectedScrollOffset = {
      scrollTop: plan.axis === 'vertical' ? achievedOffset : initialScrollOffset.scrollTop,
      scrollLeft: plan.axis === 'horizontal' ? achievedOffset : initialScrollOffset.scrollLeft,
    }
    pushLog(
      'pageNav',
      `${direction} ${plan.axis} offset=${originalOffset}->${plan.targetOffset} pos=${from}->${nextSelection.from}`,
    )
    return {
      handled: true,
      expectedDoc,
      expectedSelection: nextSelection,
      expectedTransactionCount: 1,
      expectedScrollOffset,
      moved,
      boundaryNoop: false,
    }
  } catch {
    writeScrollOffset(scrollHost, plan.axis, originalOffset)
    return { handled: false }
  }
}

export function handlePageUpDownKey(
  view: EditorView,
  event: KeyboardEvent,
  options: HandlePageUpDownKeyOptions,
): boolean {
  return runPageUpDownNavigationCommand(view, event, options).handled
}
