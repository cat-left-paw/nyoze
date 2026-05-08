export type TypewriterWritingMode = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr'
export type TypewriterScrollAxis = 'x' | 'y'

export type AxisRect = {
  left: number
  top: number
  width: number
  height: number
}

export type TypewriterFollowBand = {
  start: number
  end: number
  target: number
  bandWidth: number
}

export type TypewriterScrollPlan = {
  axis: TypewriterScrollAxis
  target: number
  bandStart: number
  bandEnd: number
  caret: number
  scrollDelta: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidRect(rect: AxisRect | null | undefined): rect is AxisRect {
  if (!rect) return false
  return (
    isFiniteNumber(rect.left) &&
    isFiniteNumber(rect.top) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  )
}

function resolveViewportExtent(
  viewportRect: AxisRect,
  axis: TypewriterScrollAxis,
): number {
  return axis === 'y' ? viewportRect.height : viewportRect.width
}

function resolveTypewriterDirection(writingMode: TypewriterWritingMode): -1 | 1 {
  if (writingMode === 'vertical-rl') return -1
  return 1
}

export function resolveTypewriterScrollAxis(
  writingMode: TypewriterWritingMode,
): TypewriterScrollAxis {
  return writingMode === 'horizontal-tb' ? 'y' : 'x'
}

export function resolveTypewriterTarget(
  viewportExtent: number,
  writingMode: TypewriterWritingMode,
  offsetRatio: number,
): number | null {
  if (!isFiniteNumber(viewportExtent) || viewportExtent <= 0) return null
  if (!isFiniteNumber(offsetRatio)) return null
  return (
    viewportExtent / 2 +
    viewportExtent * offsetRatio * resolveTypewriterDirection(writingMode)
  )
}

export function resolveTypewriterFollowBand(
  viewportExtent: number,
  target: number,
  followBandRatio: number,
): TypewriterFollowBand | null {
  if (!isFiniteNumber(viewportExtent) || viewportExtent <= 0) return null
  if (!isFiniteNumber(target)) return null
  if (!isFiniteNumber(followBandRatio) || followBandRatio < 0) return null

  const bandWidth = viewportExtent * followBandRatio
  return {
    start: target - bandWidth / 2,
    end: target + bandWidth / 2,
    target,
    bandWidth,
  }
}

export function resolveTypewriterCaretMainAxisPosition(
  viewportRect: AxisRect,
  caretRect: AxisRect,
  writingMode: TypewriterWritingMode,
): number | null {
  if (!isValidRect(viewportRect) || !isValidRect(caretRect)) return null

  if (writingMode === 'horizontal-tb') {
    return caretRect.top + caretRect.height / 2 - viewportRect.top
  }

  return caretRect.left + caretRect.width / 2 - viewportRect.left
}

export function resolveTypewriterScrollPlan(options: {
  viewportRect: AxisRect
  caretRect: AxisRect
  writingMode: TypewriterWritingMode
  offsetRatio: number
  followBandRatio: number
}): TypewriterScrollPlan | null {
  const { viewportRect, caretRect, writingMode, offsetRatio, followBandRatio } = options
  if (!isValidRect(viewportRect) || !isValidRect(caretRect)) return null

  const axis = resolveTypewriterScrollAxis(writingMode)
  const viewportExtent = resolveViewportExtent(viewportRect, axis)
  if (viewportExtent <= 0) return null

  const caret = resolveTypewriterCaretMainAxisPosition(
    viewportRect,
    caretRect,
    writingMode,
  )
  if (caret === null) return null

  const target = resolveTypewriterTarget(viewportExtent, writingMode, offsetRatio)
  if (target === null) return null

  const band = resolveTypewriterFollowBand(viewportExtent, target, followBandRatio)
  if (!band) return null

  let scrollDelta = 0
  if (caret < band.start) {
    scrollDelta = caret - band.start
  } else if (caret > band.end) {
    scrollDelta = caret - band.end
  }

  return {
    axis,
    target: band.target,
    bandStart: band.start,
    bandEnd: band.end,
    caret,
    scrollDelta,
  }
}
