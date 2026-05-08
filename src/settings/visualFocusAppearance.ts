/**
 * Visual Focus appearance (settings.json): highlight color/opacity and dim opacity.
 * Independent from Typewriter scroll; not stored in frontmatter.
 */

export const DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR = '#d9c27a'

export const DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY = 0.18

export const DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY = 0.45

export const DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR = '#1e90ff'

export const DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY = 0.28

/** Strict subset: `#rgb` or `#rrggbb` (case-insensitive). */
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

function clampOpacity(value: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(1, Math.max(0, value))
}

export function normalizeVisualFocusBlockHighlightColor(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR
  }
  const t = value.trim()
  if (!t || !HEX_COLOR_RE.test(t)) {
    return DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR
  }
  return t.toLowerCase()
}

export function normalizeVisualFocusBlockHighlightOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return clampOpacity(n, DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY)
}

export function normalizeVisualFocusDimNonFocusedBlocksOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return clampOpacity(n, DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY)
}

export function normalizeVisualFocusCurrentLineHighlightColor(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR
  }
  const t = value.trim()
  if (!t || !HEX_COLOR_RE.test(t)) {
    return DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR
  }
  return t.toLowerCase()
}

export function normalizeVisualFocusCurrentLineHighlightOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return clampOpacity(n, DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY)
}

export type Rgb = { r: number; g: number; b: number }

/** Parses `#rgb` / `#rrggbb` after normalization. Returns null if invalid. */
export function parseHexColorRgb(hex: string): Rgb | null {
  if (!HEX_COLOR_RE.test(hex.trim())) {
    return null
  }
  let h = hex.trim().slice(1).toLowerCase()
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const n = parseInt(h, 16)
  if (!Number.isFinite(n)) {
    return null
  }
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  }
}

/** Expands `#rgb` to `#rrggbb` for `<input type="color">`. */
export function expandHexForColorInput(hex: string): string {
  const rgb = parseHexColorRgb(hex)
  if (!rgb) {
    return expandHexForColorInput(DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR)
  }
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/** Expands current-line `#rgb` to `#rrggbb` for `<input type="color">`. */
export function expandHexForCurrentLineColorInput(hex: string): string {
  const rgb = parseHexColorRgb(normalizeVisualFocusCurrentLineHighlightColor(hex))
  if (!rgb) {
    return expandHexForCurrentLineColorInput(DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR)
  }
  const toHex = (x: number) => x.toString(16).padStart(2, '0')
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

/**
 * Final background for `.nyoze-visual-focus-active-block` (color × opacity).
 */
export function buildVisualFocusHighlightBackgroundCss(
  colorHex: string,
  opacity: number,
): string {
  const rgb = parseHexColorRgb(normalizeVisualFocusBlockHighlightColor(colorHex))
  const a = clampOpacity(opacity, DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY)
  if (!rgb) {
    return `rgba(217, 194, 122, ${a})`
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
}

/** Final background for current-line overlay (color × opacity). */
export function buildVisualFocusCurrentLineBackgroundCss(
  colorHex: string,
  opacity: number,
): string {
  const rgb = parseHexColorRgb(normalizeVisualFocusCurrentLineHighlightColor(colorHex))
  const a = clampOpacity(opacity, DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY)
  if (!rgb) {
    return `rgba(30, 144, 255, ${a})`
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`
}
