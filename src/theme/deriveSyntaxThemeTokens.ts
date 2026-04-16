/**
 * Derive syntax highlighting CSS variable tokens from document colors.
 *
 * Computes `--syntax-*` tokens based on the effective code-block background
 * luminance (derived from pageColor / textColor, matching deriveDocThemeTokens).
 * Automatically selects a light or dark palette so that syntax tokens remain
 * readable regardless of custom document theme colors.
 */

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Parse a hex color string (#RGB, #RRGGBB, #RRGGBBAA) into [r, g, b] 0-255. */
function parseHex(hex: string): [number, number, number] | null {
  const h = hex.replace(/^#/, '')
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  if (h.length === 6 || h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
    return [r, g, b]
  }
  return null
}

/**
 * Mix two RGB colors in sRGB space (same as CSS `color-mix(in srgb, ...)`).
 * `ratio` is the weight of `a` (0–1), so `1 - ratio` is the weight of `b`.
 */
function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  ratio: number,
): [number, number, number] {
  return [
    Math.round(a[0] * ratio + b[0] * (1 - ratio)),
    Math.round(a[1] * ratio + b[1] * (1 - ratio)),
    Math.round(a[2] * ratio + b[2] * (1 - ratio)),
  ]
}

/**
 * Relative luminance (WCAG 2.x formula).
 * Returns 0 (black) to 1 (white).
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/** Dark background palette — close to One Dark. */
const DARK_PALETTE = {
  '--syntax-keyword': '#c678dd',
  '--syntax-string': '#98c379',
  '--syntax-number': '#d19a66',
  '--syntax-comment': '#7f848e',
  '--syntax-function': '#61afef',
  '--syntax-attr': '#d19a66',
  '--syntax-variable': '#e06c75',
  '--syntax-deletion': '#e06c75',
  '--syntax-meta': '#61afef',
  '--syntax-tag': '#e06c75',
}

/** Light background palette — higher contrast, readable on white/cream. */
const LIGHT_PALETTE = {
  '--syntax-keyword': '#a626a4',
  '--syntax-string': '#50a14f',
  '--syntax-number': '#986801',
  '--syntax-comment': '#a0a1a7',
  '--syntax-function': '#4078f2',
  '--syntax-attr': '#986801',
  '--syntax-variable': '#e45649',
  '--syntax-deletion': '#e45649',
  '--syntax-meta': '#4078f2',
  '--syntax-tag': '#e45649',
}

/** Safe fallback — used when colors cannot be parsed. Matches dark palette. */
const FALLBACK_PALETTE = DARK_PALETTE

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

/**
 * Luminance threshold to distinguish light vs dark background.
 * 0.35 is chosen empirically: typical paper-white pages are ~0.9+, typical
 * dark themes are <0.1. Soft-neutral themes around #e8e0d0 are ~0.7.
 */
const LIGHT_DARK_THRESHOLD = 0.35

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SyntaxPaletteInput = {
  pageColor: string
  textColor: string
}

/**
 * Determine if a code-block background (derived the same way as
 * `deriveDocThemeTokens`) is considered "light".
 *
 * Exported for testing.
 */
export function isCodeBlockBgLight(pageColor: string, textColor: string): boolean | null {
  const page = parseHex(pageColor)
  const text = parseHex(textColor)
  if (!page || !text) return null
  // code-block-bg = pageColor 74% + textColor 26%  (same as deriveDocThemeTokens)
  const bg = mixRgb(page, text, 0.74)
  return relativeLuminance(...bg) >= LIGHT_DARK_THRESHOLD
}

/**
 * Derive `--syntax-*` CSS variable tokens from document colors.
 *
 * Returns a Record suitable for spreading into a React `style` prop.
 */
export function deriveSyntaxThemeTokens(
  input: SyntaxPaletteInput,
): Record<string, string> {
  const isLight = isCodeBlockBgLight(input.pageColor, input.textColor)
  if (isLight === null) return { ...FALLBACK_PALETTE }
  return { ...(isLight ? LIGHT_PALETTE : DARK_PALETTE) }
}
