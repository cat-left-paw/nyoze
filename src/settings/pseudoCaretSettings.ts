import {
  DEFAULT_PSEUDO_CARET_BLINK_ENABLED,
  DEFAULT_PSEUDO_CARET_ENABLED,
  DEFAULT_PSEUDO_CARET_THICKNESS,
  PSEUDO_CARET_THICKNESS_MAX,
  PSEUDO_CARET_THICKNESS_MIN,
  PSEUDO_CARET_THICKNESS_STEP,
} from './defaults'

export function normalizePseudoCaretEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PSEUDO_CARET_ENABLED
}

export function normalizePseudoCaretBlinkEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_PSEUDO_CARET_BLINK_ENABLED
}

/**
 * 擬似キャレット (Task 2-4): 太さを安全値へ正規化する。
 * - 非数値 / 非有限値は既定値へ fallback
 * - 0.5px 刻みへ丸め
 * - 1〜8px へ clamp
 */
export function normalizePseudoCaretThickness(value: unknown): number {
  // Accept real numbers and finite numeric strings only; everything else (null / objects /
  // non-numeric strings) falls back to the default rather than coercing to 0.
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN
  if (!Number.isFinite(n)) {
    return DEFAULT_PSEUDO_CARET_THICKNESS
  }
  const stepped = Math.round(n / PSEUDO_CARET_THICKNESS_STEP) * PSEUDO_CARET_THICKNESS_STEP
  const clamped = Math.min(
    PSEUDO_CARET_THICKNESS_MAX,
    Math.max(PSEUDO_CARET_THICKNESS_MIN, stepped),
  )
  // 0.5 刻み丸めで生じ得る浮動小数誤差を 0.5 単位の綺麗な値へ戻す。
  return Math.round(clamped * 2) / 2
}
