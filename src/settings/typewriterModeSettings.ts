/** App-wide Typewriter scroll settings (not persisted to frontmatter). */

export const DEFAULT_TYPEWRITER_MODE_ENABLED = false

export const DEFAULT_TYPEWRITER_OFFSET_RATIO = 0

export const DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO = 0.16

export const TYPEWRITER_OFFSET_RATIO_MIN = -0.4

export const TYPEWRITER_OFFSET_RATIO_MAX = 0.4

export const TYPEWRITER_FOLLOW_BAND_RATIO_MIN = 0.05

export const TYPEWRITER_FOLLOW_BAND_RATIO_MAX = 0.25

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function normalizeTypewriterModeEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_TYPEWRITER_MODE_ENABLED
}

export function normalizeTypewriterOffsetRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TYPEWRITER_OFFSET_RATIO
  }
  return clamp(value, TYPEWRITER_OFFSET_RATIO_MIN, TYPEWRITER_OFFSET_RATIO_MAX)
}

export function normalizeTypewriterFollowBandRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO
  }
  return clamp(value, TYPEWRITER_FOLLOW_BAND_RATIO_MIN, TYPEWRITER_FOLLOW_BAND_RATIO_MAX)
}
