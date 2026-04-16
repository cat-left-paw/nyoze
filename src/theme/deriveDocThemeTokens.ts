import type { DocThemePreset } from '../settings/types'

/**
 * Phase5-H Slice1: Derive doc-area CSS variable tokens from a preset's main colors.
 *
 * The editor panel (`.editor-panel`) already accepts inline styles for
 * `--bg-surface`, `--text-primary`, `--text-heading` via Workspace.tsx.
 * This function produces those variables (and derived secondary/muted variants)
 * so that ThemeStudioModal can preview the computed palette before saving.
 */
export function deriveDocThemeTokens(
  colors: DocThemePreset['colors'],
): Record<string, string> {
  const { pageColor, textColor, headingColor } = colors
  return {
    '--bg-surface': pageColor,
    '--text-primary': textColor,
    '--text-heading': headingColor,
    '--text-secondary': `color-mix(in srgb, ${textColor} 78%, ${pageColor} 22%)`,
    '--text-muted': `color-mix(in srgb, ${textColor} 58%, ${pageColor} 42%)`,
    '--accent-link': `color-mix(in srgb, ${headingColor} 72%, ${textColor} 28%)`,
    '--ruby-text': `color-mix(in srgb, ${textColor} 62%, ${pageColor} 38%)`,
    '--highlight-bg': `color-mix(in srgb, ${headingColor} 22%, ${pageColor} 78%)`,
    '--blockquote-bg': `color-mix(in srgb, ${pageColor} 84%, ${textColor} 16%)`,
    '--blockquote-rule': `color-mix(in srgb, ${headingColor} 34%, ${pageColor} 66%)`,
    '--blockquote-text': `color-mix(in srgb, ${textColor} 82%, ${pageColor} 18%)`,
    '--code-inline-bg': `color-mix(in srgb, ${pageColor} 78%, ${textColor} 22%)`,
    '--code-inline-border': `color-mix(in srgb, ${textColor} 34%, ${pageColor} 66%)`,
    '--code-block-bg': `color-mix(in srgb, ${pageColor} 74%, ${textColor} 26%)`,
    '--code-block-border': `color-mix(in srgb, ${headingColor} 28%, ${pageColor} 72%)`,
  }
}
