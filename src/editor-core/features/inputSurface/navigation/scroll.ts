import type { EditorView } from '@tiptap/pm/view'
import { resolvePageUpDownScrollHost } from '../../pageUpDownNavigation'
import { copyRect, type CaretRect } from './caretGeometry'

/** prosemirror-viewの`scrollMargin`の既定値（`domcoords.ts`の`scrollRectIntoView`）。このアプリは`scrollMargin` propを登録していない。 */
export const PM_SCROLL_MARGIN = 5

/**
 * 1つの軸でscrollする量。`margin`がなければ従来のreveal（端に合わせる。Arrow・compositionstartが使う）。
 * `margin`があればPMの`scrollRectIntoView`と同じ規則: 見える範囲の外に出たときだけ動かし、そのとき`margin`を取る。
 * 見える範囲の中にある間は、端から`margin`未満でも動かさない。見える範囲より大きい矩形は先頭に合わせる。
 */
export function revealDelta(start: number, end: number, viewStart: number, viewEnd: number, margin?: number): number {
  if (margin === undefined) {
    if (start < viewStart) return start - viewStart
    if (end > viewEnd) return end - viewEnd
    return 0
  }
  if (start < viewStart) return -(viewStart - start + margin)
  if (end > viewEnd) return end - start > viewEnd - viewStart ? start + margin - viewStart : end - viewEnd + margin
  return 0
}

/**
 * caretを見える範囲へ出す。scrollした場合だけtrue。
 * `options.margin`を渡したときだけPMと同じ規則になる（`revealDelta`）。渡さない呼び出しは従来のまま。
 */
export function revealCaret(view: EditorView, rect: CaretRect | null, position = view.state.selection.head, options: { margin?: number } = {}): boolean {
  const host = resolvePageUpDownScrollHost(view)
  if (!host || !rect) return false
  const at = view.domAtPos(position)
  let element = at.node.nodeType === Node.ELEMENT_NODE ? at.node as HTMLElement : at.node.parentElement
  // DOMRect's coordinates are inherited accessors, not enumerable properties.
  let caret = copyRect(rect)
  let scrolled = false
  // Code blocks have their own overflow viewport. Reveal inward to outward and
  // carry the actual scroll delta into the next viewport's caret coordinates.
  const viewports: { element: HTMLElement; x: boolean; y: boolean; left: number; top: number; right: number; bottom: number; beforeX: number; beforeY: number }[] = []
  // Snapshot every viewport before the first scroll write. A descendant scroll
  // changes the caret, but not an ancestor viewport's border box.
  while (element) {
    const style = view.dom.ownerDocument.defaultView!.getComputedStyle(element)
    const x = element === host || /auto|scroll/.test(style.overflowX)
    const y = element === host || /auto|scroll/.test(style.overflowY)
    if (x || y) {
      const box = element.getBoundingClientRect(), left = box.left + element.clientLeft, top = box.top + element.clientTop
      const right = left + element.clientWidth, bottom = top + element.clientHeight
      const beforeX = element.scrollLeft, beforeY = element.scrollTop
      viewports.push({ element, x, y, left, top, right, bottom, beforeX, beforeY })
    }
    if (element === host) break
    element = element.parentElement
  }
  for (const { element, x, y, left, top, right, bottom, beforeX, beforeY } of viewports) {
    // 動かす量があるときだけ書く（同じ値の書き込みも、小数のscroll位置では丸めで動き得る）。
    const moveX = x ? revealDelta(caret.left, caret.right, left, right, options.margin) : 0
    const moveY = y ? revealDelta(caret.top, caret.bottom, top, bottom, options.margin) : 0
    if (moveX) element.scrollLeft += moveX
    if (moveY) element.scrollTop += moveY
    const dx = element.scrollLeft - beforeX, dy = element.scrollTop - beforeY
    if (dx || dy) scrolled = true
    caret = { left: caret.left - dx, right: caret.right - dx, top: caret.top - dy, bottom: caret.bottom - dy }
  }
  return scrolled
}
