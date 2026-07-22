import {
  DEFAULT_PAGE_VIEWER_BREAK_BEFORE_HEADING,
  DEFAULT_PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL,
  PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL_MAX,
  PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL_MIN,
} from './defaults'

/** `SettingsJson.pageViewerBreakBeforeHeadingMaxLevel` と同じ union (1=H1のみ 〜 6=H1〜H6)。 */
export type PageViewerBreakBeforeHeadingMaxLevel = 1 | 2 | 3 | 4 | 5 | 6

/** PV-SET-4A: 「見出しの前で改ページ」トグルを安全値へ正規化する。非 boolean は既定値へ fallback。 */
export function normalizePageViewerBreakBeforeHeading(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PAGE_VIEWER_BREAK_BEFORE_HEADING
}

/**
 * PV-SET-4A: 対象見出し最大レベルを安全値へ正規化する。
 * - 非数値 / 非有限値は既定値 (1 = H1のみ) へ fallback
 * - 有限値は最も近い整数へ丸めたうえで 1〜6 にクランプする
 */
export function normalizePageViewerBreakBeforeHeadingMaxLevel(
  value: unknown,
): PageViewerBreakBeforeHeadingMaxLevel {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL
  }
  const rounded = Math.round(value)
  const clamped = Math.min(
    Math.max(rounded, PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL_MIN),
    PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL_MAX,
  )
  return clamped as PageViewerBreakBeforeHeadingMaxLevel
}
