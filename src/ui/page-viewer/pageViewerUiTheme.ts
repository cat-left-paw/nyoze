/**
 * PV-COL-15: Integrated Page Viewer Header の UI theme snapshot。
 *
 * Page Viewer window は独立 `BrowserWindow` であり、main window の
 * `useAppUiState.ts` が行う `document.documentElement.setAttribute('data-theme', ...)`
 * や、custom UI theme / custom font 用の無数の `style.setProperty(...)` 呼び出し
 * (`--bg-topbar` 等、数十個の CSS custom property) を一切受け取らない
 * (PV-COL-9 以来の既知の制約)。
 *
 * その theme 適用経路をこの window 向けに再実装する (二重実装) のではなく、
 * open 時点で main window 側の `getComputedStyle(document.documentElement)` から
 * 「既に解決済みの」少数の CSS token 値だけを読み取り、そのままこの window の
 * `.page-viewer-window` ルートへ inline style として注入する。標準テーマ・
 * custom テーマのどちらでも、既存の theme 解決結果をそのまま転写するだけなので
 * 分岐ロジックを持たない。
 *
 * ここで扱うのは **header chrome の見た目**（背景・境界線・icon button の
 * hover/focus/active・tooltip・separator・タイトル文字色）だけ。本文・
 * outline panel・scrubber・TOC・code block は既存の Reader theme
 * (`pageViewerReaderTheme.ts` → `deriveDocThemeTokens()`) のまま — この
 * module は一切関与しない。
 *
 * React / DOM には依存しない (`capturePageViewerUiThemeSnapshot` は
 * `getComputedStyle` を直接呼ばず、値を読む関数を注入させることで
 * unit test から DOM 無しに検証できるようにしてある)。
 */

/**
 * header chrome が参照する UI theme token の最小集合。
 *
 * 対応する `src/styles.css` の CSS custom property (メインアプリ
 * `.unified-header` / `.toolbar-btn-icon-only` / `[data-tooltip]::after` 等が
 * 実際に使っている token) は `PAGE_VIEWER_UI_THEME_CSS_VAR_MAP` を参照。
 */
export type PageViewerUiThemeSnapshot = {
  /** header 背景。メインアプリの `--bg-topbar` に対応。 */
  headerBackground: string
  /** header 下端の境界線色。メインアプリの `--border-light` に対応。 */
  headerBorder: string
  /** タイトル文字色 / icon button の既定色。メインアプリの `--text-primary` に対応。 */
  textPrimary: string
  /** icon button hover 背景。メインアプリの `--bg-button-hover` に対応。 */
  buttonHoverBackground: string
  /** icon button hover/focus 境界線。メインアプリの `--border-main` に対応。 */
  buttonHoverBorder: string
  /** active/toggle 状態・focus ring の強調色。メインアプリの `--accent` に対応。 */
  accent: string
  /** tooltip 背景。メインアプリの `--bg-dialog` に対応。 */
  tooltipBackground: string
  /** header 内 separator の色。メインアプリの `--border-divider` に対応。 */
  separator: string
}

/**
 * `PageViewerUiThemeSnapshot` の各 field と、それを読み取るメインアプリ側
 * CSS custom property 名の対応。`capturePageViewerUiThemeSnapshot` (renderer 側
 * capture) と `PageViewerHeader` の CSS フォールバック設計の両方が、この一覧を
 * 正本として参照する (フィールド名の重複定義を避ける)。
 */
export const PAGE_VIEWER_UI_THEME_CSS_VAR_MAP: Record<keyof PageViewerUiThemeSnapshot, string> = {
  headerBackground: '--bg-topbar',
  headerBorder: '--border-light',
  textPrimary: '--text-primary',
  buttonHoverBackground: '--bg-button-hover',
  buttonHoverBorder: '--border-main',
  accent: '--accent',
  tooltipBackground: '--bg-dialog',
  separator: '--border-divider',
}

const PAGE_VIEWER_UI_THEME_FIELDS = Object.keys(
  PAGE_VIEWER_UI_THEME_CSS_VAR_MAP,
) as (keyof PageViewerUiThemeSnapshot)[]

/**
 * main window の `getComputedStyle(document.documentElement)` から、この
 * window が必要とする token 値だけを読み取る。DOM に直接触れず、
 * `readCssVar` (呼び出し側が `CSSStyleDeclaration.getPropertyValue` 等を渡す)
 * を経由するため、unit test では DOM 無しに任意の固定値を注入できる。
 *
 * 値は custom UI theme (`data-theme="custom"`) を含め、既存 theme 解決の
 * **結果** をそのまま読むだけなので、標準 / custom の分岐は一切持たない。
 */
export function capturePageViewerUiThemeSnapshot(
  readCssVar: (cssVarName: string) => string,
): PageViewerUiThemeSnapshot {
  const snapshot = {} as PageViewerUiThemeSnapshot
  for (const field of PAGE_VIEWER_UI_THEME_FIELDS) {
    snapshot[field] = readCssVar(PAGE_VIEWER_UI_THEME_CSS_VAR_MAP[field]).trim()
  }
  return snapshot
}

const MAX_UI_THEME_TOKEN_LENGTH = 200

// CSS custom property の値としてそのまま inline style (React の style object
// 経由、`CSSStyleDeclaration.setProperty`) へ渡すだけなので CSS injection の
// 実害は無い (文字列連結で <style> を組み立てているわけではない) が、想定外の
// 値の紛れ込みに対する防御的な許可リストとして、hex / rgb(a) / hsl(a) /
// color-mix() / named color 相当の文字種だけを許可する。既存テーマの
// `--bg-topbar` 等は `rgba(...)` 形式のものもあり、`CSS_HEX_COLOR_RE`
// (`#rrggbb` 限定、`docColorSettings` 用) は流用できない。
// 空白は半角スペースのみ許可する ── `\s` は改行・タブも含んでしまうため、
// 意図的にリテラルのスペース 1 文字だけを許可リストに入れている。
const SAFE_CSS_TOKEN_RE = /^[A-Za-z0-9#().,% \-+]{1,200}$/

function validateUiThemeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.length === 0 || value.length > MAX_UI_THEME_TOKEN_LENGTH) return null
  if (!SAFE_CSS_TOKEN_RE.test(value)) return null
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `pageViewer:openSnapshot` / `pageViewer:openBook` の main 側ハンドラが
 * renderer からの `unknown` 値を検証する。省略可 (`undefined` はそのまま
 * `undefined`)。一部の field だけが不正な場合は snapshot 全体を `null`
 * (呼び出し側は uiTheme 無しの既存フォールバック chrome へ倒す)。
 *
 * `electron/bookPageViewerOperation.ts` (Book 全体 viewer) と
 * `pageViewerTypes.ts` (active document viewer) の両方から呼ばれる唯一の
 * validator — 二重実装しない。
 */
export function validatePageViewerUiThemeSnapshot(
  value: unknown,
): PageViewerUiThemeSnapshot | undefined | null {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) return null
  const result = {} as PageViewerUiThemeSnapshot
  for (const field of PAGE_VIEWER_UI_THEME_FIELDS) {
    const validated = validateUiThemeToken(value[field])
    if (validated === null) return null
    result[field] = validated
  }
  return result
}
