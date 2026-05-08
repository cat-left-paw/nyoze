import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  collectValidLineRectsFromDomRectList,
  domRectToLineRect,
  expandCaretThinRectToVisualLine,
  isFinitePositiveRect,
  resolveVerticalViewportLineBandRect,
  resolveCurrentLineDisplayRectFromCandidates,
  resolveVisualFocusWritingModeKind,
  type LineRect,
} from './visualFocusCurrentLineGeometry'
import { mountVisualFocusCurrentLineOverlay } from './visualFocusCurrentLineOverlay'

export type VisualFocusCurrentLineControllerOptions = {
  view: EditorView
  editorSurface: HTMLElement | null
  getEnabled: () => boolean
  getIsSourceModeActive: () => boolean
  getIsParagraphPlainActive: () => boolean
  /**
   * True while local `isComposing` or `view.composing` (IME). Used like block highlight: keep the
   * current-line overlay during composition / IME range; hide only for non-composing range selection.
   */
  getIsComposing: () => boolean
}

function headInCodeBlock(state: EditorState): boolean {
  const $head = state.selection.$head
  for (let ad = $head.depth; ad > 0; ad -= 1) {
    if ($head.node(ad).type.name === 'codeBlock') {
      return true
    }
  }
  return false
}

function resolveCurrentTextblockMeta(
  state: EditorState,
  head: number,
): { from: number; typeName: 'paragraph' | 'heading' | 'codeBlock'; isEmpty: boolean } | null {
  try {
    const $head = state.doc.resolve(head)
    for (let depth = $head.depth; depth > 0; depth -= 1) {
      const node = $head.node(depth)
      if (
        node.type.name === 'paragraph' ||
        node.type.name === 'heading' ||
        node.type.name === 'codeBlock'
      ) {
        return {
          from: $head.before(depth),
          typeName: node.type.name,
          isEmpty: node.content.size === 0,
        }
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * Viewport `LineRect` for the textblock that contains `head` — prefers innermost `p` / heading
 * under `blockquote` / `li` instead of the outer container. Returns the rect together with the
 * resolved DOM element so callers can read the **place-local** effective font size (heading vs
 * body vs other size-bearing block) instead of the PM root computed style.
 */
function resolveViewportTextblockLineRect(
  view: EditorView,
  head: number,
): { rect: LineRect; el: HTMLElement } | null {
  try {
    const $head = view.state.doc.resolve(head)
    for (let depth = $head.depth; depth > 0; depth -= 1) {
      const node = $head.node(depth)
      if (
        node.type.name !== 'paragraph' &&
        node.type.name !== 'heading' &&
        node.type.name !== 'codeBlock'
      ) {
        continue
      }
      const dom = view.nodeDOM($head.before(depth))
      if (dom instanceof HTMLElement) {
        const lr = domRectToLineRect(dom.getBoundingClientRect())
        if (isFinitePositiveRect(lr)) {
          return { rect: lr, el: dom }
        }
      }
    }
  } catch {
    // Fall through to DOM-neighborhood resolution below.
  }
  try {
    const pmRoot = view.dom as HTMLElement
    const { node } = view.domAtPos(head)
    let n: Node | null = node
    if (n.nodeType === Node.TEXT_NODE) {
      n = n.parentNode
    }
    let el: Element | null = n instanceof Element ? n : null
    let innerTextblock: HTMLElement | null = null
    while (el && el !== pmRoot) {
      if (el instanceof HTMLElement) {
        const tag = el.tagName
        if (/^P$/i.test(tag) || /^H[1-6]$/i.test(tag)) {
          innerTextblock = el
          break
        }
      }
      el = el.parentElement
    }
    if (innerTextblock) {
      const br = innerTextblock.getBoundingClientRect()
      const lr = domRectToLineRect(br)
      return isFinitePositiveRect(lr) ? { rect: lr, el: innerTextblock } : null
    }
    el = n instanceof Element ? n : null
    while (el && el !== pmRoot) {
      if (el.parentElement === pmRoot) {
        const br = (el as HTMLElement).getBoundingClientRect()
        const lr = domRectToLineRect(br)
        return isFinitePositiveRect(lr) ? { rect: lr, el: el as HTMLElement } : null
      }
      el = el.parentElement
    }
    return null
  } catch {
    return null
  }
}

/**
 * Place-local effective font size in CSS px. Falls back to the PM root style when the textblock
 * element is not available — used to drive the **vertical current-line band width** and to keep
 * it stable across glyph / IME / TCY rect changes while still adapting to body vs heading.
 */
function resolveLocalEffectiveFontSizePx(
  win: Window | null | undefined,
  textblockEl: HTMLElement | null,
  pmRoot: HTMLElement,
): number {
  if (!win) {
    return 16
  }
  const candidate =
    textblockEl && pmRoot.contains(textblockEl) ? textblockEl : pmRoot
  const raw = win.getComputedStyle(candidate).fontSize ?? '16'
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : 16
}

function synthesizeVerticalLineClampRect(
  display: LineRect,
  caret: { left: number; top: number; right: number; bottom: number },
  fontSizePx: number,
): LineRect {
  const fs = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 16
  const left = Math.min(display.x, caret.left) - fs * 2
  const right = Math.max(display.x + display.width, caret.right) + fs * 2
  const top = Math.min(display.y, caret.top) - fs * 3
  const bottom = Math.max(display.y + display.height, caret.bottom) + fs * 3
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(fs * 4, bottom - top),
  }
}

function resolveRangeCenterXClosestToCaretY(range: Range, caretY: number): number | null {
  const rects = collectValidLineRectsFromDomRectList(range.getClientRects())
  if (rects.length === 0) {
    return null
  }
  // A 1-character text range usually yields one rect, but wrap / inline-boundary DOM can expose
  // multiple fragments. Ruby annotations and wrappers are often tiny side fragments; prefer a
  // body-text-sized rect first, then the rect closest in Y to the caret.
  const maxArea = rects.reduce((m, r) => Math.max(m, r.width * r.height), 0)
  const minBodyArea = maxArea > 0 ? maxArea * 0.45 : 0
  let best: LineRect | null = null
  let bestDy = Infinity
  for (const r of rects) {
    const area = r.width * r.height
    if (area < minBodyArea) {
      continue
    }
    const dy = Math.abs(r.y + r.height / 2 - caretY)
    if (dy < bestDy) {
      best = r
      bestDy = dy
    }
  }
  if (!best) {
    best = rects[0]!
    bestDy = Math.abs(best.y + best.height / 2 - caretY)
    for (let i = 1; i < rects.length; i += 1) {
      const r = rects[i]!
      const dy = Math.abs(r.y + r.height / 2 - caretY)
      if (dy < bestDy) {
        best = r
        bestDy = dy
      }
    }
  }
  return best.x + best.width / 2
}

/**
 * Center X of the **glyph adjacent to a collapsed caret** in a Text node — the glyph after the
 * caret for mid-line / line-head positions, the glyph before the caret at logical line ends.
 *
 * In vertical writing this is the caret column's true X. The Chromium collapsed-range rect
 * (a.k.a. caret strip) leans toward the insertion boundary, not the column center, so it is NOT
 * a reliable anchor for non-line-end positions. Reading the rect of the adjacent 1-character
 * range avoids that drift while costing one extra layout read per overlay tick.
 *
 * Returns `null` for empty text nodes, non-Text anchors (special-inline neighbors), or when no
 * client rect is produced — callers must keep caret-strip center as a final fallback.
 */
function resolveVerticalCollapsedAdjacentGlyphCenterX(
  pmRoot: HTMLElement,
  selection: Selection | null,
  caretY: number,
): number | null {
  if (!selection?.isCollapsed) {
    return null
  }
  const anchorNode = selection.anchorNode
  if (!(anchorNode instanceof Text) || !pmRoot.contains(anchorNode)) {
    return null
  }
  const textLength = anchorNode.data.length
  if (textLength <= 0) {
    return null
  }
  const offset = selection.anchorOffset
  let start: number
  let end: number
  if (offset >= textLength) {
    // Logical line end: previous glyph is in the caret's column.
    start = textLength - 1
    end = textLength
  } else if (offset > 0) {
    // Mid-line: the glyph after the caret matches the next visible glyph in the column.
    start = offset
    end = offset + 1
  } else {
    // Line head: first glyph.
    start = 0
    end = 1
  }
  try {
    const range = anchorNode.ownerDocument.createRange()
    range.setStart(anchorNode, start)
    range.setEnd(anchorNode, end)
    return resolveRangeCenterXClosestToCaretY(range, caretY)
  } catch {
    return null
  }
}

function resolveVerticalAdjacentGlyphCenterXFromDocumentPosition(
  view: EditorView,
  head: number,
  caretY: number,
): number | null {
  const docSize = view.state.doc.content.size
  const candidates: Array<[number, number]> = []
  if (head < docSize) {
    candidates.push([head, head + 1])
  }
  if (head > 0) {
    candidates.push([head - 1, head])
  }

  for (const [from, to] of candidates) {
    try {
      const start = view.domAtPos(from)
      const end = view.domAtPos(to)
      const doc = view.dom.ownerDocument
      const range = doc.createRange()
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
      if (!view.dom.contains(range.commonAncestorContainer)) {
        continue
      }
      const centerX = resolveRangeCenterXClosestToCaretY(range, caretY)
      if (centerX !== null && Number.isFinite(centerX)) {
        return centerX
      }
    } catch {
      // Try the other side of the caret.
    }
  }
  return null
}

export function createVisualFocusCurrentLineController(
  options: VisualFocusCurrentLineControllerOptions,
): { scheduleUpdate: () => void; destroy: () => void } {
  const { view, editorSurface } = options
  const pmRoot = view.dom as HTMLElement
  const surfaceResolved =
    editorSurface ?? (pmRoot.closest('.editor-surface') as HTMLElement | null) ?? pmRoot
  const anchor: HTMLElement | null =
    pmRoot.parentElement === surfaceResolved
      ? pmRoot
      : pmRoot.parentElement && surfaceResolved.contains(pmRoot.parentElement)
        ? pmRoot.parentElement
        : null
  const overlay = mountVisualFocusCurrentLineOverlay(surfaceResolved, anchor)

  let raf = 0
  let pending = false
  let destroyed = false
  let lastVerticalAnchor:
    | { textblockFrom: number; writingMode: 'vertical-rl' | 'vertical-lr'; x: number }
    | null = null

  const commit = () => {
    pending = false
    raf = 0
    if (destroyed) {
      return
    }
    if (!options.getEnabled()) {
      overlay.setHidden(true)
      return
    }
    if (options.getIsSourceModeActive() || options.getIsParagraphPlainActive()) {
      overlay.setHidden(true)
      return
    }
    const state = view.state
    const composingNow = options.getIsComposing() || view.composing
    if (!state.selection.empty && !composingNow) {
      overlay.setHidden(true)
      return
    }
    if (headInCodeBlock(state)) {
      overlay.setHidden(true)
      return
    }

    const head = state.selection.head
    const textblockMeta = resolveCurrentTextblockMeta(state, head)
    const win = pmRoot.ownerDocument.defaultView
    const panel =
      (surfaceResolved.closest('.editor-panel') as HTMLElement | null) ??
      (pmRoot.closest('.editor-panel') as HTMLElement | null) ??
      (pmRoot.ownerDocument.querySelector('.editor-panel[data-writing-mode]') as HTMLElement | null)
    const writingMode = resolveVisualFocusWritingModeKind({
      editorPanelDataWritingMode: panel?.getAttribute('data-writing-mode'),
      proseMirrorComputedWritingMode: win?.getComputedStyle(pmRoot).writingMode ?? 'horizontal-tb',
      editorSurfaceComputedWritingMode: win?.getComputedStyle(surfaceResolved).writingMode ?? 'horizontal-tb',
    })
    let coords: { left: number; top: number; right: number; bottom: number } | null = null
    try {
      coords = view.coordsAtPos(head)
    } catch {
      overlay.setHidden(true)
      return
    }
    if (
      !coords ||
      !Number.isFinite(coords.left) ||
      !Number.isFinite(coords.top) ||
      !Number.isFinite(coords.right) ||
      !Number.isFinite(coords.bottom)
    ) {
      overlay.setHidden(true)
      return
    }

    let clientRects: ReturnType<typeof collectValidLineRectsFromDomRectList> = []
    let adjacentGlyphCenterX: number | null = null
    try {
      const doc = pmRoot.ownerDocument ?? document
      const sel = doc.getSelection?.()
      if (
        sel &&
        sel.rangeCount > 0 &&
        sel.anchorNode &&
        pmRoot.contains(sel.anchorNode) &&
        (sel.isCollapsed || composingNow)
      ) {
        const range = sel.getRangeAt(0)
        if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr') {
          // Adjacent-glyph center X is the column anchor for vertical writing — covers line-end,
          // mid-line, and line-head equally, and avoids Chromium's collapsed-range "caret strip"
          // which leans toward the insertion boundary instead of the column center.
          // The 1-character range's width is NEVER used for band width (that comes from font size).
          const caretY = (coords.top + coords.bottom) / 2
          adjacentGlyphCenterX =
            resolveVerticalCollapsedAdjacentGlyphCenterX(pmRoot, sel, caretY) ??
            (!textblockMeta?.isEmpty
              ? resolveVerticalAdjacentGlyphCenterXFromDocumentPosition(view, head, caretY)
              : null)
        } else {
          clientRects = collectValidLineRectsFromDomRectList(range.getClientRects())
        }
      }
    } catch {
      clientRects = []
      adjacentGlyphCenterX = null
    }

    let display = resolveCurrentLineDisplayRectFromCandidates({
      caretLeft: coords.left,
      caretTop: coords.top,
      caretRight: coords.right,
      caretBottom: coords.bottom,
      clientRects,
    })
    if (!display) {
      overlay.setHidden(true)
      return
    }

    const blockResolved = resolveViewportTextblockLineRect(view, head)
    const fontSizePx = resolveLocalEffectiveFontSizePx(
      win,
      blockResolved?.el ?? null,
      pmRoot,
    )
    const blockRect =
      blockResolved?.rect ??
      (writingMode === 'vertical-rl' || writingMode === 'vertical-lr'
        ? synthesizeVerticalLineClampRect(display, coords, fontSizePx)
        : null)

    // Vertical band X anchor: prefer the adjacent-glyph center X (true column X across line-end,
    // mid-line, and line-head). PM caret center is only a last-resort fallback for empty text /
    // special-inline neighbors where no adjacent glyph rect exists. Pass `anchorX` to the
    // geometry helper as a first-class input so the final band is centered on the column,
    // regardless of any `rect.x` / `rect.width` drift coming from collapsed-range
    // `getClientRects()` (Windows left-lean, Chromium caret strip).
    let anchorX: number | undefined
    if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr') {
      const caretCenterX = (coords.left + coords.right) / 2
      const emptyTextblockCenterX =
        textblockMeta?.isEmpty && blockRect
          ? blockRect.x + blockRect.width / 2
          : null
      anchorX =
        adjacentGlyphCenterX !== null && Number.isFinite(adjacentGlyphCenterX)
          ? adjacentGlyphCenterX
          : emptyTextblockCenterX !== null && Number.isFinite(emptyTextblockCenterX)
            ? emptyTextblockCenterX
            : caretCenterX
      const currentTextblockFrom = textblockMeta?.from ?? null
      if (
        currentTextblockFrom !== null &&
        lastVerticalAnchor &&
        lastVerticalAnchor.textblockFrom === currentTextblockFrom &&
        lastVerticalAnchor.writingMode === writingMode &&
        adjacentGlyphCenterX === null &&
        Math.abs(anchorX - lastVerticalAnchor.x) > Math.max(48, fontSizePx * 2.5)
      ) {
        anchorX = lastVerticalAnchor.x
      } else if (currentTextblockFrom !== null) {
        lastVerticalAnchor = {
          textblockFrom: currentTextblockFrom,
          writingMode,
          x: anchorX,
        }
      }
    } else {
      lastVerticalAnchor = null
    }

    if (blockRect) {
      const expandedLine = expandCaretThinRectToVisualLine({
        rect: display,
        caret: {
          left: coords.left,
          top: coords.top,
          right: coords.right,
          bottom: coords.bottom,
        },
        textBlockRect: blockRect,
        writingMode,
        fontSizePx,
        anchorX,
      })
      if (expandedLine) {
        display = expandedLine
      }
    }

    if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr') {
      const pmStyle = win?.getComputedStyle(pmRoot)
      const verticalViewportBand = resolveVerticalViewportLineBandRect({
        rect: display,
        viewportRect: domRectToLineRect(surfaceResolved.getBoundingClientRect()),
        textBlockRect: blockRect,
        contentPaddingTop: Number.parseFloat(pmStyle?.paddingTop ?? '0') || 0,
        contentPaddingBottom: Number.parseFloat(pmStyle?.paddingBottom ?? '0') || 0,
      })
      if (verticalViewportBand) {
        display = verticalViewportBand
      }
    }

    const rootRect = surfaceResolved.getBoundingClientRect()
    if (
      !rootRect ||
      !Number.isFinite(rootRect.left) ||
      !Number.isFinite(rootRect.top) ||
      !Number.isFinite(rootRect.width) ||
      !Number.isFinite(rootRect.height)
    ) {
      overlay.setHidden(true)
      return
    }

    const left = display.x - rootRect.left + surfaceResolved.scrollLeft
    const top = display.y - rootRect.top + surfaceResolved.scrollTop
    overlay.setPosition(left, top, display.width, display.height)
    overlay.setHidden(false)
  }

  const scheduleUpdate = () => {
    if (destroyed) {
      return
    }
    if (pending) {
      return
    }
    pending = true
    raf = window.requestAnimationFrame(() => {
      commit()
    })
  }

  const onScroll = () => scheduleUpdate()
  const onResize = () => scheduleUpdate()

  if (editorSurface) {
    editorSurface.addEventListener('scroll', onScroll, { passive: true })
  }
  window.addEventListener('resize', onResize)

  return {
    scheduleUpdate,
    destroy() {
      destroyed = true
      if (raf) {
        window.cancelAnimationFrame(raf)
        raf = 0
      }
      pending = false
      if (editorSurface) {
        editorSurface.removeEventListener('scroll', onScroll)
      }
      window.removeEventListener('resize', onResize)
      overlay.destroy()
    },
  }
}
