import { NodeSelection, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { NOTE_ANCHOR_NODE_NAME } from '../io/noteAnchor'
import { selectionTouchesNoteAnchor } from './noteAnchorProtection'

/**
 * Backspace / Delete で noteAnchor を含む destructive edit をブロックする。
 */
export function handleNoteAnchorDeleteKey(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false

  const { state } = view
  const selection = state.selection

  if (selection instanceof NodeSelection && selection.node.type.name === NOTE_ANCHOR_NODE_NAME) {
    event.preventDefault()
    return true
  }

  if (!selection.empty) {
    if (selectionTouchesNoteAnchor(state)) {
      event.preventDefault()
      return true
    }
    return false
  }

  const { $from } = selection
  if (event.key === 'Backspace' && $from.nodeBefore?.type.name === NOTE_ANCHOR_NODE_NAME) {
    event.preventDefault()
    return true
  }
  if (event.key === 'Delete' && $from.nodeAfter?.type.name === NOTE_ANCHOR_NODE_NAME) {
    event.preventDefault()
    return true
  }

  return false
}

export function wouldDeleteNoteAnchorWithKey(
  state: EditorState,
  key: 'Backspace' | 'Delete',
): boolean {
  const selection = state.selection
  if (selection instanceof NodeSelection && selection.node.type.name === NOTE_ANCHOR_NODE_NAME) {
    return true
  }
  if (!selection.empty) {
    return selectionTouchesNoteAnchor(state)
  }
  const { $from } = selection
  if (key === 'Backspace' && $from.nodeBefore?.type.name === NOTE_ANCHOR_NODE_NAME) return true
  if (key === 'Delete' && $from.nodeAfter?.type.name === NOTE_ANCHOR_NODE_NAME) return true
  return false
}
