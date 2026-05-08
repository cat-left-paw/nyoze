/**
 * Pure helpers for Visual Focus current-line overlay geometry (viewport / client rects).
 */

export type LineRect = { x: number; y: number; width: number; height: number }

const MAX_RECT_EXTENT = 1_000_000

export function isFinitePositiveRect(r: LineRect): boolean {
  if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.width) || !Number.isFinite(r.height)) {
    return false
  }
  if (r.width <= 0 || r.height <= 0) {
    return false
  }
  if (r.width > MAX_RECT_EXTENT || r.height > MAX_RECT_EXTENT) {
    return false
  }
  return true
}

export function rectCenter(r: LineRect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export function domRectToLineRect(d: { left: number; top: number; right: number; bottom: number }): LineRect {
  return {
    x: d.left,
    y: d.top,
    width: d.right - d.left,
    height: d.bottom - d.top,
  }
}

export function collectValidLineRectsFromDomRectList(list: ArrayLike<DOMRect | { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }>): LineRect[] {
  const out: LineRect[] = []
  for (let i = 0; i < list.length; i += 1) {
    const d = list[i]!
    const r = domRectToLineRect(d)
    if (isFinitePositiveRect(r)) {
      out.push(r)
    }
  }
  return out
}

export function pickClosestRectToPoint(px: number, py: number, rects: LineRect[]): LineRect | null {
  if (rects.length === 0) {
    return null
  }
  let best = rects[0]!
  let bestD = Infinity
  for (const r of rects) {
    const c = rectCenter(r)
    const d = distanceSquared(px, py, c.x, c.y)
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return best
}

/** Pad visual line rect slightly for readability (viewport px). */
export function expandLineRectForDisplay(r: LineRect, padX = 3, padY = 2): LineRect {
  return {
    x: r.x - padX,
    y: r.y - padY,
    width: r.width + padX * 2,
    height: r.height + padY * 2,
  }
}

/**
 * Picks the visual line rect closest to the caret center; falls back to caret rect when no client rects.
 */
export function resolveCurrentLineDisplayRectFromCandidates(args: {
  caretLeft: number
  caretTop: number
  caretRight: number
  caretBottom: number
  clientRects: LineRect[]
}): LineRect | null {
  const cx = (args.caretLeft + args.caretRight) / 2
  const cy = (args.caretTop + args.caretBottom) / 2
  let rects = args.clientRects
  if (rects.length === 0) {
    const left = args.caretLeft
    const top = args.caretTop
    const right = Math.max(args.caretRight, left + 2)
    const bottom = Math.max(args.caretBottom, top + 2)
    const cr = domRectToLineRect({ left, top, right, bottom })
    if (!isFinitePositiveRect(cr)) {
      return null
    }
    rects = [cr]
  }
  const picked = pickClosestRectToPoint(cx, cy, rects)
  if (!picked) {
    return null
  }
  const expanded = expandLineRectForDisplay(picked)
  if (!isFinitePositiveRect(expanded)) {
    return null
  }
  return expanded
}

export type WritingModeKind = 'horizontal-tb' | 'vertical-rl' | 'vertical-lr' | 'other'

/** Maps CSS `writing-mode` to a coarse bucket for line-geometry heuristics. */
export function detectWritingModeKind(cssWritingMode: string): WritingModeKind {
  const w = cssWritingMode.trim().toLowerCase()
  if (w.includes('vertical-rl') || w.includes('sideways-rl')) {
    return 'vertical-rl'
  }
  if (w.includes('vertical-lr') || w.includes('sideways-lr')) {
    return 'vertical-lr'
  }
  if (w.includes('horizontal') || w === 'lr-tb' || w === 'rl-tb' || w === 'lr' || w === 'rl') {
    return 'horizontal-tb'
  }
  return 'other'
}

/**
 * Prefer `data-writing-mode` on `.editor-panel` (UI SoT) when present, then ProseMirror / surface
 * computed styles — avoids mis-detecting vertical sessions as horizontal when used values differ.
 */
export function resolveVisualFocusWritingModeKind(args: {
  editorPanelDataWritingMode: string | null | undefined
  proseMirrorComputedWritingMode: string
  editorSurfaceComputedWritingMode: string
}): WritingModeKind {
  const ds = args.editorPanelDataWritingMode?.trim().toLowerCase()
  if (ds === 'vertical-rl' || ds === 'vertical-lr') {
    return ds
  }
  if (ds === 'horizontal-tb') {
    return 'horizontal-tb'
  }
  let k = detectWritingModeKind(args.proseMirrorComputedWritingMode)
  if (k === 'vertical-rl' || k === 'vertical-lr' || k === 'horizontal-tb') {
    return k
  }
  k = detectWritingModeKind(args.editorSurfaceComputedWritingMode)
  if (k === 'vertical-rl' || k === 'vertical-lr' || k === 'horizontal-tb') {
    return k
  }
  return k
}

export function resolveVerticalViewportLineBandRect(args: {
  rect: LineRect
  viewportRect: LineRect
  textBlockRect?: LineRect | null
  contentPaddingTop: number
  contentPaddingBottom: number
}): LineRect | null {
  const { rect, viewportRect, textBlockRect, contentPaddingTop, contentPaddingBottom } = args
  const topPad = Number.isFinite(contentPaddingTop) ? Math.max(0, contentPaddingTop) : 0
  const bottomPad = Number.isFinite(contentPaddingBottom) ? Math.max(0, contentPaddingBottom) : 0
  const y = textBlockRect?.y ?? viewportRect.y + topPad
  const height = textBlockRect?.height ?? (viewportRect.height - topPad - bottomPad)
  const out: LineRect = {
    x: rect.x,
    y,
    width: rect.width,
    height,
  }
  return isFinitePositiveRect(out) ? out : null
}

function clampLineRectToTextBlock(
  r: LineRect,
  textBlockRect: LineRect,
  minSpan: number,
  options: { preserveHeightWhenBlockIsShort?: boolean } = {},
): LineRect {
  const blockRight = textBlockRect.x + textBlockRect.width
  const blockBottom = textBlockRect.y + textBlockRect.height
  const out = { ...r }
  if (out.x < textBlockRect.x) {
    out.width -= textBlockRect.x - out.x
    out.x = textBlockRect.x
  }
  if (out.x + out.width > blockRight) {
    out.width = Math.max(minSpan, blockRight - out.x)
  }
  const preserveHeight =
    options.preserveHeightWhenBlockIsShort === true && textBlockRect.height < out.height
  if (!preserveHeight) {
    if (out.y < textBlockRect.y) {
      out.height -= textBlockRect.y - out.y
      out.y = textBlockRect.y
    }
    if (out.y + out.height > blockBottom) {
      out.height = Math.max(minSpan, blockBottom - out.y)
    }
  }
  return out
}

/**
 * Width factor for the vertical current-line band, expressed as a multiple of the local effective
 * font size. Tuned so the band reads as "this display line" (slightly wider than the glyph column)
 * without becoming a column-wide stripe.
 */
const VERTICAL_BAND_WIDTH_FACTOR = 1.4

/**
 * Extra padding (px) added on each physical-X side of the vertical band so the result does not feel
 * cramped at small font sizes. Independent of glyph rect — keeps width stable across IME / TCY.
 */
const VERTICAL_BAND_EXTRA_PAD_PX = 3

/**
 * Pure helper: vertical current-line band width derived **only from the effective font size**.
 * Independent of glyph rect, caret rect, IME composition rect, or TCY rendered width — this is the
 * stability anchor for the visual focus current line in vertical writing.
 */
export function resolveVerticalCurrentLineBandWidth(fontSizePx: number): number {
  const fs = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 16
  return fs * VERTICAL_BAND_WIDTH_FACTOR + VERTICAL_BAND_EXTRA_PAD_PX * 2
}

/**
 * When the resolved rect is caret-like in horizontal writing, expand to span the full textblock
 * row. In vertical writing, the band is **centered on the explicit `anchorX`** with a font-size
 * derived fixed width — width is never a function of glyph / caret / IME / TCY rect width, and
 * center X is never recomputed from `rect`. Callers must pass the PM caret center as `anchorX`
 * (with end-glyph center as a line-end override) so collapsed-range rect drift cannot leak into
 * the band's X position.
 *
 * `textBlockRect` is only used for clamping / horizontal row width, not as the vertical span in
 * vertical writing. `anchorX` is required for vertical writing; if absent, the helper falls back
 * to `rect` center but this path is not the supported runtime contract.
 */
export function expandCaretThinRectToVisualLine(args: {
  rect: LineRect
  caret: { left: number; top: number; right: number; bottom: number }
  textBlockRect: LineRect
  writingMode: WritingModeKind
  fontSizePx: number
  /**
   * Explicit X anchor for vertical writing — typically the PM caret center, optionally overridden
   * by an end-glyph center at logical line ends. When provided, the band is centered on this X
   * regardless of `rect.x` / `rect.width`. Optional in horizontal writing.
   */
  anchorX?: number
}): LineRect | null {
  const { rect, caret, textBlockRect, writingMode, fontSizePx, anchorX } = args
  const fs = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 16
  const minSpan = Math.max(8, fs * 0.35)

  const caretH = Math.max(0, caret.bottom - caret.top)
  const lineH = Math.max(caretH, rect.height, minSpan)

  let r: LineRect = { ...rect }

  if (writingMode === 'horizontal-tb') {
    // Thin vertical strip in horizontal flow: span full block width.
    const looksLikeCaretColumn =
      rect.width < Math.max(minSpan * 2, lineH * 0.35) && rect.width < textBlockRect.width * 0.92
    if (looksLikeCaretColumn) {
      r = {
        x: textBlockRect.x,
        y: Math.min(caret.top, rect.y) - 2,
        width: textBlockRect.width,
        height: lineH + 4,
      }
      const yMax = textBlockRect.y + textBlockRect.height - r.height
      r.y = Math.max(textBlockRect.y, Math.min(r.y, yMax))
    }
  } else if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr') {
    // Vertical band: width = font-size-only constant. Center X = explicit `anchorX` (caret
    // center or end-glyph center). Never recompute center from `rect` — that re-introduces
    // the collapsed-range drift the anchor was meant to neutralize. Final physical-Y span is
    // set later via `resolveVerticalViewportLineBandRect`; we still produce a sensible interim
    // height here.
    const w = resolveVerticalCurrentLineBandWidth(fs)
    const centerX = Number.isFinite(anchorX) ? (anchorX as number) : rect.x + rect.width / 2
    const fragTop = Math.min(caret.top, rect.y)
    const fragBottom = Math.max(caret.bottom, rect.y + rect.height)
    const interimH = Math.max(fragBottom - fragTop, lineH, minSpan) + 4
    r = clampLineRectToTextBlock(
      {
        x: centerX - w / 2,
        y: fragTop - 2,
        width: w,
        height: interimH,
      },
      textBlockRect,
      minSpan,
      { preserveHeightWhenBlockIsShort: true },
    )
    // Re-assert width and center: clamping never narrows or shifts the anchored band in X.
    r.width = w
    r.x = centerX - w / 2
  }

  if (!isFinitePositiveRect(r)) {
    return null
  }
  return r
}
