/**
 * EDITOR-PARAGRAPH-REPARSE1: 「この段落の記法を反映」のショートカット（Cmd / Ctrl + Shift + M）の分類。
 *
 * - Mod 判定は `metaKey || ctrlKey`（既存の shortcut と同じ）。Alt を伴うものは対象外。
 * - IME の変換中・IME の特殊 key・non-cancelable・Windows の AltGr は、消費しない（文字入力へ委譲する）。
 * - 文字は `event.key` を小文字にして比べる（Shift を押すと `M`）。
 */
export type ParagraphReparseShortcutProbe = {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** Windows AltGr。true のときは消費しない。 */
  altGraphKey?: boolean
  isComposing?: boolean
  keyCode?: number
  cancelable?: boolean
}

export function isParagraphReparseShortcut(probe: ParagraphReparseShortcutProbe): boolean {
  if (probe.isComposing) return false
  if (probe.keyCode === 229) return false
  if (probe.key === 'Process' || probe.key === 'Unidentified') return false
  if (probe.cancelable === false) return false
  if (probe.altGraphKey === true) return false
  if (!(probe.metaKey || probe.ctrlKey) || !probe.shiftKey || probe.altKey) return false
  return probe.code === 'KeyM' || probe.key.toLowerCase() === 'm'
}
