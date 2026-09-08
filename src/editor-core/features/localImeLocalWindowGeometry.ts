import { computeOverlayReservedHostTargetPx } from './overlayReservedBlockLayout'
import type { WritingModePhysicalAxis } from './writingModeNavigationMapping'

export type LocalImeLocalWindowMeasuredRect = {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/** current top-level rect unionだけからlogical block extentを読むpure helper。 */
export function measureLocalImeLocalWindowBlockRectUnion(
  rects: readonly LocalImeLocalWindowMeasuredRect[],
  blockAxis: WritingModePhysicalAxis,
): number | null {
  if (
    rects.length === 0 ||
    rects.some((rect) =>
      !Number.isFinite(rect.left) || !Number.isFinite(rect.right) ||
      !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom) ||
      rect.right <= rect.left || rect.bottom <= rect.top)
  ) return null
  const extent = blockAxis === 'x'
    ? Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left))
    : Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top))
  return Number.isFinite(extent) && extent > 0 ? extent : null
}

/** source占有を残すP0専用。返値は追加deltaであり、base+localExtentではない。 */
export function computeLocalImeLocalWindowGrowthDelta(input: {
  basePx: number
  localExtentPx: number
  stepPx: number
}): number | null {
  if (
    !Number.isFinite(input.basePx) || input.basePx < 0 ||
    !Number.isFinite(input.localExtentPx) || input.localExtentPx < 0
  ) return null
  if (input.localExtentPx <= input.basePx) return 0
  const target = computeOverlayReservedHostTargetPx({
    idealPx: input.localExtentPx,
    basePx: input.basePx,
    stepPx: input.stepPx,
  })
  return target === null ? null : Math.max(0, target - input.basePx)
}
