import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { isValidNoteAnchorId } from '../io/noteAnchor'
import { findNoteAnchorPosition } from './noteAnchorNavigation'
import { NOTE_ANCHOR_DELETE_META_KEY } from './noteAnchorProtection'

function buildRemoveNoteAnchorTransactionAtPosition(
  state: EditorState,
  pos: number,
  id: string,
): Transaction | null {
  const node = state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'noteAnchor' || node.attrs.id !== id) return null
  return state.tr
    .delete(pos, pos + node.nodeSize)
    .setMeta(NOTE_ANCHOR_DELETE_META_KEY, id)
}

/**
 * 専用削除 command 用: 本文から noteAnchor node を除去する PM transaction。
 * filterTransaction は NOTE_ANCHOR_DELETE_META_KEY 付きのみ許可する。
 * 同一 ID が複数ある場合は doc 走査順の最初の 1 個だけ削除する。
 */
export function buildRemoveNoteAnchorTransaction(
  state: EditorState,
  id: string,
): Transaction | null {
  if (!isValidNoteAnchorId(id)) return null
  const pos = findNoteAnchorPosition(state.doc, id)
  if (pos === null) return null
  return buildRemoveNoteAnchorTransactionAtPosition(state, pos, id)
}

/**
 * 右クリックした DOM marker に対応する noteAnchor node だけを削除する transaction。
 * posAtDOM の解決が node 境界にずれる場合は nodeBefore / nodeAfter を補正する。
 */
export function buildRemoveNoteAnchorTransactionAtDom(
  state: EditorState,
  view: EditorView,
  markerElement: Element,
  id: string,
): Transaction | null {
  if (!isValidNoteAnchorId(id)) return null
  const marker = markerElement.closest('.note-anchor[data-note-anchor-id]')
  if (!marker || marker.getAttribute('data-note-anchor-id') !== id) return null
  if (!view.dom.contains(marker)) return null

  let pos: number
  try {
    pos = view.posAtDOM(marker, 0)
  } catch {
    return null
  }

  const direct = buildRemoveNoteAnchorTransactionAtPosition(state, pos, id)
  if (direct) return direct

  const $pos = state.doc.resolve(pos)
  const before = $pos.nodeBefore
  if (before?.type.name === 'noteAnchor' && before.attrs.id === id) {
    const nodePos = pos - before.nodeSize
    return buildRemoveNoteAnchorTransactionAtPosition(state, nodePos, id)
  }
  const after = $pos.nodeAfter
  if (after?.type.name === 'noteAnchor' && after.attrs.id === id) {
    return buildRemoveNoteAnchorTransactionAtPosition(state, pos, id)
  }
  return null
}
