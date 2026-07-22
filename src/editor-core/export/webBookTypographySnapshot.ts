/**
 * Web Book 見出し appearance 用の純粋な typography snapshot。
 * Display Settings / Page Viewer の型を IPC へ持ち込まず、
 * 明朝 / ゴシック / 本文と同じ、という意味論だけを export 境界で扱う。
 * OS 固有・custom font family 文字列は受理・出力しない。
 */

export type WebBookHeadingFont = 'same-as-body' | 'mincho' | 'gothic'
export type WebBookHeadingAlign = 'start' | 'center' | 'end'

export type WebBookHeadingDividerLevels = {
  h1: boolean
  h2: boolean
  h3: boolean
  h4: boolean
  h5: boolean
  h6: boolean
}

export type WebBookTypographySnapshotInput = {
  headingFont: WebBookHeadingFont
  headingAlignHorizontal: WebBookHeadingAlign
  headingAlignVertical: WebBookHeadingAlign
  headingMarginAfter: number
  headingDividerLevels: WebBookHeadingDividerLevels
}

export type WebBookTypographySnapshot = Readonly<WebBookTypographySnapshotInput>

const TYPOGRAPHY_KEYS = [
  'headingFont',
  'headingAlignHorizontal',
  'headingAlignVertical',
  'headingMarginAfter',
  'headingDividerLevels',
] as const

const HEADING_FONTS = new Set<WebBookHeadingFont>(['same-as-body', 'mincho', 'gothic'])
const HEADING_ALIGNS = new Set<WebBookHeadingAlign>(['start', 'center', 'end'])
const DIVIDER_KEYS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

/** Display Settings の headingMarginAfter と同じ安全範囲。 */
export const WEB_BOOK_HEADING_MARGIN_AFTER_MIN = 0
export const WEB_BOOK_HEADING_MARGIN_AFTER_MAX = 1.5
export const WEB_BOOK_HEADING_MARGIN_AFTER_DEFAULT = 0.45

export const DEFAULT_WEB_BOOK_HEADING_DIVIDER_LEVELS: WebBookHeadingDividerLevels = Object.freeze({
  h1: true,
  h2: true,
  h3: false,
  h4: false,
  h5: false,
  h6: false,
})

export const DEFAULT_WEB_BOOK_TYPOGRAPHY_SNAPSHOT: WebBookTypographySnapshot = Object.freeze({
  headingFont: 'same-as-body',
  headingAlignHorizontal: 'start',
  headingAlignVertical: 'start',
  headingMarginAfter: WEB_BOOK_HEADING_MARGIN_AFTER_DEFAULT,
  headingDividerLevels: { ...DEFAULT_WEB_BOOK_HEADING_DIVIDER_LEVELS },
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeHeadingFontStrict(value: unknown): WebBookHeadingFont {
  if (typeof value !== 'string' || !HEADING_FONTS.has(value as WebBookHeadingFont)) {
    throw new Error('Web Book typography snapshot の headingFont は same-as-body / mincho / gothic で指定してください')
  }
  return value as WebBookHeadingFont
}

function normalizeHeadingAlignStrict(value: unknown, key: string): WebBookHeadingAlign {
  if (typeof value !== 'string' || !HEADING_ALIGNS.has(value as WebBookHeadingAlign)) {
    throw new Error(`Web Book typography snapshot の ${key} は start / center / end で指定してください`)
  }
  return value as WebBookHeadingAlign
}

/**
 * margin は有限数を round して 0〜1.5 にクランプする。
 * 非数は throw（IPC strict 経路用）。
 */
export function normalizeWebBookHeadingMarginAfter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Web Book typography snapshot の headingMarginAfter は有限数で指定してください')
  }
  const rounded = Math.round(value * 100) / 100
  return Math.min(
    WEB_BOOK_HEADING_MARGIN_AFTER_MAX,
    Math.max(WEB_BOOK_HEADING_MARGIN_AFTER_MIN, rounded),
  )
}

function normalizeDividerLevelsStrict(value: unknown): WebBookHeadingDividerLevels {
  if (!isPlainObject(value)) {
    throw new Error('Web Book typography snapshot の headingDividerLevels は h1〜h6 の object で指定してください')
  }
  const keys = Object.keys(value)
  if (
    keys.length !== DIVIDER_KEYS.length ||
    keys.some((key) => !DIVIDER_KEYS.includes(key as (typeof DIVIDER_KEYS)[number]))
  ) {
    throw new Error('Web Book typography snapshot の headingDividerLevels は h1〜h6 の完全な 6 key で指定してください')
  }
  const out: WebBookHeadingDividerLevels = {
    h1: false,
    h2: false,
    h3: false,
    h4: false,
    h5: false,
    h6: false,
  }
  for (const key of DIVIDER_KEYS) {
    if (typeof value[key] !== 'boolean') {
      throw new Error(`Web Book typography snapshot の headingDividerLevels.${key} は boolean で指定してください`)
    }
    out[key] = value[key] as boolean
  }
  return out
}

/**
 * 明示的に渡された typography input を厳格に検証・正規化する。
 * 欠損、余分な key、任意 CSS / font family 文字列を静かな preset fallback にしない。
 */
export function normalizeWebBookTypographySnapshot(input: unknown): WebBookTypographySnapshot {
  if (!isPlainObject(input)) {
    throw new Error(
      'Web Book typography snapshot は headingFont / headingAlignHorizontal / headingAlignVertical / headingMarginAfter / headingDividerLevels を持つ object で指定してください',
    )
  }

  const keys = Object.keys(input)
  if (
    keys.length !== TYPOGRAPHY_KEYS.length ||
    keys.some((key) => !TYPOGRAPHY_KEYS.includes(key as (typeof TYPOGRAPHY_KEYS)[number]))
  ) {
    throw new Error(
      'Web Book typography snapshot には headingFont / headingAlignHorizontal / headingAlignVertical / headingMarginAfter / headingDividerLevels 以外を指定できません',
    )
  }

  return Object.freeze({
    headingFont: normalizeHeadingFontStrict(input.headingFont),
    headingAlignHorizontal: normalizeHeadingAlignStrict(input.headingAlignHorizontal, 'headingAlignHorizontal'),
    headingAlignVertical: normalizeHeadingAlignStrict(input.headingAlignVertical, 'headingAlignVertical'),
    headingMarginAfter: normalizeWebBookHeadingMarginAfter(input.headingMarginAfter),
    headingDividerLevels: Object.freeze(normalizeDividerLevelsStrict(input.headingDividerLevels)),
  })
}

/**
 * Display Settings / docHeadingFont から export-time snapshot を組み立てる。
 * custom heading font と不明値は安全側で same-as-body へ正規化する。
 * align / margin / divider の不正値は Display 既定へフォールバックする。
 */
export function resolveWebBookTypographySnapshotFromDisplay(input: {
  docHeadingFont?: unknown
  displaySettings?: {
    headingAlignHorizontal?: unknown
    headingAlignVertical?: unknown
    headingMarginAfter?: unknown
    headingDividerLevels?: unknown
  }
}): WebBookTypographySnapshot {
  const headingFont = resolveHeadingFontFromDisplay(input.docHeadingFont)
  const settings = input.displaySettings ?? {}

  const headingAlignHorizontal = resolveAlignFromDisplay(
    settings.headingAlignHorizontal,
    DEFAULT_WEB_BOOK_TYPOGRAPHY_SNAPSHOT.headingAlignHorizontal,
  )
  const headingAlignVertical = resolveAlignFromDisplay(
    settings.headingAlignVertical,
    DEFAULT_WEB_BOOK_TYPOGRAPHY_SNAPSHOT.headingAlignVertical,
  )
  const headingMarginAfter = resolveMarginFromDisplay(settings.headingMarginAfter)
  const headingDividerLevels = resolveDividerLevelsFromDisplay(settings.headingDividerLevels)

  return normalizeWebBookTypographySnapshot({
    headingFont,
    headingAlignHorizontal,
    headingAlignVertical,
    headingMarginAfter,
    headingDividerLevels,
  })
}

function resolveHeadingFontFromDisplay(value: unknown): WebBookHeadingFont {
  if (value === 'same-as-body' || value === 'mincho' || value === 'gothic') return value
  // custom:* および不明値は Web 上で明朝/ゴシックへ確定できないため same-as-body。
  return 'same-as-body'
}

function resolveAlignFromDisplay(value: unknown, fallback: WebBookHeadingAlign): WebBookHeadingAlign {
  if (typeof value === 'string' && HEADING_ALIGNS.has(value as WebBookHeadingAlign)) {
    return value as WebBookHeadingAlign
  }
  return fallback
}

function resolveMarginFromDisplay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return WEB_BOOK_HEADING_MARGIN_AFTER_DEFAULT
  }
  const rounded = Math.round(value * 100) / 100
  return Math.min(
    WEB_BOOK_HEADING_MARGIN_AFTER_MAX,
    Math.max(WEB_BOOK_HEADING_MARGIN_AFTER_MIN, rounded),
  )
}

function resolveDividerLevelsFromDisplay(value: unknown): WebBookHeadingDividerLevels {
  if (!isPlainObject(value)) {
    return { ...DEFAULT_WEB_BOOK_HEADING_DIVIDER_LEVELS }
  }
  const out: WebBookHeadingDividerLevels = { ...DEFAULT_WEB_BOOK_HEADING_DIVIDER_LEVELS }
  for (const key of DIVIDER_KEYS) {
    if (typeof value[key] === 'boolean') out[key] = value[key] as boolean
  }
  return out
}

/** 正規化済み snapshot から body へ埋め込む CSS custom property 宣言を作る。 */
export function buildWebBookTypographyCssVariables(snapshot: WebBookTypographySnapshot): string {
  const d = snapshot.headingDividerLevels
  return [
    `--wb-heading-margin-after: ${snapshot.headingMarginAfter}em`,
    `--wb-heading-align-h: ${snapshot.headingAlignHorizontal}`,
    `--wb-heading-align-v: ${snapshot.headingAlignVertical}`,
    `--wb-heading-divider-h1: ${d.h1 ? '1' : '0'}`,
    `--wb-heading-divider-h2: ${d.h2 ? '1' : '0'}`,
    `--wb-heading-divider-h3: ${d.h3 ? '1' : '0'}`,
    `--wb-heading-divider-h4: ${d.h4 ? '1' : '0'}`,
    `--wb-heading-divider-h5: ${d.h5 ? '1' : '0'}`,
    `--wb-heading-divider-h6: ${d.h6 ? '1' : '0'}`,
  ].join('; ')
}
