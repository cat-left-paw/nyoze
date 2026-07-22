import type { EditorState, Transaction } from '@tiptap/pm/state'
import { isValidNoteAnchorId } from '../io/noteAnchor'
import type { SelectionRange } from '../types'

/**
 * 付箋アンカー挿入 (Task 3A-3) の pure PM helper。
 *
 * - collapsed selection: キャレット位置へ noteAnchor を挿入する。
 * - non-collapsed selection: 選択テキストを削除せず、選択範囲の末尾 (to) へ
 *   挿入する (挙動はテストで固定)。
 * - range 指定時 (modal を挟んで selection が動いた場合の復元用) は
 *   range.to を使う。
 */
export function buildInsertNoteAnchorTransaction(
  state: EditorState,
  id: string,
  range?: SelectionRange,
): Transaction | null {
  if (!isValidNoteAnchorId(id)) return null
  const nodeType = state.schema.nodes['noteAnchor']
  if (!nodeType) return null

  const pos = range ? range.to : state.selection.to
  if (pos < 0 || pos > state.doc.content.size) return null

  // inline atom は textblock 内にしか置けない。doc 直下などへは挿入しない。
  const $pos = state.doc.resolve(pos)
  if (!$pos.parent.isTextblock) return null

  return state.tr.insert(pos, nodeType.create({ id }))
}
