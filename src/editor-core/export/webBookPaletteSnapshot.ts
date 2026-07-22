/**
 * Web Book Author / Original 用の純粋な配色 snapshot。
 * Display Settings や Page Viewer の型を持ち込まず、HTML へ埋め込める
 * 6 桁 hex だけを export 境界で受理する。
 */
export type WebBookPaletteSnapshotInput = {
  pageColor: string
  textColor: string
  headingColor: string
}

export type WebBookPaletteSnapshot = Readonly<WebBookPaletteSnapshotInput>

export type WebBookDerivedPalette = Readonly<{
  background: string
  foreground: string
  heading: string
  muted: string
  canvas: string
  chromeBackground: string
  chromeBorder: string
  chromeForeground: string
  outlineBackground: string
  outlineShadow: string
  accent: string
}>

const PALETTE_KEYS = ['pageColor', 'textColor', 'headingColor'] as const
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function normalizeHex(value: unknown, key: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new Error(`Web Book palette snapshot の ${key} は #rrggbb 形式で指定してください`)
  }
  return value.toLowerCase()
}

/**
 * 明示的に渡された palette input を厳格に検証・正規化する。
 * 欠損、余分な key、任意 CSS 文字列を静かな preset fallback にしない。
 */
export function normalizeWebBookPaletteSnapshot(input: unknown): WebBookPaletteSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Web Book palette snapshot は pageColor / textColor / headingColor を持つ object で指定してください')
  }

  const record = input as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== PALETTE_KEYS.length || keys.some((key) => !PALETTE_KEYS.includes(key as typeof PALETTE_KEYS[number]))) {
    throw new Error('Web Book palette snapshot には pageColor / textColor / headingColor 以外を指定できません')
  }

  return Object.freeze({
    pageColor: normalizeHex(record.pageColor, 'pageColor'),
    textColor: normalizeHex(record.textColor, 'textColor'),
    headingColor: normalizeHex(record.headingColor, 'headingColor'),
  })
}

function hexToRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function toHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
}

/** source を ratio 分だけ target へ寄せる（0 = source、1 = target）。 */
function mixHex(source: string, target: string, ratio: number): string {
  const from = hexToRgb(source)
  const to = hexToRgb(target)
  return `#${toHex(from[0] + (to[0] - from[0]) * ratio)}${toHex(from[1] + (to[1] - from[1]) * ratio)}${toHex(from[2] + (to[2] - from[2]) * ratio)}`
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * 3 色 snapshot から Web Book 固有の semantic token を決定的に導出する。
 * 任意 CSS を評価せず、戻り値も #rrggbb / 固定 rgba だけで構成する。
 */
export function deriveWebBookPalette(snapshot: WebBookPaletteSnapshot): WebBookDerivedPalette {
  const shadow = luminance(snapshot.pageColor) < 0.45 ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.28)'
  return Object.freeze({
    background: snapshot.pageColor,
    foreground: snapshot.textColor,
    heading: snapshot.headingColor,
    muted: mixHex(snapshot.textColor, snapshot.pageColor, 0.42),
    canvas: mixHex(snapshot.pageColor, snapshot.textColor, 0.08),
    chromeBackground: mixHex(snapshot.pageColor, snapshot.textColor, 0.045),
    chromeBorder: mixHex(snapshot.pageColor, snapshot.textColor, 0.2),
    chromeForeground: snapshot.textColor,
    outlineBackground: mixHex(snapshot.pageColor, snapshot.textColor, 0.025),
    outlineShadow: shadow,
    accent: snapshot.headingColor,
  })
}

/** 正規化済み palette だけから Author theme 用 CSS custom property を生成する。 */
export function buildWebBookAuthorPaletteCss(snapshot: WebBookPaletteSnapshot): string {
  const palette = deriveWebBookPalette(snapshot)
  return [
    '/* Author / Original palette snapshot: export 開始時点の document colors。 */',
    'body.nyoze-web-book-root[data-wb-theme="author"][data-wb-author-palette="true"] {',
    `  --wb-bg: ${palette.background};`,
    `  --wb-fg: ${palette.foreground};`,
    `  --wb-heading: ${palette.heading};`,
    `  --wb-muted: ${palette.muted};`,
    `  --wb-canvas: ${palette.canvas};`,
    `  --wb-chrome-bg: ${palette.chromeBackground};`,
    `  --wb-chrome-border: ${palette.chromeBorder};`,
    `  --wb-chrome-fg: ${palette.chromeForeground};`,
    `  --wb-outline-bg: ${palette.outlineBackground};`,
    `  --wb-outline-shadow: ${palette.outlineShadow};`,
    `  --wb-accent: ${palette.accent};`,
    '}',
  ].join('\n')
}
