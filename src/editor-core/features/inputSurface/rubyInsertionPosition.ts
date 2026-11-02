import type { EditorState } from '@tiptap/pm/state'
import { resolveRubyAncestorRangeAtPos } from '../rubyBoundarySelection'

/** B14: 親文字の内側の端点だけ、同じ側のRuby外側へ投影する。 */
export function normalizeRubyInsertionRange(state: EditorState, from: number, to: number): { from: number; to: number } {
  const outside = (pos: number) => {
    const ruby = resolveRubyAncestorRangeAtPos(state, pos)
    if (!ruby) return pos
    if (pos === ruby.from + 1) return ruby.from
    if (pos === ruby.to - 1) return ruby.to
    return pos
  }
  return { from: outside(from), to: outside(to) }
}
