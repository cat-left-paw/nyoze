/**
 * Local Window list-move shortcut
 * （`Cmd/Ctrl+ArrowUp/Down/Left/Right`）の focused target 分類（pure）。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md` §11
 * Product Slice P2-G2c2。
 *
 * 通常PMは`isProseMirrorFocused()`を再利用し、Local Windowはrootの明示data属性で
 * 判定する。
 * だけを区別する。それ以外（native input / button / Explorer / dialog 等）は
 * すべて `'other'` に落とし、既存の「編集領域外では shortcut を奪わない」
 * 契約を維持する。
 *
 * `isProseMirrorFocused()`自体は変更しない（「PMまたはLocal Window」という広い
 * predicate へ書き換えない）。
 */

import { isProseMirrorFocused } from './selectAllShortcutRouting'
export type ListMoveShortcutTargetKind = 'prosemirror' | 'local-window' | 'other'

export function classifyListMoveShortcutTarget(
  target: Element | null,
): ListMoveShortcutTargetKind {
  if (target?.closest('[data-nyoze-local-window-editor="true"]')) {
    return 'local-window'
  }
  if (isProseMirrorFocused(target)) return 'prosemirror'
  return 'other'
}
