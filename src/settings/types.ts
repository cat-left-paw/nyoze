import type { ParagraphPlainBehavior } from './paragraphPlainBehavior'
import type { ExternalExportOptionsDefaultsStore } from './externalExportOptionsDefaults'

export type { ParagraphPlainBehavior } from './paragraphPlainBehavior'

export type Theme =
  | 'mist'
  | 'taupe'
  | 'linen'
  | 'dove'
  | 'clay'
  | 'olive'
  | 'custom'
  | 'light'
  | 'sakura'
  | 'harbor'
  | 'sage'
  | 'dark'
  | 'moss'
  | 'slate'
  | 'merlot'
  | 'graphite'
  | 'dark-gpt'

/** Phase5-H: UI theme (app chrome) — same values as legacy Theme */
export type UiTheme = Theme

/** Phase5-H: UI font selector */
export type UiFont = 'mincho' | 'gothic' | `custom:${string}`

/** 0.1.1-beta.1 T1: UI language mode */
export type UiLanguageMode = 'ja' | 'en' | 'mixed'

/** App title preset selector */
export type AppTitlePreset = 'nyoze' | 'nyoze-upper' | 'nyoze-kanji' | 'custom'

/** App title font selector */
export type AppTitleFont = 'ui-default' | UiFont

/** Phase5-H: Document theme (editor content area) */
export type DocumentTheme =
  | 'ui-linked'
  | 'paper-light'
  | 'paper-dark'
  | 'bow'
  | 'wob'
  | 'soft-neutral'

/** Phase5-H Slice 2: Document font preset */
export type DocumentFontPreset = 'ui-linked' | 'mincho' | 'gothic' | `custom:${string}`

/** Phase5-H: Heading font selector */
export type DocumentHeadingFont = 'same-as-body' | 'mincho' | 'gothic' | `custom:${string}`

/** Phase5-H Slice 2: Document custom color settings */
export type DocumentColorSettings = {
  pageColor: string
  textColor: string
  headingColor: string
}

export type WritingMode = 'vertical-rl' | 'horizontal-tb'

/**
 * Document Type 別の既定表示方向。frontmatter `writingMode` が無い文書にだけ効く。
 * 未設定文書も含めて縦書き / 横書きを明示的に選ぶ。
 * 初期値は互換のため novel=vertical-rl / article=horizontal-tb / unset=vertical-rl。
 */
export type DocumentTypeWritingModeDefaults = {
  novel: WritingMode
  article: WritingMode
  unset: WritingMode
}

/** BETA-H1: H1–H6 共通。横書きでは text-align（左/中央/右）、縦書きでは行内軸方向の配置（上/中央/下）に対応 */
export type HeadingAlign = 'start' | 'center' | 'end'

export type DisplaySettings = {
  fontSize: number
  lineHeight: number
  paddingTop: number
  paddingBottom: number
  rubySize: number
  rubyOffset: number
  autoTcyEnabled: boolean
  autoTcyNumbersOnly: boolean
  autoTcyMinDigits: number
  autoTcyMaxDigits: number
  headingMarginAfter: number
  headingDividerLevels: HeadingDividerLevels
  /** 横書き（horizontal-tb）時の見出し位置 */
  headingAlignHorizontal: HeadingAlign
  /** 縦書き（vertical-rl 等）時の見出し位置（行内軸＝縦方向の start/center/end） */
  headingAlignVertical: HeadingAlign
}

export type HeadingDividerLevels = {
  h1: boolean
  h2: boolean
  h3: boolean
  h4: boolean
  h5: boolean
  h6: boolean
}

export type DisplaySettingsNumericKey =
  | 'fontSize'
  | 'lineHeight'
  | 'paddingTop'
  | 'paddingBottom'
  | 'rubySize'
  | 'rubyOffset'
  | 'autoTcyMinDigits'
  | 'autoTcyMaxDigits'
  | 'headingMarginAfter'

export type PaneState = {
  leftOpen: boolean
  rightOpen: boolean
  leftWidth: number
  rightWidth: number
}

/** Phase5-H Slice1: UI theme preset (color-only profile) */
export type UiThemePreset = {
  id: string
  name: string
  kind?: 'system' | 'custom'
  createdAt?: string
  baseTheme: Theme
  colors: {
    baseBg: string
    surfaceBg: string
    textPrimary: string
    /** Optional explicit override for left/right pane background. */
    paneBg?: string
    accent: string
    border: string
    paneBorder: string
    scrollbarBase: string
  }
}

/** Phase5-H Slice1: Document theme preset (color-only profile) */
export type DocThemePreset = {
  id: string
  name: string
  kind?: 'system' | 'custom'
  createdAt?: string
  baseDocTheme: DocumentTheme
  colors: {
    pageColor: string
    textColor: string
    headingColor: string
  }
}

export type DebugSettings = {
  imeProfilerEnabled?: boolean
  imeProfilerShowHud?: boolean
  imeProfilerLogSummary?: boolean
  imePhaseAEnabled?: boolean
  imePhaseAMinSyncIntervalMs?: number
  imePhaseBRubySuspendEnabled?: boolean
  imeProfilerSaveJson?: boolean
  imeProfilerBenchmarkDocumentId?: string
  imeProfilerBenchmarkInputChars?: number
  allowProdDevTools?: boolean
}

/** Phase5-H Slice 3: settings.json shape (subset persisted to userData) */
export type SettingsJson = {
  uiTheme?: Theme
  uiFont?: UiFont
  uiLanguageMode?: UiLanguageMode
  uiTextPrimary?: string | null
  uiFontScale?: number
  toolbarIconColor?: string | null
  toolbarIconStroke?: number
  toolbarScale?: number
  appTitleVisible?: boolean
  appTitlePreset?: AppTitlePreset
  appTitleCustom?: string
  appTitleColor?: string | null
  appTitleFont?: AppTitleFont
  displaySettings?: DisplaySettings
  documentTheme?: DocumentTheme
  docFontPreset?: DocumentFontPreset
  docHeadingFont?: DocumentHeadingFont
  docColorSettings?: DocumentColorSettings
  registeredFonts?: string[]
  selectedFont?: string | null
  rubyVisible?: boolean
  frontmatterVisible?: boolean
  frontmatterShowAuthors?: boolean
  frontmatterShowTranslators?: boolean
  frontmatterShowRoleLabels?: boolean
  /**
   * Project 内ファイル（祖先に `.nyoze/project.json`）でも frontmatter display を
   * 本文中に表示するか。既定 false。Project 外の単独文書には影響しない。
   */
  frontmatterShowInProjectFiles?: boolean
  /**
   * Project 内ファイルの frontmatter title / original_title / subtitle を表示するか。
   * `frontmatterShowInProjectFiles=false` のときは無効。既定 true。
   */
  frontmatterProjectShowTitle?: boolean
  /**
   * Project 内ファイルの frontmatter author / co_authors を表示するか。
   * `frontmatterShowInProjectFiles=false` のときは無効。既定 true。
   */
  frontmatterProjectShowAuthors?: boolean
  lineBreakPolicy?: 'obsidian-paragraph' | 'commonmark-strict'
  /**
   * Document Type 別の既定表示方向。frontmatter `writingMode` が無い文書にだけ効く。
   * 未指定時は互換の既定（novel=vertical-rl / article=horizontal-tb / unset=vertical-rl）。
   */
  defaultNovelWritingMode?: WritingMode
  defaultArticleWritingMode?: WritingMode
  defaultUnsetDocumentWritingMode?: WritingMode
  /** Phase5-H Slice1: theme presets */
  uiThemePresets?: UiThemePreset[]
  activeUiThemePresetId?: string | null
  docThemePresets?: DocThemePreset[]
  activeDocThemePresetId?: string | null
  /** Phase5-H Slice2: reserved for future preset import/export migrations */
  themePresetSchemaVersion?: number
  debug?: DebugSettings
  /** BETA-DISP1: caret color setting (not stored in theme presets) */
  caretColorMode?: 'auto' | 'custom' | 'highlight'
  caretColorCustom?: string | null
  /** Windows Chromium I-beam workaround: use arrow pointer inside editor surfaces */
  useEditorArrowPointer?: boolean
  /**
   * App-wide Paragraph Plain responsiveness vs following content visibility.
   * Legacy `settings.json` value `comfortable-no-scroll-reposition` is normalized to `comfortable` on read.
   * @see normalizeParagraphPlainBehavior
   */
  paragraphPlainBehavior?: ParagraphPlainBehavior
  /** App-wide Typewriter scroll (not frontmatter / not per-tab). */
  typewriterModeEnabled?: boolean
  typewriterOffsetRatio?: number
  typewriterFollowBandRatio?: number
  /** Visual Focus Phase 1: edit block highlight in WYSIWYG (not Typewriter scroll). */
  visualFocusBlockHighlightEnabled?: boolean
  /** Visual Focus Phase 2: dim non-focused textblocks in WYSIWYG (not Typewriter scroll). */
  visualFocusDimNonFocusedBlocksEnabled?: boolean
  /** Visual Focus Phase 3: active block highlight fill (`#rgb` / `#rrggbb`). */
  visualFocusBlockHighlightColor?: string
  /** Visual Focus Phase 3: highlight fill opacity (0..1). */
  visualFocusBlockHighlightOpacity?: number
  /** Visual Focus Phase 3: dimmed non-focused block opacity (0..1). */
  visualFocusDimNonFocusedBlocksOpacity?: number
  /** Visual Focus Phase 5: current visual line overlay (WYSIWYG; not Typewriter scroll). */
  visualFocusCurrentLineHighlightEnabled?: boolean
  /** Visual Focus Phase 5: current line fill (`#rgb` / `#rrggbb`). */
  visualFocusCurrentLineHighlightColor?: string
  /** Visual Focus Phase 5: current line fill opacity (0..1). */
  visualFocusCurrentLineHighlightOpacity?: number
  /**
   * Hidden: macOS のみ Arrow 後の過大スクロールを局所 clamp（UI なし / frontmatter 非連動）。
   */
  macosArrowScrollClampEnabled?: boolean
  /**
   * Task 2-4: 擬似キャレットの ON/OFF。表示専用オーバーレイ。未設定時は既定 true。
   */
  pseudoCaretEnabled?: boolean
  /**
   * Task 2-4: 擬似キャレットの太さ（px、短軸）。1〜8px、0.5px 刻み。既定 2。
   */
  pseudoCaretThickness?: number
  /**
   * 擬似キャレット点滅: overlay の opacity animation ON/OFF。既定 true。
   */
  pseudoCaretBlinkEnabled?: boolean
  /**
   * 付箋 (Task 3A-3): 初回付箋作成時の説明を確認済みか。既定 false。設定 UI なし。
   */
  noteAnchorNoticeConfirmed?: boolean
  /**
   * 外部書き出し options 確認 modal の scope × format 別既定選択。
   * frontmatter / books.json には保存しない。
   */
  externalExportOptionsDefaults?: ExternalExportOptionsDefaultsStore
  /**
   * PV-SET-4A: Page Viewer（active document / Book Viewer 共通）の読書用
   * pagination default「見出しの前で改ページ」。既定 false。外部 export の
   * `pageBreakBeforeHeading` とは別 key・別既定値（値を共用しない）。
   */
  pageViewerBreakBeforeHeading?: boolean
  /**
   * PV-SET-4A: 対象見出し最大レベル。1=H1のみ 〜 6=H1〜H6。既定 1。
   * toggle が OFF の間も値は保持するが、pagination には影響しない。
   */
  pageViewerBreakBeforeHeadingMaxLevel?: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * PV-READ-1: Page Viewer 読書面の物理上余白（選択値 0〜80 / 8px 刻み）。
   * 実効値は固定安全域 32px を加える。frontmatter / books.json / export には保存しない。
   */
  pageViewerReadingMarginTop?: number
  /** PV-READ-1: 物理下余白（選択値）。実効は +32px。 */
  pageViewerReadingMarginBottom?: number
  /** PV-READ-1: 物理左右共通余白（選択値）。実効は +16px。 */
  pageViewerReadingMarginInline?: number
  /** PV-READ-1: 用紙枠（canvas / border / shadow）の ON/OFF。既定 true。 */
  pageViewerReadingPaperFrame?: boolean
  /**
   * PV-READ-2: 読書面 header furniture の表示。既定 true。
   * frontmatter / books.json / export には保存しない。
   */
  pageViewerReadingHeaderEnabled?: boolean
  /** PV-READ-2: header の物理位置。既定 'start'（左）。 */
  pageViewerReadingHeaderAlign?: 'start' | 'center' | 'end'
  /** PV-READ-2: header 内容。既定 'title'。author は visibility hard gate 後。 */
  pageViewerReadingHeaderContent?: 'title' | 'title-author'
  /** PV-READ-2: 読書面 footer（現在/総ページ）の表示。既定 true。 */
  pageViewerReadingFooterEnabled?: boolean
  /** PV-READ-2: footer の物理位置。既定 'end'（右）。 */
  pageViewerReadingFooterAlign?: 'start' | 'center' | 'end'
  /** PV-READ-3B: Page Viewer冒頭の表示専用簡易表紙。 */
  pageViewerReadingSimpleCoverEnabled?: boolean
  /** PV-READ-3B: 簡易表紙groupだけの書字方向。 */
  pageViewerReadingSimpleCoverWritingMode?: 'inherit' | 'vertical-rl' | 'horizontal-tb'
  /** PV-READ-3B: Web Book / Tategakiと意味を揃えた通常/中央配置。 */
  pageViewerReadingSimpleCoverLayout?: 'normal' | 'center'
}
