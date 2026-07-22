/**
 * BETA-DISP1: キャレット色設定ヘルパー
 *
 * - auto: pageColor の輝度から高コントラストな色を自動決定
 * - custom: ユーザー指定の hex 色をそのまま使用
 * - highlight: 現在の UI テーマ accent 色を使用
 * - 不正値は auto にフォールバック
 */

import type { Theme, UiThemePreset } from '../settings/types'
import { UI_THEME_MAIN_COLORS } from '../settings/defaults'

export type CaretColorMode = 'auto' | 'custom' | 'highlight'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export function isValidCaretColorCustom(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value)
}

export function normalizeCaretColorMode(value: unknown): CaretColorMode {
  if (value === 'auto' || value === 'custom' || value === 'highlight') return value
  return 'auto'
}

export function normalizeCaretColorCustom(value: unknown): string | null {
  return isValidCaretColorCustom(value) ? value : null
}

/**
 * 現在の UI テーマ（または active UI preset）の accent 色を返す。
 * theme preset に新フィールドは追加せず、既存 `colors.accent` を正本とする。
 */
export function resolveUiThemeAccentColor(
  theme: Theme,
  activePreset: UiThemePreset | null | undefined,
): string {
  const accent = activePreset?.colors.accent ?? UI_THEME_MAIN_COLORS[theme].accent
  return isValidCaretColorCustom(accent) ? accent : UI_THEME_MAIN_COLORS.mist.accent
}

/**
 * hex6 → 相対輝度 (0–1, WCAG 2.1)
 */
function hexToRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * pageColor に対して視認性の高いキャレット色を返す。
 * 輝度が高い（明るい背景）→ 暗色 (#1a1a1a)
 * 輝度が低い（暗い背景）→ 明色 (#f0f0f0)
 */
function autoCaretColor(pageColor: string): string {
  if (!HEX_COLOR_RE.test(pageColor)) return '#1a1a1a'
  const lum = hexToRelativeLuminance(pageColor)
  return lum > 0.3 ? '#1a1a1a' : '#f0f0f0'
}

/**
 * 実効キャレット色文字列を返す。
 * CSS の caret-color / --editor-caret-color に直接設定できる値。
 */
export function resolveCaretColor(
  mode: CaretColorMode,
  customColor: string | null,
  pageColor: string,
  uiThemeAccentColor?: string,
): string {
  if (mode === 'custom' && isValidCaretColorCustom(customColor)) {
    return customColor
  }
  if (mode === 'highlight') {
    if (isValidCaretColorCustom(uiThemeAccentColor)) return uiThemeAccentColor
    return autoCaretColor(pageColor)
  }
  return autoCaretColor(pageColor)
}
