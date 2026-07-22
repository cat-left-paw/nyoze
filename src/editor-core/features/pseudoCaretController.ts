import type { EditorView } from '@tiptap/pm/view'
import {
  buildPseudoCaretShape,
  isFinitePseudoCaretCoords,
  pickHorizontalWrapBoundaryRect,
  pickVerticalWrapBoundaryRect,
  resolvePseudoCaretOrientation,
  synthesizeVerticalEmptyTextblockCaretCoords,
  type PseudoCaretCoords,
  type PseudoCaretOrientation,
  type PseudoCaretPointerPoint,
  type VerticalWrapAffinity,
} from './pseudoCaretGeometry'
import { mountPseudoCaretOverlay } from './pseudoCaretOverlay'

export type PseudoCaretControllerOptions = {
  view: EditorView
  editorSurface: HTMLElement | null
  /** Master ON/OFF (settings-driven). When false the overlay is always hidden. */
  getEnabled: () => boolean
  /**
   * Caret short-axis thickness in px (settings-driven, Task 2-4). Already sanitized upstream.
   * When undefined / non-finite, `buildPseudoCaretShape` keeps its built-in default thickness.
   */
  getThickness?: () => number | undefined
  /** Overlay opacity blink ON/OFF (settings-driven). Default true when unset. */
  getBlinkEnabled?: () => boolean
  /** Source Mode active — pseudo caret hidden (CodeMirror owns the caret). */
  getIsSourceModeActive: () => boolean
  /** Paragraph Plain active — pseudo caret hidden (textarea overlay owns input). */
  getIsParagraphPlainActive: () => boolean
  /**
   * True while local `isComposing` or `view.composing` (IME). MVP keeps the pseudo caret visible
   * during composition and lets it follow `selection.head`, mirroring the current-line overlay.
   */
  getIsComposing: () => boolean
}

export type PseudoCaretControllerHandle = {
  scheduleUpdate: () => void
  destroy: () => void
}

/**
 * Display-only pseudo caret controller. Reads `view.coordsAtPos(selection.head)` once per animation
 * frame and positions a thin line overlay mounted directly under `.editor-surface`. It never
 * mutates ProseMirror state, DOM selection, Undo/Redo, or IME handling, and keeps the standard
 * caret intact.
 */
export function createPseudoCaretController(
  options: PseudoCaretControllerOptions,
): PseudoCaretControllerHandle {
  const { view, editorSurface } = options
  const pmRoot = view.dom as HTMLElement
  const surfaceResolved =
    editorSurface ?? (pmRoot.closest('.editor-surface') as HTMLElement | null) ?? pmRoot
  const overlay = mountPseudoCaretOverlay(surfaceResolved)

  let raf = 0
  let pending = false
  let destroyed = false

  // Last navigation intent — used ONLY to pick a side at a soft-wrap boundary, where one
  // document position maps to two visual spots (previous line end vs next line head). We cannot read
  // Chromium's private caret affinity, so we approximate it from the last key / pointer the user
  // pressed. This never touches ProseMirror state or DOM selection.
  let wrapAffinity: VerticalWrapAffinity = 'end'
  // When the last intent was a pointerdown, prefer the actual click point over the keyboard affinity:
  // at a wrap boundary we pick whichever visual rect is closest to where the user clicked. Cleared on
  // any keydown so keyboard navigation keeps its own (already-correct) head/end affinity.
  let lastIntentWasPointer = false
  let pointerViewportPoint: PseudoCaretPointerPoint | null = null

  const noteNavigationIntent = (event: KeyboardEvent) => {
    lastIntentWasPointer = false
    switch (event.key) {
      // Bare arrow navigation should keep the caret on the visual line-head
      // side at a wrap boundary. In Chromium's native caret this avoids flickering back to the
      // previous line end while moving across a wrapped line/column boundary.
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
        wrapAffinity = 'head'
        break
      // Explicit line end → caret stays at the previous line end.
      case 'End':
        wrapAffinity = 'end'
        break
      default:
        // Printable character (forward typing) → next line head, mirroring native insertion.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          wrapAffinity = 'head'
        }
    }
  }
  // A direct click should land the caret on the visual line nearest the click point. Remember the
  // pointer viewport coords so the boundary picker can choose the closer rect (line-head vs line-end)
  // instead of always snapping to the previous line end. Keep `wrapAffinity = 'end'` as the fallback
  // for paths where the pointer point cannot be used (e.g. composition).
  const notePointerIntent = (event: PointerEvent) => {
    wrapAffinity = 'end'
    lastIntentWasPointer = true
    pointerViewportPoint = { x: event.clientX, y: event.clientY }
  }

  const hide = () => overlay.setHidden(true)

  /**
   * The true caret line, read from the DOM collapsed selection range.
   *
   * `view.coordsAtPos` does not special-case vertical writing: it flattens the position to a thin
   * strip along the inline axis, which in vertical writing lands left-leaning, half a glyph low, and
   * too short. The browser's collapsed-range `getBoundingClientRect`, by contrast, returns the
   * actual caret line in BOTH writing modes — a vertical line spanning the line height in horizontal
   * writing, and a horizontal line spanning the column width at the insertion-boundary Y in vertical
   * writing. We prefer it and keep `coordsAtPos` only as the validity gate / fallback.
   *
   * Returns `null` when no usable in-PM selection rect exists, so the caller falls back to coords.
   */
  const toCoords = (rect: DOMRect): PseudoCaretCoords => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  })

  const isSameCoords = (a: PseudoCaretCoords, b: PseudoCaretCoords): boolean =>
    a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom

  const resolveDomCaretViewportRect = (
    composingNow: boolean,
    orientation: PseudoCaretOrientation,
  ): PseudoCaretCoords | null => {
    const doc = pmRoot.ownerDocument
    const sel = doc?.getSelection?.()
    if (!sel || sel.rangeCount === 0) {
      return null
    }
    const focusNode = sel.focusNode
    if (!focusNode || !pmRoot.contains(focusNode)) {
      return null
    }
    let rect: DOMRect | null = null
    try {
      if (sel.isCollapsed) {
        const range = sel.getRangeAt(0)
        // Soft-wrap boundary: a collapsed caret can yield two client rects (previous line end +
        // next line head). Pick the side matching the last navigation intent. Returns null off a
        // boundary or near ruby/TCY fragments, so we fall through to the plain bounding rect.
        if (!composingNow) {
          const rects = Array.from(range.getClientRects(), toCoords)
          // Pointer click: disambiguate by the actual click point. Keyboard navigation: keep the
          // head/end affinity derived from the last key. Never used during composition (guarded above).
          const pointer = lastIntentWasPointer ? pointerViewportPoint : null
          const boundaryRect =
            orientation === 'vertical'
              ? pickVerticalWrapBoundaryRect({ rects, affinity: wrapAffinity, pointer })
              : pickHorizontalWrapBoundaryRect({ rects, affinity: wrapAffinity, pointer })
          if (boundaryRect) {
            if (pointer) {
              const headRect =
                orientation === 'vertical'
                  ? pickVerticalWrapBoundaryRect({ rects, affinity: 'head' })
                  : pickHorizontalWrapBoundaryRect({ rects, affinity: 'head' })
              wrapAffinity = headRect && isSameCoords(boundaryRect, headRect) ? 'head' : 'end'
              lastIntentWasPointer = false
              pointerViewportPoint = null
            }
            return boundaryRect
          }
        }
        rect = range.getBoundingClientRect()
      } else if (composingNow) {
        // Composition: the live range spans the composing text; collapse to the focus point so the
        // caret still follows the insertion head without touching the real selection.
        const caretRange = doc.createRange()
        caretRange.setStart(focusNode, sel.focusOffset)
        caretRange.collapse(true)
        rect = caretRange.getBoundingClientRect()
      }
    } catch {
      return null
    }
    if (!rect) {
      return null
    }
    const coords = toCoords(rect)
    if (!isFinitePseudoCaretCoords(coords)) {
      return null
    }
    // A fully degenerate (0×0) rect carries no axis length — let coords fall back instead.
    if (rect.width === 0 && rect.height === 0) {
      return null
    }
    return coords
  }

  const resolveVerticalEmptyTextblockViewportRect = (
    coordsAtPos: PseudoCaretCoords,
  ): PseudoCaretCoords | null => {
    const { selection } = view.state
    if (!selection.empty) {
      return null
    }
    const $head = selection.$head
    const parent = $head.parent
    if (!parent.isTextblock || parent.content.size !== 0 || $head.depth <= 0) {
      return null
    }

    let dom: Node | null = null
    try {
      dom = view.nodeDOM($head.before($head.depth))
    } catch {
      return null
    }
    const el =
      dom instanceof HTMLElement
        ? dom
        : dom?.parentElement instanceof HTMLElement
          ? dom.parentElement
          : null
    if (!el || !pmRoot.contains(el)) {
      return null
    }

    const rect = el.getBoundingClientRect()
    const win = pmRoot.ownerDocument.defaultView
    const fontSizePx = win ? Number.parseFloat(win.getComputedStyle(el).fontSize) : Number.NaN
    return synthesizeVerticalEmptyTextblockCaretCoords({
      coordsAtPos,
      textblockRect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
      fontSizePx,
    })
  }

  const commit = () => {
    pending = false
    raf = 0
    if (destroyed) {
      return
    }
    if (!options.getEnabled()) {
      hide()
      return
    }
    if (options.getIsSourceModeActive() || options.getIsParagraphPlainActive()) {
      hide()
      return
    }
    // Focus lost → hide. During composition the view still reports focus.
    if (!view.hasFocus()) {
      hide()
      return
    }
    const state = view.state
    const composingNow = options.getIsComposing() || view.composing
    // Non-collapsed selection → hide, except while composing (the caret should keep following head).
    if (!state.selection.empty && !composingNow) {
      hide()
      return
    }

    const head = state.selection.head

    // Resolve writing mode: prefer the UI source of truth (`data-writing-mode` on `.editor-panel`),
    // then the computed `writing-mode` of the PM root / surface. Kept inline (small + display-only)
    // so this controller stays decoupled from the Visual Focus current-line geometry feature.
    const win = pmRoot.ownerDocument.defaultView
    const panel =
      (surfaceResolved.closest('.editor-panel') as HTMLElement | null) ??
      (pmRoot.closest('.editor-panel') as HTMLElement | null) ??
      (pmRoot.ownerDocument.querySelector('.editor-panel[data-writing-mode]') as HTMLElement | null)
    const writingMode =
      panel?.getAttribute('data-writing-mode') ||
      win?.getComputedStyle(pmRoot).writingMode ||
      win?.getComputedStyle(surfaceResolved).writingMode ||
      'horizontal-tb'
    const orientation = resolvePseudoCaretOrientation(writingMode)

    // Prefer the DOM caret line (correct in both writing modes). `view.coordsAtPos` forces a layout,
    // so only read it when the DOM rect is unavailable (empty textblock / no usable selection rect) —
    // this keeps scroll updates to the minimum number of synchronous layout reads.
    let caretRect = resolveDomCaretViewportRect(composingNow, orientation)
    if (!caretRect) {
      let coords: PseudoCaretCoords | null = null
      try {
        coords = view.coordsAtPos(head)
      } catch {
        hide()
        return
      }
      if (!coords) {
        hide()
        return
      }
      caretRect =
        (orientation === 'vertical' ? resolveVerticalEmptyTextblockViewportRect(coords) : null) ??
        coords
    }

    const rootRect = surfaceResolved.getBoundingClientRect()
    // Settings-driven thickness applies uniformly to the short axis in both writing modes, and to
    // the empty-line / wrap-affinity corrected shapes (they all flow through buildPseudoCaretShape).
    const thickness = options.getThickness?.()
    const shape = buildPseudoCaretShape({
      coords: caretRect,
      surface: {
        left: rootRect.left,
        top: rootRect.top,
        scrollLeft: surfaceResolved.scrollLeft,
        scrollTop: surfaceResolved.scrollTop,
      },
      orientation,
      thickness,
    })
    if (!shape) {
      hide()
      return
    }

    overlay.setOrientation(orientation)
    overlay.setPosition(shape.left, shape.top, shape.width, shape.height)
    overlay.setBlink(options.getBlinkEnabled?.() !== false)
    overlay.setHidden(false)
  }

  const scheduleUpdate = () => {
    if (destroyed || pending) {
      return
    }
    pending = true
    raf = window.requestAnimationFrame(() => {
      commit()
    })
  }

  const onScroll = () => scheduleUpdate()
  const onResize = () => scheduleUpdate()
  const onFocus = () => scheduleUpdate()
  const onBlur = () => scheduleUpdate()

  if (editorSurface) {
    editorSurface.addEventListener('scroll', onScroll, { passive: true })
  }
  window.addEventListener('resize', onResize)
  pmRoot.addEventListener('focus', onFocus)
  pmRoot.addEventListener('blur', onBlur)
  // Read-only intent capture for vertical wrap-boundary affinity (no preventDefault / no state change).
  pmRoot.addEventListener('keydown', noteNavigationIntent, true)
  pmRoot.addEventListener('pointerdown', notePointerIntent, true)

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
      pmRoot.removeEventListener('focus', onFocus)
      pmRoot.removeEventListener('blur', onBlur)
      pmRoot.removeEventListener('keydown', noteNavigationIntent, true)
      pmRoot.removeEventListener('pointerdown', notePointerIntent, true)
      overlay.destroy()
    },
  }
}
