/**
 * Pure helpers for the pseudo caret overlay (Task 2-2 MVP).
 *
 * The pseudo caret is **display only**. These helpers turn a viewport caret rect (from
 * `view.coordsAtPos(selection.head)`) into a `.editor-surface`-relative shape, picking a thin line
 * whose long axis matches the writing mode. No ProseMirror state / DOM selection is touched here.
 *
 * Kept intentionally separate from `visualFocusCurrentLineGeometry` — the current-line overlay
 * computes a full "line band" with adjacent-glyph heuristics; the pseudo caret only needs the
 * collapsed caret position. We may borrow ideas, but not the band geometry.
 */

/** Viewport caret rect as returned by `EditorView.coordsAtPos`. */
export type PseudoCaretCoords = {
  left: number
  top: number
  right: number
  bottom: number
}

/** `.editor-surface` box + scroll offsets, used to convert viewport coords to surface-relative. */
export type PseudoCaretSurfaceMetrics = {
  left: number
  top: number
  scrollLeft: number
  scrollTop: number
}

/** Surface-relative shape applied to the overlay element (absolute positioning). */
export type PseudoCaretShape = {
  left: number
  top: number
  width: number
  height: number
}

/** Coarse caret orientation derived from writing mode. */
export type PseudoCaretOrientation = 'horizontal' | 'vertical'

/** Default caret line thickness (short axis), in CSS px. */
export const PSEUDO_CARET_THICKNESS_PX = 2

/** Minimum caret line length (long axis) so degenerate rects still produce a visible mark. */
export const PSEUDO_CARET_MIN_LENGTH_PX = 8

const MAX_EXTENT = 1_000_000
const DEFAULT_EMPTY_VERTICAL_COLUMN_WIDTH_PX = 20
const MIN_EMPTY_VERTICAL_COLUMN_WIDTH_PX = 12
const MAX_EMPTY_VERTICAL_COLUMN_WIDTH_PX = 96

export function isFinitePseudoCaretCoords(c: PseudoCaretCoords): boolean {
  return (
    Number.isFinite(c.left) &&
    Number.isFinite(c.top) &&
    Number.isFinite(c.right) &&
    Number.isFinite(c.bottom)
  )
}

function isFinitePositiveShape(s: PseudoCaretShape): boolean {
  if (
    !Number.isFinite(s.left) ||
    !Number.isFinite(s.top) ||
    !Number.isFinite(s.width) ||
    !Number.isFinite(s.height)
  ) {
    return false
  }
  if (s.width <= 0 || s.height <= 0) {
    return false
  }
  if (s.width > MAX_EXTENT || s.height > MAX_EXTENT) {
    return false
  }
  return true
}

/**
 * Maps a CSS `writing-mode` (or the UI `data-writing-mode`) string to a coarse caret orientation.
 * Vertical writing (`vertical-rl` / `vertical-lr` / `sideways-*`) → a horizontal caret line;
 * everything else → a vertical caret line.
 */
export function resolvePseudoCaretOrientation(writingMode: string | null | undefined): PseudoCaretOrientation {
  const w = (writingMode ?? '').trim().toLowerCase()
  if (w.includes('vertical') || w.includes('sideways')) {
    return 'vertical'
  }
  return 'horizontal'
}

/**
 * Builds the surface-relative pseudo caret shape from a viewport caret rect.
 *
 * - Horizontal writing → a thin **vertical** line: short axis = `thickness` (X), long axis = caret
 *   height (Y).
 * - Vertical writing → a thin **horizontal** line: short axis = `thickness` (Y), long axis = caret
 *   width (X).
 *
 * Returns `null` for non-finite coords or any degenerate result, so the caller hides the overlay.
 */
export function buildPseudoCaretShape(args: {
  coords: PseudoCaretCoords
  surface: PseudoCaretSurfaceMetrics
  orientation: PseudoCaretOrientation
  thickness?: number
  minLength?: number
}): PseudoCaretShape | null {
  const { coords, surface, orientation } = args
  if (!isFinitePseudoCaretCoords(coords)) {
    return null
  }
  if (
    !Number.isFinite(surface.left) ||
    !Number.isFinite(surface.top) ||
    !Number.isFinite(surface.scrollLeft) ||
    !Number.isFinite(surface.scrollTop)
  ) {
    return null
  }
  const thickness =
    Number.isFinite(args.thickness) && (args.thickness as number) > 0
      ? (args.thickness as number)
      : PSEUDO_CARET_THICKNESS_PX
  const minLength =
    Number.isFinite(args.minLength) && (args.minLength as number) > 0
      ? (args.minLength as number)
      : PSEUDO_CARET_MIN_LENGTH_PX

  // Convert a viewport X/Y to surface-relative content coordinates.
  const toLeft = (viewportX: number) => viewportX - surface.left + surface.scrollLeft
  const toTop = (viewportY: number) => viewportY - surface.top + surface.scrollTop

  let shape: PseudoCaretShape
  if (orientation === 'vertical') {
    const rawLen = coords.right - coords.left
    const length = Number.isFinite(rawLen) && rawLen > 0 ? Math.max(rawLen, minLength) : minLength
    const centerY = (coords.top + coords.bottom) / 2
    shape = {
      left: toLeft(coords.left),
      top: toTop(centerY) - thickness / 2,
      width: length,
      height: thickness,
    }
  } else {
    const rawLen = coords.bottom - coords.top
    const length = Number.isFinite(rawLen) && rawLen > 0 ? Math.max(rawLen, minLength) : minLength
    const centerX = (coords.left + coords.right) / 2
    shape = {
      left: toLeft(centerX) - thickness / 2,
      top: toTop(coords.top),
      width: thickness,
      height: length,
    }
  }

  return isFinitePositiveShape(shape) ? shape : null
}

/** Which side of a vertical soft-wrap boundary the caret should display on. */
export type VerticalWrapAffinity = 'head' | 'end'

/** Viewport pointer point captured on pointerdown (used for click-based wrap disambiguation). */
export type PseudoCaretPointerPoint = { x: number; y: number }

function rectCenter(r: PseudoCaretCoords): PseudoCaretPointerPoint {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }
}

/**
 * Picks whichever of the two wrap-boundary candidates sits closer to the click point.
 *
 * Pure and writing-mode agnostic: callers pass the `head` / `end` rects they already resolved for
 * their orientation, so the cross/block axis that actually distinguishes the two candidates (the
 * column for vertical writing, the line for horizontal writing) is already reflected in the rect
 * centers. Comparing squared center distance therefore honors both the inline and block axes without
 * special-casing the writing mode here. Ties resolve to `end` (the historical line-end default).
 */
export function pickWrapRectClosestToPointer(
  head: PseudoCaretCoords,
  end: PseudoCaretCoords,
  pointer: PseudoCaretPointerPoint,
): PseudoCaretCoords {
  const hc = rectCenter(head)
  const ec = rectCenter(end)
  const hd = (hc.x - pointer.x) ** 2 + (hc.y - pointer.y) ** 2
  const ed = (ec.x - pointer.x) ** 2 + (ec.y - pointer.y) ** 2
  return hd < ed ? head : end
}

/**
 * Resolves the caret rect at a **vertical soft-wrap boundary** from the collapsed selection's client
 * rects.
 *
 * At a soft-wrap boundary a collapsed caret exposes TWO client rects for the same document position:
 * the end of the previous column (visually the bottom — larger `top`) and the head of the next
 * column (visually the top — smaller `top`). `getBoundingClientRect` always returns the line-end one,
 * so the pseudo caret can never sit at the next line head. Given all client rects and an `affinity`
 * (derived from the last navigation intent), this returns the matching rect.
 *
 * Returns `null` when the rects do NOT look like a genuine column wrap (fewer than 2 rects, or the
 * two candidates are too close in Y / X). This keeps the caller on its default bounding rect and
 * avoids reacting to ruby / TCY side fragments, which produce small adjacent rects rather than a
 * full column jump. Writing-direction agnostic: works for both vertical-rl and vertical-lr because
 * text always flows top→bottom within a column, so line-end is always the larger-`top` rect.
 */
export function pickVerticalWrapBoundaryRect(args: {
  rects: PseudoCaretCoords[]
  affinity: VerticalWrapAffinity
  /**
   * Optional viewport pointer from the last pointerdown. When set, the candidate whose center is
   * closest to the click point wins over `affinity`. In vertical writing the two candidates sit in
   * different columns (block axis = X) at different boundary Y, so the click disambiguates which
   * visual column the user aimed at — fixing the "head-of-column click shows previous line end" feel.
   */
  pointer?: PseudoCaretPointerPoint | null
}): PseudoCaretCoords | null {
  const valid = args.rects.filter(isFinitePseudoCaretCoords)
  if (valid.length < 2) {
    return null
  }
  let head = valid[0]!
  let end = valid[0]!
  for (const r of valid) {
    if (r.top < head.top) head = r
    if (r.top > end.top) end = r
  }
  const yGap = end.top - head.top
  const caretLen = Math.max(head.right - head.left, end.right - end.left)
  const scale = Number.isFinite(caretLen) && caretLen > 0 ? caretLen : PSEUDO_CARET_MIN_LENGTH_PX
  const xGap = Math.abs(head.left - end.left)
  // Genuine wrap: a large block-axis jump into a different column. The Y gap guard rejects same-line
  // fragments (ruby/TCY); the X gap guard confirms the candidates are in different columns.
  if (yGap <= scale || xGap <= scale * 0.5) {
    return null
  }
  if (args.pointer) {
    return pickWrapRectClosestToPointer(head, end, args.pointer)
  }
  return args.affinity === 'head' ? head : end
}

/**
 * Resolves the caret rect at a **horizontal soft-wrap boundary** from collapsed selection client
 * rects.
 *
 * In horizontal writing the two candidates are the previous line end (smaller `top`) and next line
 * head (larger `top`). This mirrors `pickVerticalWrapBoundaryRect`, but uses the block-axis line
 * jump in horizontal flow instead of the vertical column jump.
 */
export function pickHorizontalWrapBoundaryRect(args: {
  rects: PseudoCaretCoords[]
  affinity: VerticalWrapAffinity
  /**
   * Optional viewport pointer from the last pointerdown. When set, the candidate whose center is
   * closest to the click point wins over `affinity`. In horizontal writing the two candidates sit on
   * different lines (block axis = Y) at different inline X, so the click disambiguates which visual
   * line the user aimed at.
   */
  pointer?: PseudoCaretPointerPoint | null
}): PseudoCaretCoords | null {
  const valid = args.rects.filter(isFinitePseudoCaretCoords)
  if (valid.length < 2) {
    return null
  }
  let head = valid[0]!
  let end = valid[0]!
  for (const r of valid) {
    if (r.top > head.top) head = r
    if (r.top < end.top) end = r
  }
  const yGap = head.top - end.top
  const caretLen = Math.max(head.bottom - head.top, end.bottom - end.top)
  const scale = Number.isFinite(caretLen) && caretLen > 0 ? caretLen : PSEUDO_CARET_MIN_LENGTH_PX
  const xGap = Math.abs(head.left - end.left)
  // Genuine wrap: a line-height-ish Y jump plus a visible inline-axis jump. The looser Y threshold
  // accepts normal line-height equality; same-line fragments / ruby side rects remain below it.
  if (yGap <= scale * 0.5 || xGap <= scale * 0.5) {
    return null
  }
  if (args.pointer) {
    return pickWrapRectClosestToPointer(head, end, args.pointer)
  }
  return args.affinity === 'head' ? head : end
}

function clampEmptyVerticalColumnWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) {
    return DEFAULT_EMPTY_VERTICAL_COLUMN_WIDTH_PX
  }
  return Math.max(
    MIN_EMPTY_VERTICAL_COLUMN_WIDTH_PX,
    Math.min(width, MAX_EMPTY_VERTICAL_COLUMN_WIDTH_PX),
  )
}

/**
 * Builds a vertical-writing caret rect for an empty textblock.
 *
 * Chromium often reports a fully degenerate DOM Range rect for an empty paragraph/heading. Falling
 * back to `coordsAtPos` alone makes the pseudo caret use the 8px minimum and sit on the left edge of
 * the glyph column. For empty textblocks we keep the insertion-boundary Y from `coordsAtPos`, but
 * synthesize the missing column width from the block rect or local font size.
 */
export function synthesizeVerticalEmptyTextblockCaretCoords(args: {
  coordsAtPos: PseudoCaretCoords
  textblockRect: PseudoCaretCoords
  fontSizePx?: number | null
}): PseudoCaretCoords | null {
  const { coordsAtPos, textblockRect } = args
  if (!isFinitePseudoCaretCoords(coordsAtPos) || !isFinitePseudoCaretCoords(textblockRect)) {
    return null
  }
  const fallbackWidth = clampEmptyVerticalColumnWidth(args.fontSizePx ?? Number.NaN)
  const rectWidth = textblockRect.right - textblockRect.left
  const hasUsableBlockWidth = Number.isFinite(rectWidth) && rectWidth > 0
  const canUseBlockWidth =
    hasUsableBlockWidth &&
    rectWidth >= fallbackWidth * 0.5 &&
    rectWidth <= fallbackWidth * 1.25
  const width = canUseBlockWidth ? rectWidth : fallbackWidth
  let left = coordsAtPos.left
  if (canUseBlockWidth) {
    left = textblockRect.left
  } else if (hasUsableBlockWidth) {
    left = textblockRect.left + rectWidth / 2 - width / 2
  }
  const y = Number.isFinite(coordsAtPos.top) ? coordsAtPos.top : textblockRect.top
  const out = {
    left,
    top: y,
    right: left + width,
    bottom: y,
  }
  return isFinitePseudoCaretCoords(out) ? out : null
}
