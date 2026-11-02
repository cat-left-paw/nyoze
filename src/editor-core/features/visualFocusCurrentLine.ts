import { resolveCaretRectAtDomPoint } from './caretDomGeometry'
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
import { isInputSurfacePathActive } from './inputSurface/inputSurfaceGate'

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
  /**
   * 局所 contenteditable IME スロット PoC が active な間は current line 帯を隠す
   * (`docs/local-contenteditable-ime-poc-design-2026-07.md` §4.7)。
   * overlay が PM caret 位置の帯より上に来るため、帯だけが古い位置へ残るのを防ぐ。
   * geometry 実装自体は変更しない。
   */
  getIsLocalImeEditingActive?: () => boolean
}

/**
 * PIS-S10-CURRENT-LINE2 (a): 入力面で変換中の文字のcaretのDOMの位置。入力面が変換中で、文字があり、DOMの選択が
 * 入力面の中にあるときだけ返る。返ったときだけ、帯はその位置（利用者に見えている字とcaret）から、Hostと同じ読み取りで読む。
 * 変換中はPMのselectionが動かないので、これがないと、帯は変換を始めた行に残る。
 */
export type CompositionCaretDomPoint = { root: HTMLElement; node: Node; offset: number }
export type CompositionCaretSource = () => CompositionCaretDomPoint | null

export type VisualFocusCurrentLineControllerHandle = {
  scheduleUpdate: () => void
  /** 入力面の生成のときに1回渡す（破棄でnull）。帯のcontrollerは、入力面をselectorで探さない。 */
  setCompositionCaretSource: (source: CompositionCaretSource | null) => void
  /**
   * 入力面の表示の変化（変換中の文字・caretの変化）の通知。現在行の表示がONで、変換中のときだけ、
   * 既存の1つのrAFで帯を更新する。OFFのとき・変換中でないときは、何もしない。
   */
  noteInputSurfaceDisplayChange: () => void
  destroy: () => void
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
  return resolveVerticalAdjacentGlyphCenterXFromDomPoint(
    pmRoot,
    selection.anchorNode,
    selection.anchorOffset,
    caretY,
  )
}

/**
 * The adjacent-glyph read itself, for a DOM point (node, offset). The Host passes the DOM selection's
 * anchor; the input surface (PIS) passes the DOM point PM would write for its selection
 * (`resolveSelectionDomPointFromDocumentPosition`), so both go through the same computation.
 */
function resolveVerticalAdjacentGlyphCenterXFromDomPoint(
  pmRoot: HTMLElement,
  anchorNode: Node | null,
  anchorOffset: number,
  caretY: number,
): number | null {
  if (!(anchorNode instanceof Text) || !pmRoot.contains(anchorNode)) {
    return null
  }
  const textLength = anchorNode.data.length
  if (textLength <= 0) {
    return null
  }
  const offset = anchorOffset
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

/** `text`が、textblockの中の`contenteditable="false"`の要素（Rubyの読み・縦中横・付箋・画像など）の中にあるか。 */
function isInsideNonEditableInline(text: Text, textblock: HTMLElement): boolean {
  for (let el = text.parentElement; el && el !== textblock; el = el.parentElement) {
    if (el.getAttribute('contenteditable') === 'false') {
      return true
    }
  }
  return false
}

/**
 * PIS-S10-CURRENT-LINE2 (c): DOMの位置から「caretの隣の文字」（上の読み取り）が得られないときの、caretの列の中心。
 *
 * textblockの先頭・末尾や、隣り合う2つの間で、`contenteditable="false"`のinline（Ruby・縦中横・付箋・画像など）の隣に
 * caretがあると、DOMの位置はText nodeではなくtextblockの要素になる。そのとき、PMの位置からの予備
 * （`resolveVerticalAdjacentGlyphCenterXFromDocumentPosition`）は、Rubyの読みやmarkerの矩形を読むか、何も読めない。
 *
 * ここでは、同じtextblockの中で、DOMの順で隣の**本文の字**（`contenteditable="false"`の外のText nodeの、大きさのある字。
 * 位置より後ろの最初の字、次に、位置より前の最後の字）のうち、caretと同じ列にあるものの中心を返す。
 * nodeの種類の名前は見ない。得られなければnull（呼ぶ側は既存の予備へ進む）。読むだけで、DOM・Selectionは変えない。
 * HostはDOMの選択のanchor、入力面（PIS）はPMの位置から求めたDOMの位置を渡す（同じ関数）。
 */
function resolveVerticalNeighborBodyGlyphCenterX(
  textblock: HTMLElement,
  node: Node | null,
  offset: number,
  caretCenterX: number,
  fontSizePx: number,
): number | null {
  if (!node || !textblock.contains(node)) {
    return null
  }
  try {
    const doc = textblock.ownerDocument
    // 新しいRangeは潰れている。始点を置くと、終点も同じ位置になる。
    const point = doc.createRange()
    point.setStart(node, offset)
    // 本文のText node（文書の順）。`split`以降が位置より後ろ（位置を含むnodeは`split`で、`splitOffset`で分ける）。
    const texts: Text[] = []
    let split = -1
    let splitOffset = 0
    const walker = doc.createTreeWalker(textblock, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode() as Text | null; text; text = walker.nextNode() as Text | null) {
      if (text.data.length === 0 || isInsideNonEditableInline(text, textblock)) {
        continue
      }
      if (split < 0) {
        if (text === node) {
          split = texts.length
          splitOffset = Math.max(0, Math.min(offset, text.data.length))
        } else if (point.comparePoint(text, 0) > 0) {
          split = texts.length
        }
      }
      texts.push(text)
    }
    if (split < 0) {
      split = texts.length
    }
    const glyph = doc.createRange()
    const sizedRect = (text: Text, index: number): DOMRect | null => {
      glyph.setStart(text, index)
      glyph.setEnd(text, index + 1)
      const rect = glyph.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 ? rect : null
    }
    // 列の中心とcaretの細い矩形の中心の差は、行の送りと字の大きさの差の半分まで。隣の列の字は、字の大きさより遠い。
    const sameColumn = (rect: DOMRect): boolean =>
      Math.abs(rect.left + rect.width / 2 - caretCenterX) <= fontSizePx * 0.75
    let after: DOMRect | null = null
    for (let i = split; i < texts.length && !after; i += 1) {
      const text = texts[i]!
      for (let index = i === split ? splitOffset : 0; index < text.data.length && !after; index += 1) {
        after = sizedRect(text, index)
      }
    }
    if (after && sameColumn(after)) {
      return after.left + after.width / 2
    }
    let before: DOMRect | null = null
    for (let i = Math.min(split, texts.length - 1); i >= 0 && !before; i -= 1) {
      const text = texts[i]!
      for (let index = (i === split ? splitOffset : text.data.length) - 1; index >= 0 && !before; index -= 1) {
        before = sizedRect(text, index)
      }
    }
    if (before && sameColumn(before)) {
      return before.left + before.width / 2
    }
    return null
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

/**
 * PMのheadから、PMの`selectionToDOM`が書くDOMの位置（node・offset）を求める（端点の側: textblockの先頭だけ+1、それ以外は-1）。
 * HostのDOMの選択のanchorの代わりに、PIS（DOMの選択がHostの外）が、Hostと同じ読み取りへ渡す。DOMの選択・focusには触れない。
 */
function resolveSelectionDomPointFromDocumentPosition(
  view: EditorView,
  head: number,
): { node: Node; offset: number } | null {
  try {
    const $head = view.state.doc.resolve(head)
    return view.domAtPos(head, $head.parentOffset ? -1 : 1)
  } catch {
    return null
  }
}

/**
 * PIS（入力面がfocusを持ち、DOMの選択がHostの外にあるとき）の読み取り。HostのDOMの選択の代わりに、PMの位置
 * （`view.state.selection`のhead）から、切り離したcollapsedなRangeのrectを読む。PMの`selectionToDOM`と同じ端点の側
 * （textblockの先頭だけ+1、それ以外は-1）を使うので、HostのDOMの選択のRangeと同じrectになる。
 * HostのDOMの選択・focus・transactionには触れない。
 */
function resolveHorizontalCollapsedRectsFromDocumentPosition(
  view: EditorView,
  head: number,
): ReturnType<typeof collectValidLineRectsFromDomRectList> {
  const at = resolveSelectionDomPointFromDocumentPosition(view, head)
  return at ? resolveCollapsedRectsAtDomPoint(view.dom.ownerDocument, at.node, at.offset) : []
}

/** DOMの位置（node・offset）の、切り離したcollapsedなRangeのrect。DOMの選択・focusには触れない。 */
function resolveCollapsedRectsAtDomPoint(
  doc: Document,
  node: Node,
  offset: number,
): ReturnType<typeof collectValidLineRectsFromDomRectList> {
  try {
    const range = doc.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    return collectValidLineRectsFromDomRectList(range.getClientRects())
  } catch {
    return []
  }
}


export function createVisualFocusCurrentLineController(
  options: VisualFocusCurrentLineControllerOptions,
): VisualFocusCurrentLineControllerHandle {
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
  let compositionCaretSource: CompositionCaretSource | null = null

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
    if (options.getIsLocalImeEditingActive?.() === true) {
      overlay.setHidden(true)
      return
    }
    const state = view.state
    const composingNow = options.getIsComposing() || view.composing
    if (!state.selection.empty && !composingNow) {
      overlay.setHidden(true)
      return
    }
    // PIS-S10-CURRENT-LINE2: 入力の方式がPISで、PMの選択が範囲・AllSelectionのとき（入力面の変換は、選んだ文字へ重ねて
    // 表示される）は、変換中でも帯を出さない。HostのDOMで変換している間（PISの例外の経路）は、従来どおり。
    if (!state.selection.empty && isInputSurfacePathActive() && !view.composing) {
      overlay.setHidden(true)
      return
    }
    if (headInCodeBlock(state)) {
      overlay.setHidden(true)
      return
    }
    // PIS-S10-CURRENT-LINE1 REVIEWFIX1: headがinline contentの外（GapCursorなど）のとき、行の帯にならない。
    // HostもPISも意味のない小さな矩形を出していたので、NodeSelection・範囲と同じく帯を出さない。PMのstateだけで判定し、DOMを読む前に戻る。
    if (!state.selection.$head.parent.inlineContent) {
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
    const vertical = writingMode === 'vertical-rl' || writingMode === 'vertical-lr'
    // PIS-S10-CURRENT-LINE2 (a): 入力面で変換中は、変換中の文字のcaret（利用者に見えている字）の位置から読む。
    // caretの細い矩形が得られないときは、PMの位置（変換を始めた行）のまま。
    const compositionPoint = isInputSurfacePathActive() ? compositionCaretSource?.() ?? null : null
    const compositionCoords = compositionPoint
      ? resolveCaretRectAtDomPoint(compositionPoint.node, compositionPoint.offset, vertical)
      : null
    const compositionCaret = compositionCoords ? compositionPoint : null
    let coords: { left: number; top: number; right: number; bottom: number } | null = null
    try {
      coords = compositionCoords ?? view.coordsAtPos(head)
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

    // textblockの要素と、その場所のfont size（読むだけ）。下の読み取り（caretの隣の本文の字）と、帯の幅の両方で使う。
    const blockResolved = resolveViewportTextblockLineRect(view, head)
    const fontSizePx = resolveLocalEffectiveFontSizePx(
      win,
      blockResolved?.el ?? null,
      pmRoot,
    )
    // PIS-S10-CURRENT-LINE2 (c): DOMの位置がText nodeの中の字を指さないとき（textblockの端や、隣り合う2つの間で、
    // Ruby・縦中横・付箋・画像などの隣にcaretがある）の、同じtextblockの隣の本文の字の列の中心。
    // 「caretの隣の文字」の次・PMの位置からの予備の前に使う。HostもPISも、この同じ読み取りを通る。
    const caretStripCenterX = (coords.left + coords.right) / 2
    const neighborGlyphCenterX = (node: Node | null, offset: number): number | null =>
      blockResolved
        ? resolveVerticalNeighborBodyGlyphCenterX(blockResolved.el, node, offset, caretStripCenterX, fontSizePx)
        : null

    let clientRects: ReturnType<typeof collectValidLineRectsFromDomRectList> = []
    let adjacentGlyphCenterX: number | null = null
    try {
      const doc = pmRoot.ownerDocument ?? document
      const sel = doc.getSelection?.()
      const domSelectionInHost = Boolean(
        sel && sel.rangeCount > 0 && sel.anchorNode && pmRoot.contains(sel.anchorNode),
      )
      if (
        sel &&
        domSelectionInHost &&
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
            (sel.isCollapsed ? neighborGlyphCenterX(sel.anchorNode, sel.anchorOffset) : null) ??
            (!textblockMeta?.isEmpty
              ? resolveVerticalAdjacentGlyphCenterXFromDocumentPosition(view, head, caretY)
              : null)
        } else {
          clientRects = collectValidLineRectsFromDomRectList(range.getClientRects())
        }
      } else if (!domSelectionInHost && isInputSurfacePathActive()) {
        // PIS-S10-CURRENT-LINE1: 入力の方式がPISのとき、DOMの選択は入力面にある（Hostの外）。上の読み取りを通らず、
        // 帯が細いcaretの中心へ落ちて列の中心から外れ（B074・B075）、列の中心が無いので安定化の処理が旧文書の位置へ
        // 固定していた（B076）。PMの位置から同じ値を読む。focusの持ち主は問わない（toolbarのbuttonへfocusが移っても、
        // HostはDOMの選択がHostに残るので同じ読み取りになる）。DOMの選択・focusは動かさず、transactionも出さない。
        // 方式がPISでない起動（従来の入力）はこの枝に入らず、帯の読み取りは変わらない。
        if (compositionCaret) {
          // CURRENT-LINE2 (a): 変換中。入力面のcaretの位置を、Hostと同じ読み取りへ渡す（縦書きは「caretの隣の文字」、
          // 横書きはその位置のcollapsedなRange）。PISのための別の計算は持たない。
          if (vertical) {
            const caretY = (coords.top + coords.bottom) / 2
            adjacentGlyphCenterX = resolveVerticalAdjacentGlyphCenterXFromDomPoint(compositionCaret.root, compositionCaret.node, compositionCaret.offset, caretY)
          } else {
            clientRects = resolveCollapsedRectsAtDomPoint(doc, compositionCaret.node, compositionCaret.offset)
          }
        } else if (writingMode === 'vertical-rl' || writingMode === 'vertical-lr') {
          // Hostと同じ順・同じ計算: 先に「caretの隣の文字」（DOMの位置から。Rubyの親文字の末尾でも親文字の中の文字を読む）、
          // 次に同じtextblockの隣の本文の字（CURRENT-LINE2 (c)）、得られないときだけPMの位置からの予備。
          // PIS専用の別の計算は持たない（REVIEWFIX2）。
          const caretY = (coords.top + coords.bottom) / 2
          const domPoint = state.selection.empty
            ? resolveSelectionDomPointFromDocumentPosition(view, head)
            : null
          adjacentGlyphCenterX =
            (domPoint
              ? resolveVerticalAdjacentGlyphCenterXFromDomPoint(pmRoot, domPoint.node, domPoint.offset, caretY)
              : null) ??
            (domPoint ? neighborGlyphCenterX(domPoint.node, domPoint.offset) : null) ??
            (!textblockMeta?.isEmpty
              ? resolveVerticalAdjacentGlyphCenterXFromDocumentPosition(view, head, caretY)
              : null)
        } else {
          clientRects = resolveHorizontalCollapsedRectsFromDocumentPosition(view, head)
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
    setCompositionCaretSource(source) {
      compositionCaretSource = source
    },
    noteInputSurfaceDisplayChange() {
      if (options.getEnabled() && options.getIsComposing()) {
        scheduleUpdate()
      }
    },
    destroy() {
      destroyed = true
      compositionCaretSource = null
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
