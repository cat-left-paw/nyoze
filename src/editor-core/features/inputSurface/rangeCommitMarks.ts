import type { Mark } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

/** OS Host基準: 部分置換は継続するmark、終端を跨ぐ非inclusive markは継承しない。 */
export function resolveHostRangeCommitMarks(state: EditorState, from: number, to: number): readonly Mark[] | undefined {
  if (from === to) return undefined // collapsedのS3経路をそのまま保つ。
  return state.storedMarks ?? state.doc.resolve(from).marksAcross(state.doc.resolve(to)) ?? []
}
