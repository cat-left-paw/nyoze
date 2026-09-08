import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { isLocalImeLocalWindowCapableParagraph } from './localImeLocalWindowCapability'
import {
  LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS,
  planLocalImeLocalWindowCapture,
  resolveLocalImeLocalWindowBlockIndex,
  type LocalImeLocalWindowCapturePlan,
} from './localImeLocalWindowState'

export type LocalImeLocalWindowAcquisitionResult =
  | {
      readonly ok: true
      readonly plan: LocalImeLocalWindowCapturePlan
      readonly blockPositions: readonly number[]
      readonly paragraphs: readonly ProseMirrorNode[]
    }
  | {
      readonly ok: false
      readonly reason:
        | 'selection-depth'
        | 'paragraph-shape'
        | 'surface'
        | 'host-root'
        | 'paragraph-dom'
        | 'range-plan'
    }

/**
 * LOCAL-WINDOW-BOUNDED1 viewport snapshot。
 *
 * PM top-level index / positionを先に列挙し、そのexact positionから既存
 * `view.nodeDOM(pos)`へ進む一方向のproofだけを使う。DOM座標からPM positionを
 * 逆算しない。active session中は呼ばれず、返したplanは開始rangeと共に固定される。
 */
export function acquireLocalImeLocalWindowCapturePlan(input: {
  readonly state: EditorState
  readonly view: EditorView
  readonly editorSurface: HTMLElement | null
}): LocalImeLocalWindowAcquisitionResult {
  const { state, view, editorSurface } = input
  const currentIndex = resolveLocalImeLocalWindowBlockIndex(state.doc, state.selection.head)
  if (currentIndex === null) return { ok: false, reason: 'selection-depth' }
  if (!editorSurface?.isConnected || !editorSurface.contains(view.dom)) {
    return { ok: false, reason: 'surface' }
  }
  if (
    !view.dom.isConnected || !view.dom.classList.contains('ProseMirror') ||
    view.dom.parentElement?.classList.contains('editor-core-host') !== true
  ) return { ok: false, reason: 'host-root' }

  const allPositions: number[] = []
  const allParagraphs: ProseMirrorNode[] = []
  state.doc.forEach((node, offset) => {
    allPositions.push(offset)
    allParagraphs.push(node)
  })
  const eligibleBlocks = allParagraphs.map(isLocalImeLocalWindowCapableParagraph)
  if (!eligibleBlocks[currentIndex]) return { ok: false, reason: 'paragraph-shape' }

  let runStart = currentIndex
  let runEnd = currentIndex
  while (runStart > 0 && eligibleBlocks[runStart - 1]) runStart -= 1
  while (runEnd + 1 < eligibleBlocks.length && eligibleBlocks[runEnd + 1]) runEnd += 1

  const surfaceRect = editorSurface.getBoundingClientRect()
  let viewportUsable =
    Number.isFinite(surfaceRect.left) && Number.isFinite(surfaceRect.right) &&
    Number.isFinite(surfaceRect.top) && Number.isFinite(surfaceRect.bottom) &&
    surfaceRect.width > 0 && surfaceRect.height > 0
  const viewportIntersectingBlocks = eligibleBlocks.map(() => false)
  // capture上限を満たすのに必要なcurrent前後だけを読む。巨大eligible run全件へ
  // layout readを広げず、最大 `2 * CAPTURE_MAX + 1` paragraphに固定する。
  const inspectStart = Math.max(runStart, currentIndex - LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS)
  const inspectEnd = Math.min(runEnd, currentIndex + LOCAL_IME_LOCAL_WINDOW_CAPTURE_MAX_BLOCKS)
  for (let index = inspectStart; index <= inspectEnd; index += 1) {
    let candidate: Node | null = null
    try { candidate = view.nodeDOM(allPositions[index]!) } catch { /* reject below */ }
    if (
      !(candidate instanceof HTMLElement) || candidate.parentElement !== view.dom ||
      candidate.tagName !== 'P'
    ) return { ok: false, reason: 'paragraph-dom' }
    if (!viewportUsable) continue
    const rect = candidate.getBoundingClientRect()
    if (
      !Number.isFinite(rect.left) || !Number.isFinite(rect.right) ||
      !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom) ||
      rect.width <= 0 || rect.height <= 0
    ) {
      viewportUsable = false
      continue
    }
    viewportIntersectingBlocks[index] =
      rect.right > surfaceRect.left && rect.left < surfaceRect.right &&
      rect.bottom > surfaceRect.top && rect.top < surfaceRect.bottom
  }
  const plan = planLocalImeLocalWindowCapture({
    currentIndex,
    eligibleBlocks,
    viewportIntersectingBlocks: viewportUsable ? viewportIntersectingBlocks : null,
  })
  if (!plan) return { ok: false, reason: 'range-plan' }
  return {
    ok: true,
    plan,
    blockPositions: allPositions.slice(plan.startIndex, plan.endIndex + 1),
    paragraphs: allParagraphs.slice(plan.startIndex, plan.endIndex + 1),
  }
}
