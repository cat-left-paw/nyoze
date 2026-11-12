import type { Node as PMNode } from '@tiptap/pm/model'
import type { SupportedEditorWritingMode } from '../../writingModeNavigationMapping'
import { isInlineAtomNode, isLineBreakNode } from './inlineAtomNavigation'
import type { NavigationAffinity } from './rules'

type EdgeRect = { left: number; right: number; top: number; bottom: number }

/**
 * PIS-INLINE-EDGE-CARET1: 縦書きで、Rangeがどのsideでも矩形を返さない位置（ルビ・縦中横・画像などの文字でない部品の前後）の
 * caretを、隣の部品の矩形の端から作るための、純粋な判断。`caretGeometry.ts`の`readInlineEdgeCaretRect()`が、DOMの読み取りだけを持つ。
 *
 * 「後ろの部品の先頭の端」（`after`）と「前の部品の末尾の端」（`before`）の2つが候補で、affinityが行末側（`end`）のときだけ
 * 前を先に、それ以外は後ろを先にする（折り返しの位置で、次の行の先頭にcaretを出す側が既定）。
 */
export type InlineEdgeNeighbor = 'after' | 'before'

export function inlineEdgeNeighborOrder(affinity: NavigationAffinity): readonly [InlineEdgeNeighbor, InlineEdgeNeighbor] {
  return affinity === 'end' ? ['before', 'after'] : ['after', 'before']
}

/**
 * 隣の矩形の読み方。判定はPMのnodeの事実（text・inline・atom・中身）だけで、nodeの種類の名前では分けない。
 * - `content`: 中身にtextを持つnode（Ruby）。親文字の端のcollapsed Range（読みを含まない）。
 * - `box`: atom（縦中横・画像・inline HTML・付箋のマーカーなど）。nodeのDOMの要素の矩形。
 * - `text`: 後ろ（`after`）のtext。その位置のcollapsed Range（text nodeの先頭）。**前（`opposite`）がtextでないときだけ**。
 *   前もtextの位置（同じtext nodeの中。構文の色分けのspanの境や、改行の直後など、DOMだけが分かれている位置）は、
 *   文字と隣り合う位置なので、この予備の対象ではない（従来どおり`coordsAtPos()`）。前のtextは使わない。
 * 中身のないnode（空のRuby）と、前のtext・前もtextの後ろのtextは、nullを返し、次の候補へ進む。
 */
export type InlineEdgeSource = 'content' | 'box' | 'text'

export function inlineEdgeSource(node: PMNode | null | undefined, neighbor: InlineEdgeNeighbor, opposite?: PMNode | null): InlineEdgeSource | null {
  if (!node || !node.isInline) return null
  if (node.isText) return neighbor === 'after' && !opposite?.isText ? 'text' : null
  if (node.isAtom) return 'box'
  return node.content.size > 0 ? 'content' : null
}

/**
 * 隣の部品の矩形から、その端のcaretを作る。block方向は部品の列（縦書きはleft〜right、横書きはtop〜bottom）の全体、
 * inline方向は端の1点（縦書きは後ろの部品なら上端`top`・前の部品なら下端`bottom`。横書きは左端`left`・右端`right`）。
 */
export function inlineEdgeCaret(rect: EdgeRect, neighbor: InlineEdgeNeighbor, mode: SupportedEditorWritingMode): EdgeRect {
  if (mode === 'vertical-rl') {
    const edge = neighbor === 'after' ? rect.top : rect.bottom
    return { left: rect.left, right: rect.right, top: edge, bottom: edge }
  }
  const edge = neighbor === 'after' ? rect.left : rect.right
  return { left: edge, right: edge, top: rect.top, bottom: rect.bottom }
}

/**
 * PIS-INLINE-ATOM-WRAP-NAV1: 折り返しの位置で、隣がinlineのatomのときの、2つ目のcaretの候補（atomの端）を作るための、純粋な判断。
 *
 * 折り返しの位置は、文書の1つの位置が、画面では2か所に当たる（前の行の末尾と、次の行の先頭）。字と字の間では、collapsed Rangeが
 * 2つの矩形を返すので、共有のpicker（`pickVerticalWrapBoundaryRect` / `pickHorizontalWrapBoundaryRect`）がaffinityで選べる。
 * 隣がatom（縦中横・画像・inline HTML・付箋のマーカー）だと、Rangeは字の側の1つの矩形しか返さない（atomの側は矩形を返さない）ので、
 * 行頭側・行末側を選べない。atomの端のcaret（`inlineEdgeCaret()`）を、字の側の矩形と一緒にpickerへ渡す。
 *
 * - `atoms`: 候補にするatomの側。atomは、前（`before`。その末尾の端）・後ろ（`after`。その先頭の端）。改行（hardBreak）は含めない
 *   （幅・高さがなく、矩形を持たない）。
 * - `text`: 字の側の候補。atomが片側だけで、反対側がtextのとき、そのtextの側。atomが両側（隣り合う2つのatomの間）のときは`null`
 *   （2つのatomの端だけで候補が2つになる）。
 * 候補が2つに満たない（atomが片側だけで、反対側がtextでない）ときは`null`（何も足さない。従来の経路）。隣がatomでない位置（字と字の間）は
 * 常に`null`で、従来のまま。ルビは、atomではないので対象外。
 */
export type AtomWrapPlan = { text: InlineEdgeNeighbor | null; atoms: readonly InlineEdgeNeighbor[] }

export function planAtomWrapCandidates(before: PMNode | null | undefined, after: PMNode | null | undefined): AtomWrapPlan | null {
  const isCandidateAtom = (node: PMNode | null | undefined) => isInlineAtomNode(node) && !isLineBreakNode(node)
  const atoms: InlineEdgeNeighbor[] = []
  if (isCandidateAtom(before)) atoms.push('before')
  if (isCandidateAtom(after)) atoms.push('after')
  if (atoms.length === 0) return null
  if (atoms.length === 2) return { text: null, atoms }
  const other = atoms[0] === 'before' ? after : before
  if (!other?.isText) return null
  return { text: atoms[0] === 'before' ? 'after' : 'before', atoms }
}

/**
 * pickerへ渡す判定用の矩形: atomの端のcaretのblock方向の長さ（縦書きは幅、横書きは高さ）を、`reference`（1行ぶんの長さ）までに揃える。
 * 中心とinline方向の位置は変えない。`reference`以下（または`reference`が正の数でない）なら、そのまま返す（同じobject）。
 * 列より幅の広い画像（縦書き）・行より高い画像（横書き）が、pickerの「同じ行の断片」の判定の目安（候補の長さ）を膨らませないため。
 */
export function clampCrossExtent(rect: EdgeRect, reference: number, mode: SupportedEditorWritingMode): EdgeRect {
  const vertical = mode === 'vertical-rl'
  const length = vertical ? rect.right - rect.left : rect.bottom - rect.top
  if (!(reference > 0) || length <= reference) return rect
  const center = vertical ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2
  return vertical ? { ...rect, left: center - reference / 2, right: center + reference / 2 } : { ...rect, top: center - reference / 2, bottom: center + reference / 2 }
}
