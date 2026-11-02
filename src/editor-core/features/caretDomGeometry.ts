/**
 * PIS-S10-CURRENT-LINE2 (a): DOMの位置（node・offset）のcaretの細い矩形（Hostの`view.coordsAtPos(head)`に当たる）。
 * 切り離したcollapsedなRangeの矩形を読む。折り返しの境界で2つ返るときは、後ろ側（次の行の先頭。「caretの隣の文字」の
 * 読み取りが途中の位置で直後の字を読むのと同じ側）。矩形が得られないときは、隣の字の端。読むだけ。
 */
export function resolveCaretRectAtDomPoint(
  node: Node,
  offset: number,
  vertical: boolean,
): { left: number; top: number; right: number; bottom: number } | null {
  try {
    const doc = node.ownerDocument
    if (!doc) {
      return null
    }
    const range = doc.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const rects = range.getClientRects()
    const rect = rects.length > 0 ? rects[rects.length - 1]! : range.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
    }
    if (!(node instanceof Text) || node.data.length === 0) {
      return null
    }
    const atEnd = offset >= node.data.length
    const index = atEnd ? node.data.length - 1 : offset
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    const glyph = range.getBoundingClientRect()
    if (glyph.width <= 0 && glyph.height <= 0) {
      return null
    }
    if (vertical) {
      const y = atEnd ? glyph.bottom : glyph.top
      return { left: glyph.left, right: glyph.right, top: y, bottom: y }
    }
    const x = atEnd ? glyph.right : glyph.left
    return { left: x, right: x, top: glyph.top, bottom: glyph.bottom }
  } catch {
    return null
  }
}

