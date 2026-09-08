/**
 * 局所 IME slot（P2-D2）向けの collapsed caret 専用 mark toggle。
 *
 * 通常 PM（toolbar / `useGlobalShortcuts`）は TipTap の
 * `toggleBold` / `toggleItalic` / `toggleStrike` を使う。
 * TipTap は range で「全体が mark 済みなら解除、部分的なら全体へ付与」だが、
 * ProseMirror 標準 `toggleMark` は「一部でも mark があれば全体から解除」になり得る。
 * P2-D2 は collapsed caret（storedMarks）限定のため、ここに TipTap range 意味論は持ち込まない。
 */

import { toggleMark } from '@tiptap/pm/commands'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { selectionTouchesNoteAnchor } from './noteAnchorProtection'
import type { EditorMarkShortcutName } from './editorMarkShortcutClassification'

export type RunEditorMarkToggleCommandInput = {
  state: EditorState
  dispatch: (tr: Transaction) => void
  markName: EditorMarkShortcutName
  /** 省略時は noteAnchor 接触を拒否する。 */
  allowNoteAnchor?: boolean
}

/**
 * collapsed caret の storedMarks 切替だけを行う。
 * range selection / schema に mark が無い / noteAnchor 接触時は false（command reject）。
 */
export function runEditorMarkToggleCommand(
  input: RunEditorMarkToggleCommandInput,
): boolean {
  const markType = input.state.schema.marks[input.markName]
  if (!markType) return false
  if (!input.state.selection.empty) return false
  if (input.allowNoteAnchor !== true && selectionTouchesNoteAnchor(input.state)) {
    return false
  }
  return toggleMark(markType)(input.state, input.dispatch)
}
