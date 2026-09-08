/**
 * 局所 overlay が host に確保する block reservation の中立な計算。
 * runtime の DOM read / cache は持たない。
 */
const MIN_STEP_PX = 1
const FALLBACK_FONT_PX = 16
const FALLBACK_LINE_HEIGHT_RATIO = 1.2
const MIN_CSS_STEP_PX = 4
const MAX_CSS_STEP_PX = 512

function finiteNonNegative(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function clampCssStep(px: number): number {
  if (!Number.isFinite(px)) return FALLBACK_FONT_PX
  return Math.min(MAX_CSS_STEP_PX, Math.max(MIN_CSS_STEP_PX, Math.round(px)))
}

/** Start時に取得済みのstyle文字列をpxへ正規化する共有pure primitive。 */
export function parseCssFontSizeToPx(value: string | undefined, fallbackPx: number): number {
  if (!value || typeof value !== 'string') return fallbackPx
  const v = value.trim().toLowerCase()
  const n = Number.parseFloat(v.endsWith('px') ? v.slice(0, -2) : v)
  return Number.isFinite(n) && n > 0 ? n : fallbackPx
}

/** `normal` / unitless / pxのline-heightをcolumn/line stepへ正規化する。 */
export function parseCssLineHeightToPx(lineHeight: string | undefined, fontSizePx: number): number {
  if (!lineHeight || typeof lineHeight !== 'string') {
    return clampCssStep(fontSizePx * FALLBACK_LINE_HEIGHT_RATIO)
  }
  const v = lineHeight.trim().toLowerCase()
  if (v === 'normal') return clampCssStep(fontSizePx * FALLBACK_LINE_HEIGHT_RATIO)
  if (v.endsWith('px')) {
    const n = Number.parseFloat(v.slice(0, -2))
    return clampCssStep(Number.isFinite(n) && n > 0 ? n : fontSizePx * FALLBACK_LINE_HEIGHT_RATIO)
  }
  const unitless = Number.parseFloat(v)
  if (Number.isFinite(unitless) && unitless > 0) {
    return clampCssStep(unitless < 32 && !v.includes('%') ? fontSizePx * unitless : unitless)
  }
  return clampCssStep(fontSizePx * FALLBACK_LINE_HEIGHT_RATIO)
}

export function resolveOverlayReservedBlockAxis(writingMode: string): 'width' | 'height' | null {
  if (writingMode === 'vertical-rl') return 'width'
  if (writingMode === 'horizontal-tb') return 'height'
  return null
}

export function resolveOverlayReservedEpsilonPx(stepPx: number): number | null {
  if (!Number.isFinite(stepPx) || stepPx <= 0) return null
  return Math.min(6, Math.max(3, Math.round(stepPx * 0.12)))
}

export function computeOverlayReservedIdealPx(params: {
  basePx: number
  overlayScrollPx: number
  paddingPx?: number
}): number | null {
  const basePx = finiteNonNegative(params.basePx)
  const scrollPx = finiteNonNegative(params.overlayScrollPx)
  const paddingPx = finiteNonNegative(params.paddingPx ?? 0)
  if (basePx === null || scrollPx === null || paddingPx === null) return null
  return Math.max(basePx, scrollPx + paddingPx)
}

export function computeOverlayReservedHostTargetPx(params: {
  idealPx: number
  basePx: number
  stepPx: number
  epsilonPx?: number
}): number | null {
  const idealPx = finiteNonNegative(params.idealPx)
  const basePx = finiteNonNegative(params.basePx)
  if (idealPx === null || basePx === null || !Number.isFinite(params.stepPx) || params.stepPx <= 0) {
    return null
  }
  const stepPx = Math.max(MIN_STEP_PX, params.stepPx)
  const epsilonPx = params.epsilonPx ?? resolveOverlayReservedEpsilonPx(stepPx)
  if (epsilonPx === null || !Number.isFinite(epsilonPx) || epsilonPx < 0) return null
  const overflow = Math.max(0, idealPx - basePx)
  if (overflow <= epsilonPx) return basePx
  return basePx + Math.ceil((overflow - epsilonPx) / stepPx) * stepPx
}

export function shouldWriteOverlayReservedBlockTarget(
  previousPx: number | null,
  nextPx: number | null,
): boolean {
  return nextPx !== null && previousPx !== nextPx
}
