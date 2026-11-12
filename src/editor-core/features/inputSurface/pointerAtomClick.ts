import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { resolveSupportedEditorWritingMode } from '../writingModeNavigationMapping'
import { atomWrapBoundary } from './navigation/caretGeometry'
import { atomLineEdges, isInlineAtomNode, needsWrapEdgeProbe, resolveInlineAtomClickCorrection, type AtomClickBox, type InlineAtomRange } from './navigation/inlineAtomNavigation'

/** pointerdownからpointerupまでの移動がこの距離（CSS px）を超えたら、dragとして扱い、補正しない。 */
export const ATOM_CLICK_DRAG_PX = 4

export const isAtomClickDrag = (down: { x: number; y: number }, up: { x: number; y: number }): boolean =>
  Math.hypot(up.x - down.x, up.y - down.y) > ATOM_CLICK_DRAG_PX

/**
 * PIS-INLINE-ATOM-NAV1: clickの後の、inlineのatom（縦中横・画像など）の前後のcaretの補正。
 * 呼ぶのは、primaryのclick（Shiftなし・dragでない・変換中でない・caretを動かさないwidgetでない）のpointerupで、HostのDOMの選択を
 * PMへ読み込んだ直後だけ。選択がcollapsedなTextSelectionで、atomの中・直後・直前にあるときだけDOMを読み、選択だけのtransaction
 * （`addToHistory: false`）を1回dispatchする。`NodeSelection`・rangeには何もしない。判断は純粋な`resolveInlineAtomClickCorrection()`。
 * 補正したときは新しい位置、しなかったときは`null`。
 */
export function correctCaretAtInlineAtom(view: EditorView, pointer: { x: number; y: number }): number | null {
  const selection = view.state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const $head = selection.$head, head = selection.head
  const insideRange: InlineAtomRange | null = $head.depth > 0 && $head.parent.isAtom ? { from: $head.before(), to: $head.after() } : null
  const beforeRange: InlineAtomRange | null = !insideRange && isInlineAtomNode($head.nodeBefore) ? { from: head - $head.nodeBefore.nodeSize, to: head } : null
  const afterRange: InlineAtomRange | null = !insideRange && isInlineAtomNode($head.nodeAfter) ? { from: head, to: head + $head.nodeAfter.nodeSize } : null
  if (!insideRange && !beforeRange && !afterRange) return null
  const writingMode = view.dom.ownerDocument.defaultView?.getComputedStyle(view.dom).writingMode
  const mode = writingMode ? resolveSupportedEditorWritingMode(writingMode) : null
  if (!mode) return null
  // `side`: headがatomの直後（`before`の役）のときは行頭の旗、直前（`after`の役）のときは行末の旗だけを使う（規則2）。
  const box = (range: InlineAtomRange | null, side: 'start' | 'end' | null): AtomClickBox | null => {
    if (!range) return null
    const element = view.nodeDOM(range.from) as Element | null
    const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
    if (!rect || !(rect.width > 0 && rect.height > 0)) return null
    const plain = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    const structural = atomLineEdges(view.state.doc, range)
    let { atLineStart, atLineEnd } = structural
    // PIS-INLINE-ATOM-WRAP-NAV1: 折り返しで行頭・行末に来たatom。atomの前（後ろ）の位置が、折り返しの位置（前の行の末尾と次の行の先頭に当たる位置）のとき。
    // 構造上の行頭・行末でなく、規則2が旗で結果を変える場面（pointerがatomの外側の余白）だけDOMを読む。
    if (side === 'start' && !atLineStart && needsWrapEdgeProbe(plain, mode, pointer, 'start')) atLineStart = atomWrapBoundary(view, range.from, mode) !== null
    if (side === 'end' && !atLineEnd && needsWrapEdgeProbe(plain, mode, pointer, 'end')) atLineEnd = atomWrapBoundary(view, range.to, mode) !== null
    return { ...range, atLineStart, atLineEnd, rect: plain }
  }
  const target = resolveInlineAtomClickCorrection({ mode, head, inside: box(insideRange, null), before: box(beforeRange, 'start'), after: box(afterRange, 'end'), pointer })
  if (target === null || target === head) return null
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)).setMeta('addToHistory', false))
  return target
}
