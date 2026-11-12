import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type Selection } from '@tiptap/pm/state'
import type { SupportedEditorWritingMode } from '../../writingModeNavigationMapping'

/**
 * PIS-INLINE-ATOM-NAV1: inlineのatom（縦中横・画像・inline HTML・付箋のマーカーなど）の前後へ、移動とclickで着くための、純粋な判断。
 * DOMの読み取りは`lineGeometry.ts`（候補）と`pointerAtomClick.ts`（click）が持つ。判定はPMのnodeの事実（text・inline・atom）だけで、
 * nodeの種類の名前では分けない。
 */
export type InlineAtomRange = { from: number; to: number }
type Rect = { left: number; right: number; top: number; bottom: number }

/** text以外のinline node（`isAtom`）。縦中横は中身のtextを持つatom、画像・改行・付箋のマーカーは中身のないatom。 */
export const isInlineAtomNode = (node: PMNode | null | undefined): node is PMNode => !!node && node.isInline && !node.isText && node.isAtom

/** 位置がinlineのatomの中（親がatom）か。atomの中の位置へは、どの移動・clickでも着かせない。 */
export const isInsideInlineAtom = (parent: PMNode): boolean => parent.isAtom

/** textblockの直下のinline atomの範囲（文書の順）。`blockStart`は、そのtextblockの中身の先頭の位置。 */
export function inlineAtomRanges(block: PMNode, blockStart: number): InlineAtomRange[] {
  const out: InlineAtomRange[] = []
  block.forEach((child, offset) => {
    if (isInlineAtomNode(child)) out.push({ from: blockStart + offset, to: blockStart + offset + child.nodeSize })
  })
  return out
}

/**
 * 縦書きの文字の軸で、縦中横の隣から縦中横を越えるときの着地点。進むときは後ろ、戻るときは前（対称）。
 * 横書きは`NodeSelection`を経る既存の規則で、ここでは扱わない。
 */
export function verticalTcyCharacterTarget(forward: boolean, pos: number, nodeSize: number): number {
  return forward ? pos + nodeSize : pos - nodeSize
}

/**
 * 既存の規則（Rubyの境界のArrow）が返したselectionの端点が、inlineのatomの中（縦中横の字の前）にあるとき、atomの外へ出す。
 * Rubyの親文字の末尾から進むとき、既存の規則は「Rubyの直後の1書記素ぶん」進むが、直後が縦中横だと、その中へ入ってしまう。
 * 進むときはatomの後ろ、戻るときはatomの前。atomの中でなければ、そのまま返す。規則そのもの（`rubyBoundaryArrowNavigation.ts`）は変えない。
 */
export function keepSelectionOutsideInlineAtom(selection: Selection, forward: boolean): Selection {
  if (!(selection instanceof TextSelection) || !selection.empty) return selection
  const $head = selection.$head
  if ($head.depth === 0 || !isInsideInlineAtom($head.parent)) return selection
  return TextSelection.create($head.doc, forward ? $head.after() : $head.before())
}

/**
 * 位置がinlineのatomの中（親がatom）にあるとき、atomの外の端へ出す（進む向きは後ろ、戻る向きは前）。atomの中でなければそのまま返す。
 * Rubyを起点にした表示の行の端（`resolveRubyAwareVisualLineEdge`。Hostと共有）は、位置ごとの座標を走査して決めるので、
 * 行にatomがあると、その中の位置を返すことがある。規則そのもの（`rubyHomeEndVisualEdge.ts`）は変えない。
 */
export function keepPositionOutsideInlineAtom(doc: PMNode, pos: number, forward: boolean): number {
  const $pos = doc.resolve(pos)
  if ($pos.depth === 0 || !isInsideInlineAtom($pos.parent)) return pos
  return forward ? $pos.after() : $pos.before()
}

/** 改行（hardBreak）か。PMのschemaが改行の置き換えとして宣言したnode（`NodeSpec.linebreakReplacement`）。nodeの種類の名前では判定しない。 */
export const isLineBreakNode = (node: PMNode | null | undefined): boolean => !!node && node.type === node.type.schema.linebreakReplacement

/**
 * atomが、構造上の行頭・行末にあるか（textblockの中での位置。折り返しの位置は見ない）。
 * 行頭: atomの前に何もない（textblockの先頭）か、直前のnodeが改行。行末: atomの後ろに何もないか、直後のnodeが改行。
 */
export function atomLineEdges(doc: PMNode, range: InlineAtomRange): { atLineStart: boolean; atLineEnd: boolean } {
  const before = doc.resolve(range.from).nodeBefore, after = doc.resolve(range.to).nodeAfter
  return { atLineStart: !before || isLineBreakNode(before), atLineEnd: !after || isLineBreakNode(after) }
}

export type AtomClickBox = InlineAtomRange & {
  rect: Rect
  /** atomが構造上の行頭にある（`atomLineEdges()`）。省略はfalse。 */
  atLineStart?: boolean
  /** atomが構造上の行末にある。省略はfalse。 */
  atLineEnd?: boolean
}
export type AtomClickInput = {
  mode: SupportedEditorWritingMode
  /** collapsedなTextSelectionの位置。 */
  head: number
  /** headがatomの中にあるとき、そのatom。 */
  inside: AtomClickBox | null
  /** headの直前にあるatom（`to === head`）。 */
  before: AtomClickBox | null
  /** headの直後にあるatom（`from === head`）。 */
  after: AtomClickBox | null
  pointer: { x: number; y: number }
}

const inlineRange = (rect: Rect, mode: SupportedEditorWritingMode): [number, number] => mode === 'vertical-rl' ? [rect.top, rect.bottom] : [rect.left, rect.right]
const blockRange = (rect: Rect, mode: SupportedEditorWritingMode): [number, number] => mode === 'vertical-rl' ? [rect.left, rect.right] : [rect.top, rect.bottom]
const inlinePointer = (pointer: { x: number; y: number }, mode: SupportedEditorWritingMode) => mode === 'vertical-rl' ? pointer.y : pointer.x
const blockPointer = (pointer: { x: number; y: number }, mode: SupportedEditorWritingMode) => mode === 'vertical-rl' ? pointer.x : pointer.y

/**
 * PIS-INLINE-ATOM-WRAP-NAV1: 構造上の行頭・行末でないatom（`atLineStart` / `atLineEnd`が立たない）が、折り返しで行頭・行末に来ているかを、
 * DOMで調べる必要があるか。pointerがatomの列（縦書き）・行（横書き）の中で、atomのinline方向の先頭の端より前（`start`）、または末尾の端より
 * 後ろ（`end`）にあるときだけ。規則2（行頭・行末の外側の余白）が、その旗で結果を変える場面だけ読む（clickごとのDOMの読み取りを増やさない）。
 */
export function needsWrapEdgeProbe(rect: Rect, mode: SupportedEditorWritingMode, pointer: { x: number; y: number }, side: 'start' | 'end'): boolean {
  const [low, high] = blockRange(rect, mode), cross = blockPointer(pointer, mode)
  if (cross < low || cross > high) return false
  const [start, end] = inlineRange(rect, mode), point = inlinePointer(pointer, mode)
  return side === 'start' ? point < start : point > end
}

/**
 * clickの後の、inlineのatomの前後のcaretの補正。補正する場面は次の1〜3だけ（0は補正しない場面）で、それ以外は`null`（そのまま）。
 * 0. pointerがhead隣のatom自身の上にあるときは補正しない（PMのclickの処理が`NodeSelection`にする）。
 * 1. headがatomの中: atomのinline方向の中点と比べ、近い方の端（前・後ろ）。atomの中には、どのclickでも着かせない。
 * 2. headがatomAの直後（A = `nodeBefore`）で、Aが構造上の行頭（Aの前に何もない、または直前が改行）にあり、pointerがAの列（縦書き）・
 *    行（横書き）の中で、Aのinline方向の先頭の端より前にある: Aの前へ（距離は問わない）。対称に、headがAの直前（A = `nodeAfter`）で、Aが
 *    構造上の行末にあり、pointerがAの列・行の中で、Aの末尾の端より後ろにある: Aの後ろへ。行頭（行末）の外側には、atomの隣しか
 *    caretを置ける場所がなく、Chromiumのhit testがatomの反対側を返す（縦中横の上の余白を、後ろの位置として返す）ため。
 *    折り返しの位置で行頭に来たatomは、構造上の行頭ではないので対象外。
 * 3. headがatomの直後（直前）で、pointerがそのatomのinline方向の中点より前（後ろ）にあり、atomの列（縦書き）・行（横書き）の範囲にあり、
 *    かつそのatomの近く（inline方向で、atomの範囲を、atomの長さの半分だけ広げた範囲）にある: 近い方の端。
 *    Chromiumのhit testが、縦中横の上の余白・上半分を、後ろの位置として返す場面を直す。atomから離れた場所（行の外・別のatomの余白）の
 *    clickは、hit testの結果をそのままにする（離れたatomへcaretを引き寄せない）。
 * 直後を先に見る。atomが隣り合うときは、pointerが属するatomの規則だけが当たる。
 */
export function resolveInlineAtomClickCorrection(input: AtomClickInput): number | null {
  const { mode, pointer } = input
  const point = inlinePointer(pointer, mode)
  // pointerがatom自身の上にあるclickは補正しない: atomを押したclickは、PMのclickの処理がatomの`NodeSelection`にする（縦中横・画像・
  // inline HTML・付箋のマーカーで確かめた。補正しても、その後に置き換えられるだけで、選択だけのtransactionが1つ増える）。
  const onAtom = (box: AtomClickBox | null) => {
    if (!box) return false
    const [start, end] = inlineRange(box.rect, mode), [low, high] = blockRange(box.rect, mode), cross = blockPointer(pointer, mode)
    return point >= start && point <= end && cross >= low && cross <= high
  }
  if (onAtom(input.inside) || onAtom(input.before) || onAtom(input.after)) return null
  if (input.inside) {
    const [start, end] = inlineRange(input.inside.rect, mode)
    return point < (start + end) / 2 ? input.inside.from : input.inside.to
  }
  const inColumn = (box: AtomClickBox) => {
    const [low, high] = blockRange(box.rect, mode), cross = blockPointer(pointer, mode)
    return cross >= low && cross <= high
  }
  if (input.before?.atLineStart && inColumn(input.before) && point < inlineRange(input.before.rect, mode)[0]) return input.before.from
  if (input.after?.atLineEnd && inColumn(input.after) && point > inlineRange(input.after.rect, mode)[1]) return input.after.to
  const isNear = (box: AtomClickBox) => {
    const [low, high] = blockRange(box.rect, mode), cross = blockPointer(pointer, mode)
    if (cross < low || cross > high) return false
    const [start, end] = inlineRange(box.rect, mode), slack = (end - start) / 2
    return point >= start - slack && point <= end + slack
  }
  if (input.before && isNear(input.before)) {
    const [start, end] = inlineRange(input.before.rect, mode)
    if (point < (start + end) / 2) return input.before.from
  }
  if (input.after && isNear(input.after)) {
    const [start, end] = inlineRange(input.after.rect, mode)
    if (point > (start + end) / 2) return input.after.to
  }
  return null
}
