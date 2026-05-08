/** App-wide Visual Focus block highlight (WYSIWYG decoration only; not Typewriter scroll). */

export const DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED = false

export function normalizeVisualFocusBlockHighlightEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED
}

/** Visual Focus Phase 2: dim non-focused textblocks (WYSIWYG decoration only; not Typewriter scroll). */

export const DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED = false

export function normalizeVisualFocusDimNonFocusedBlocksEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED
}

/** Visual Focus Phase 5: current visual line highlight (WYSIWYG overlay only). */

export const DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED = false

export function normalizeVisualFocusCurrentLineHighlightEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED
}
