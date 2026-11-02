import { NodeSelection, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { NOTE_ANCHOR_NODE_NAME } from '../io/noteAnchor'
import { selectionTouchesNoteAnchor } from './noteAnchorProtection'
import { notifyNoteAnchorProtection } from './noteAnchorProtectionNotice'

/**
 * Backspace / Delete で noteAnchor を含む destructive edit をブロックする。
 */
export function handleNoteAnchorDeleteKey(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false

  // 拒否の判定は `wouldDeleteNoteAnchorWithKey` と同じ（PIS の deletionRules も同じ述語を使う）。
  if (!wouldDeleteNoteAnchorWithKey(view.state, event.key as 'Backspace' | 'Delete')) return false
  event.preventDefault()
  // STICKY-NOTE-LIFECYCLE1: 拒否は保ち、理由を知らせる（表示と連打の抑制は受け手）。
  notifyNoteAnchorProtection(view, 'delete-key')
  return true
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
