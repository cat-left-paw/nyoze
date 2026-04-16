import { NodeSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'

type Dispatch = (tr: Transaction) => void

export type HorizontalRuleDeleteResult =
  | 'nodeSelection'
  | 'backspace'
  | 'delete'
  | null

export function deleteHorizontalRuleWithKey(
  state: EditorState,
  event: KeyboardEvent,
  dispatch?: Dispatch,
): HorizontalRuleDeleteResult {
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.key !== 'Backspace' && event.key !== 'Delete') return null

  const selection = state.selection

  if (selection instanceof NodeSelection && selection.node.type.name === 'horizontalRule') {
    if (dispatch) dispatch(state.tr.delete(selection.from, selection.to))
    return 'nodeSelection'
  }

  if (!selection.empty) return null

  const { $from } = selection
  if (event.key === 'Backspace') {
    const before = $from.nodeBefore
    if (!before || before.type.name !== 'horizontalRule') return null
    if (dispatch) dispatch(state.tr.delete($from.pos - before.nodeSize, $from.pos))
    return 'backspace'
  }

  const after = $from.nodeAfter
  if (!after || after.type.name !== 'horizontalRule') return null
  if (dispatch) dispatch(state.tr.delete($from.pos, $from.pos + after.nodeSize))
  return 'delete'
}

export function selectHorizontalRuleAtEventTarget(
  state: EditorState,
  target: EventTarget | null,
  posAtDOM: (node: Node, offset: number) => number,
  dispatch?: Dispatch,
): number | null {
  const targetElement =
    target instanceof Element
      ? target
      : target instanceof Text
        ? target.parentElement
        : null
  if (!targetElement) return null

  const horizontalRuleEl = targetElement.closest('hr')
  if (!(horizontalRuleEl instanceof HTMLHRElement)) return null

  const pos = posAtDOM(horizontalRuleEl, 0)
  if (dispatch) {
    dispatch(
      state.tr.setSelection(
        NodeSelection.create(state.doc, pos),
      ),
    )
  }
  return pos
}
