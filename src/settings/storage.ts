import type { LineBreakPolicy } from '../editor-core/types'
import { resolveAutoTcyDigitRange } from '../editor-core/features/autoTcy'
import {
  APP_TITLE_COLOR_STORAGE_KEY,
  APP_TITLE_CUSTOM_STORAGE_KEY,
  APP_TITLE_FONT_STORAGE_KEY,
  APP_TITLE_PRESET_STORAGE_KEY,
  APP_TITLE_VISIBLE_STORAGE_KEY,
  DEFAULT_APP_TITLE_CUSTOM,
  DEFAULT_APP_TITLE_FONT,
  DEFAULT_APP_TITLE_PRESET,
  DEFAULT_APP_TITLE_VISIBLE,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_HEADING_DIVIDER_LEVELS,
  DEFAULT_DOC_COLOR_SETTINGS,
  DEFAULT_DOC_FONT_PRESET,
  DEFAULT_DOC_HEADING_FONT,
  DEFAULT_DOCUMENT_THEME,
  DEFAULT_TOOLBAR_ICON_STROKE,
  DEFAULT_TOOLBAR_SCALE,
  DEFAULT_UI_FONT,
  DEFAULT_UI_FONT_SCALE,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_LINE_BREAK_POLICY,
  DEFAULT_RIGHT_WIDTH,
  DEFAULT_WRITING_MODE,
  DISPLAY_SETTINGS_STORAGE_KEY,
  DOC_COLOR_SETTINGS_STORAGE_KEY,
  DOC_FONT_PRESET_STORAGE_KEY,
  DOC_HEADING_FONT_STORAGE_KEY,
  DOCUMENT_THEME_STORAGE_KEY,
  LINE_BREAK_POLICY_STORAGE_KEY,
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  PANE_STORAGE_KEY,
  CARET_COLOR_MODE_STORAGE_KEY,
  CARET_COLOR_CUSTOM_STORAGE_KEY,
  DEFAULT_CARET_COLOR_MODE,
  REGISTERED_FONTS_STORAGE_KEY,
  RUBY_VISIBILITY_STORAGE_KEY,
  SELECTED_FONT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  TOOLBAR_OFFSET_STORAGE_KEY,
  TOOLBAR_ICON_COLOR_STORAGE_KEY,
  TOOLBAR_ICON_STROKE_STORAGE_KEY,
  TOOLBAR_SCALE_STORAGE_KEY,
  TOOLBAR_VISIBLE_STORAGE_KEY,
  UI_FONT_SCALE_STORAGE_KEY,
  UI_FONT_STORAGE_KEY,
  UI_TEXT_PRIMARY_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  WRITING_MODE_STORAGE_KEY,
} from './defaults'
import type {
  AppTitleFont,
  AppTitlePreset,
  DisplaySettings,
  DocThemePreset,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  DocumentTheme,
  HeadingAlign,
  PaneState,
  SettingsJson,
  Theme,
  UiFont,
  UiThemePreset,
  WritingMode,
} from './types'
import { normalizeAppTitleCustomValue } from './appTitleCustom'
import { normalizeTheme, UI_THEME_VALUES } from './themeUtils'
import {
  type CaretColorMode,
  isValidCaretColorCustom,
  normalizeCaretColorMode,
} from '../theme/caretColor'

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeHeadingDividerLevels(
  value: unknown,
): DisplaySettings['headingDividerLevels'] {
  const parsed = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
  return {
    h1: typeof parsed?.h1 === 'boolean' ? parsed.h1 : DEFAULT_HEADING_DIVIDER_LEVELS.h1,
    h2: typeof parsed?.h2 === 'boolean' ? parsed.h2 : DEFAULT_HEADING_DIVIDER_LEVELS.h2,
    h3: typeof parsed?.h3 === 'boolean' ? parsed.h3 : DEFAULT_HEADING_DIVIDER_LEVELS.h3,
    h4: typeof parsed?.h4 === 'boolean' ? parsed.h4 : DEFAULT_HEADING_DIVIDER_LEVELS.h4,
    h5: typeof parsed?.h5 === 'boolean' ? parsed.h5 : DEFAULT_HEADING_DIVIDER_LEVELS.h5,
    h6: typeof parsed?.h6 === 'boolean' ? parsed.h6 : DEFAULT_HEADING_DIVIDER_LEVELS.h6,
  }
}

function normalizeHeadingAlign(
  value: unknown,
  fallback: HeadingAlign,
): HeadingAlign {
  if (value === 'start' || value === 'center' || value === 'end') return value
  return fallback
}

/**
 * BETA-H1: `document.documentElement` に align を載せ、CSS（見出しブロックの shrink-wrap + 論理 margin）で参照する。
 * 属性名: data-editor-heading-align-h / data-editor-heading-align-v
 * （折りたたみトグル単体を動かす用途では使わない）
 */
export function syncHeadingAlignDataset(
  root: { dataset: DOMStringMap } | null | undefined,
  horizontal: HeadingAlign,
  vertical: HeadingAlign,
): void {
  if (!root) return
  root.dataset.editorHeadingAlignH = horizontal
  root.dataset.editorHeadingAlignV = vertical
}

export function normalizeDisplaySettings(value: unknown): DisplaySettings {
  const parsed = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
  const legacyPadding = clampNumber(
    Number(parsed.contentPadding ?? DEFAULT_DISPLAY_SETTINGS.paddingTop),
    22,
    80,
  )
  const autoTcyDigitRange = resolveAutoTcyDigitRange(parsed)

  return {
    fontSize: clampNumber(
      Number(parsed.fontSize ?? DEFAULT_DISPLAY_SETTINGS.fontSize),
      14,
      36,
    ),
    lineHeight: clampNumber(
      Number(parsed.lineHeight ?? DEFAULT_DISPLAY_SETTINGS.lineHeight),
      1.2,
      2.8,
    ),
    paddingTop: clampNumber(
      Number(parsed.paddingTop ?? legacyPadding),
      22,
      120,
    ),
    paddingBottom: clampNumber(
      Number(parsed.paddingBottom ?? legacyPadding),
      8,
      120,
    ),
    rubySize: clampNumber(
      Number(parsed.rubySize ?? DEFAULT_DISPLAY_SETTINGS.rubySize),
      0.3,
      1.2,
    ),
    rubyOffset: clampNumber(
      Number(parsed.rubyOffset ?? DEFAULT_DISPLAY_SETTINGS.rubyOffset),
      -1.5,
      1.5,
    ),
    autoTcyEnabled:
      typeof parsed.autoTcyEnabled === 'boolean'
        ? parsed.autoTcyEnabled
        : DEFAULT_DISPLAY_SETTINGS.autoTcyEnabled,
    autoTcyNumbersOnly:
      typeof parsed.autoTcyNumbersOnly === 'boolean'
        ? parsed.autoTcyNumbersOnly
        : DEFAULT_DISPLAY_SETTINGS.autoTcyNumbersOnly,
    autoTcyMinDigits: autoTcyDigitRange.minDigits,
    autoTcyMaxDigits: autoTcyDigitRange.maxDigits,
    headingMarginAfter: clampNumber(
      Number(parsed.headingMarginAfter ?? DEFAULT_DISPLAY_SETTINGS.headingMarginAfter),
      0,
      1.5,
    ),
    headingDividerLevels: normalizeHeadingDividerLevels(parsed.headingDividerLevels),
    headingAlignHorizontal: normalizeHeadingAlign(
      parsed.headingAlignHorizontal,
      DEFAULT_DISPLAY_SETTINGS.headingAlignHorizontal,
    ),
    headingAlignVertical: normalizeHeadingAlign(
      parsed.headingAlignVertical,
      DEFAULT_DISPLAY_SETTINGS.headingAlignVertical,
    ),
  }
}

export function loadTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    const normalized = normalizeTheme(saved)
    if (normalized) return normalized
  } catch {
    // ignore
  }
  return 'mist'
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function loadRubyVisibility(): boolean {
  try {
    return window.localStorage.getItem(RUBY_VISIBILITY_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveRubyVisibility(visible: boolean): void {
  try {
    window.localStorage.setItem(RUBY_VISIBILITY_STORAGE_KEY, visible ? '1' : '0')
  } catch {
    // ignore
  }
}

export function loadDisplaySettings(): DisplaySettings {
  try {
    const raw = window.localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_DISPLAY_SETTINGS
    return normalizeDisplaySettings(JSON.parse(raw))
  } catch {
    return DEFAULT_DISPLAY_SETTINGS
  }
}

export function saveDisplaySettings(settings: DisplaySettings): void {
  try {
    window.localStorage.setItem(
      DISPLAY_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    )
  } catch {
    // ignore
  }
}

export function loadLineBreakPolicy(): LineBreakPolicy {
  try {
    const raw = window.localStorage.getItem(LINE_BREAK_POLICY_STORAGE_KEY)
    if (raw === 'commonmark-strict') return raw
  } catch {
    // ignore
  }
  return DEFAULT_LINE_BREAK_POLICY
}

export function saveLineBreakPolicy(policy: LineBreakPolicy): void {
  try {
    window.localStorage.setItem(LINE_BREAK_POLICY_STORAGE_KEY, policy)
  } catch {
    // ignore
  }
}

export function loadPaneState(): PaneState {
  try {
    const raw = window.localStorage.getItem(PANE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : true,
        rightOpen:
          typeof parsed.rightOpen === 'boolean' ? parsed.rightOpen : false,
        leftWidth:
          typeof parsed.leftWidth === 'number' &&
          parsed.leftWidth >= MIN_LEFT_WIDTH
            ? parsed.leftWidth
            : DEFAULT_LEFT_WIDTH,
        rightWidth:
          typeof parsed.rightWidth === 'number' &&
          parsed.rightWidth >= MIN_RIGHT_WIDTH
            ? parsed.rightWidth
            : DEFAULT_RIGHT_WIDTH,
      }
    }
  } catch {
    // ignore
  }

  return {
    leftOpen: true,
    rightOpen: false,
    leftWidth: DEFAULT_LEFT_WIDTH,
    rightWidth: DEFAULT_RIGHT_WIDTH,
  }
}

export function savePaneState(state: PaneState): void {
  try {
    window.localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function loadWritingMode(): WritingMode {
  try {
    const raw = window.localStorage.getItem(WRITING_MODE_STORAGE_KEY)
    if (raw === 'horizontal-tb') return raw
  } catch {
    // ignore
  }
  return DEFAULT_WRITING_MODE
}

export function saveWritingMode(mode: WritingMode): void {
  try {
    window.localStorage.setItem(WRITING_MODE_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function loadToolbarVisible(): boolean {
  try {
    return window.localStorage.getItem(TOOLBAR_VISIBLE_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveToolbarVisible(visible: boolean): void {
  try {
    window.localStorage.setItem(TOOLBAR_VISIBLE_STORAGE_KEY, visible ? '1' : '0')
  } catch {
    // ignore
  }
}

export function loadToolbarOffset(): number {
  try {
    const raw = window.localStorage.getItem(TOOLBAR_OFFSET_STORAGE_KEY)
    if (raw !== null) {
      const n = Number(raw)
      if (Number.isFinite(n)) return n
    }
  } catch {
    // ignore
  }
  return 0
}

export function saveToolbarOffset(offset: number): void {
  try {
    window.localStorage.setItem(TOOLBAR_OFFSET_STORAGE_KEY, String(offset))
  } catch {
    // ignore
  }
}

/** Phase5-H: load UI theme (falls back to legacy `nyoze.theme` then to 'mist') */
export function loadUiTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
    const normalized = normalizeTheme(saved)
    if (normalized) return normalized
    // Fallback to legacy key for pre-migration users
    return loadTheme()
  } catch {
    return 'mist'
  }
}

export function saveUiTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

/** Phase5-H: UI font selector */
const UI_FONT_CUSTOM_PREFIX = 'custom:'
const VALID_UI_FONTS: Array<Exclude<UiFont, `custom:${string}`>> = ['mincho', 'gothic']

function isValidUiFont(value: unknown): value is UiFont {
  if (typeof value !== 'string') return false
  if (VALID_UI_FONTS.includes(value as Exclude<UiFont, `custom:${string}`>)) {
    return true
  }
  if (!value.startsWith(UI_FONT_CUSTOM_PREFIX)) return false
  return value.slice(UI_FONT_CUSTOM_PREFIX.length).trim().length > 0
}

export function loadUiFont(): UiFont {
  try {
    const saved = window.localStorage.getItem(UI_FONT_STORAGE_KEY)
    if (isValidUiFont(saved)) return saved
  } catch {
    // ignore
  }
  return DEFAULT_UI_FONT
}

export function saveUiFont(value: UiFont): void {
  try {
    window.localStorage.setItem(UI_FONT_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

/** Phase5-H: UI primary text color + font scale */
function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

export function loadUiTextPrimary(): string | null {
  try {
    const saved = window.localStorage.getItem(UI_TEXT_PRIMARY_STORAGE_KEY)
    return isValidHexColor(saved) ? saved : null
  } catch {
    return null
  }
}

export function saveUiTextPrimary(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(UI_TEXT_PRIMARY_STORAGE_KEY)
    } else {
      window.localStorage.setItem(UI_TEXT_PRIMARY_STORAGE_KEY, value)
    }
  } catch {
    // ignore
  }
}

export function loadUiFontScale(): number {
  try {
    const raw = window.localStorage.getItem(UI_FONT_SCALE_STORAGE_KEY)
    if (raw === null) return DEFAULT_UI_FONT_SCALE
    const value = Number(raw)
    if (Number.isFinite(value)) return clampNumber(value, 0.9, 1.3)
  } catch {
    // ignore
  }
  return DEFAULT_UI_FONT_SCALE
}

export function saveUiFontScale(value: number): void {
  try {
    window.localStorage.setItem(
      UI_FONT_SCALE_STORAGE_KEY,
      String(clampNumber(value, 0.9, 1.3)),
    )
  } catch {
    // ignore
  }
}

export function loadToolbarIconColor(): string | null {
  try {
    const saved = window.localStorage.getItem(TOOLBAR_ICON_COLOR_STORAGE_KEY)
    return isValidHexColor(saved) ? saved : null
  } catch {
    return null
  }
}

export function saveToolbarIconColor(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(TOOLBAR_ICON_COLOR_STORAGE_KEY)
    } else if (isValidHexColor(value)) {
      window.localStorage.setItem(TOOLBAR_ICON_COLOR_STORAGE_KEY, value)
    }
  } catch {
    // ignore
  }
}

export function loadToolbarIconStroke(): number {
  try {
    const raw = window.localStorage.getItem(TOOLBAR_ICON_STROKE_STORAGE_KEY)
    if (raw === null) return DEFAULT_TOOLBAR_ICON_STROKE
    const value = Number(raw)
    if (Number.isFinite(value)) return clampNumber(value, 0.9, 1.8)
  } catch {
    // ignore
  }
  return DEFAULT_TOOLBAR_ICON_STROKE
}

export function saveToolbarIconStroke(value: number): void {
  try {
    window.localStorage.setItem(
      TOOLBAR_ICON_STROKE_STORAGE_KEY,
      String(clampNumber(value, 0.9, 1.8)),
    )
  } catch {
    // ignore
  }
}

export function loadToolbarScale(): number {
  try {
    const raw = window.localStorage.getItem(TOOLBAR_SCALE_STORAGE_KEY)
    if (raw === null) return DEFAULT_TOOLBAR_SCALE
    const value = Number(raw)
    if (Number.isFinite(value)) return clampNumber(value, 0.85, 1.15)
  } catch {
    // ignore
  }
  return DEFAULT_TOOLBAR_SCALE
}

export function saveToolbarScale(value: number): void {
  try {
    window.localStorage.setItem(
      TOOLBAR_SCALE_STORAGE_KEY,
      String(clampNumber(value, 0.85, 1.15)),
    )
  } catch {
    // ignore
  }
}

const VALID_APP_TITLE_PRESETS: AppTitlePreset[] = [
  'nyoze',
  'nyoze-upper',
  'nyoze-kanji',
  'custom',
]

const APP_TITLE_FONT_CUSTOM_PREFIX = 'custom:'
const VALID_APP_TITLE_FONTS: Array<Exclude<AppTitleFont, `custom:${string}`>> = [
  'ui-default',
  'mincho',
  'gothic',
]

function normalizeAppTitleCustom(value: unknown): string {
  return normalizeAppTitleCustomValue(value)
}

function isValidAppTitleFont(value: unknown): value is AppTitleFont {
  if (typeof value !== 'string') return false
  if (VALID_APP_TITLE_FONTS.includes(value as Exclude<AppTitleFont, `custom:${string}`>)) {
    return true
  }
  if (!value.startsWith(APP_TITLE_FONT_CUSTOM_PREFIX)) return false
  return value.slice(APP_TITLE_FONT_CUSTOM_PREFIX.length).trim().length > 0
}

export function loadAppTitleVisible(): boolean {
  try {
    const raw = window.localStorage.getItem(APP_TITLE_VISIBLE_STORAGE_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
  } catch {
    // ignore
  }
  return DEFAULT_APP_TITLE_VISIBLE
}

export function saveAppTitleVisible(value: boolean): void {
  try {
    window.localStorage.setItem(APP_TITLE_VISIBLE_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

export function loadAppTitlePreset(): AppTitlePreset {
  try {
    const raw = window.localStorage.getItem(APP_TITLE_PRESET_STORAGE_KEY)
    if (raw && VALID_APP_TITLE_PRESETS.includes(raw as AppTitlePreset)) {
      return raw as AppTitlePreset
    }
  } catch {
    // ignore
  }
  return DEFAULT_APP_TITLE_PRESET
}

export function saveAppTitlePreset(value: AppTitlePreset): void {
  try {
    window.localStorage.setItem(APP_TITLE_PRESET_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

export function loadAppTitleCustom(): string {
  try {
    return normalizeAppTitleCustom(
      window.localStorage.getItem(APP_TITLE_CUSTOM_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_APP_TITLE_CUSTOM
  }
}

export function saveAppTitleCustom(value: string): void {
  try {
    window.localStorage.setItem(
      APP_TITLE_CUSTOM_STORAGE_KEY,
      normalizeAppTitleCustom(value),
    )
  } catch {
    // ignore
  }
}

export function loadAppTitleColor(): string | null {
  try {
    const raw = window.localStorage.getItem(APP_TITLE_COLOR_STORAGE_KEY)
    return isValidHexColor(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveAppTitleColor(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(APP_TITLE_COLOR_STORAGE_KEY)
      return
    }
    if (!isValidHexColor(value)) return
    window.localStorage.setItem(APP_TITLE_COLOR_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

export function loadAppTitleFont(): AppTitleFont {
  try {
    const raw = window.localStorage.getItem(APP_TITLE_FONT_STORAGE_KEY)
    if (isValidAppTitleFont(raw)) return raw
  } catch {
    // ignore
  }
  return DEFAULT_APP_TITLE_FONT
}

export function saveAppTitleFont(value: AppTitleFont): void {
  try {
    window.localStorage.setItem(APP_TITLE_FONT_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

const VALID_DOC_THEMES: DocumentTheme[] = [
  'ui-linked',
  'paper-light',
  'paper-dark',
  'bow',
  'wob',
  'soft-neutral',
]

export function loadDocumentTheme(): DocumentTheme {
  try {
    const saved = window.localStorage.getItem(DOCUMENT_THEME_STORAGE_KEY)
    if (saved === 'paper-custom') return 'ui-linked'
    if (saved && VALID_DOC_THEMES.includes(saved as DocumentTheme)) {
      return saved as DocumentTheme
    }
  } catch {
    // ignore
  }
  return DEFAULT_DOCUMENT_THEME
}

export function saveDocumentTheme(docTheme: DocumentTheme): void {
  try {
    window.localStorage.setItem(DOCUMENT_THEME_STORAGE_KEY, docTheme)
  } catch {
    // ignore
  }
}

/** Phase5-H Slice 2: document font preset */
const DOC_FONT_PRESET_CUSTOM_PREFIX = 'custom:'
const VALID_FONT_PRESETS: Array<Exclude<DocumentFontPreset, `custom:${string}`>> = [
  'ui-linked',
  'mincho',
  'gothic',
]

function isValidDocFontPreset(value: unknown): value is DocumentFontPreset {
  if (typeof value !== 'string') return false
  if (VALID_FONT_PRESETS.includes(value as Exclude<DocumentFontPreset, `custom:${string}`>)) {
    return true
  }
  if (!value.startsWith(DOC_FONT_PRESET_CUSTOM_PREFIX)) return false
  return value.slice(DOC_FONT_PRESET_CUSTOM_PREFIX.length).trim().length > 0
}

export function loadDocFontPreset(): DocumentFontPreset {
  try {
    const saved = window.localStorage.getItem(DOC_FONT_PRESET_STORAGE_KEY)
    if (isValidDocFontPreset(saved)) {
      return saved
    }
  } catch {
    // ignore
  }
  return DEFAULT_DOC_FONT_PRESET
}

export function saveDocFontPreset(preset: DocumentFontPreset): void {
  try {
    window.localStorage.setItem(DOC_FONT_PRESET_STORAGE_KEY, preset)
  } catch {
    // ignore
  }
}

/** Phase5-H: heading font selector */
const DOC_HEADING_FONT_CUSTOM_PREFIX = 'custom:'
const VALID_DOC_HEADING_FONTS: Array<Exclude<DocumentHeadingFont, `custom:${string}`>> = [
  'same-as-body',
  'mincho',
  'gothic',
]

function isValidDocHeadingFont(value: unknown): value is DocumentHeadingFont {
  if (typeof value !== 'string') return false
  if (VALID_DOC_HEADING_FONTS.includes(value as Exclude<DocumentHeadingFont, `custom:${string}`>)) {
    return true
  }
  if (!value.startsWith(DOC_HEADING_FONT_CUSTOM_PREFIX)) return false
  return value.slice(DOC_HEADING_FONT_CUSTOM_PREFIX.length).trim().length > 0
}

export function loadDocHeadingFont(): DocumentHeadingFont {
  try {
    const saved = window.localStorage.getItem(DOC_HEADING_FONT_STORAGE_KEY)
    if (isValidDocHeadingFont(saved)) return saved
  } catch {
    // ignore
  }
  return DEFAULT_DOC_HEADING_FONT
}

export function saveDocHeadingFont(value: DocumentHeadingFont): void {
  try {
    window.localStorage.setItem(DOC_HEADING_FONT_STORAGE_KEY, value)
  } catch {
    // ignore
  }
}

/** Phase5-H Slice 2: document custom color settings */
const CSS_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function isValidCssColor(value: unknown): value is string {
  return typeof value === 'string' && CSS_COLOR_RE.test(value)
}

export function loadDocColorSettings(): DocumentColorSettings {
  try {
    const raw = window.localStorage.getItem(DOC_COLOR_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_DOC_COLOR_SETTINGS
    const parsed = JSON.parse(raw)
    return {
      pageColor: isValidCssColor(parsed.pageColor)
        ? parsed.pageColor
        : DEFAULT_DOC_COLOR_SETTINGS.pageColor,
      textColor: isValidCssColor(parsed.textColor)
        ? parsed.textColor
        : DEFAULT_DOC_COLOR_SETTINGS.textColor,
      headingColor: isValidCssColor(parsed.headingColor)
        ? parsed.headingColor
        : DEFAULT_DOC_COLOR_SETTINGS.headingColor,
    }
  } catch {
    return DEFAULT_DOC_COLOR_SETTINGS
  }
}

export function saveDocColorSettings(settings: DocumentColorSettings): void {
  try {
    window.localStorage.setItem(
      DOC_COLOR_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    )
  } catch {
    // ignore
  }
}

/** Phase5-H Slice 3: registered fonts (localStorage) */

export function loadRegisteredFonts(): string[] {
  try {
    const raw = window.localStorage.getItem(REGISTERED_FONTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string')
  } catch {
    // ignore
  }
  return []
}

export function saveRegisteredFonts(fonts: string[]): void {
  try {
    window.localStorage.setItem(REGISTERED_FONTS_STORAGE_KEY, JSON.stringify(fonts))
  } catch {
    // ignore
  }
}

export function loadSelectedFont(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_FONT_STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveSelectedFont(font: string | null): void {
  try {
    if (font === null) {
      window.localStorage.removeItem(SELECTED_FONT_STORAGE_KEY)
    } else {
      window.localStorage.setItem(SELECTED_FONT_STORAGE_KEY, font)
    }
  } catch {
    // ignore
  }
}

/** BETA-DISP1: caret color settings */

export function loadCaretColorMode(): CaretColorMode {
  try {
    const raw = window.localStorage.getItem(CARET_COLOR_MODE_STORAGE_KEY)
    return normalizeCaretColorMode(raw)
  } catch {
    return DEFAULT_CARET_COLOR_MODE
  }
}

export function saveCaretColorMode(mode: CaretColorMode): void {
  try {
    window.localStorage.setItem(CARET_COLOR_MODE_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

export function loadCaretColorCustom(): string | null {
  try {
    const raw = window.localStorage.getItem(CARET_COLOR_CUSTOM_STORAGE_KEY)
    return isValidCaretColorCustom(raw) ? raw : null
  } catch {
    return null
  }
}

export function saveCaretColorCustom(value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(CARET_COLOR_CUSTOM_STORAGE_KEY)
    } else if (isValidCaretColorCustom(value)) {
      window.localStorage.setItem(CARET_COLOR_CUSTOM_STORAGE_KEY, value)
    }
  } catch {
    // ignore
  }
}

/** Phase5-H Slice 3: settings.json persistence via IPC */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bridge = () => (window as any).nyozeBridge?.settings as {
  read: () => Promise<Record<string, unknown> | null>
  write: (data: Record<string, unknown>) => Promise<boolean>
} | undefined

let settingsJsonCache: SettingsJson | null = null

type LoadSettingsJsonResult = {
  settings: SettingsJson
  ok: boolean
}

async function loadSettingsJsonWithStatus(): Promise<LoadSettingsJsonResult> {
  if (settingsJsonCache) {
    return { settings: settingsJsonCache, ok: true }
  }
  try {
    const api = bridge()
    if (api) {
      const data = await api.read()
      if (data) {
        settingsJsonCache = data as SettingsJson
        return { settings: settingsJsonCache, ok: true }
      }
    }
  } catch {
    // ignore — fall through to empty
  }
  return { settings: {}, ok: false }
}

export async function loadSettingsJson(): Promise<SettingsJson> {
  return (await loadSettingsJsonWithStatus()).settings
}

export async function saveSettingsJson(settings: SettingsJson): Promise<void> {
  settingsJsonCache = settings
  // Always mirror to localStorage as fallback
  try {
    if (settings.registeredFonts !== undefined) {
      saveRegisteredFonts(settings.registeredFonts)
    }
    if (settings.selectedFont !== undefined) saveSelectedFont(settings.selectedFont ?? null)
    if (settings.displaySettings !== undefined) saveDisplaySettings(settings.displaySettings)
    if (settings.docColorSettings !== undefined) saveDocColorSettings(settings.docColorSettings)
    if (settings.docFontPreset !== undefined) saveDocFontPreset(settings.docFontPreset)
    if (settings.docHeadingFont !== undefined) saveDocHeadingFont(settings.docHeadingFont)
    if (settings.documentTheme !== undefined) saveDocumentTheme(settings.documentTheme)
    if (settings.uiFont !== undefined) saveUiFont(settings.uiFont)
    if (settings.uiTextPrimary !== undefined) saveUiTextPrimary(settings.uiTextPrimary)
    if (settings.uiFontScale !== undefined) saveUiFontScale(settings.uiFontScale)
    if (settings.toolbarIconColor !== undefined) {
      saveToolbarIconColor(settings.toolbarIconColor)
    }
    if (settings.toolbarIconStroke !== undefined) {
      saveToolbarIconStroke(settings.toolbarIconStroke)
    }
    if (settings.toolbarScale !== undefined) {
      saveToolbarScale(settings.toolbarScale)
    }
    if (settings.appTitleVisible !== undefined) saveAppTitleVisible(settings.appTitleVisible)
    if (settings.appTitlePreset !== undefined) saveAppTitlePreset(settings.appTitlePreset)
    if (settings.appTitleCustom !== undefined) saveAppTitleCustom(settings.appTitleCustom)
    if (settings.appTitleColor !== undefined) saveAppTitleColor(settings.appTitleColor)
    if (settings.appTitleFont !== undefined) saveAppTitleFont(settings.appTitleFont)
    if (settings.uiTheme !== undefined) saveUiTheme(settings.uiTheme)
    if (settings.lineBreakPolicy !== undefined) {
      saveLineBreakPolicy(settings.lineBreakPolicy)
    }
    if (settings.rubyVisible !== undefined) saveRubyVisibility(settings.rubyVisible)
    if (settings.caretColorMode !== undefined) saveCaretColorMode(normalizeCaretColorMode(settings.caretColorMode))
    if (settings.caretColorCustom !== undefined) saveCaretColorCustom(settings.caretColorCustom ?? null)
  } catch {
    // ignore localStorage errors
  }
  // Primary: write to settings.json via IPC
  try {
    const api = bridge()
    if (api) {
      const ok = await api.write(settings as Record<string, unknown>)
      if (!ok) console.warn('settings.json write returned false')
    }
  } catch (err) {
    console.warn('settings.json write failed:', err)
  }
}

export async function patchSettingsJson(patch: Partial<SettingsJson>): Promise<void> {
  settingsJsonWriteQueue = settingsJsonWriteQueue
    .then(async () => {
      const { settings: current, ok } = await loadSettingsJsonWithStatus()
      if (!ok) {
        console.warn('patchSettingsJson skipped: current settings unavailable')
        return
      }
      const merged = { ...current, ...patch }
      await saveSettingsJson(merged)
    })
    .catch((err) => {
      console.warn('patchSettingsJson queue failed:', err)
    })

  return settingsJsonWriteQueue
}

let settingsJsonWriteQueue: Promise<void> = Promise.resolve()

export function __resetSettingsJsonStateForTests(): void {
  settingsJsonCache = null
  settingsJsonWriteQueue = Promise.resolve()
}

/** Phase5-H Slice1: Preset validation helpers */

const CSS_HEX_RE = /^#[0-9a-fA-F]{6}$/

function isHex(v: unknown): v is string {
  return typeof v === 'string' && CSS_HEX_RE.test(v)
}

function isValidUiThemeValue(v: unknown): v is Theme {
  return typeof v === 'string' && UI_THEME_VALUES.includes(v as Theme)
}

function isValidDocThemeValue(v: unknown): v is DocumentTheme {
  return (
    v === 'ui-linked' ||
    v === 'paper-light' ||
    v === 'paper-dark' ||
    v === 'bow' ||
    v === 'wob' ||
    v === 'soft-neutral'
  )
}


function normalizePresetKind(
  value: unknown,
  fallbackId: string,
  prefix: 'preset-ui-' | 'preset-doc-',
): 'system' | 'custom' {
  if (value === 'system' || value === 'custom') return value
  return fallbackId.startsWith(prefix) ? 'system' : 'custom'
}

export function validateUiThemePreset(data: unknown): UiThemePreset | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.id !== 'string' || !d.id) return null
  if (typeof d.name !== 'string') return null
  if (!isValidUiThemeValue(d.baseTheme)) return null
  const c = d.colors
  if (!c || typeof c !== 'object') return null
  const colors = c as Record<string, unknown>
  if (
    !isHex(colors.baseBg) ||
    !isHex(colors.surfaceBg) ||
    !isHex(colors.textPrimary) ||
    !isHex(colors.accent) ||
    !isHex(colors.border) ||
    !isHex(colors.scrollbarBase)
  ) return null
  const paneBorder = isHex(colors.paneBorder)
    ? (colors.paneBorder as string)
    : (colors.border as string)
  const paneBg = isHex(colors.paneBg)
    ? (colors.paneBg as string)
    : undefined
  // Font fields removed from preset (BETA-T1); old data silently ignored.
  return {
    id: d.id as string,
    name: d.name as string,
    kind: normalizePresetKind(d.kind, d.id as string, 'preset-ui-'),
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : undefined,
    baseTheme: d.baseTheme as Theme,
    colors: {
      baseBg: colors.baseBg as string,
      surfaceBg: colors.surfaceBg as string,
      textPrimary: colors.textPrimary as string,
      paneBg,
      accent: colors.accent as string,
      border: colors.border as string,
      paneBorder,
      scrollbarBase: colors.scrollbarBase as string,
    },
  }
}

export function validateDocThemePreset(data: unknown): DocThemePreset | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.id !== 'string' || !d.id) return null
  if (typeof d.name !== 'string') return null
  if (!isValidDocThemeValue(d.baseDocTheme)) return null
  const c = d.colors
  if (!c || typeof c !== 'object') return null
  const colors = c as Record<string, unknown>
  if (
    !isHex(colors.pageColor) ||
    !isHex(colors.textColor) ||
    !isHex(colors.headingColor)
  ) return null
  // Font fields removed from preset (BETA-T1); old data silently ignored.
  return {
    id: d.id as string,
    name: d.name as string,
    kind: normalizePresetKind(d.kind, d.id as string, 'preset-doc-'),
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : undefined,
    baseDocTheme: d.baseDocTheme as DocumentTheme,
    colors: {
      pageColor: colors.pageColor as string,
      textColor: colors.textColor as string,
      headingColor: colors.headingColor as string,
    },
  }
}

export function validateUiThemePresets(data: unknown): UiThemePreset[] {
  if (!Array.isArray(data)) return []
  return data
    .map(validateUiThemePreset)
    .filter((p): p is UiThemePreset => p !== null)
}

export function validateDocThemePresets(data: unknown): DocThemePreset[] {
  if (!Array.isArray(data)) return []
  return data
    .map(validateDocThemePreset)
    .filter((p): p is DocThemePreset => p !== null)
}
