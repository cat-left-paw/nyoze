import { Selection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { graphemeStepLengthBackward, graphemeStepLengthForward } from '../io/graphemeStep'

type LogPush = (event: string, detail: string) => void

export type RubyBoundaryArrowDirection = 'backward' | 'forward'
export type RubyBoundaryWritingMode = 'horizontal-tb' | 'vertical-rl'

type HandleRubyBoundaryArrowKeyOptions = {
  getIsComposing: () => boolean
  pushLog: LogPush
}

function isBareArrowKey(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

function resolveRubyAncestorDepth(state: EditorState, pos: number): number | null {
  const $pos = state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'aozoraRuby') return depth
  }
  return null
}

/** Shared duplicate-boundary authority, also used for a native range's initial anchor. */
export function resolveRubyBoundaryArrowAnchor(state: EditorState, direction: RubyBoundaryArrowDirection): number {
  const { selection } = state
  if (!selection.empty) return selection.anchor
  const pos = selection.anchor, $pos = state.doc.resolve(pos)
  if (direction === 'forward' && $pos.nodeAfter?.type.name === 'aozoraRuby') return pos + 1
  const depth = resolveRubyAncestorDepth(state, pos)
  if (direction === 'backward' && depth !== null && pos === $pos.start(depth)) return $pos.before(depth)
  return pos
}

export function resolveRubyBoundaryWritingMode(view: EditorView): RubyBoundaryWritingMode {
  const viewDom = view.dom
  const writingMode =
    viewDom?.ownerDocument?.defaultView?.getComputedStyle?.(viewDom).writingMode ?? ''
  return writingMode.startsWith('vertical') ? 'vertical-rl' : 'horizontal-tb'
}

export function resolveRubyBoundaryArrowDirection(
  key: string,
  writingMode: RubyBoundaryWritingMode,
): RubyBoundaryArrowDirection | null {
  if (writingMode === 'horizontal-tb') {
    if (key === 'ArrowLeft') return 'backward'
    if (key === 'ArrowRight') return 'forward'
    return null
  }

  if (key === 'ArrowUp') return 'backward'
  if (key === 'ArrowDown') return 'forward'
  return null
}

export function resolveRubyBoundaryArrowSelection(
  state: EditorState,
  direction: RubyBoundaryArrowDirection,
): Selection | null {
  const { selection, doc } = state
  if (!selection.empty) return null

  const pos = selection.from
  const $pos = doc.resolve(pos)

  if (direction === 'backward') {
    const nodeBefore = $pos.nodeBefore
    if (!nodeBefore || nodeBefore.type.name !== 'aozoraRuby') return null
    if (pos < 2) return null
    // Ruby の内側の末尾（pos - 1）から、親文字の最後の書記素 1 歩ぶん戻る。固定の数（pos - 2）では、末尾が
    // サロゲートペア（拡張B の漢字）・異体字セレクタ付きの漢字のとき、ペアの内側・漢字とセレクタの間に着く。
    const baseText = nodeBefore.textContent
    const step = graphemeStepLengthBackward(baseText, baseText.length) || 1
    return Selection.near(doc.resolve(pos - 1 - step), -1)
  }

  const rubyDepth = resolveRubyAncestorDepth(state, pos)
  if (rubyDepth === null) return null
  if (pos !== $pos.end(rubyDepth)) return null

  const afterRubyPos = $pos.after(rubyDepth)
  // Ruby の直後の text の先頭の書記素 1 歩ぶん進む。直後が text でないとき（別の inline node・段落末）は従来どおり 1。
  const following = doc.resolve(afterRubyPos).nodeAfter
  const step = following?.isText ? graphemeStepLengthForward(following.text ?? '', 0) || 1 : 1
  const targetPos = Math.min(doc.content.size, afterRubyPos + step)
  if (targetPos <= pos) return null
  return Selection.near(doc.resolve(targetPos), 1)
}

export function handleRubyBoundaryArrowKey(
  view: EditorView,
  event: KeyboardEvent,
  { getIsComposing, pushLog }: HandleRubyBoundaryArrowKeyOptions,
): boolean {
  if (!isBareArrowKey(event)) return false
  if (getIsComposing()) return false

  const direction = resolveRubyBoundaryArrowDirection(
    event.key,
    resolveRubyBoundaryWritingMode(view),
  )
  if (!direction) return false

  const nextSelection = resolveRubyBoundaryArrowSelection(view.state, direction)
  if (!nextSelection) return false

  const from = view.state.selection.from
  event.preventDefault()
  view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
  pushLog('rubyArrow', `skipDuplicateBoundary ${direction} ${from}->${nextSelection.from}`)
  return true
}
