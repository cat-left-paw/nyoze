import {
  resolveAutoTcyDigitRange,
  resolveAutoTcyNumbersOnly,
} from '../editor-core/features/autoTcy'
import {
  DEFAULT_DOCUMENT_INFO_TITLE_PAGE_LAYOUT,
  DEFAULT_DOCUMENT_INFO_TITLE_PAGE_WRITING_MODE,
  resolveDocumentInfoTitlePageLayout,
  resolveDocumentInfoTitlePageWritingMode,
  type DocumentInfoTitlePageLayout,
  type DocumentInfoTitlePageWritingMode,
} from '../editor-core/export/htmlExportSemantic'
import { DEFAULT_WEB_BOOK_OUTPUT_PROFILE, type WebBookOutputProfile } from '../editor-core/export/webBookAssetPlan'

export type ExternalExportFormat = 'webBook' | 'leme' | 'denden' | 'aozora'

export type ExternalExportOptionsScope = 'document' | 'book'

/**
 * active document export と Book 全体 export の両方で共有する options。
 * `pageBreak` / `pageBreakBeforeHeading` / `pageBreakBeforeHeadingMaxLevel` は
 * `ExternalExportOptions`（`src/editor-core/export/externalExportOptions.ts`）
 * にそのまま対応する共通 option。
 * `autoTcy` 系は LeME / でんでん向け UI だけで表示するが、selection / defaults
 * の型としては共通に持ち、他 format の slot へ保存しても無害（変換側が無視する）。
 */
export type CommonExternalExportOptionsSelection = {
  pageBreak: boolean
  pageBreakBeforeHeading: boolean
  pageBreakBeforeHeadingMaxLevel: number
  autoTcy: boolean
  tcyMinDigits: number
  tcyMaxDigits: number
  tcyNumbersOnly: boolean
}

/**
 * `insertPageBreakBetweenChapters` は Book 全体 export 専用、
 * `includeDocumentInfo` は単独文書 export 専用、
 * `includeBookInfo` / `includeChapterInfo` は Book 全体 export 専用。
 * UI は scope / format に応じて表示 field だけを使い、payload に不要 field を混ぜない。
 */
export type ExternalExportOptionsSelection = CommonExternalExportOptionsSelection & {
  /** Web Book only. Stored independently in document.webBook / book.webBook slots. */
  webBookOutputProfile: WebBookOutputProfile
  insertPageBreakBetweenChapters: boolean
  includeDocumentInfo: boolean
  includeTableOfContents: boolean
  /** HTML系 export 専用。目次に含める見出しの最大レベル (1〜6)。UI 既定 `6`。 */
  tableOfContentsMaxLevel: number
  showRoleLabels: boolean
  includeBookInfo: boolean
  includeChapterInfo: boolean
  /**
   * Web Book 専用。文書情報（Book では作品情報）の後ろで改ページするか。
   * UI 既定 `false`。`document.webBook` / `book.webBook` slot にだけ永続化する。
   */
  breakAfterDocumentInfo: boolean
  /**
   * Web Book 専用（WB-R9）。文書情報（Book では作品情報）を簡易表紙として
   * 表示するか。UI 既定 `false`。ON の間、UI は `breakAfterDocumentInfo` を
   * 必ず ON にする（簡易表紙は常に独立ページ）。
   * `document.webBook` / `book.webBook` slot にだけ永続化する。
   */
  documentInfoTitlePage: boolean
  /**
   * Web Book 専用（WB-R9）。簡易表紙の metadata group の書字方向。
   * UI 既定 `'inherit'`。webBook slot にだけ永続化する。
   */
  documentInfoTitlePageWritingMode: DocumentInfoTitlePageWritingMode
  /**
   * Web Book 専用（WB-R9）。簡易表紙のレイアウト（Tategaki の frontmatter
   * 独立ページと同じ `normal` / `center`）。UI 既定 `'normal'`。
   * webBook slot にだけ永続化する。
   */
  documentInfoTitlePageLayout: DocumentInfoTitlePageLayout
}

/**
 * options 確認 UI 自体の初期選択。`pageBreakBeforeHeadingMaxLevel: 1` は
 * UI 上の既定（H1のみ）で、pure converter 側の後方互換 default `6` とは独立。
 * auto TCY は既定 OFF（Display Settings とは独立）。
 */
export const DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION: ExternalExportOptionsSelection = {
  webBookOutputProfile: DEFAULT_WEB_BOOK_OUTPUT_PROFILE,
  pageBreak: true,
  pageBreakBeforeHeading: false,
  pageBreakBeforeHeadingMaxLevel: 1,
  autoTcy: false,
  tcyMinDigits: 2,
  tcyMaxDigits: 4,
  tcyNumbersOnly: false,
  insertPageBreakBetweenChapters: true,
  includeDocumentInfo: false,
  includeTableOfContents: false,
  tableOfContentsMaxLevel: 6,
  showRoleLabels: true,
  includeBookInfo: false,
  includeChapterInfo: false,
  breakAfterDocumentInfo: false,
  documentInfoTitlePage: false,
  documentInfoTitlePageWritingMode: DEFAULT_DOCUMENT_INFO_TITLE_PAGE_WRITING_MODE,
  documentInfoTitlePageLayout: DEFAULT_DOCUMENT_INFO_TITLE_PAGE_LAYOUT,
}

/** `settings.json` の `externalExportOptionsDefaults` に保存する 1 slot 分。 */
export type StoredExternalExportOptionsSelection = Partial<ExternalExportOptionsSelection>

export type ExternalExportOptionsDefaultsFormatStore = Partial<
  Record<ExternalExportFormat, StoredExternalExportOptionsSelection>
>

/** scope × format ごとの保存済み options 確認 UI 初期値。 */
export type ExternalExportOptionsDefaultsStore = {
  document?: ExternalExportOptionsDefaultsFormatStore
  book?: ExternalExportOptionsDefaultsFormatStore
}

const VALID_SCOPES = new Set<ExternalExportOptionsScope>(['document', 'book'])
const VALID_FORMATS = new Set<ExternalExportFormat>(['webBook', 'leme', 'denden', 'aozora'])

const HEADING_LEVEL_MIN = 1
const HEADING_LEVEL_MAX = 6

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(
  raw: Record<string, unknown>,
  key: keyof ExternalExportOptionsSelection,
): boolean | undefined {
  const value = raw[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * `pageBreakBeforeHeadingMaxLevel` を options 確認 UI 用に正規化する。
 * 非数値は UI 既定 `1` へ。有限値は round して 1〜6 にクランプする。
 */
export function normalizeExternalExportOptionsHeadingMaxLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION.pageBreakBeforeHeadingMaxLevel
  }
  const rounded = Math.round(value)
  return Math.min(
    Math.max(rounded, HEADING_LEVEL_MIN),
    HEADING_LEVEL_MAX,
  )
}

/**
 * `tableOfContentsMaxLevel` を HTML export 目次用に正規化する。
 * 非数値は UI 既定 `6` へ。有限値は round して 1〜6 にクランプする。
 */
export function normalizeTableOfContentsMaxLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION.tableOfContentsMaxLevel
  }
  const rounded = Math.round(value)
  return Math.min(
    Math.max(rounded, HEADING_LEVEL_MIN),
    HEADING_LEVEL_MAX,
  )
}

/**
 * 部分オブジェクトを既知 field だけ取り出し、欠損は
 * `DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION` で埋める。
 */
export function normalizeExternalExportOptionsSelection(
  raw: unknown,
): ExternalExportOptionsSelection {
  const base = { ...DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION }
  if (!isPlainObject(raw)) return base

  const pageBreak = readBoolean(raw, 'pageBreak')
  if (pageBreak !== undefined) base.pageBreak = pageBreak

  if (raw.webBookOutputProfile === 'package' || raw.webBookOutputProfile === 'singleHtml') {
    base.webBookOutputProfile = raw.webBookOutputProfile
  }

  const pageBreakBeforeHeading = readBoolean(raw, 'pageBreakBeforeHeading')
  if (pageBreakBeforeHeading !== undefined) base.pageBreakBeforeHeading = pageBreakBeforeHeading

  if ('pageBreakBeforeHeadingMaxLevel' in raw) {
    base.pageBreakBeforeHeadingMaxLevel = normalizeExternalExportOptionsHeadingMaxLevel(
      raw.pageBreakBeforeHeadingMaxLevel,
    )
  }

  const autoTcy = readBoolean(raw, 'autoTcy')
  if (autoTcy !== undefined) base.autoTcy = autoTcy

  const tcyNumbersOnly = readBoolean(raw, 'tcyNumbersOnly')
  if (tcyNumbersOnly !== undefined) {
    base.tcyNumbersOnly = resolveAutoTcyNumbersOnly({ numbersOnly: tcyNumbersOnly })
  }

  if ('tcyMinDigits' in raw || 'tcyMaxDigits' in raw) {
    const digitRange = resolveAutoTcyDigitRange({
      minDigits: 'tcyMinDigits' in raw ? raw.tcyMinDigits : base.tcyMinDigits,
      maxDigits: 'tcyMaxDigits' in raw ? raw.tcyMaxDigits : base.tcyMaxDigits,
    })
    base.tcyMinDigits = digitRange.minDigits
    base.tcyMaxDigits = digitRange.maxDigits
  }

  const insertPageBreakBetweenChapters = readBoolean(raw, 'insertPageBreakBetweenChapters')
  if (insertPageBreakBetweenChapters !== undefined) {
    base.insertPageBreakBetweenChapters = insertPageBreakBetweenChapters
  }

  const includeDocumentInfo = readBoolean(raw, 'includeDocumentInfo')
  if (includeDocumentInfo !== undefined) base.includeDocumentInfo = includeDocumentInfo

  const includeTableOfContents = readBoolean(raw, 'includeTableOfContents')
  if (includeTableOfContents !== undefined) base.includeTableOfContents = includeTableOfContents

  if ('tableOfContentsMaxLevel' in raw) {
    base.tableOfContentsMaxLevel = normalizeTableOfContentsMaxLevel(raw.tableOfContentsMaxLevel)
  }

  const showRoleLabels = readBoolean(raw, 'showRoleLabels')
  if (showRoleLabels !== undefined) base.showRoleLabels = showRoleLabels

  const includeBookInfo = readBoolean(raw, 'includeBookInfo')
  if (includeBookInfo !== undefined) base.includeBookInfo = includeBookInfo

  const includeChapterInfo = readBoolean(raw, 'includeChapterInfo')
  if (includeChapterInfo !== undefined) base.includeChapterInfo = includeChapterInfo

  const breakAfterDocumentInfo = readBoolean(raw, 'breakAfterDocumentInfo')
  if (breakAfterDocumentInfo !== undefined) base.breakAfterDocumentInfo = breakAfterDocumentInfo

  const documentInfoTitlePage = readBoolean(raw, 'documentInfoTitlePage')
  if (documentInfoTitlePage !== undefined) base.documentInfoTitlePage = documentInfoTitlePage

  if ('documentInfoTitlePageWritingMode' in raw) {
    base.documentInfoTitlePageWritingMode = resolveDocumentInfoTitlePageWritingMode(
      raw.documentInfoTitlePageWritingMode,
    )
  }

  if ('documentInfoTitlePageLayout' in raw) {
    base.documentInfoTitlePageLayout = resolveDocumentInfoTitlePageLayout(
      raw.documentInfoTitlePageLayout,
    )
  } else if ('documentInfoTitlePagePlacement' in raw) {
    // 開発中 build の settings.json にだけ残り得る旧 temporary key の read-time 互換。
    // 旧 `center` → 新 `center`、旧 `top` / `bottom`（および不正値）→ 新 `normal`。
    // 保存時は normalize 済み selection（新 key のみ）を書くため、旧 key は残らない。
    // export API / Book IPC ではこの旧 key を受理しない。
    base.documentInfoTitlePageLayout =
      raw.documentInfoTitlePagePlacement === 'center' ? 'center' : 'normal'
  }

  return base
}

function normalizeFormatStore(raw: unknown): ExternalExportOptionsDefaultsFormatStore | undefined {
  if (!isPlainObject(raw)) return undefined

  const out: ExternalExportOptionsDefaultsFormatStore = {}
  for (const format of VALID_FORMATS) {
    if (!(format in raw)) continue
    if (!isPlainObject(raw[format])) continue
    const normalized = normalizeExternalExportOptionsSelection(raw[format])
    out[format] = normalized
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * `settings.json` から読んだ `externalExportOptionsDefaults` を正規化する。
 * 不正 scope / format / field は無視する。
 */
export function normalizeExternalExportOptionsDefaults(
  raw: unknown,
): ExternalExportOptionsDefaultsStore {
  if (!isPlainObject(raw)) return {}

  const out: ExternalExportOptionsDefaultsStore = {}
  for (const scope of VALID_SCOPES) {
    if (!(scope in raw)) continue
    const formatStore = normalizeFormatStore(raw[scope])
    if (formatStore) out[scope] = formatStore
  }
  return out
}

/** 未設定 slot は `DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION` を返す。 */
export function getExternalExportOptionsInitialSelection(
  store: ExternalExportOptionsDefaultsStore,
  scope: ExternalExportOptionsScope,
  format: ExternalExportFormat,
): ExternalExportOptionsSelection {
  const stored = store[scope]?.[format]
  if (!stored) return { ...DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION }
  return normalizeExternalExportOptionsSelection(stored)
}

/** 該当 scope + format のみ上書きし、他 slot は保持する。 */
export function setExternalExportOptionsDefault(
  store: ExternalExportOptionsDefaultsStore,
  scope: ExternalExportOptionsScope,
  format: ExternalExportFormat,
  selection: ExternalExportOptionsSelection,
): ExternalExportOptionsDefaultsStore {
  const normalized = normalizeExternalExportOptionsSelection(selection)
  // WB-R7 / WB-R9: breakAfterDocumentInfo と title page 系は webBook slot にだけ永続化する。
  let stored: StoredExternalExportOptionsSelection = normalized
  if (format !== 'webBook') {
    const {
      breakAfterDocumentInfo: _ignoredBreakAfterDocumentInfo,
      documentInfoTitlePage: _ignoredDocumentInfoTitlePage,
      documentInfoTitlePageWritingMode: _ignoredDocumentInfoTitlePageWritingMode,
      documentInfoTitlePageLayout: _ignoredDocumentInfoTitlePageLayout,
      webBookOutputProfile: _ignoredWebBookOutputProfile,
      ...withoutWebBookOnly
    } = normalized
    void _ignoredBreakAfterDocumentInfo
    void _ignoredDocumentInfoTitlePage
    void _ignoredDocumentInfoTitlePageWritingMode
    void _ignoredDocumentInfoTitlePageLayout
    void _ignoredWebBookOutputProfile
    stored = withoutWebBookOnly
  }
  return {
    ...store,
    [scope]: {
      ...store[scope],
      [format]: stored,
    },
  }
}
