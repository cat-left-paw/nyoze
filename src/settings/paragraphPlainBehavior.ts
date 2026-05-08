/**
 * App-wide Paragraph Plain layout / responsiveness (settings.json).
 * Not stored in frontmatter; does not affect saved Markdown.
 *
 * Formal mapping (debug localStorage overrides are applied on top in renderer):
 * - `fast`: scroll reposition off, reserved block size off
 * - `comfortable`: scroll reposition off, reserved block size on
 */

export type ParagraphPlainBehavior = 'fast' | 'comfortable'

export const DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR: ParagraphPlainBehavior = 'fast'

/**
 * Legacy `settings.json` value from a pre-release comparison experiment.
 * Read-only compat: normalize maps this to `comfortable`. Do not write as new saves.
 */
export const LEGACY_PARAGRAPH_PLAIN_COMFORTABLE_NO_SCROLL =
  'comfortable-no-scroll-reposition' as const

const VALID: ReadonlySet<string> = new Set(['fast', 'comfortable'])

export function normalizeParagraphPlainBehavior(
  value: unknown,
): ParagraphPlainBehavior {
  if (typeof value === 'string') {
    if (value === LEGACY_PARAGRAPH_PLAIN_COMFORTABLE_NO_SCROLL) return 'comfortable'
    if (VALID.has(value)) return value as ParagraphPlainBehavior
  }
  return DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR
}
