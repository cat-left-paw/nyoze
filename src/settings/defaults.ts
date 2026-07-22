import type { LineBreakPolicy } from '../editor-core/types'
import {
  DEFAULT_AUTO_TCY_ENABLED,
  DEFAULT_AUTO_TCY_MAX_DIGITS,
  DEFAULT_AUTO_TCY_MIN_DIGITS,
  DEFAULT_AUTO_TCY_NUMBERS_ONLY,
} from '../editor-core/features/autoTcy'
import type {
  AppTitleFont,
  AppTitlePreset,
  DisplaySettings,
  HeadingDividerLevels,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  DocumentTheme,
  Theme,
  UiFont,
  UiLanguageMode,
  UiThemePreset,
  WritingMode,
} from './types'

export {
  DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO,
  DEFAULT_TYPEWRITER_MODE_ENABLED,
  DEFAULT_TYPEWRITER_OFFSET_RATIO,
  TYPEWRITER_FOLLOW_BAND_RATIO_MAX,
  TYPEWRITER_FOLLOW_BAND_RATIO_MIN,
  TYPEWRITER_OFFSET_RATIO_MAX,
  TYPEWRITER_OFFSET_RATIO_MIN,
} from './typewriterModeSettings'

export const CUSTOM_BOUTEN_STORAGE_KEY = 'nyoze.customBoutenChars'
export const THEME_STORAGE_KEY = 'nyoze.theme'
export const PANE_STORAGE_KEY = 'nyoze.paneState'
export const RUBY_VISIBILITY_STORAGE_KEY = 'nyoze.rubyVisible'
export const DISPLAY_SETTINGS_STORAGE_KEY = 'nyoze.displaySettings'
export const LINE_BREAK_POLICY_STORAGE_KEY = 'nyoze.lineBreakPolicy'
export const FILE_EXPLORER_DIR_STORAGE_KEY = 'nyoze.fileExplorerDir'

export const DEFAULT_BOUTEN_CHARS = [
  '・',
  '•',
  '●',
  '○',
  '⚬',
  '◦',
  '﹅',
  '﹆',
] as const

export const THEME_LABELS: Record<Theme, string> = {
  mist: 'Greige',
  taupe: 'Taupe',
  linen: 'Linen',
  dove: 'Dove',
  clay: 'Clay',
  olive: 'Olive',
  custom: 'Plum',
  light: 'Light',
  sakura: 'Sakura',
  harbor: 'Harbor',
  sage: 'Sage',
  dark: 'Dark',
  moss: 'Moss',
  slate: 'Slate',
  merlot: 'Merlot',
  graphite: 'Graphite',
  'dark-gpt': 'Midnight Blue',
}

export const MIN_LEFT_WIDTH = 220
export const MIN_RIGHT_WIDTH = 260
export const DEFAULT_LEFT_WIDTH = 260
export const DEFAULT_RIGHT_WIDTH = 300
export const DIVIDER_WIDTH = 5
export const MIN_CENTER_WIDTH = 540

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  fontSize: 20,
  lineHeight: 1.9,
  paddingTop: 22,
  paddingBottom: 20,
  rubySize: 0.5,
  rubyOffset: 0,
  autoTcyEnabled: DEFAULT_AUTO_TCY_ENABLED,
  autoTcyNumbersOnly: DEFAULT_AUTO_TCY_NUMBERS_ONLY,
  autoTcyMinDigits: DEFAULT_AUTO_TCY_MIN_DIGITS,
  autoTcyMaxDigits: DEFAULT_AUTO_TCY_MAX_DIGITS,
  headingMarginAfter: 0.45,
  headingDividerLevels: {
    h1: true,
    h2: true,
    h3: false,
    h4: false,
    h5: false,
    h6: false,
  },
  headingAlignHorizontal: 'start',
  headingAlignVertical: 'start',
}

export const DEFAULT_HEADING_DIVIDER_LEVELS: HeadingDividerLevels = {
  h1: DEFAULT_DISPLAY_SETTINGS.headingDividerLevels.h1,
  h2: DEFAULT_DISPLAY_SETTINGS.headingDividerLevels.h2,
  h3: DEFAULT_DISPLAY_SETTINGS.headingDividerLevels.h3,
  h4: DEFAULT_DISPLAY_SETTINGS.headingDividerLevels.h4,
  h5: DEFAULT_DISPLAY_SETTINGS.headingDividerLevels.h5,
  h6: DEFAULT_DISPLAY_SETTINGS.headingDividerLevels.h6,
}

export const DEFAULT_LINE_BREAK_POLICY: LineBreakPolicy = 'obsidian-paragraph'

export const WRITING_MODE_STORAGE_KEY = 'nyoze.writingMode'
export const DEFAULT_WRITING_MODE: WritingMode = 'vertical-rl'

/**
 * Document Type 別の既定表示方向の初期値（互換維持）。
 * frontmatter `writingMode` が無い文書にだけ効く。settings.json に保存する。
 */
export const DEFAULT_NOVEL_WRITING_MODE: WritingMode = 'vertical-rl'
export const DEFAULT_ARTICLE_WRITING_MODE: WritingMode = 'horizontal-tb'
export const DEFAULT_UNSET_DOCUMENT_WRITING_MODE: WritingMode = 'vertical-rl'

export const TOOLBAR_VISIBLE_STORAGE_KEY = 'nyoze.toolbarVisible'
export const TOOLBAR_OFFSET_STORAGE_KEY = 'nyoze.toolbarOffset'

/** Phase5-H: separated theme storage keys */
export const UI_THEME_STORAGE_KEY = 'nyoze.uiTheme'
export const DOCUMENT_THEME_STORAGE_KEY = 'nyoze.documentTheme'
export const UI_FONT_STORAGE_KEY = 'nyoze.uiFont'
export const UI_LANGUAGE_MODE_STORAGE_KEY = 'nyoze.uiLanguageMode'

export const DEFAULT_UI_FONT: UiFont = 'gothic'
export const DEFAULT_UI_LANGUAGE_MODE: UiLanguageMode = 'mixed'

export const UI_FONT_LABELS: Record<Exclude<UiFont, `custom:${string}`>, string> = {
  mincho: '明朝体',
  gothic: 'ゴシック体',
}

/** UI theme -> default UI font mapping (for "back to theme default" action) */
export const UI_THEME_FONT_PRESETS: Record<Theme, Exclude<UiFont, `custom:${string}`>> = {
  mist: 'gothic',
  taupe: 'gothic',
  linen: 'gothic',
  dove: 'gothic',
  clay: 'gothic',
  olive: 'gothic',
  custom: 'gothic',
  light: 'gothic',
  sakura: 'gothic',
  harbor: 'gothic',
  sage: 'gothic',
  dark: 'gothic',
  moss: 'gothic',
  slate: 'gothic',
  merlot: 'gothic',
  graphite: 'gothic',
  'dark-gpt': 'gothic',
}

/** UI theme -> default primary text color mapping */
export const UI_THEME_TEXT_PRIMARY_PRESETS: Record<Theme, string> = {
  mist: '#7c6e6a',
  taupe: '#4f4a45',
  linen: '#3b3d3a',
  dove: '#42464a',
  clay: '#4f433d',
  olive: '#444c3f',
  custom: '#352a32',
  light: '#2c3040',
  sakura: '#5d4952',
  harbor: '#465d6b',
  sage: '#4d5a4d',
  dark: '#d0d4dc',
  moss: '#d4ded4',
  slate: '#dbe3ec',
  merlot: '#ead8df',
  graphite: '#dfdbea',
  'dark-gpt': '#e8edf5',
}

export const UI_TEXT_PRIMARY_STORAGE_KEY = 'nyoze.uiTextPrimary'
export const UI_FONT_SCALE_STORAGE_KEY = 'nyoze.uiFontScale'
export const DEFAULT_UI_FONT_SCALE = 1
export const TOOLBAR_ICON_COLOR_STORAGE_KEY = 'nyoze.toolbarIconColor'
export const TOOLBAR_ICON_STROKE_STORAGE_KEY = 'nyoze.toolbarIconStroke'
export const TOOLBAR_SCALE_STORAGE_KEY = 'nyoze.toolbarScale'
export const DEFAULT_TOOLBAR_ICON_STROKE = 1.1
export const MIN_TOOLBAR_ICON_STROKE = 0.9
export const MAX_TOOLBAR_ICON_STROKE = 1.8
export const DEFAULT_TOOLBAR_SCALE = 1
export const MIN_TOOLBAR_SCALE = 0.85
export const MAX_TOOLBAR_SCALE = 1.15

export const APP_TITLE_VISIBLE_STORAGE_KEY = 'nyoze.appTitleVisible'
export const APP_TITLE_PRESET_STORAGE_KEY = 'nyoze.appTitlePreset'
export const APP_TITLE_CUSTOM_STORAGE_KEY = 'nyoze.appTitleCustom'
export const APP_TITLE_COLOR_STORAGE_KEY = 'nyoze.appTitleColor'
export const APP_TITLE_FONT_STORAGE_KEY = 'nyoze.appTitleFont'

// Display width unit: half-width = 1, full-width = 2 (20 units = half-width 20 / full-width 10)
export const APP_TITLE_CUSTOM_MAX_LENGTH = 20
export const DEFAULT_APP_TITLE_VISIBLE = true
export const DEFAULT_APP_TITLE_PRESET: AppTitlePreset = 'nyoze'
export const DEFAULT_APP_TITLE_CUSTOM = 'Nyoze'
export const DEFAULT_APP_TITLE_FONT: AppTitleFont = 'ui-default'

export const APP_TITLE_PRESET_LABELS: Record<AppTitlePreset, string> = {
  nyoze: 'Nyoze',
  'nyoze-upper': 'NYOZE',
  'nyoze-kanji': '如是',
  custom: 'カスタム...',
}

export const APP_TITLE_PRESET_TEXTS: Record<Exclude<AppTitlePreset, 'custom'>, string> = {
  nyoze: 'Nyoze',
  'nyoze-upper': 'NYOZE',
  'nyoze-kanji': '如是',
}

export const APP_TITLE_COLOR_PRESETS: Record<Theme, string> = {
  mist: '#6f6c66',
  taupe: '#7a7168',
  linen: '#7a7c76',
  dove: '#757b7c',
  clay: '#9a7768',
  olive: '#7e8a66',
  custom: '#7f6f78',
  light: '#727887',
  sakura: '#b27d8e',
  harbor: '#6e8d9a',
  sage: '#809a74',
  dark: '#81889a',
  moss: '#8faf94',
  slate: '#8fa0ba',
  merlot: '#b8869a',
  graphite: '#b6a8c0',
  'dark-gpt': '#8c9bb2',
}

export const DEFAULT_FRONTMATTER_VISIBLE = true
export const DEFAULT_FRONTMATTER_SHOW_AUTHORS = true
export const DEFAULT_FRONTMATTER_SHOW_TRANSLATORS = true
export const DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS = true
/**
 * Project 内 Markdown ファイル（祖先に `.nyoze/project.json` を持つ）で
 * frontmatter display を本文中に表示するか。既定 false。
 * Project 内では frontmatter は管理 metadata として扱い、章タイトル・資料タイトルは
 * Project / Outline / File Explorer の表示名に使う。ON のときだけ Project 内でも
 * 単独文書と同じ frontmatter display を出す。Project 外の単独文書には影響しない。
 */
export const DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES = false
/** Project 内ファイルの frontmatter title を表示するか。既定 true（後から個別 OFF 可）。 */
export const DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE = true
/** Project 内ファイルの frontmatter authors を表示するか。既定 true（後から個別 OFF 可）。 */
export const DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS = true

export const DEFAULT_DOCUMENT_THEME: DocumentTheme = 'ui-linked'

export const DOCUMENT_THEME_LABELS: Record<DocumentTheme, string> = {
  'ui-linked': 'UIテーマに追従',
  'paper-light': 'Paper Light',
  'paper-dark': 'Paper Dark',
  bow: 'BOW',
  wob: 'WOB',
  'soft-neutral': 'Soft Neutral',
}

/** Phase5-H Slice 2: font preset */
export const DOC_FONT_PRESET_STORAGE_KEY = 'nyoze.docFontPreset'
export const DEFAULT_DOC_FONT_PRESET: DocumentFontPreset = 'ui-linked'

export const DOC_FONT_PRESET_LABELS: Record<Exclude<DocumentFontPreset, `custom:${string}`>, string> = {
  'ui-linked': 'UIテーマと同じ',
  mincho: '明朝体',
  gothic: 'ゴシック体',
}

/** Phase5-H: heading font selector */
export const DOC_HEADING_FONT_STORAGE_KEY = 'nyoze.docHeadingFont'
export const DEFAULT_DOC_HEADING_FONT: DocumentHeadingFont = 'same-as-body'

export const DOC_HEADING_FONT_LABELS: Record<
  Exclude<DocumentHeadingFont, `custom:${string}`>,
  string
> = {
  'same-as-body': '本文と同じ',
  mincho: '明朝体',
  gothic: 'ゴシック体',
}

/** Phase5-H Slice 2: custom color settings */
export const DOC_COLOR_SETTINGS_STORAGE_KEY = 'nyoze.docColorSettings'
export const DEFAULT_DOC_COLOR_SETTINGS: DocumentColorSettings = {
  pageColor: '#e9e6e1',
  textColor: '#4e524f',
  headingColor: '#565b58',
}

export const UI_THEME_DOC_COLOR_PRESETS: Record<Theme, DocumentColorSettings> = {
  mist: {
    pageColor: '#e9e6e1',
    textColor: '#7c6e6a',
    headingColor: '#565b58',
  },
  taupe: {
    pageColor: '#ebe5de',
    textColor: '#4f4a45',
    headingColor: '#5a544e',
  },
  linen: {
    pageColor: '#fdfcf8',
    textColor: '#3b3d3a',
    headingColor: '#454844',
  },
  dove: {
    pageColor: '#eeeee9',
    textColor: '#42464a',
    headingColor: '#50575a',
  },
  clay: {
    pageColor: '#efe7df',
    textColor: '#4f433d',
    headingColor: '#5b4b43',
  },
  olive: {
    pageColor: '#edf0e5',
    textColor: '#444c3f',
    headingColor: '#515b4a',
  },
  custom: {
    pageColor: '#ffffff',
    textColor: '#352a32',
    headingColor: '#352a32',
  },
  light: {
    pageColor: '#ffffff',
    textColor: '#2c3040',
    headingColor: '#3a4050',
  },
  sakura: {
    pageColor: '#fff8fa',
    textColor: '#5d4952',
    headingColor: '#6f5661',
  },
  harbor: {
    pageColor: '#f6fbfd',
    textColor: '#465d6b',
    headingColor: '#537180',
  },
  sage: {
    pageColor: '#f7fbf5',
    textColor: '#4d5a4d',
    headingColor: '#5a6a59',
  },
  dark: {
    pageColor: '#282b33',
    textColor: '#d0d4dc',
    headingColor: '#bcc0cc',
  },
  moss: {
    pageColor: '#27302a',
    textColor: '#d4ded4',
    headingColor: '#c3d0c3',
  },
  slate: {
    pageColor: '#2d3640',
    textColor: '#dbe3ec',
    headingColor: '#c7d2de',
  },
  merlot: {
    pageColor: '#30202a',
    textColor: '#ead8df',
    headingColor: '#d9bec8',
  },
  graphite: {
    pageColor: '#373b4a',
    textColor: '#dfdbea',
    headingColor: '#cbc6dc',
  },
  'dark-gpt': {
    pageColor: '#1b2330',
    textColor: '#e8edf5',
    headingColor: '#e8edf5',
  },
}

export const DOCUMENT_THEME_COLOR_PRESETS: Record<
  Exclude<DocumentTheme, 'ui-linked'>,
  DocumentColorSettings
> = {
  'paper-light': {
    pageColor: '#f5f1eb',
    textColor: '#3a3530',
    headingColor: '#2e2924',
  },
  'paper-dark': {
    pageColor: '#262220',
    textColor: '#d6cfc5',
    headingColor: '#e0d9cf',
  },
  bow: {
    pageColor: '#ffffff',
    textColor: '#111111',
    headingColor: '#000000',
  },
  wob: {
    pageColor: '#111111',
    textColor: '#f4f4f4',
    headingColor: '#ffffff',
  },
  'soft-neutral': {
    pageColor: '#e6dfd5',
    textColor: '#4f4a44',
    headingColor: '#3f3a35',
  },
}

/** Phase5-H Slice 3: registered fonts + selected font */
export const REGISTERED_FONTS_STORAGE_KEY = 'nyoze.registeredFonts'
export const SELECTED_FONT_STORAGE_KEY = 'nyoze.selectedFont'

/** BETA-DISP1: caret color settings */
export const CARET_COLOR_MODE_STORAGE_KEY = 'nyoze.caretColorMode'
export const CARET_COLOR_CUSTOM_STORAGE_KEY = 'nyoze.caretColorCustom'
export const DEFAULT_CARET_COLOR_MODE = 'auto' as const
export const EDITOR_ARROW_POINTER_STORAGE_KEY = 'nyoze.editorArrowPointer'
export const DEFAULT_EDITOR_ARROW_POINTER = false

/** Hidden settings.json: macOS Chromium の Arrow caret reveal 過大ジャンプ抑制 */
export const DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED = true

/** 擬似キャレット MVP (Task 2-2): 表示専用キャレットオーバーレイ。新規 / 未設定は既定 ON。 */
export const DEFAULT_PSEUDO_CARET_ENABLED = true

/**
 * 擬似キャレット (Task 2-4): 短軸の太さ（px）。横書きは縦線の幅、縦書きは横線の高さ。
 * 範囲 1〜8px、0.5px 刻み。既定は現行見た目に近い 2px。
 */
export const DEFAULT_PSEUDO_CARET_THICKNESS = 2
export const PSEUDO_CARET_THICKNESS_MIN = 1
export const PSEUDO_CARET_THICKNESS_MAX = 8
export const PSEUDO_CARET_THICKNESS_STEP = 0.5

/** 擬似キャレット点滅: overlay の opacity animation ON/OFF。既定は ON。 */
export const DEFAULT_PSEUDO_CARET_BLINK_ENABLED = true

/**
 * 付箋 (Task 3A-3): 初回付箋作成時の「本文に非表示コメントが追加される」説明を
 * 確認済みかどうか。一度確認したら再表示しない。設定 UI なし。
 */
export const DEFAULT_NOTE_ANCHOR_NOTICE_CONFIRMED = false

/**
 * PV-SET-4A: Page Viewer（active document / Book Viewer 共通）の読書用
 * pagination default。「見出しの前で改ページ」。既定 OFF。外部 export の
 * `pageBreakBeforeHeading` とは独立した key・独立した既定値。
 */
export const DEFAULT_PAGE_VIEWER_BREAK_BEFORE_HEADING = false

/**
 * PV-SET-4A: 対象見出し最大レベル。1=H1のみ 〜 6=H1〜H6。既定 1（H1のみ）。
 * toggle が OFF の間も値は保持するが、pagination には影響しない。
 */
export const DEFAULT_PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL = 1
export const PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL_MIN = 1
export const PAGE_VIEWER_BREAK_BEFORE_HEADING_MAX_LEVEL_MAX = 6

/**
 * PV-READ-1: Page Viewer 読書面の選択余白（settings.json 保存値）。
 * 実効余白は固定安全域（top/bottom 8px、inline 0px）を加えた値。
 * 既定の実効余白は top 32px / bottom 16px / inline 16px。範囲 0〜80、8px 刻み。
 */
export const DEFAULT_PAGE_VIEWER_READING_MARGIN_TOP = 24
export const DEFAULT_PAGE_VIEWER_READING_MARGIN_BOTTOM = 8
export const DEFAULT_PAGE_VIEWER_READING_MARGIN_INLINE = 16
export const PAGE_VIEWER_READING_MARGIN_MIN = 0
export const PAGE_VIEWER_READING_MARGIN_MAX = 80
export const PAGE_VIEWER_READING_MARGIN_STEP = 8

/** PV-READ-1: 用紙枠の既定 ON。 */
export const DEFAULT_PAGE_VIEWER_READING_PAPER_FRAME = true

/** PV-READ-2: 読書面 header furniture の既定。 */
export const DEFAULT_PAGE_VIEWER_READING_HEADER_ENABLED = true
export const DEFAULT_PAGE_VIEWER_READING_HEADER_ALIGN = 'start' as const
export const DEFAULT_PAGE_VIEWER_READING_HEADER_CONTENT = 'title' as const

/** PV-READ-2: 読書面 footer furniture の既定。 */
export const DEFAULT_PAGE_VIEWER_READING_FOOTER_ENABLED = true
export const DEFAULT_PAGE_VIEWER_READING_FOOTER_ALIGN = 'end' as const

/** PV-READ-3B: Page Viewer専用の簡易表紙（既定OFF）。 */
export const DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_ENABLED = false
export const DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_WRITING_MODE = 'inherit' as const
export const DEFAULT_PAGE_VIEWER_READING_SIMPLE_COVER_LAYOUT = 'normal' as const

/**
 * Phase5-H Slice1: Main color definitions per UI theme.
 * baseBg=panel, surfaceBg=surface, textPrimary, accent,
 * border=control/main border, paneBorder=topbar+pane boundary border,
 * scrollbarBase=scrollbar-thumb
 */
export const UI_THEME_MAIN_COLORS: Record<Theme, UiThemePreset['colors']> = {
  mist: {
    baseBg: '#e6e4de',
    surfaceBg: '#e9e6e1',
    textPrimary: '#7c6e6a',
    accent: '#8a9994',
    border: '#c9c5bd',
    paneBorder: '#d5d1ca',
    scrollbarBase: '#b7b3aa',
  },
  taupe: {
    baseBg: '#e4ddd5',
    surfaceBg: '#ebe5de',
    textPrimary: '#4f4a45',
    accent: '#a18c98',
    border: '#c8bdb1',
    paneBorder: '#d6cabe',
    scrollbarBase: '#b8ab9d',
  },
  linen: {
    baseBg: '#f8f6f1',
    surfaceBg: '#fdfcf8',
    textPrimary: '#3b3d3a',
    accent: '#919778',
    border: '#d9d5cc',
    paneBorder: '#e8e4dc',
    scrollbarBase: '#c4beb2',
  },
  dove: {
    baseBg: '#dededb',
    surfaceBg: '#eeeeeb',
    textPrimary: '#42464a',
    accent: '#7d8f98',
    border: '#c8c8c2',
    paneBorder: '#d6d6d1',
    scrollbarBase: '#b4b5b0',
  },
  clay: {
    baseBg: '#e3d7ce',
    surfaceBg: '#efe8e1',
    textPrimary: '#4f433d',
    accent: '#b07f6f',
    border: '#cab9ad',
    paneBorder: '#d8cac0',
    scrollbarBase: '#b8a79b',
  },
  olive: {
    baseBg: '#dfe1d4',
    surfaceBg: '#edf0e5',
    textPrimary: '#444c3f',
    accent: '#87956a',
    border: '#c5cab7',
    paneBorder: '#d5dacb',
    scrollbarBase: '#aeb69d',
  },
  custom: {
    baseBg: '#ffffff',
    surfaceBg: '#ffffff',
    textPrimary: '#352a32',
    accent: '#b7969e',
    border: '#d8c9d1',
    paneBorder: '#e3d7de',
    scrollbarBase: '#c2aab6',
  },
  light: {
    baseBg: '#f7f7f7',
    surfaceBg: '#ffffff',
    textPrimary: '#2c3040',
    accent: '#a1a1c4',
    border: '#d1d5dc',
    paneBorder: '#e4e6eb',
    scrollbarBase: '#b6bcc6',
  },
  sakura: {
    baseBg: '#f8eff3',
    surfaceBg: '#fff8fa',
    textPrimary: '#5d4952',
    accent: '#d59aaa',
    border: '#e5ced8',
    paneBorder: '#efe0e6',
    scrollbarBase: '#cbb3bc',
  },
  harbor: {
    baseBg: '#e6eff3',
    surfaceBg: '#f3f8fb',
    textPrimary: '#465d6b',
    accent: '#7fa2b3',
    border: '#c7d8e0',
    paneBorder: '#d9e6eb',
    scrollbarBase: '#b3c4cc',
  },
  sage: {
    baseBg: '#e9efe7',
    surfaceBg: '#f5f8f2',
    textPrimary: '#4d5a4d',
    accent: '#90a887',
    border: '#ced8cb',
    paneBorder: '#dde5da',
    scrollbarBase: '#b8c4b4',
  },
  dark: {
    baseBg: '#22252c',
    surfaceBg: '#282b33',
    textPrimary: '#d0d4dc',
    accent: '#7f9f93',
    border: '#3a3d46',
    paneBorder: '#32353e',
    scrollbarBase: '#4b5463',
  },
  moss: {
    baseBg: '#202823',
    surfaceBg: '#27302a',
    textPrimary: '#d4ded4',
    accent: '#8da391',
    border: '#3a463d',
    paneBorder: '#334036',
    scrollbarBase: '#58675d',
  },
  slate: {
    baseBg: '#242a31',
    surfaceBg: '#2d3640',
    textPrimary: '#dbe3ec',
    accent: '#8da2b5',
    border: '#46505a',
    paneBorder: '#3c4753',
    scrollbarBase: '#617181',
  },
  merlot: {
    baseBg: '#261a22',
    surfaceBg: '#30202a',
    textPrimary: '#ead8df',
    accent: '#b57c93',
    border: '#493440',
    paneBorder: '#422d38',
    scrollbarBase: '#725564',
  },
  graphite: {
    baseBg: '#2e3240',
    surfaceBg: '#373b4a',
    textPrimary: '#dfdbea',
    accent: '#ad99b8',
    border: '#4f5364',
    paneBorder: '#484d5f',
    scrollbarBase: '#6a6f86',
  },
  'dark-gpt': {
    baseBg: '#1b2330',
    surfaceBg: '#1b2330',
    textPrimary: '#e8edf5',
    accent: '#9ec5b4',
    border: '#36445b',
    paneBorder: '#3f4f68',
    scrollbarBase: '#4f6483',
  },
}
