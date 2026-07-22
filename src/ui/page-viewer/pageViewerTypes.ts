/**
 * 軽量ページビューア (独立 BrowserWindow) の window 間 payload 型と、その
 * validation / query-mode 判定を提供する pure module。
 *
 * `PMNode` / `PageViewModel` (`pageModel.ts` / `pageModelView.ts`) は window 間
 * IPC でそのまま渡さない。viewer window 側が `markdown` snapshot から自分で
 * `parseMarkdown → PageModel → PageViewModel` を組み立てる (`PageViewerWindowRoot.tsx`)。
 * ここにあるのは、その前段の「main ⇄ viewer window」間で受け渡す serializable な
 * plain data の型と検証だけ。
 *
 * fs / Electron / React / DOM には依存しない (viewer window 起動判定は
 * `URLSearchParams` のみ使用、main / preload / renderer のどこからでも import 可能)。
 */

import type { HeadingAlign, HeadingDividerLevels, WritingMode } from '../../settings/types'
import {
  validatePageViewerUiThemeSnapshot,
  type PageViewerUiThemeSnapshot,
} from './pageViewerUiTheme'

/** 本文冒頭の文書情報。3 項目とも `PageModelDocumentInfo` (`pageModel.ts`) と同じ shape。 */
export type PageViewerDocumentInfo = {
  title?: string
  author?: string
  translator?: string
}

/**
 * PV-SET-2: Display Settings の metadata field visibility open-time snapshot。
 * settings.json の既存 frontmatter* key と同名・同意味。Page Viewer 専用 boolean は作らない。
 * Project-file 3 key は Book Viewer の chapterInfo 表示にだけ使う。
 */
export type PageViewerMetadataDisplaySnapshot = {
  frontmatterVisible?: boolean
  frontmatterShowAuthors?: boolean
  frontmatterShowTranslators?: boolean
  frontmatterShowRoleLabels?: boolean
  /** Book chapterInfo master（既定 false）。bookInfo / documentInfo には使わない。 */
  frontmatterShowInProjectFiles?: boolean
  /** chapterInfo の title 表示可否。chapter anchor label には影響しない。 */
  frontmatterProjectShowTitle?: boolean
  /** chapterInfo の authors 追加条件（`frontmatterShowAuthors` と AND）。 */
  frontmatterProjectShowAuthors?: boolean
}

/** Book 全体 Page Viewer で渡す 1 章分の serializable snapshot。 */
export type PageViewerBookChapterSnapshot = {
  /** `.nyoze/books.json` v3 body item の path。chapterId として使う。 */
  path: string
  /** `.nyoze/books.json` v3 body item の title。frontmatter からは再取得しない。 */
  title: string
  authors?: readonly string[]
  translators?: readonly string[]
  /** frontmatter 除去済みの chapter Markdown body。 */
  markdown: string
}

/**
 * Page Viewer 専用の画像 capability。scope / base token は main が発行する opaque
 * identifier で、実 directory / file path はこの payload に絶対に含めない。
 *
 * - `defaultBaseToken`: active document viewer の本文用 base。
 * - `chapterBaseTokens`: Book viewer の chapter path ごとの base。chapter ごとに
 *   同名の相対画像を独立して解決できる。
 */
export type PageViewerImageScope = {
  scopeId: string
  defaultBaseToken?: string
  chapterBaseTokens?: Readonly<Record<string, string>>
}

/**
 * `pageViewer:openSnapshot` で renderer → main へ渡す入力。`payloadId` は main が
 * 発行するため含まない。
 *
 * `pageColor` / `textColor` / `headingColor` / `fontSize` / `fontFamily` /
 * `lineHeight` は、open 時点の Display Settings / document theme の見た目
 * snapshot (`usePageViewerLauncher.ts` が組み立てる)。live sync はしない —
 * viewer window は open 時点の値をそのまま使い続ける。
 */
type PageViewerSnapshotBase = {
  title: string
  /**
   * heading から TOC synthetic section を作るか。Page Viewer 専用 option
   * (export options の `includeTableOfContents` とは別経路・別既定)。
   * 省略時は viewer 側で TOC を出さない (`false` 相当)。
   */
  includeTableOfContents?: boolean
  /**
   * `includeTableOfContents: true` のときの見出し最大レベル (1〜6)。
   * 省略時は PageModel 側の既定 `6`。
   */
  tableOfContentsMaxLevel?: number
  writingMode?: WritingMode
  fontSize?: number
  fontFamily?: string
  lineHeight?: number
  /** 本文背景色 (`#rrggbb`)。`DocumentColorSettings.pageColor` と同じ shape。 */
  pageColor?: string
  /** 本文文字色 (`#rrggbb`)。`DocumentColorSettings.textColor` と同じ shape。 */
  textColor?: string
  /** 見出し色 (`#rrggbb`)。header title / progress bar の控えめな補助色にも使う。 */
  headingColor?: string
  /**
   * PV-SET-1A: 見出し font-family (`docHeadingFont` の解決済み値、`same-as-body`
   * は本文 `fontFamily` と同じ値に解決済み)。省略時は viewer の `fontFamily`
   * (省略時はさらに既定フォント) にフォールバックする。
   */
  headingFontFamily?: string
  /** 見出し後余白 (em)。`DisplaySettings.headingMarginAfter` と同じ範囲 (0〜1.5)。 */
  headingMarginAfter?: number
  /** 見出し区切り線レベル (h1〜h6 の 6 キーすべてが boolean の object のみ)。 */
  headingDividerLevels?: HeadingDividerLevels
  /** 横書き時の見出し配置 (`start` / `center` / `end`)。 */
  headingAlignHorizontal?: HeadingAlign
  /** 縦書き時の見出し配置 (`start` / `center` / `end`)。 */
  headingAlignVertical?: HeadingAlign
  /** ルビ文字サイズ (em)。`DisplaySettings.rubySize` と同じ範囲 (0.3〜1.2)。 */
  rubySize?: number
  /**
   * PV-SET-1B: display-only auto TCY (`DisplaySettings.autoTcy*` と同じ意味)。
   * Viewer 適用時は `resolveAutoTcyDigitRange` で正規化する（1..4 clamp、
   * min>max なら swap。Display Settings / `normalizeDisplaySettings` と同規則）。
   * horizontal-tb では設定が true でも auto TCY 化しない（Viewer 側 gate）。
   */
  autoTcyEnabled?: boolean
  autoTcyNumbersOnly?: boolean
  autoTcyMinDigits?: number
  autoTcyMaxDigits?: number
  /**
   * PV-SET-2: metadata field visibility（settings.json の既存 frontmatter*
   * と同名）。省略時は Viewer 側で `DEFAULT_FRONTMATTER_*` へ fallback。
   * live sync はしない。値 filter は `pageViewerSnapshotView`、role label
   * 表示は SyntheticView 側。Project-file 3 key は Book chapterInfo 専用。
   */
  frontmatterVisible?: boolean
  frontmatterShowAuthors?: boolean
  frontmatterShowTranslators?: boolean
  frontmatterShowRoleLabels?: boolean
  frontmatterShowInProjectFiles?: boolean
  frontmatterProjectShowTitle?: boolean
  frontmatterProjectShowAuthors?: boolean
  /**
   * PV-SET-4A: Page Viewer（active document / Book Viewer 共通）の読書用
   * pagination default「見出しの前で改ページ」（settings.json の
   * `pageViewerBreakBeforeHeading` と同名・同意味）。省略時は viewer 側で
   * `false` へ fallback。live sync はしない（open 時点の snapshot 固定）。
   * 外部 export の `pageBreakBeforeHeading` とは独立した key。
   */
  pageViewerBreakBeforeHeading?: boolean
  /**
   * `pageViewerBreakBeforeHeading: true` のときの対象見出し最大レベル
   * (1〜6、省略時は viewer 側で `1` = H1のみへ fallback)。
   */
  pageViewerBreakBeforeHeadingMaxLevel?: number
  /**
   * PV-READ-1: 読書面の物理上余白（settings.json の選択値 0〜80 / 8px 刻み）。
   * 省略時は viewer 側で既定 16 へ fallback。live sync はしない。
   */
  pageViewerReadingMarginTop?: number
  /** PV-READ-1: 物理下余白（選択値）。省略時は既定 16。 */
  pageViewerReadingMarginBottom?: number
  /** PV-READ-1: 物理左右共通余白（選択値）。省略時は既定 16。 */
  pageViewerReadingMarginInline?: number
  /** PV-READ-1: 用紙枠 ON/OFF。省略時は既定 true。 */
  pageViewerReadingPaperFrame?: boolean
  /** PV-READ-2: 読書面 header furniture 表示。省略時は既定 true。 */
  pageViewerReadingHeaderEnabled?: boolean
  /** PV-READ-2: header 物理位置。省略時は既定 'start'。 */
  pageViewerReadingHeaderAlign?: 'start' | 'center' | 'end'
  /** PV-READ-2: header 内容。省略時は既定 'title'。 */
  pageViewerReadingHeaderContent?: 'title' | 'title-author'
  /** PV-READ-2: footer furniture 表示。省略時は既定 true。 */
  pageViewerReadingFooterEnabled?: boolean
  /** PV-READ-2: footer 物理位置。省略時は既定 'end'。 */
  pageViewerReadingFooterAlign?: 'start' | 'center' | 'end'
  /** PV-READ-3B: 冒頭の表示専用簡易表紙。省略時は既定 false。 */
  pageViewerReadingSimpleCoverEnabled?: boolean
  /** PV-READ-3B: 表紙groupだけの書字方向。 */
  pageViewerReadingSimpleCoverWritingMode?: 'inherit' | 'vertical-rl' | 'horizontal-tb'
  /** PV-READ-3B: Web Book / Tategakiと意味を揃えた通常/中央配置。 */
  pageViewerReadingSimpleCoverLayout?: 'normal' | 'center'
  /**
   * PV-COL-15: 起動元メインアプリの UI theme (標準 / custom 問わず) から
   * open 時点で解決済みの token だけを snapshot した最小集合。
   * `PageViewerHeader` の背景・境界線・icon button・tooltip・separator
   * だけに使う — 本文・outline panel・scrubber・TOC・code block の Reader
   * theme (`pageColor`/`textColor`/`headingColor` 由来) とは独立した経路。
   * live sync はしない (open 時点の値に固定)。省略時は既存の chrome token
   * フォールバックへ倒れる。
   */
  uiTheme?: PageViewerUiThemeSnapshot
}

export type PageViewerDocumentSnapshotRequest = PageViewerSnapshotBase & {
  kind?: 'document'
  markdown: string
  documentInfo?: PageViewerDocumentInfo
}

export type PageViewerBookSnapshotRequest = PageViewerSnapshotBase & {
  kind: 'book'
  bookInfo?: PageViewerDocumentInfo
  chapters: readonly PageViewerBookChapterSnapshot[]
}

export type PageViewerSnapshotRequest = PageViewerDocumentSnapshotRequest | PageViewerBookSnapshotRequest

/** main が保持し、`pageViewer:getSnapshot` で viewer window へ返す payload。 */
export type PageViewerSnapshotPayload = PageViewerSnapshotRequest & {
  payloadId: string
  imageScope?: PageViewerImageScope
}

// Markdown 本文は electron/ipcSecurity.ts の MAX_CONTENT_LENGTH と同じ上限に揃える
// (この module は electron に依存しないため、ここでは定数として複製する)。
const MAX_PAGE_VIEWER_MARKDOWN_LENGTH = 50 * 1024 * 1024
const MAX_PAGE_VIEWER_TITLE_LENGTH = 500
const MAX_PAGE_VIEWER_PATH_LENGTH = 4096
const MAX_PAGE_VIEWER_FONT_FAMILY_LENGTH = 300
const MAX_PAGE_VIEWER_CHAPTER_COUNT = 2000
const MAX_PAGE_VIEWER_CREDIT_COUNT = 32
const MIN_PAGE_VIEWER_FONT_SIZE = 1
const MAX_PAGE_VIEWER_FONT_SIZE = 400
// Display Settings の lineHeight スライダーと同じ範囲 (DisplaySettingsModal.tsx / ThemeStudioModal.tsx)。
// IPC 境界の validation は「将来の調整幅」ではなく現行正本に揃えるほうが安全なため、独自に広げない。
const MIN_PAGE_VIEWER_LINE_HEIGHT = 1.2
const MAX_PAGE_VIEWER_LINE_HEIGHT = 2.8
// Display Settings の headingMarginAfter / rubySize スライダーと同じ範囲
// (electron/settingsSanitizer.ts の clamp と一致させる)。
const MIN_PAGE_VIEWER_HEADING_MARGIN_AFTER = 0
const MAX_PAGE_VIEWER_HEADING_MARGIN_AFTER = 1.5
const MIN_PAGE_VIEWER_RUBY_SIZE = 0.3
const MAX_PAGE_VIEWER_RUBY_SIZE = 1.2
// Display Settings / `autoTcy.ts` の digit 範囲と同じ (1〜4)。
// IPC では「有限整数かつ範囲内」だけ受理し、min/max 逆転は reject せず
// Viewer 適用時の `resolveAutoTcyDigitRange` に正規化を委ねる。
const MIN_PAGE_VIEWER_AUTO_TCY_DIGITS = 1
const MAX_PAGE_VIEWER_AUTO_TCY_DIGITS = 4
// `docColorSettings` (settingsSanitizer.ts の isHexColor) と同じ `#rrggbb` 形式のみ許容する。
const CSS_HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const PAGE_VIEWER_OPAQUE_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafePageViewerChapterPath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_PAGE_VIEWER_PATH_LENGTH) return false
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[/\\]/.test(value)) return false
  return !value.replace(/\\/g, '/').split('/').some((segment) => segment === '..')
}

/** trim はしない (表示文字列としてそのまま扱う)。空文字列は許容する。 */
function validateOptionalBoundedString(
  value: unknown,
  maxLength: number,
): { ok: true; value: string | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined }
  if (typeof value !== 'string' || value.length > maxLength) return { ok: false }
  return { ok: true, value }
}

function validateDocumentInfo(value: unknown): PageViewerDocumentInfo | undefined | null {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) return null
  const title = validateOptionalBoundedString(value.title, MAX_PAGE_VIEWER_TITLE_LENGTH)
  const author = validateOptionalBoundedString(value.author, MAX_PAGE_VIEWER_TITLE_LENGTH)
  const translator = validateOptionalBoundedString(value.translator, MAX_PAGE_VIEWER_TITLE_LENGTH)
  if (!title.ok || !author.ok || !translator.ok) return null
  return { title: title.value, author: author.value, translator: translator.value }
}

function validateOptionalStringArray(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_PAGE_VIEWER_CREDIT_COUNT) return null
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length > MAX_PAGE_VIEWER_TITLE_LENGTH) return null
    out.push(entry)
  }
  return out
}

function validateBookChapters(value: unknown): PageViewerBookChapterSnapshot[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PAGE_VIEWER_CHAPTER_COUNT) {
    return null
  }

  let totalMarkdownLength = 0
  const chapters: PageViewerBookChapterSnapshot[] = []
  for (const chapter of value) {
    if (!isPlainObject(chapter)) return null
    const path = validateOptionalBoundedString(chapter.path, MAX_PAGE_VIEWER_PATH_LENGTH)
    const title = validateOptionalBoundedString(chapter.title, MAX_PAGE_VIEWER_TITLE_LENGTH)
    const authors = validateOptionalStringArray(chapter.authors)
    const translators = validateOptionalStringArray(chapter.translators)
    if (!path.ok || !path.value || !title.ok || title.value === undefined || authors === null || translators === null) {
      return null
    }
    if (typeof chapter.markdown !== 'string') return null
    totalMarkdownLength += chapter.markdown.length
    if (totalMarkdownLength > MAX_PAGE_VIEWER_MARKDOWN_LENGTH) return null
    chapters.push({
      path: path.value,
      title: title.value,
      authors,
      translators,
      markdown: chapter.markdown,
    })
  }
  return chapters
}

function validateWritingMode(value: unknown): WritingMode | undefined | null {
  if (value === undefined) return undefined
  if (value === 'vertical-rl' || value === 'horizontal-tb') return value
  return null
}

function validateFontSize(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < MIN_PAGE_VIEWER_FONT_SIZE ||
    value > MAX_PAGE_VIEWER_FONT_SIZE
  ) {
    return null
  }
  return value
}

function validateLineHeight(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < MIN_PAGE_VIEWER_LINE_HEIGHT ||
    value > MAX_PAGE_VIEWER_LINE_HEIGHT
  ) {
    return null
  }
  return value
}

function validateHeadingMarginAfter(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < MIN_PAGE_VIEWER_HEADING_MARGIN_AFTER ||
    value > MAX_PAGE_VIEWER_HEADING_MARGIN_AFTER
  ) {
    return null
  }
  return value
}

function validateRubySize(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < MIN_PAGE_VIEWER_RUBY_SIZE ||
    value > MAX_PAGE_VIEWER_RUBY_SIZE
  ) {
    return null
  }
  return value
}

/**
 * auto TCY の桁数 field。有限整数かつ 1〜4 のみ受理する。
 * min/max の大小関係はここでは検証せず、Viewer 側で `resolveAutoTcyDigitRange`
 * により Display Settings と同じく swap / clamp する。
 */
function validateAutoTcyDigitCount(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < MIN_PAGE_VIEWER_AUTO_TCY_DIGITS ||
    value > MAX_PAGE_VIEWER_AUTO_TCY_DIGITS
  ) {
    return null
  }
  return value
}

function validateHeadingAlign(value: unknown): HeadingAlign | undefined | null {
  if (value === undefined) return undefined
  if (value === 'start' || value === 'center' || value === 'end') return value
  return null
}

/** h1〜h6 の 6 キーすべてが boolean の object のみ受理する。部分 object は不正とする。 */
function validateHeadingDividerLevels(value: unknown): HeadingDividerLevels | undefined | null {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) return null
  const levels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
  const out = {} as HeadingDividerLevels
  for (const level of levels) {
    const levelValue = value[level]
    if (typeof levelValue !== 'boolean') return null
    out[level] = levelValue
  }
  return out
}

function validateHexColor(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !CSS_HEX_COLOR_RE.test(value)) return null
  return value
}

function validateOptionalBoolean(value: unknown): boolean | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') return null
  return value
}

/**
 * main が viewer payload へ付与する image scope の defensive validator。
 * renderer 起点の `PageViewerSnapshotRequest` には含めず、main で発行した UUID
 * capability だけを受理する。chapter path は payload 内の relative path 文字列を
 * key とするが、base directory のような filesystem 情報は持てない。
 */
export function validatePageViewerImageScope(value: unknown): PageViewerImageScope | null {
  if (!isPlainObject(value) || typeof value.scopeId !== 'string' || !PAGE_VIEWER_OPAQUE_TOKEN_RE.test(value.scopeId)) {
    return null
  }
  const defaultBaseToken = value.defaultBaseToken
  if (defaultBaseToken !== undefined && (typeof defaultBaseToken !== 'string' || !PAGE_VIEWER_OPAQUE_TOKEN_RE.test(defaultBaseToken))) {
    return null
  }
  const rawChapterBaseTokens = value.chapterBaseTokens
  if (rawChapterBaseTokens !== undefined && !isPlainObject(rawChapterBaseTokens)) return null
  const chapterBaseTokens: Record<string, string> = {}
  if (rawChapterBaseTokens) {
    for (const [chapterPath, baseToken] of Object.entries(rawChapterBaseTokens)) {
      if (
        !isSafePageViewerChapterPath(chapterPath) ||
        typeof baseToken !== 'string' ||
        !PAGE_VIEWER_OPAQUE_TOKEN_RE.test(baseToken)
      ) {
        return null
      }
      chapterBaseTokens[chapterPath] = baseToken
    }
  }
  if (defaultBaseToken === undefined && Object.keys(chapterBaseTokens).length === 0) return null
  return {
    scopeId: value.scopeId,
    ...(defaultBaseToken === undefined ? {} : { defaultBaseToken }),
    ...(Object.keys(chapterBaseTokens).length === 0 ? {} : { chapterBaseTokens }),
  }
}

/** TOC 最大レベル。省略可。有限数値なら 1〜6 にクランプして受理する。 */
function validateTableOfContentsMaxLevel(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return Math.min(Math.max(rounded, 1), 6)
}

/**
 * PV-SET-4A: 見出し前改ページの対象見出し最大レベル。省略可。有限数値なら
 * 1〜6 にクランプして受理する (`validateTableOfContentsMaxLevel` と同じ
 * clamp-not-reject 方針。範囲外の値を reject せず安全側にクランプする)。
 */
function validatePageViewerHeadingBreakMaxLevel(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return Math.min(Math.max(rounded, 1), 6)
}

/**
 * PV-READ-1: 読書面余白。省略可。有限数値なら 0〜80 / 8px 刻みへ正規化して受理。
 * 不正型は payload reject（sanitizer の fallback 方針とは別。IPC 境界は strict）。
 */
function validatePageViewerReadingMargin(value: unknown): number | undefined | null {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const clamped = Math.min(80, Math.max(0, value))
  return Math.round(clamped / 8) * 8
}

/** PV-READ-2: furniture align。省略可。許可 enum 以外は reject。 */
function validatePageViewerReadingFurnitureAlign(
  value: unknown,
): 'start' | 'center' | 'end' | undefined | null {
  if (value === undefined) return undefined
  if (value === 'start' || value === 'center' || value === 'end') return value
  return null
}

/** PV-READ-2: header content。省略可。許可 enum 以外は reject。 */
function validatePageViewerReadingHeaderContent(
  value: unknown,
): 'title' | 'title-author' | undefined | null {
  if (value === undefined) return undefined
  if (value === 'title' || value === 'title-author') return value
  return null
}

function validatePageViewerReadingSimpleCoverWritingModeValue(
  value: unknown,
): 'inherit' | 'vertical-rl' | 'horizontal-tb' | undefined | null {
  if (value === undefined) return undefined
  if (value === 'inherit' || value === 'vertical-rl' || value === 'horizontal-tb') return value
  return null
}

function validatePageViewerReadingSimpleCoverLayoutValue(
  value: unknown,
): 'normal' | 'center' | undefined | null {
  if (value === undefined) return undefined
  if (value === 'normal' || value === 'center') return value
  return null
}

/**
 * `pageViewer:openSnapshot` の main 側ハンドラが renderer からの `unknown` payload を
 * 検証する。不正なら `null`。`documentInfo` / `includeTableOfContents` /
 * `tableOfContentsMaxLevel` / `writingMode` / `fontSize` / `fontFamily` /
 * `lineHeight` / `pageColor` / `textColor` / `headingColor` / `headingFontFamily` /
 * `headingMarginAfter` / `headingDividerLevels` / `headingAlignHorizontal` /
 * `headingAlignVertical` / `rubySize` / `autoTcyEnabled` / `autoTcyNumbersOnly` /
 * `autoTcyMinDigits` / `autoTcyMaxDigits` / `frontmatterVisible` /
 * `frontmatterShowAuthors` / `frontmatterShowTranslators` /
 * `frontmatterShowRoleLabels` / `frontmatterShowInProjectFiles` /
 * `frontmatterProjectShowTitle` / `frontmatterProjectShowAuthors` /
 * `pageViewerBreakBeforeHeading` / `pageViewerBreakBeforeHeadingMaxLevel` /
 * `pageViewerReadingMarginTop` / `pageViewerReadingMarginBottom` /
 * `pageViewerReadingMarginInline` / `pageViewerReadingPaperFrame` /
 * `pageViewerReadingHeaderEnabled` / `pageViewerReadingHeaderAlign` /
 * `pageViewerReadingHeaderContent` / `pageViewerReadingFooterEnabled` /
 * `pageViewerReadingFooterAlign` /
 * `uiTheme` はすべて省略可能
 * (省略時 viewer 側の既定値にフォールバックする)。
 */
export function validatePageViewerSnapshotRequest(value: unknown): PageViewerSnapshotRequest | null {
  if (!isPlainObject(value)) return null

  const {
    kind,
    title,
    markdown,
    documentInfo,
    bookInfo,
    chapters,
    includeTableOfContents,
    tableOfContentsMaxLevel,
    writingMode,
    fontSize,
    fontFamily,
    lineHeight,
    pageColor,
    textColor,
    headingColor,
    headingFontFamily,
    headingMarginAfter,
    headingDividerLevels,
    headingAlignHorizontal,
    headingAlignVertical,
    rubySize,
    autoTcyEnabled,
    autoTcyNumbersOnly,
    autoTcyMinDigits,
    autoTcyMaxDigits,
    frontmatterVisible,
    frontmatterShowAuthors,
    frontmatterShowTranslators,
    frontmatterShowRoleLabels,
    frontmatterShowInProjectFiles,
    frontmatterProjectShowTitle,
    frontmatterProjectShowAuthors,
    pageViewerBreakBeforeHeading,
    pageViewerBreakBeforeHeadingMaxLevel,
    pageViewerReadingMarginTop,
    pageViewerReadingMarginBottom,
    pageViewerReadingMarginInline,
    pageViewerReadingPaperFrame,
    pageViewerReadingHeaderEnabled,
    pageViewerReadingHeaderAlign,
    pageViewerReadingHeaderContent,
    pageViewerReadingFooterEnabled,
    pageViewerReadingFooterAlign,
    pageViewerReadingSimpleCoverEnabled,
    pageViewerReadingSimpleCoverWritingMode,
    pageViewerReadingSimpleCoverLayout,
    uiTheme,
  } = value

  if (typeof title !== 'string' || title.length === 0 || title.length > MAX_PAGE_VIEWER_TITLE_LENGTH) {
    return null
  }
  if (kind !== undefined && kind !== 'document' && kind !== 'book') {
    return null
  }

  const validDocumentInfo = validateDocumentInfo(documentInfo)
  if (validDocumentInfo === null) return null
  const validBookInfo = validateDocumentInfo(bookInfo)
  if (validBookInfo === null) return null

  const validIncludeToc = validateOptionalBoolean(includeTableOfContents)
  if (validIncludeToc === null) return null

  const validTocMaxLevel = validateTableOfContentsMaxLevel(tableOfContentsMaxLevel)
  if (validTocMaxLevel === null) return null

  const validWritingMode = validateWritingMode(writingMode)
  if (validWritingMode === null) return null

  const validFontSize = validateFontSize(fontSize)
  if (validFontSize === null) return null

  const validFontFamily = validateOptionalBoundedString(fontFamily, MAX_PAGE_VIEWER_FONT_FAMILY_LENGTH)
  if (!validFontFamily.ok) return null

  const validLineHeight = validateLineHeight(lineHeight)
  if (validLineHeight === null) return null

  const validPageColor = validateHexColor(pageColor)
  if (validPageColor === null) return null

  const validTextColor = validateHexColor(textColor)
  if (validTextColor === null) return null

  const validHeadingColor = validateHexColor(headingColor)
  if (validHeadingColor === null) return null

  const validHeadingFontFamily = validateOptionalBoundedString(headingFontFamily, MAX_PAGE_VIEWER_FONT_FAMILY_LENGTH)
  if (!validHeadingFontFamily.ok) return null

  const validHeadingMarginAfter = validateHeadingMarginAfter(headingMarginAfter)
  if (validHeadingMarginAfter === null) return null

  const validHeadingDividerLevels = validateHeadingDividerLevels(headingDividerLevels)
  if (validHeadingDividerLevels === null) return null

  const validHeadingAlignHorizontal = validateHeadingAlign(headingAlignHorizontal)
  if (validHeadingAlignHorizontal === null) return null

  const validHeadingAlignVertical = validateHeadingAlign(headingAlignVertical)
  if (validHeadingAlignVertical === null) return null

  const validRubySize = validateRubySize(rubySize)
  if (validRubySize === null) return null

  const validAutoTcyEnabled = validateOptionalBoolean(autoTcyEnabled)
  if (validAutoTcyEnabled === null) return null

  const validAutoTcyNumbersOnly = validateOptionalBoolean(autoTcyNumbersOnly)
  if (validAutoTcyNumbersOnly === null) return null

  const validAutoTcyMinDigits = validateAutoTcyDigitCount(autoTcyMinDigits)
  if (validAutoTcyMinDigits === null) return null

  const validAutoTcyMaxDigits = validateAutoTcyDigitCount(autoTcyMaxDigits)
  if (validAutoTcyMaxDigits === null) return null

  const validFrontmatterVisible = validateOptionalBoolean(frontmatterVisible)
  if (validFrontmatterVisible === null) return null

  const validFrontmatterShowAuthors = validateOptionalBoolean(frontmatterShowAuthors)
  if (validFrontmatterShowAuthors === null) return null

  const validFrontmatterShowTranslators = validateOptionalBoolean(frontmatterShowTranslators)
  if (validFrontmatterShowTranslators === null) return null

  const validFrontmatterShowRoleLabels = validateOptionalBoolean(frontmatterShowRoleLabels)
  if (validFrontmatterShowRoleLabels === null) return null

  const validFrontmatterShowInProjectFiles = validateOptionalBoolean(frontmatterShowInProjectFiles)
  if (validFrontmatterShowInProjectFiles === null) return null

  const validFrontmatterProjectShowTitle = validateOptionalBoolean(frontmatterProjectShowTitle)
  if (validFrontmatterProjectShowTitle === null) return null

  const validFrontmatterProjectShowAuthors = validateOptionalBoolean(frontmatterProjectShowAuthors)
  if (validFrontmatterProjectShowAuthors === null) return null

  const validPageViewerBreakBeforeHeading = validateOptionalBoolean(pageViewerBreakBeforeHeading)
  if (validPageViewerBreakBeforeHeading === null) return null

  const validPageViewerBreakBeforeHeadingMaxLevel = validatePageViewerHeadingBreakMaxLevel(
    pageViewerBreakBeforeHeadingMaxLevel,
  )
  if (validPageViewerBreakBeforeHeadingMaxLevel === null) return null

  const validPageViewerReadingMarginTop = validatePageViewerReadingMargin(pageViewerReadingMarginTop)
  if (validPageViewerReadingMarginTop === null) return null

  const validPageViewerReadingMarginBottom = validatePageViewerReadingMargin(pageViewerReadingMarginBottom)
  if (validPageViewerReadingMarginBottom === null) return null

  const validPageViewerReadingMarginInline = validatePageViewerReadingMargin(pageViewerReadingMarginInline)
  if (validPageViewerReadingMarginInline === null) return null

  const validPageViewerReadingPaperFrame = validateOptionalBoolean(pageViewerReadingPaperFrame)
  if (validPageViewerReadingPaperFrame === null) return null

  const validPageViewerReadingHeaderEnabled = validateOptionalBoolean(pageViewerReadingHeaderEnabled)
  if (validPageViewerReadingHeaderEnabled === null) return null

  const validPageViewerReadingHeaderAlign = validatePageViewerReadingFurnitureAlign(
    pageViewerReadingHeaderAlign,
  )
  if (validPageViewerReadingHeaderAlign === null) return null

  const validPageViewerReadingHeaderContent = validatePageViewerReadingHeaderContent(
    pageViewerReadingHeaderContent,
  )
  if (validPageViewerReadingHeaderContent === null) return null

  const validPageViewerReadingFooterEnabled = validateOptionalBoolean(pageViewerReadingFooterEnabled)
  if (validPageViewerReadingFooterEnabled === null) return null

  const validPageViewerReadingFooterAlign = validatePageViewerReadingFurnitureAlign(
    pageViewerReadingFooterAlign,
  )
  if (validPageViewerReadingFooterAlign === null) return null

  const validPageViewerReadingSimpleCoverEnabled = validateOptionalBoolean(
    pageViewerReadingSimpleCoverEnabled,
  )
  if (validPageViewerReadingSimpleCoverEnabled === null) return null

  const validPageViewerReadingSimpleCoverWritingMode = validatePageViewerReadingSimpleCoverWritingModeValue(
    pageViewerReadingSimpleCoverWritingMode,
  )
  if (validPageViewerReadingSimpleCoverWritingMode === null) return null

  const validPageViewerReadingSimpleCoverLayout = validatePageViewerReadingSimpleCoverLayoutValue(
    pageViewerReadingSimpleCoverLayout,
  )
  if (validPageViewerReadingSimpleCoverLayout === null) return null

  const validUiTheme = validatePageViewerUiThemeSnapshot(uiTheme)
  if (validUiTheme === null) return null

  const common = {
    title,
    includeTableOfContents: validIncludeToc,
    tableOfContentsMaxLevel: validTocMaxLevel,
    writingMode: validWritingMode,
    fontSize: validFontSize,
    fontFamily: validFontFamily.value,
    lineHeight: validLineHeight,
    pageColor: validPageColor,
    textColor: validTextColor,
    headingColor: validHeadingColor,
    headingFontFamily: validHeadingFontFamily.value,
    headingMarginAfter: validHeadingMarginAfter,
    headingDividerLevels: validHeadingDividerLevels,
    headingAlignHorizontal: validHeadingAlignHorizontal,
    headingAlignVertical: validHeadingAlignVertical,
    rubySize: validRubySize,
    autoTcyEnabled: validAutoTcyEnabled,
    autoTcyNumbersOnly: validAutoTcyNumbersOnly,
    autoTcyMinDigits: validAutoTcyMinDigits,
    autoTcyMaxDigits: validAutoTcyMaxDigits,
    frontmatterVisible: validFrontmatterVisible,
    frontmatterShowAuthors: validFrontmatterShowAuthors,
    frontmatterShowTranslators: validFrontmatterShowTranslators,
    frontmatterShowRoleLabels: validFrontmatterShowRoleLabels,
    frontmatterShowInProjectFiles: validFrontmatterShowInProjectFiles,
    frontmatterProjectShowTitle: validFrontmatterProjectShowTitle,
    frontmatterProjectShowAuthors: validFrontmatterProjectShowAuthors,
    pageViewerBreakBeforeHeading: validPageViewerBreakBeforeHeading,
    pageViewerBreakBeforeHeadingMaxLevel: validPageViewerBreakBeforeHeadingMaxLevel,
    pageViewerReadingMarginTop: validPageViewerReadingMarginTop,
    pageViewerReadingMarginBottom: validPageViewerReadingMarginBottom,
    pageViewerReadingMarginInline: validPageViewerReadingMarginInline,
    pageViewerReadingPaperFrame: validPageViewerReadingPaperFrame,
    pageViewerReadingHeaderEnabled: validPageViewerReadingHeaderEnabled,
    pageViewerReadingHeaderAlign: validPageViewerReadingHeaderAlign,
    pageViewerReadingHeaderContent: validPageViewerReadingHeaderContent,
    pageViewerReadingFooterEnabled: validPageViewerReadingFooterEnabled,
    pageViewerReadingFooterAlign: validPageViewerReadingFooterAlign,
    pageViewerReadingSimpleCoverEnabled: validPageViewerReadingSimpleCoverEnabled,
    pageViewerReadingSimpleCoverWritingMode: validPageViewerReadingSimpleCoverWritingMode,
    pageViewerReadingSimpleCoverLayout: validPageViewerReadingSimpleCoverLayout,
    uiTheme: validUiTheme,
  }

  if (kind === 'book') {
    const validChapters = validateBookChapters(chapters)
    if (!validChapters) return null
    return {
      kind: 'book',
      ...common,
      bookInfo: validBookInfo,
      chapters: validChapters,
    }
  }

  if (typeof markdown !== 'string' || markdown.length > MAX_PAGE_VIEWER_MARKDOWN_LENGTH) {
    return null
  }

  return {
    ...common,
    ...(kind === 'document' ? { kind: 'document' as const } : {}),
    markdown,
    documentInfo: validDocumentInfo,
  }
}

const MAX_PAGE_VIEWER_PAYLOAD_ID_LENGTH = 200

/** `pageViewer:getSnapshot` の main 側ハンドラが renderer からの `unknown` payloadId を検証する。 */
export function validatePageViewerPayloadId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PAGE_VIEWER_PAYLOAD_ID_LENGTH) {
    return null
  }
  return value
}

/** viewer window の URL query に載せる `nyozeWindow` の値。 */
export const PAGE_VIEWER_WINDOW_QUERY_VALUE = 'page-viewer'
const PAGE_VIEWER_WINDOW_QUERY_KEY = 'nyozeWindow'
const PAGE_VIEWER_PAYLOAD_ID_QUERY_KEY = 'payloadId'

export type PageViewerWindowQuery = {
  mode: 'page-viewer'
  payloadId: string
}

/**
 * `location.search` (`?nyozeWindow=page-viewer&payloadId=...`) を判定する。
 * `main.tsx` が通常 `App` / viewer window 用 `PageViewerWindowRoot` のどちらを
 * render するか決めるのに使う。DOM に依存しない (`URLSearchParams` は Node でも動く)。
 */
export function parsePageViewerWindowQuery(search: string): PageViewerWindowQuery | null {
  const params = new URLSearchParams(search)
  if (params.get(PAGE_VIEWER_WINDOW_QUERY_KEY) !== PAGE_VIEWER_WINDOW_QUERY_VALUE) return null
  const payloadId = params.get(PAGE_VIEWER_PAYLOAD_ID_QUERY_KEY)
  if (!payloadId) return null
  return { mode: 'page-viewer', payloadId }
}

/** main 側で viewer window の loadURL 用 query string を組み立てる。 */
export function buildPageViewerWindowQueryString(payloadId: string): string {
  const params = new URLSearchParams()
  params.set(PAGE_VIEWER_WINDOW_QUERY_KEY, PAGE_VIEWER_WINDOW_QUERY_VALUE)
  params.set(PAGE_VIEWER_PAYLOAD_ID_QUERY_KEY, payloadId)
  return params.toString()
}
