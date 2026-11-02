import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { pickHorizontalWrapBoundaryRect, pickVerticalWrapBoundaryRect, synthesizeVerticalEmptyTextblockCaretCoords } from '../../pseudoCaretGeometry'
import type { SupportedEditorWritingMode } from '../../writingModeNavigationMapping'
import { isGapCursorPosition } from './gapCursorApi'
import type { NavigationAffinity } from './rules'

export type CaretRect = { left: number; right: number; top: number; bottom: number }
export const copyRect = (r: CaretRect): CaretRect => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })
export const validRect = (r: CaretRect) => Object.values(copyRect(r)).every(Number.isFinite) && (r.right > r.left || r.bottom > r.top)
export const blockCenter = (r: CaretRect, mode: SupportedEditorWritingMode) => mode === 'vertical-rl' ? (r.left + r.right) / 2 : (r.top + r.bottom) / 2
export const inlineStart = (r: CaretRect, mode: SupportedEditorWritingMode) => mode === 'vertical-rl' ? r.top : r.left

/**
 * PIS-S10-CODEBLOCK-CARET1: textblockの末尾で、textが改行の字で終わる位置（code blockの末尾の空の行）。collapsed Rangeは矩形を
 * 返さないので、PMがその空の行に置くtrailing break（`br.ProseMirror-trailingBreak`）の矩形を使う。縦書きは列の幅×0、横書きは
 * 0×行の高さで、改行の字の補いと同じ形の細い矩形になる。条件はPMのDocとDOMの事実だけで、nodeの種類の名前では分けない。
 * trailing breakが見つからなければ空を返し、次の経路へ進む（無関係な要素の矩形を使わない）。
 */
function readTrailingBreakRects(view: EditorView, $pos: ResolvedPos): DOMRect[] {
  const before = $pos.nodeBefore
  if (!before?.isText || !before.text?.endsWith('\n') || $pos.parentOffset !== $pos.parent.content.size) return []
  const at = view.domAtPos($pos.pos, 1), br = at.node.childNodes[at.offset] as Element | undefined
  if (br?.nodeName !== 'BR' || !br.classList.contains('ProseMirror-trailingBreak')) return []
  return Array.from(br.getClientRects()).filter(validRect)
}

/**
 * GapCursor（blockのatomの前・間。親がtextblockでない位置）のcaret。textのRangeがないので、隣のnodeのDOMの矩形から作る。
 * 新しい段落が入る位置（隣のnodeとの境）を、1行分のcaretで返す: inline方向は隣のnodeの先頭、block方向は境を中心にする。
 * HostのPMのwidget（`.ProseMirror-gapcursor`）は、Hostがfocusを持つときだけ表示されるので使わない（styleを変えない）。
 */
function readGapCaretRect(view: EditorView, $pos: ResolvedPos, mode: SupportedEditorWritingMode): CaretRect | null {
  const rectOf = (node: Node | null) => {
    const element = node as Element | null
    if (!element?.getClientRects?.().length) return null
    const rect = element.getBoundingClientRect()
    return Object.values(copyRect(rect)).every(Number.isFinite) ? copyRect(rect) : null
  }
  const after = $pos.nodeAfter ? rectOf(view.nodeDOM($pos.pos)) : null
  const before = $pos.nodeBefore ? rectOf(view.nodeDOM($pos.pos - $pos.nodeBefore.nodeSize)) : null
  const anchor = after ?? before
  if (!anchor) return null
  const style = view.dom.ownerDocument.defaultView!.getComputedStyle(view.dom)
  const fontSize = parseFloat(style.fontSize), lineHeight = parseFloat(style.lineHeight)
  const size = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : (Number.isFinite(fontSize) ? fontSize : 16) * 1.6
  if (mode === 'vertical-rl') {
    // block方向は右から左。afterのblock先頭は右端、beforeのblock末尾は左端。
    const edge = after && before ? (after.right + before.left) / 2 : after ? after.right : before!.left
    return { left: edge - size / 2, right: edge + size / 2, top: anchor.top, bottom: anchor.top }
  }
  const edge = after && before ? (after.top + before.bottom) / 2 : after ? after.top : before!.bottom
  return { left: anchor.left, right: anchor.left, top: edge - size / 2, bottom: edge + size / 2 }
}

/** Detached Ranges never touch the focused editing host's DOM Selection. */
export function readCaretRect(view: EditorView, pos: number, mode: SupportedEditorWritingMode, affinity: NavigationAffinity, pointer?: { x: number; y: number }, purpose?: 'pseudo-caret'): CaretRect | null {
  const doc = view.dom.ownerDocument
  // B13: Ruby / TCY直後は隣の文字のRangeを使い、Hostの小さな塊を再現しない。
  // それ以外はPMのselectionToDOMと同じ端点の側を保つ。
  const $pos = view.state.doc.resolve(pos)
  // textのRangeがない位置。矩形を得られないときは、下の既存の経路へ進まずnullを返す（無関係なnodeの矩形を使わない）。
  if (!$pos.parent.inlineContent && isGapCursorPosition($pos)) return readGapCaretRect(view, $pos, mode)
  const afterSpecialInline = ['aozoraRuby', 'aozoraTcy'].includes($pos.nodeBefore?.type.name ?? '')
  const sides = purpose === 'pseudo-caret'
    ? afterSpecialInline ? [1, 0, -1] : [$pos.parentOffset ? -1 : 1] : [0, 1, -1]
  for (const side of sides) {
    try {
      const at = view.domAtPos(pos, side), range = doc.createRange()
      range.setStart(at.node, at.offset)
      range.collapse(true)
      let rects = Array.from(range.getClientRects()).filter(validRect)
      // Chromium gives a zero-by-zero collapsed Range on an empty preformatted
      // line. Its newline Range still has the glyph's block-axis extent.
      if (!rects.length && at.node.nodeType === Node.TEXT_NODE && at.node.textContent?.[at.offset] === '\n') {
        range.setEnd(at.node, at.offset + 1)
        rects = Array.from(range.getClientRects()).filter(validRect)
      }
      if (!rects.length) rects = readTrailingBreakRects(view, $pos)
      if (!rects.length) continue
      const pick = mode === 'vertical-rl' ? pickVerticalWrapBoundaryRect : pickHorizontalWrapBoundaryRect
      return pick({ rects, affinity, pointer }) ?? copyRect(rects[0])
    } catch { /* Element boundaries can have no rendered caret. Try the other side. */ }
  }
  if (purpose === 'pseudo-caret' && $pos.nodeBefore?.type.name === 'aozoraRuby') {
    // 文末で次のtextがないときも、親文字末尾のRangeなら読みを含まず通常の軸を持つ。
    try {
      const at = view.domAtPos(pos - 1, -1), range = doc.createRange()
      range.setStart(at.node, at.offset); range.collapse(true)
      const rect = range.getBoundingClientRect()
      if (validRect(rect)) return copyRect(rect)
    } catch { /* empty Ruby has no glyph */ }
  }
  try {
    const coords = view.coordsAtPos(pos), $pos = view.state.doc.resolve(pos)
    // An image-only paragraph has no text Range at either endpoint. Use the
    // existing inline atom's rendered box, without manufacturing a PM offset.
    // PMではtext nodeも`isAtom`なので外す。nodeDOMがElementでなければ矩形を読まない（TypeErrorで全体をnullにしない）。
    const inlineAtom = (node: PMNode | null | undefined) => !!node && node.isAtom && node.isInline && !node.isText
    const atom = inlineAtom($pos.nodeBefore) ? { node: $pos.nodeBefore!, pos: pos - $pos.nodeBefore!.nodeSize, after: true }
      : inlineAtom($pos.nodeAfter) ? { node: $pos.nodeAfter!, pos, after: false } : null
    if (atom && (purpose !== 'pseudo-caret' || afterSpecialInline)) {
      const element = view.nodeDOM(atom.pos) as Element | null
      const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (rect && rect.width > 0 && rect.height > 0) {
        if (mode === 'vertical-rl') { const edge = atom.after ? rect.bottom : rect.top; return { left: rect.left, right: rect.right, top: edge, bottom: edge } }
        const edge = atom.after ? rect.right : rect.left
        return { left: edge, right: edge, top: rect.top, bottom: rect.bottom }
      }
    }
    if (mode === 'vertical-rl' && $pos.parent.isTextblock && !$pos.parent.content.size) {
      const element = view.nodeDOM($pos.before()) as HTMLElement | null
      if (element) return synthesizeVerticalEmptyTextblockCaretCoords({
        coordsAtPos: coords, textblockRect: element.getBoundingClientRect(),
        fontSizePx: parseFloat(doc.defaultView!.getComputedStyle(element).fontSize),
      }) ?? coords
    }
    return (purpose === 'pseudo-caret' ? Object.values(copyRect(coords)).every(Number.isFinite) : validRect(coords)) ? copyRect(coords) : null
  } catch { return null }
}
