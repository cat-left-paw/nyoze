import type { WritingMode } from '../../settings/types'

export type PlainModeKind = 'paragraph-plain' | 'full-plain'

type ResolvePlainModeKindInput = {
  paragraphPlainModeActive: boolean
  fullPlainEditActive: boolean
}

type BlockedEditorShortcutMatchInput = {
  key: string
  code?: string
  mod: boolean
  shift: boolean
  alt: boolean
  writingMode: WritingMode
}

type ResolveFormattingButtonStateInput = {
  plainModeKind: PlainModeKind | null
  baseDisabled: boolean
  defaultTooltip: string
}

export function resolvePlainModeKind({
  paragraphPlainModeActive,
  fullPlainEditActive,
}: ResolvePlainModeKindInput): PlainModeKind | null {
  if (fullPlainEditActive) return 'full-plain'
  if (paragraphPlainModeActive) return 'paragraph-plain'
  return null
}

export function getPlainFormattingUnavailableMessage(kind: PlainModeKind): string {
  return kind === 'full-plain'
    ? 'Source Mode 中は書式操作できません'
    : 'Paragraph Plain 中は書式操作できません'
}

export function getPlainContextMenuUnavailableMessage(kind: PlainModeKind): string {
  return kind === 'full-plain'
    ? 'Source Mode 中は editor context menu は使えません'
    : 'Paragraph Plain 中は editor context menu は使えません'
}

export function getPlainShortcutUnavailableMessage(kind: PlainModeKind): string {
  return kind === 'full-plain'
    ? 'Source Mode 中は editor command shortcut は使えません'
    : 'Paragraph Plain 中は editor command shortcut は使えません'
}

export function resolveFormattingButtonState({
  plainModeKind,
  baseDisabled,
  defaultTooltip,
}: ResolveFormattingButtonStateInput): {
  disabled: boolean
  ariaDisabled: boolean
  tooltip: string
  title: string | undefined
} {
  if (!plainModeKind) {
    return {
      disabled: baseDisabled,
      ariaDisabled: false,
      tooltip: defaultTooltip,
      title: undefined,
    }
  }

  const message = getPlainFormattingUnavailableMessage(plainModeKind)
  return {
    disabled: false,
    ariaDisabled: true,
    tooltip: message,
    title: message,
  }
}

type ParagraphPlainToggleShortcutInput = {
  code: string
  key: string
  mod: boolean
  alt: boolean
  shift: boolean
}

/**
 * Paragraph Plain toggle shortcut: Cmd/Ctrl + Alt/Option + P.
 *
 * Uses `event.code === 'KeyP'` as the primary match so that macOS layouts
 * where Option+P emits `π` still fire the toggle. Falls back to `key` when
 * `code` is unavailable.
 */
export function matchesParagraphPlainToggleShortcut({
  code,
  key,
  mod,
  alt,
  shift,
}: ParagraphPlainToggleShortcutInput): boolean {
  if (!mod || !alt || shift) return false
  if (code === 'KeyP') return true
  return key.toLowerCase() === 'p'
}

export function matchesPlainBlockedEditorShortcut({
  key,
  code,
  mod,
  shift,
  alt,
  writingMode,
}: BlockedEditorShortcutMatchInput): boolean {
  if (!mod) return false

  if (!shift && !alt && (key === 'b' || key === 'i' || key === 'k')) {
    return true
  }
  if ((shift && !alt && key === 'X') || (shift && !alt && key === 'C')) {
    return true
  }
  if (alt && !shift && ['0', '1', '2', '3', '4', '5', '6'].includes(key)) {
    return true
  }
  // Ruby 挿入 shortcut (Cmd/Ctrl+Alt+R) は editor command 扱いなので plain mode では block する。
  // macOS の Option+R で `®` が key に入っても、event.code === 'KeyR' で拾えるようにする。
  if (alt && !shift && (code === 'KeyR' || key === 'r' || key === 'R')) {
    return true
  }
  if (!shift && !alt) {
    if (writingMode === 'horizontal-tb' && (key === 'ArrowUp' || key === 'ArrowDown')) {
      return true
    }
    if (writingMode !== 'horizontal-tb' && (key === 'ArrowRight' || key === 'ArrowLeft')) {
      return true
    }
  }
  // Outline shortcut: event.code を優先して plain mode でも一貫した判定にする。
  // previous / next heading は Cmd/Ctrl+Shift+`,` / `.` (Comma / Period)、fold は
  // Cmd/Ctrl+Shift+L (KeyL)。以前の `[` / `]` / `/` は、日本語配列 / macOS Help
  // 衝突の事情で実用にならなかったため廃止している。Alt 併用時は pane toggle 側
  // なので、ここで outline として拾ってはいけない。
  if (shift && !alt) {
    if (code === 'Comma' || code === 'Period' || code === 'KeyL') {
      return true
    }
    if (key === ',' || key === '.') {
      return true
    }
    // Shift 合成で `,` → `<`, `.` → `>` に化ける環境の fallback。
    if (key === '<' || key === '>') {
      return true
    }
    // L/l は event.key fallback。
    if (key === 'l' || key === 'L') {
      return true
    }
  }

  return false
}

type RubyInsertShortcutInput = {
  code: string
  key: string
  mod: boolean
  alt: boolean
  shift: boolean
}

/**
 * Ruby 挿入 shortcut: Cmd/Ctrl + Alt/Option + R.
 *
 * macOS の Option+R は `®` を発火するため、`event.code === 'KeyR'` を優先し、
 * 取得できない環境では `event.key` を fallback として扱う。Shift を要求しない
 * のは既存 formatting shortcut との衝突を避けるため。
 */
export function matchesRubyInsertShortcut({
  code,
  key,
  mod,
  alt,
  shift,
}: RubyInsertShortcutInput): boolean {
  if (!mod || !alt || shift) return false
  if (code === 'KeyR') return true
  return key.toLowerCase() === 'r'
}

type PaneToggleShortcutInput = {
  code: string
  key: string
  mod: boolean
  alt: boolean
  shift: boolean
}

/**
 * 左右 pane toggle: Cmd/Ctrl + Alt/Option + `,` / `.`.
 *
 * Editor command ではないので plain mode でも使える。`event.code === 'Comma'` /
 * `'Period'` を優先。以前の `[` / `]` は日本語配列などで実機 `Cmd+Alt+[` 自体が
 * 拾えないケースがあり、実用にならなかったため廃止。Shift 併用は outline
 * 見出しナビ (`Cmd/Ctrl+Shift+,` / `.`) との衝突回避のため除外する。
 *
 * event.key fallback は素の `,` / `.` に加えて、OS / layout 依存で `、` / `。`
 * (日本語 IME OFF + 一部 layout)、Alt 合成で `≤` / `≥` (macOS US layout) に
 * 化ける環境も想定しておく。
 */
export function matchesLeftPaneToggleShortcut({
  code,
  key,
  mod,
  alt,
  shift,
}: PaneToggleShortcutInput): boolean {
  if (!mod || !alt || shift) return false
  if (code === 'Comma') return true
  if (key === ',' || key === '、' || key === '≤') return true
  return false
}

export function matchesRightPaneToggleShortcut({
  code,
  key,
  mod,
  alt,
  shift,
}: PaneToggleShortcutInput): boolean {
  if (!mod || !alt || shift) return false
  if (code === 'Period') return true
  if (key === '.' || key === '。' || key === '≥') return true
  return false
}

type OutlineShortcutInput = {
  code: string
  key: string
  mod: boolean
  alt: boolean
  shift: boolean
}

export type OutlineShortcutKind =
  | 'comma'
  | 'period'
  | 'fold'
  | null

/**
 * Outline 関連 shortcut を `event.code` で判定する。
 *
 * - `Cmd/Ctrl+Shift+,` (Comma): previous / next heading (writing mode 依存)
 * - `Cmd/Ctrl+Shift+.` (Period): previous / next heading (writing mode 依存)
 * - `Cmd/Ctrl+Shift+L` (KeyL): fold toggle
 *
 * 以前は `[` / `]` / `.` や `,` / `.` / `/` を試したが、前者は日本語キーボードで
 * `Cmd+Shift+[` が成立しないケースが多く、後者は macOS の `Cmd+Shift+/`
 * (Help 検索) と衝突して実機で動かなかった。Comma / Period / KeyL は実機で
 * 拾えることを E2E / 実機で確認済み。
 *
 * 返り値は shortcut の「物理キー」を表すだけで、previous / next heading の
 * 意味解釈 (writing mode 依存) は呼び出し側で行う。縦書きでは視覚的な向きが
 * 逆になるため、`comma` = next, `period` = previous と対応づける必要がある。
 *
 * Alt 併用時は pane toggle (`Cmd/Ctrl+Alt+,` / `.`) の領域なので、outline
 * では拾わない。
 *
 * event.key は Shift 合成で `,` → `<`, `.` → `>` に変わる環境がある (US/JIS)。
 */
export function matchesOutlineShortcut({
  code,
  key,
  mod,
  alt,
  shift,
}: OutlineShortcutInput): OutlineShortcutKind {
  if (!mod || !shift || alt) return null
  if (code === 'Comma' || key === ',' || key === '<') return 'comma'
  if (code === 'Period' || key === '.' || key === '>') return 'period'
  if (code === 'KeyL' || key === 'l' || key === 'L') return 'fold'
  return null
}
