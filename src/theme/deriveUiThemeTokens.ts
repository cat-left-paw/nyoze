import type { UiThemePreset } from '../settings/types'

export const UI_THEME_TOKEN_KEYS = [
  '--bg-topbar',
  '--bg-panel',
  '--bg-surface',
  '--bg-dialog',
  '--bg-input',
  '--bg-button',
  '--bg-button-hover',
  '--bg-pane',
  '--border-main',
  '--border-light',
  '--border-input',
  '--border-divider',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-heading',
  '--accent',
  '--pane-divider-track',
  '--pane-divider-track-hover',
  '--pane-divider-track-active',
  '--scrollbar-track',
  '--scrollbar-thumb',
  '--scrollbar-thumb-hover',
  '--scrollbar-corner',
  '--slider-track',
  '--slider-thumb',
  '--slider-thumb-hover',
] as const

/**
 * Phase5-H Slice1: Derive UI CSS variable tokens from a preset's main colors.
 *
 * Returns a map of CSS variable names → values.
 * These are applied as inline styles on `document.documentElement` to override
 * the `[data-theme]` CSS rules when a preset customizes the palette.
 *
 * Token derivation uses `color-mix(in srgb, ...)` to produce secondary/muted/
 * button/border variants from the 6 main colors, matching the pattern already
 * used for the `--text-*` overrides in useAppUiState.
 */
export function deriveUiThemeTokens(
  colors: UiThemePreset['colors'],
): Record<string, string> {
  const {
    baseBg,
    surfaceBg,
    textPrimary,
    paneBg,
    accent,
    border,
    paneBorder,
    scrollbarBase,
  } = colors
  return {
    // Backgrounds
    '--bg-topbar': paneBorder,
    '--bg-panel': baseBg,
    '--bg-surface': surfaceBg,
    '--bg-dialog': surfaceBg,
    '--bg-input': surfaceBg,
    '--bg-button': `color-mix(in srgb, ${baseBg} 82%, ${textPrimary} 18%)`,
    '--bg-button-hover': `color-mix(in srgb, ${baseBg} 70%, ${textPrimary} 30%)`,
    '--bg-pane': paneBg ?? `color-mix(in srgb, ${baseBg} 92%, ${textPrimary} 8%)`,
    // Borders
    '--border-main': border,
    '--border-light': `color-mix(in srgb, ${border} 55%, ${surfaceBg} 45%)`,
    '--border-input': border,
    '--border-divider': paneBorder,
    // Text
    '--text-primary': textPrimary,
    '--text-secondary': `color-mix(in srgb, ${textPrimary} 78%, ${baseBg} 22%)`,
    '--text-muted': `color-mix(in srgb, ${textPrimary} 58%, ${baseBg} 42%)`,
    '--text-heading': textPrimary,
    // Accent
    '--accent': accent,
    '--pane-divider-track': paneBorder,
    '--pane-divider-track-hover': `color-mix(in srgb, ${paneBorder} 70%, ${accent} 30%)`,
    '--pane-divider-track-active': `color-mix(in srgb, ${paneBorder} 56%, ${accent} 44%)`,
    // Scrollbar
    '--scrollbar-track': `color-mix(in srgb, ${baseBg} 80%, ${border} 20%)`,
    '--scrollbar-thumb': scrollbarBase,
    '--scrollbar-thumb-hover': `color-mix(in srgb, ${scrollbarBase} 80%, ${textPrimary} 20%)`,
    '--scrollbar-corner': `color-mix(in srgb, ${baseBg} 80%, ${border} 20%)`,
    // Slider (range input) — thumb uses accent directly; track blends textPrimary
    // into baseBg so the rail is always visible even when `border` sits close to
    // `baseBg` on pale palettes (previously the track collapsed to near-invisible).
    '--slider-track': `color-mix(in srgb, ${textPrimary} 28%, ${baseBg} 72%)`,
    '--slider-thumb': accent,
    '--slider-thumb-hover': `color-mix(in srgb, ${accent} 80%, ${textPrimary} 20%)`,
  }
}
