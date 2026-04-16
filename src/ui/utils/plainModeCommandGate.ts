import type { WritingMode } from '../../settings/types'

export type PlainModeKind = 'paragraph-plain' | 'full-plain'

type ResolvePlainModeKindInput = {
  paragraphPlainModeActive: boolean
  fullPlainEditActive: boolean
}

type BlockedEditorShortcutMatchInput = {
  key: string
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
  if (!shift && !alt) {
    if (writingMode === 'horizontal-tb' && (key === 'ArrowUp' || key === 'ArrowDown')) {
      return true
    }
    if (writingMode !== 'horizontal-tb' && (key === 'ArrowRight' || key === 'ArrowLeft')) {
      return true
    }
  }
  if (shift && !alt && (key === '[' || key === ']' || key === '.')) {
    return true
  }

  return false
}
