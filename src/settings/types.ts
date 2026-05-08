import type { ParagraphPlainBehavior } from './paragraphPlainBehavior'

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
  lineBreakPolicy?: 'obsidian-paragraph' | 'commonmark-strict'
  /** Phase5-H Slice1: theme presets */
  uiThemePresets?: UiThemePreset[]
  activeUiThemePresetId?: string | null
  docThemePresets?: DocThemePreset[]
  activeDocThemePresetId?: string | null
  /** Phase5-H Slice2: reserved for future preset import/export migrations */
  themePresetSchemaVersion?: number
  debug?: DebugSettings
  /** BETA-DISP1: caret color setting (not stored in theme presets) */
  caretColorMode?: 'auto' | 'custom'
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
}
