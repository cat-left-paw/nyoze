import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { pickHorizontalWrapBoundaryRect, pickVerticalWrapBoundaryRect, synthesizeVerticalEmptyTextblockCaretCoords } from '../../pseudoCaretGeometry'
import type { SupportedEditorWritingMode } from '../../writingModeNavigationMapping'
import { isGapCursorPosition } from './gapCursorApi'
import { clampCrossExtent, inlineEdgeCaret, inlineEdgeNeighborOrder, inlineEdgeSource, planAtomWrapCandidates, type InlineEdgeNeighbor } from './inlineEdgeCaret'
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

/**
 * PIS-INLINE-EDGE-CARET1: 縦書きで、Rangeがどのsideでも矩形を返さない位置（文字と隣り合わない位置。ルビ・縦中横・画像などの前後）の
 * caret。`view.coordsAtPos()`は横書きの前提の値（部品の左端に立てた、部品の高さの縦線）で、縦書きの擬似キャレットの形（その中央）にすると、
 * 部品の中央に細く出る・幅も高さもない矩形で取れない。隣の部品（text以外のinline node）の矩形の端から、列の幅いっぱいのcaretを作る。
 * 隣は、text以外のinline node（Ruby・縦中横・画像など）と、前がtextでない位置の後ろのtext。先に試す側は、affinityが行末側なら前の末尾、それ以外は後ろの先頭。
 * 判断は`inlineEdgeCaret.ts`の純粋な関数。
 * 擬似キャレット・入力面の配置・navigationのすべての`purpose`で同じ。Rangeで矩形が取れる位置は、ここへ来ない。
 */
function readInlineEdgeCaretRect(view: EditorView, $pos: ResolvedPos, pos: number, affinity: NavigationAffinity): CaretRect | null {
  const doc = view.dom.ownerDocument
  const neighborRect = (neighbor: InlineEdgeNeighbor): CaretRect | null => {
    const node = neighbor === 'after' ? $pos.nodeAfter : $pos.nodeBefore
    const source = inlineEdgeSource(node, neighbor, neighbor === 'after' ? $pos.nodeBefore : $pos.nodeAfter)
    if (!node || !source) return null
    const nodePos = neighbor === 'after' ? pos : pos - node.nodeSize
    try {
      if (source === 'content' || source === 'text') {
        // 親文字の端（読み（rt）を含まない。既存のB13の予備と同じ読み方）、または後ろのtextの先頭のRange。
        const at = source === 'text' ? view.domAtPos(pos, 1)
          : neighbor === 'after' ? view.domAtPos(nodePos + 1, 1) : view.domAtPos(nodePos + node.nodeSize - 1, -1)
        const range = doc.createRange()
        range.setStart(at.node, at.offset)
        range.collapse(true)
        const rect = range.getBoundingClientRect()
        return validRect(rect) ? copyRect(rect) : null
      }
      const element = view.nodeDOM(nodePos) as Element | null
      const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      return rect && rect.width > 0 && rect.height > 0 ? copyRect(rect) : null
    } catch { return null }
  }
  for (const neighbor of inlineEdgeNeighborOrder(affinity)) {
    const rect = neighborRect(neighbor)
    if (rect) return inlineEdgeCaret(rect, neighbor, 'vertical-rl')
  }
  return null
}

/**
 * PIS-INLINE-ATOM-WRAP-NAV1: 折り返しの位置で、隣がinlineのatomのときの、行頭側・行末側の候補。
 * 字と字の間の折り返しでは、collapsed Rangeが2つの矩形（前の行の末尾・次の行の先頭）を返し、共有のpickerがaffinityで選べる。隣がatomだと、
 * Rangeは字の側の1つの矩形しか返さないので、atomの端のcaret（`inlineEdgeCaret()`。atomの要素の矩形）を足して、字の側の矩形と一緒にpickerへ
 * 渡す。足すかどうかは純粋な`planAtomWrapCandidates()`（隣がatomのときだけ）。pickerは変えない。同じ行の2つの候補を折り返しとみなさない判定
 * （`yGap`・`xGap`）はpickerの既存の条件に任せ、折り返しでなければ`null`（従来の経路がそのまま使われる）。
 * 擬似キャレット・入力面の配置・navigationのすべての`purpose`で同じ（sidesの順に依らない）。縦書き・横書きの両方。
 *
 * pickerの判定は、候補のblock方向の長さ（縦書きは幅、横書きは高さ）を「1行ぶん」の目安にする。列より幅の広い画像（縦書き）・行より高い画像
 * （横書き）は、その長さが目安を膨らませ、遠く離れた折り返しでも「同じ行」と判定されてしまう。そこで、pickerへ渡す判定用の矩形は、atomの
 * block方向の長さを、字の側の長さ（両側がatomのときは、小さい方）までに揃える（中心は変えない。inline方向の位置も変えない）。
 * 選ばれた候補として返すのは、揃える前の矩形（atomの要素の矩形の端）。
 */
type WrapCandidate = { real: CaretRect; forPick: CaretRect }
function readAtomWrapBoundaryCandidates(view: EditorView, $pos: ResolvedPos, pos: number, mode: SupportedEditorWritingMode): WrapCandidate[] | null {
  const plan = planAtomWrapCandidates($pos.nodeBefore, $pos.nodeAfter)
  if (!plan) return null
  const vertical = mode === 'vertical-rl'
  const cross = (r: CaretRect) => vertical ? r.right - r.left : r.bottom - r.top
  const text: CaretRect[] = [], atoms: CaretRect[] = []
  try {
    if (plan.text) {
      // 字の側の矩形: そのtextの、atomに近い端のcollapsed Range（前のtextは末尾、後ろのtextは先頭）。2つ返るときは字だけの折り返しなので触れない。
      const at = view.domAtPos(pos, plan.text === 'before' ? -1 : 1), range = view.dom.ownerDocument.createRange()
      if (at.node.nodeType !== Node.TEXT_NODE) return null
      range.setStart(at.node, at.offset)
      range.collapse(true)
      const found = Array.from(range.getClientRects()).filter(validRect)
      if (found.length !== 1) return null
      text.push(copyRect(found[0]))
    }
    for (const neighbor of plan.atoms) {
      const node = neighbor === 'after' ? $pos.nodeAfter : $pos.nodeBefore
      const element = view.nodeDOM(neighbor === 'after' ? pos : pos - node!.nodeSize) as Element | null
      const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (!rect || !(rect.width > 0 && rect.height > 0)) return null
      atoms.push(inlineEdgeCaret(rect, neighbor, mode))
    }
  } catch { return null }
  if (text.length + atoms.length < 2) return null
  // 判定用の「1行ぶん」: 字の側の長さ。なければ、atomの長さのうち小さい方。
  const reference = text.length ? cross(text[0]) : Math.min(...atoms.map(cross))
  const normalized = (r: CaretRect): CaretRect => clampCrossExtent(r, reference, mode)
  return [...text.map(real => ({ real, forPick: real })), ...atoms.map(real => ({ real, forPick: normalized(real) }))]
}

/** 候補（判定用の矩形）を共有のpickerへ渡し、選ばれた候補の元の矩形を返す。pickerが折り返しとみなさなければ`null`。 */
function pickAtomWrapCandidate(candidates: WrapCandidate[], mode: SupportedEditorWritingMode, affinity: NavigationAffinity, pointer?: { x: number; y: number }): CaretRect | null {
  const pick = mode === 'vertical-rl' ? pickVerticalWrapBoundaryRect : pickHorizontalWrapBoundaryRect
  const picked = pick({ rects: candidates.map(candidate => candidate.forPick), affinity, pointer })
  return candidates.find(candidate => candidate.forPick === picked)?.real ?? null
}

/** 折り返しの位置で、隣のatomの端のcaretが、字（または隣のatom）の側のcaretと別の行にあるとき、その行頭側・行末側の矩形。折り返しでなければ`null`。 */
export function atomWrapBoundary(view: EditorView, pos: number, mode: SupportedEditorWritingMode): { head: CaretRect; end: CaretRect } | null {
  const candidates = readAtomWrapBoundaryCandidates(view, view.state.doc.resolve(pos), pos, mode)
  if (!candidates) return null
  const head = pickAtomWrapCandidate(candidates, mode, 'head'), end = pickAtomWrapCandidate(candidates, mode, 'end')
  return head && end ? { head: copyRect(head), end: copyRect(end) } : null
}

/** Detached Ranges never touch the focused editing host's DOM Selection. */
export function readCaretRect(view: EditorView, pos: number, mode: SupportedEditorWritingMode, affinity: NavigationAffinity, pointer?: { x: number; y: number }, purpose?: 'pseudo-caret'): CaretRect | null {
  const doc = view.dom.ownerDocument
  // B13: Ruby / TCY直後は隣の文字のRangeを使い、Hostの小さな塊を再現しない。
  // それ以外はPMのselectionToDOMと同じ端点の側を保つ。
  const $pos = view.state.doc.resolve(pos)
  // textのRangeがない位置。矩形を得られないときは、下の既存の経路へ進まずnullを返す（無関係なnodeの矩形を使わない）。
  if (!$pos.parent.inlineContent && isGapCursorPosition($pos)) return readGapCaretRect(view, $pos, mode)
  // PIS-INLINE-ATOM-WRAP-NAV1: 折り返しの位置で隣がatomのとき、行頭側・行末側をaffinity（click後はpointer）で選ぶ。折り返しでなければ従来の経路。
  const atomWrap = readAtomWrapBoundaryCandidates(view, $pos, pos, mode)
  if (atomWrap) {
    const picked = pickAtomWrapCandidate(atomWrap, mode, affinity, pointer)
    if (picked) return copyRect(picked)
  }
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
    // 縦書きだけ。横書きの`coordsAtPos()`は、部品の端に立てた縦線で正しい。
    if (mode === 'vertical-rl') {
      const edge = readInlineEdgeCaretRect(view, $pos, pos, affinity)
      if (edge) return edge
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
