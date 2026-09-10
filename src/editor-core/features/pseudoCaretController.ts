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
import type { LocalImePostFlushFrameConsumer } from './localImePostFlushFrameState'
import type { LocalImePseudoCaretGeometrySource } from './localImePseudoCaretGeometrySource'
import {
  resolveLocalImeLocalWindowPseudoCaretGeometrySourceIdentity,
  resolveLocalImePseudoCaretGeometrySourceFocusRoot,
} from './localImePseudoCaretGeometrySource'

/**
 * CARET1: `.ProseMirror` 外で実 focus を持つ局所 IME slot の、表示専用 source。
 * 本文・PM position・composition payload は含めない。所有者は slot controller のまま、
 * pseudo caret controller はこの identity を検証して描画するだけに留める。
 */
export type PseudoCaretExternalGeometrySource = LocalImePseudoCaretGeometrySource

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
  /** CARET1: armed / composing の slot focus 中だけ使う外部 geometry source。 */
  getExternalGeometrySource?: () => PseudoCaretExternalGeometrySource | null
  /** PERF2b-2c1 の既存 shared frame への限定 join port。 */
  joinPostFlushFrame?: (
    consumer: LocalImePostFlushFrameConsumer,
  ) => (() => void) | null
}

export type PseudoCaretControllerHandle = {
  scheduleUpdate: () => void
  /** slot Arrow handoff など、PM keydown を経由しない経路向け。 */
  noteKeyboardNavigationIntent: (event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>) => void
  /**
   * slot pointer selection handoff など、`pmRoot` の pointerdown を経由しない経路向け。
   * soft-wrap 境界の rect 選択に使う viewport 点を記録する。
   */
  notePointerSelectionIntent: (point: PseudoCaretPointerPoint) => void
  /** flush 前に最後に安全な slot caret rect を 1 回だけ capture する。 */
  captureExternalGeometryForFlush: () => void
  /** guard reject / cancelでshared frameへ進まないcaptureを破棄する。 */
  discardExternalGeometryForFlush: () => void
  /** capture 済み rect を既存 post-flush frame の表示 consumer として反映する。 */
  schedulePostFlushExternalGeometry: () => void
  destroy: () => void
}

/** CARET1 post-flush rAF ownership のpure state。DOM / schedulerを持たない。 */
export type PseudoCaretPostFlushState = {
  pending: boolean
  postFlushExternalOwner: boolean
  hasExternalFlushPlan: boolean
}

export type PseudoCaretPostFlushEvent =
  | { type: 'capture' }
  | { type: 'captured-plan'; hasPlan: boolean }
  | { type: 'generic-request' }
  | { type: 'shared-write'; externalSourceAvailable: boolean }
  | { type: 'settle'; clearPlan: boolean }
  | { type: 'discard' }
  | { type: 'frame-commit' }

export type PseudoCaretPostFlushTransition = {
  state: PseudoCaretPostFlushState
  cancelPending: boolean
  scheduleFrame: boolean
  applyCapturedPlan: boolean
}

/**
 * CARET1のcapture → shared write → settle → final rAFを所有する最小pure transition。
 * `hasExternalFlushPlan`はDOM nodeやrectを持たないpresenceだけで、実planはcontroller内に
 * 留める。これによりpendingを立てずにframeを成功扱いにする経路を作らない。
 */
export function transitionPseudoCaretPostFlushState(
  state: PseudoCaretPostFlushState,
  event: PseudoCaretPostFlushEvent,
): PseudoCaretPostFlushTransition {
  switch (event.type) {
    case 'capture':
      return {
        state: { pending: false, postFlushExternalOwner: true, hasExternalFlushPlan: false },
        cancelPending: state.pending,
        scheduleFrame: false,
        applyCapturedPlan: false,
      }
    case 'captured-plan':
      return {
        state: { ...state, hasExternalFlushPlan: event.hasPlan },
        cancelPending: false,
        scheduleFrame: false,
        applyCapturedPlan: false,
      }
    case 'generic-request': {
      const scheduleFrame = !state.pending && !state.postFlushExternalOwner
      return {
        state: scheduleFrame ? { ...state, pending: true } : state,
        cancelPending: false,
        scheduleFrame,
        applyCapturedPlan: false,
      }
    }
    case 'shared-write':
      return {
        // shared writeの時点でcapture planは消費済みにする。同じconsumer writeが
        // 偶発的に再入しても旧slot rectを二重適用しない。実DOM planはsettleでのみ
        // identity照合して破棄するため、ここへDOM / generationを持ち込まない。
        state: { ...state, hasExternalFlushPlan: false },
        cancelPending: false,
        scheduleFrame: false,
        applyCapturedPlan: state.hasExternalFlushPlan && !event.externalSourceAvailable,
      }
    case 'settle':
      return {
        state: {
          ...state,
          postFlushExternalOwner: false,
          hasExternalFlushPlan: event.clearPlan ? false : state.hasExternalFlushPlan,
        },
        cancelPending: false,
        scheduleFrame: true,
        applyCapturedPlan: false,
      }
    case 'discard':
      return {
        state: { ...state, postFlushExternalOwner: false, hasExternalFlushPlan: false },
        cancelPending: false,
        scheduleFrame: false,
        applyCapturedPlan: false,
      }
    case 'frame-commit':
      return {
        state: { ...state, pending: false },
        cancelPending: false,
        scheduleFrame: false,
        applyCapturedPlan: false,
      }
  }
}

/** CARET1既存pure判定の互換wrapper。実controllerは上のstate transitionを正本にする。 */
export function evaluatePseudoCaretPostFlushSchedule(input: {
  pending: boolean
  postFlushExternalOwner: boolean
  event: 'capture' | 'generic-request' | 'settle' | 'discard'
}): { cancelPending: boolean; scheduleFrame: boolean; owner: boolean } {
  const event: PseudoCaretPostFlushEvent =
    input.event === 'capture'
      ? { type: 'capture' }
      : input.event === 'generic-request'
        ? { type: 'generic-request' }
        : input.event === 'settle'
          ? { type: 'settle', clearPlan: true }
          : { type: 'discard' }
  const result = transitionPseudoCaretPostFlushState(
    { pending: input.pending, postFlushExternalOwner: input.postFlushExternalOwner, hasExternalFlushPlan: false },
    event,
  )
  return {
    cancelPending: result.cancelPending,
    scheduleFrame: result.scheduleFrame,
    owner: result.state.postFlushExternalOwner,
  }
}

/** CARET1-V1-suspended: settle後のsource選択だけをDOMなしで固定する。 */
export function resolvePseudoCaretFinalSource(input: {
  externalSourceAvailable: boolean
  pmFocus: boolean
  pmCollapsedOrComposing: boolean
}): 'external' | 'pm' | 'hidden' {
  if (input.externalSourceAvailable) return 'external'
  return input.pmFocus && input.pmCollapsedOrComposing ? 'pm' : 'hidden'
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
  let postFlushState: PseudoCaretPostFlushState = {
    pending: false,
    postFlushExternalOwner: false,
    hasExternalFlushPlan: false,
  }
  let destroyed = false
  type ExternalFlushPlan = {
    generation: number
    documentIdentity: string
    shape: { left: number; top: number; width: number; height: number }
    orientation: PseudoCaretOrientation
  }
  let externalFlushPlan: ExternalFlushPlan | null = null

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
  const applyPointerSelectionIntent = (point: PseudoCaretPointerPoint) => {
    wrapAffinity = 'end'
    lastIntentWasPointer = true
    pointerViewportPoint = { x: point.x, y: point.y }
  }

  const notePointerIntent = (event: PointerEvent) => {
    applyPointerSelectionIntent({ x: event.clientX, y: event.clientY })
  }

  const hide = () => overlay.setHidden(true)

  // どの external source（slot / paragraph overlay）の DOM root を native-hidden に
  // したかを自前で追跡する。`getExternalGeometrySource()` は mode 遷移後 null を返す
  // ことがある（例: paragraph overlay の recovery-required）ため、clear 側を source の
  // 再解決に依存させない。こうすることで「geometry が無い状態で native caret だけ
  // 消える」ことを防ぎ、pseudo/native の切替を同じ validated state からだけ制御する。
  let nativeHiddenRoot: HTMLElement | null = null
  const setNativeHiddenRoot = (root: HTMLElement | null): void => {
    if (nativeHiddenRoot === root) return
    if (nativeHiddenRoot) nativeHiddenRoot.removeAttribute('data-nyoze-pseudo-caret-native-hidden')
    if (root) root.setAttribute('data-nyoze-pseudo-caret-native-hidden', 'true')
    nativeHiddenRoot = root
  }

  const clearNativeSlotCaret = () => {
    setNativeHiddenRoot(null)
  }

  const hideWithNativeSlotCaret = () => {
    clearNativeSlotCaret()
    hide()
  }

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

  /**
   * OVERLAY-CARET1: `root` を引数化し、host `pmRoot` と外部 source（slot /
   * paragraph overlay）の `focusRoot` の両方から同じ wrap-boundary affinity
   * 選択を再利用できるようにする。`wrapAffinity` / pointer intent は
   * controller instance 共有の状態で、host と外部 source を区別しない。
   */
  const resolveDomCaretViewportRect = (
    root: HTMLElement,
    composingNow: boolean,
    orientation: PseudoCaretOrientation,
  ): PseudoCaretCoords | null => {
    const doc = root.ownerDocument
    const sel = doc?.getSelection?.()
    if (!sel || sel.rangeCount === 0) {
      return null
    }
    const focusNode = sel.focusNode
    if (!focusNode || !root.contains(focusNode)) {
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

  /**
   * OVERLAY-ELIG1: 空 local paragraph の caret rect。
   *
   * Chromium は空 textblock の collapsed Range に client rect を返さないため、
   * `resolveDomCaretViewportRect()` はここで必ず `null` になる。その一点だけ、
   * ProseMirror が描く sole trailing `<br>` 自身の rect を使う（合成・近似・
   * `coordsAtPos()` を使わず、browser が返した実測値をそのまま渡す）。
   * anchor が無い / rect が degenerate なら caret を出さずに fail-closed する。
   */
  const resolveEmptyCaretAnchorViewportRect = (
    anchor: HTMLElement | null,
  ): PseudoCaretCoords | null => {
    if (!anchor) return null
    const rect = anchor.getBoundingClientRect()
    const coords = toCoords(rect)
    if (!isFinitePseudoCaretCoords(coords)) return null
    // 縦書きは高さ 0、横書きは幅 0 の caret line になるため、両軸 0 のときだけ捨てる。
    if (rect.width === 0 && rect.height === 0) return null
    return coords
  }

  const resolveExternalGeometry = (
    source: PseudoCaretExternalGeometrySource,
  ): ExternalFlushPlan | null => {
    if (source.surface !== surfaceResolved || !source.documentIdentity) {
      return null
    }
    // LOCAL-WINDOW-PSEUDOCARET1: local EditorView sourceは独立pure resolverが
    // kind / generation / document identity / DOM root の
    // identity / active かつ未破棄 / 実 focus 所有 / selection 有効性を exact に検証する。
    // 空 local paragraph だけ、DOM caret rect が存在しないので
    // ProseMirror 自身の trailing `<br>` の実 rect を使う。固定座標や隣接 paragraph の
    // geometry へは絶対に fallback しない。
    const identity = resolveLocalImeLocalWindowPseudoCaretGeometrySourceIdentity(source)
    if (!identity) return null
    const emptyCaretAnchor = identity.emptyCaretAnchor
    const focusRoot = identity.focusRoot
    const writingMode = identity.writingMode
    const generation = identity.generation
    const documentIdentity = identity.documentIdentity
    const composingNow = source.mode === 'composing'
    const orientation = resolvePseudoCaretOrientation(writingMode)
    // host branchと同じwrap-boundary affinity選択（同一controller instanceが
    // 保持するwrapAffinity / pointer intentを共有する）をLocal Windowの
    // focusRootにも再利用する。第二のshape計算は作らない。
    const coords =
      resolveDomCaretViewportRect(focusRoot, composingNow, orientation) ??
      resolveEmptyCaretAnchorViewportRect(emptyCaretAnchor)
    if (!coords) return null
    const rootRect = surfaceResolved.getBoundingClientRect()
    const shape = buildPseudoCaretShape({
      coords,
      surface: {
        left: rootRect.left,
        top: rootRect.top,
        scrollLeft: surfaceResolved.scrollLeft,
        scrollTop: surfaceResolved.scrollTop,
      },
      orientation,
      thickness: options.getThickness?.(),
    })
    if (!shape) return null
    return {
      generation,
      documentIdentity,
      shape,
      orientation,
    }
  }

  const applyExternalPlan = (
    plan: ExternalFlushPlan,
    source: PseudoCaretExternalGeometrySource | null,
  ): void => {
    overlay.setOrientation(plan.orientation)
    overlay.setPosition(plan.shape.left, plan.shape.top, plan.shape.width, plan.shape.height)
    overlay.setBlink(options.getBlinkEnabled?.() !== false)
    overlay.setHidden(false)
    // focus / DOM selection / composition は保持したまま、pilot の active slot の
    // native caret 色だけを透明化する。source が teardown 済みの flush plan は触らない。
    if (source?.generation === plan.generation && source.documentIdentity === plan.documentIdentity) {
      setNativeHiddenRoot(resolveLocalImePseudoCaretGeometrySourceFocusRoot(source))
    }
  }

  const commit = () => {
    postFlushState = transitionPseudoCaretPostFlushState(postFlushState, { type: 'frame-commit' }).state
    raf = 0
    // capture 後に残ったcallbackは、たとえ scheduler のcancelがraceした場合も
    // geometryを読まない。shared frameのsettleが唯一の復帰ownerである。
    if (postFlushState.postFlushExternalOwner) return
    if (destroyed) {
      return
    }
    if (!options.getEnabled()) {
      hideWithNativeSlotCaret()
      return
    }
    if (options.getIsSourceModeActive() || options.getIsParagraphPlainActive()) {
      hideWithNativeSlotCaret()
      return
    }
    // Windows native confirm のように activeElement を stale に残したまま document
    // focus だけを失う場合がある。pseudo caret は実 text-input owner の表示なので、
    // `view.hasFocus()` / Local Window proof だけではなく document focus も必須にする。
    const documentFocused = pmRoot.ownerDocument.hasFocus()
    const externalSource = documentFocused ? (options.getExternalGeometrySource?.() ?? null) : null
    const finalSource = resolvePseudoCaretFinalSource({
      externalSourceAvailable: externalSource !== null,
      pmFocus: documentFocused && view.hasFocus(),
      pmCollapsedOrComposing: view.state.selection.empty || options.getIsComposing() || view.composing,
    })
    if (finalSource === 'external' && externalSource) {
      const plan = resolveExternalGeometry(externalSource)
      if (!plan) {
        hideWithNativeSlotCaret()
        return
      }
      applyExternalPlan(plan, externalSource)
      return
    }
    // Focus lost → hide. Local slot focus has already been handled above.
    if (finalSource !== 'pm') {
      hideWithNativeSlotCaret()
      return
    }
    const state = view.state
    const composingNow = options.getIsComposing() || view.composing
    // Non-collapsed selection → hide, except while composing (the caret should keep following head).
    if (!state.selection.empty && !composingNow) {
      hideWithNativeSlotCaret()
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
    let caretRect = resolveDomCaretViewportRect(pmRoot, composingNow, orientation)
    if (!caretRect) {
      let coords: PseudoCaretCoords | null = null
      try {
        coords = view.coordsAtPos(head)
      } catch {
        hideWithNativeSlotCaret()
        return
      }
      if (!coords) {
        hideWithNativeSlotCaret()
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
      hideWithNativeSlotCaret()
      return
    }

    overlay.setOrientation(orientation)
    overlay.setPosition(shape.left, shape.top, shape.width, shape.height)
    overlay.setBlink(options.getBlinkEnabled?.() !== false)
    overlay.setHidden(false)
  }

  const scheduleUpdate = () => {
    if (destroyed) return
    const transition = transitionPseudoCaretPostFlushState(postFlushState, { type: 'generic-request' })
    postFlushState = transition.state
    if (!transition.scheduleFrame) {
      return
    }
    raf = window.requestAnimationFrame(() => {
      commit()
    })
  }

  const captureExternalGeometryForFlush = () => {
    if (destroyed || !options.getEnabled()) return
    const source = options.getExternalGeometrySource?.() ?? null
    if (!source) return
    const transition = transitionPseudoCaretPostFlushState(postFlushState, { type: 'capture' })
    postFlushState = transition.state
    // compositionupdate等で先に予約されたgeneric callbackを、ownership取得前に
    // 必ず除去する。cancel後もcallback guardが二重にgeometry readを塞ぐ。
    if (transition.cancelPending) {
      if (raf) window.cancelAnimationFrame(raf)
      raf = 0
    }
    externalFlushPlan = resolveExternalGeometry(source)
    postFlushState = transitionPseudoCaretPostFlushState(postFlushState, {
      type: 'captured-plan',
      hasPlan: externalFlushPlan !== null,
    }).state
  }

  const schedulePostFlushExternalGeometry = () => {
    if (destroyed || !postFlushState.hasExternalFlushPlan || !externalFlushPlan || !options.getEnabled()) {
      postFlushState = transitionPseudoCaretPostFlushState(postFlushState, { type: 'discard' }).state
      scheduleUpdate()
      return
    }
    const plan = externalFlushPlan
    const leave = options.joinPostFlushFrame?.({
      participant: 'pseudo-caret',
      // capture 済み plan を write phase へ渡すだけ。ここで layout read はしない。
      // re-arm が同じ frame の先行 write で新slotを作った場合、旧generationの rectを
      // 一瞬でも描かない。arm が既に予約した既存rAFだけに新slotのreadを委ねる。
      prepare: () => () => {
        const write = transitionPseudoCaretPostFlushState(postFlushState, {
          type: 'shared-write',
          externalSourceAvailable: Boolean(options.getExternalGeometrySource?.()),
        })
        postFlushState = write.state
        if (write.applyCapturedPlan) applyExternalPlan(plan, null)
      },
      settle: () => {
        const clearPlan = externalFlushPlan === plan
        if (clearPlan) externalFlushPlan = null
        const settle = transitionPseudoCaretPostFlushState(postFlushState, {
          type: 'settle',
          clearPlan,
        })
        postFlushState = settle.state
        // shared write終了後にだけ、現在source（rearmed slot / suspended PM）を
        // 次frameで再評価する。capture中のgeneric rAFには依存しない。
        if (settle.scheduleFrame) scheduleUpdate()
      },
    })
    if (!leave) {
      postFlushState = transitionPseudoCaretPostFlushState(postFlushState, { type: 'discard' }).state
      scheduleUpdate()
    }
  }

  const discardExternalGeometryForFlush = () => {
    externalFlushPlan = null
    postFlushState = transitionPseudoCaretPostFlushState(postFlushState, { type: 'discard' }).state
  }

  const onScroll = () => scheduleUpdate()
  const onResize = () => scheduleUpdate()
  const onFocus = () => scheduleUpdate()
  const onBlur = () => scheduleUpdate()

  if (editorSurface) {
    editorSurface.addEventListener('scroll', onScroll, { passive: true })
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', onFocus)
  window.addEventListener('blur', onBlur)
  pmRoot.addEventListener('focus', onFocus)
  pmRoot.addEventListener('blur', onBlur)
  // Read-only intent capture for vertical wrap-boundary affinity (no preventDefault / no state change).
  pmRoot.addEventListener('keydown', noteNavigationIntent, true)
  pmRoot.addEventListener('pointerdown', notePointerIntent, true)

  return {
    scheduleUpdate,
    /** slot Arrow handoff など、PM keydown を経由しない経路向け。 */
    noteKeyboardNavigationIntent: (event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>) => {
      noteNavigationIntent(event as KeyboardEvent)
    },
    notePointerSelectionIntent: (point) => {
      applyPointerSelectionIntent(point)
    },
    captureExternalGeometryForFlush,
    discardExternalGeometryForFlush,
    schedulePostFlushExternalGeometry,
    destroy() {
      destroyed = true
      if (raf) {
        window.cancelAnimationFrame(raf)
        raf = 0
      }
      externalFlushPlan = null
      postFlushState = { pending: false, postFlushExternalOwner: false, hasExternalFlushPlan: false }
      clearNativeSlotCaret()
      if (editorSurface) {
        editorSurface.removeEventListener('scroll', onScroll)
      }
      window.removeEventListener('resize', onResize)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      pmRoot.removeEventListener('focus', onFocus)
      pmRoot.removeEventListener('blur', onBlur)
      pmRoot.removeEventListener('keydown', noteNavigationIntent, true)
      pmRoot.removeEventListener('pointerdown', notePointerIntent, true)
      overlay.destroy()
    },
  }
}
