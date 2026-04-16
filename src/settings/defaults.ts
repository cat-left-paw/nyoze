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
  UiThemePreset,
  WritingMode,
} from './types'

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

export const TOOLBAR_VISIBLE_STORAGE_KEY = 'nyoze.toolbarVisible'
export const TOOLBAR_OFFSET_STORAGE_KEY = 'nyoze.toolbarOffset'

/** Phase5-H: separated theme storage keys */
export const UI_THEME_STORAGE_KEY = 'nyoze.uiTheme'
export const DOCUMENT_THEME_STORAGE_KEY = 'nyoze.documentTheme'
export const UI_FONT_STORAGE_KEY = 'nyoze.uiFont'

export const DEFAULT_UI_FONT: UiFont = 'gothic'

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
