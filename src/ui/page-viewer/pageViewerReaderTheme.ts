/**
 * PV-COL-12: Page Viewer reader theme (session-only)。
 *
 * header のテーマ dropdown で選べる 4 択を、実際の `DocumentColorSettings`
 * (`pageColor` / `textColor` / `headingColor`) へ解決する pure module。
 * React / DOM には依存しない。
 *
 * `settings.json` / frontmatter / snapshot payload の文書設定は一切変更しない —
 * ここで選んだ結果は `PageViewerWindowRoot.tsx` 内の React state (session-only)
 * にだけ保持し、viewer を閉じて開き直すと payload の文書設定へ戻る
 * (`docs/page-viewer-css-columns-design-2026-07.md` §17)。
 *
 * 4 択の色の出どころ:
 * - `document` (文書テーマ追従): snapshot payload の `pageColor` / `textColor` /
 *   `headingColor`。省略項目は `DEFAULT_DOC_COLOR_SETTINGS` へフォールバックする —
 *   これは既存 `buildPageViewerStyleVars()` の derivation とまったく同じ規則で、
 *   新規に定義し直さない。
 * - `light` / `dark`: 既存 `UI_THEME_DOC_COLOR_PRESETS.light` / `.dark`
 *   (`settings/defaults.ts`) をそのまま流用する。新しい配色定数は作らない。
 * - `paper`: 既存 `DOCUMENT_THEME_COLOR_PRESETS['paper-light']`
 *   (`settings/defaults.ts`、ラベルは "Paper Light") を流用する。依頼の 4 択は
 *   単一の「ペーパー」であり、`paper-dark` ではなく `paper-light` (暖色クリーム地)
 *   を採用したのは、既存プリセットの中で「紙」の見た目に最も直感的に一致する
 *   ことに加え、他の 3 択 (文書追従 / ライト / ダーク) が既定でどれも独立した
 *   printed-page 的な明暗コントラストを持つのに対し、`paper-light` だけが唯一
 *   「暖色の紙」という第三の質感を追加できるため。
 */

import { DEFAULT_DOC_COLOR_SETTINGS, DOCUMENT_THEME_COLOR_PRESETS, UI_THEME_DOC_COLOR_PRESETS } from '../../settings/defaults'
import type { DocumentColorSettings } from '../../settings/types'

export type PageViewerReaderTheme = 'document' | 'light' | 'dark' | 'paper'

/** dropdown に表示する順序そのもの (依頼の列挙順と同じ)。 */
export const PAGE_VIEWER_READER_THEME_OPTIONS: readonly PageViewerReaderTheme[] = [
  'document',
  'light',
  'dark',
  'paper',
]

export const DEFAULT_PAGE_VIEWER_READER_THEME: PageViewerReaderTheme = 'document'

export const PAGE_VIEWER_READER_THEME_LABELS: Record<PageViewerReaderTheme, string> = {
  document: '文書テーマ追従',
  light: 'ライト',
  dark: 'ダーク',
  paper: 'ペーパー',
}

export function isPageViewerReaderTheme(value: unknown): value is PageViewerReaderTheme {
  return value === 'document' || value === 'light' || value === 'dark' || value === 'paper'
}

/** snapshot payload が持つ表示色 3 項目だけの最小 shape (payload 全体に依存しない)。 */
export type PageViewerReaderThemeDocumentColors = {
  pageColor?: string
  textColor?: string
  headingColor?: string
}

/**
 * `document` (文書テーマ追従) 選択時の色。省略項目は `DEFAULT_DOC_COLOR_SETTINGS`
 * へフォールバックする — `PageViewerWindowRoot.tsx` の旧 `buildPageViewerStyleVars()`
 * が payload から直接行っていたのと同じ derivation をここへ集約しただけで、
 * 挙動は変えていない。
 */
export function documentReaderThemeColors(
  payload: PageViewerReaderThemeDocumentColors,
): DocumentColorSettings {
  return {
    pageColor: payload.pageColor ?? DEFAULT_DOC_COLOR_SETTINGS.pageColor,
    textColor: payload.textColor ?? DEFAULT_DOC_COLOR_SETTINGS.textColor,
    headingColor: payload.headingColor ?? DEFAULT_DOC_COLOR_SETTINGS.headingColor,
  }
}

/**
 * 選択中の reader theme を実際の `DocumentColorSettings` へ解決する。
 * `document` 以外は既存プリセットをそのまま返すだけで、新規配色は増やさない。
 */
export function resolvePageViewerReaderThemeColors(
  theme: PageViewerReaderTheme,
  payload: PageViewerReaderThemeDocumentColors,
): DocumentColorSettings {
  switch (theme) {
    case 'light':
      return UI_THEME_DOC_COLOR_PRESETS.light
    case 'dark':
      return UI_THEME_DOC_COLOR_PRESETS.dark
    case 'paper':
      return DOCUMENT_THEME_COLOR_PRESETS['paper-light']
    case 'document':
      return documentReaderThemeColors(payload)
    default:
      return documentReaderThemeColors(payload)
  }
}
