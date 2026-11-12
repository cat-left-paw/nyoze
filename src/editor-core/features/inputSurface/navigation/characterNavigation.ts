import { NodeSelection, TextSelection, type EditorState, type Selection } from '@tiptap/pm/state'
import { resolveRubyBoundaryArrowAnchor, resolveRubyBoundaryArrowSelection } from '../../rubyBoundaryArrowNavigation'
import { selectionTouchesSpecialInlineNode } from '../../specialInlineBoundaryDiagnostics'
import { isLocalImeLocalWindowSelectionInsideSpecialInline } from '../../localImeLocalWindowCaretCapability'
import type { SupportedEditorWritingMode } from '../../writingModeNavigationMapping'
import { keepSelectionOutsideInlineAtom, verticalTcyCharacterTarget } from './inlineAtomNavigation'
import type { Textblock } from './lineGeometry'
import { stopAtAnchor, type NavigationOp } from './rules'

const Segmenter = (Intl as typeof Intl & { Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => { segment(text: string): Iterable<{ index: number; segment: string }> } }).Segmenter
const segmenter = new Segmenter('ja', { granularity: 'grapheme' })

export function characterSelection(state: EditorState, block: Textblock, adjacent: Textblock | null, op: NavigationOp, mode: SupportedEditorWritingMode): Selection {
  const { selection, doc } = state, forward = op.direction === 'forward'
  const pos = selection.head, $pos = selection.$head
  if (!selection.empty && !op.extend) return TextSelection.near(doc.resolve(forward ? selection.to : selection.from))
  // Bare Ruby boundary corrections are the Host's authority. Shift uses native text extent.
  const ruby = !op.extend ? resolveRubyBoundaryArrowSelection(state, op.direction) : null
  if (ruby) return keepSelectionOutsideInlineAtom(ruby, forward)
  const touching = selectionTouchesSpecialInlineNode(state)
  const inside = isLocalImeLocalWindowSelectionInsideSpecialInline(selection)
  const node = forward ? $pos.nodeAfter : $pos.nodeBefore
  const boundaryAnchor = resolveRubyBoundaryArrowAnchor(state, op.direction)
  const anchor = op.extend ? boundaryAnchor : pos
  const at = (head: number) => {
    const target = op.extend && !selection.empty ? stopAtAnchor(anchor, pos, head) : head
    return TextSelection.create(doc, op.extend ? anchor : target, target)
  }
  if (touching && node?.type.name === 'aozoraTcy' && !op.extend) {
    return mode === 'horizontal-tb'
      ? NodeSelection.create(doc, forward ? pos : pos - node.nodeSize)
      : at(verticalTcyCharacterTarget(forward, pos, node.nodeSize))
  }
  if (inside && $pos.parent.type.name === 'aozoraTcy') return at(mode === 'vertical-rl' && forward ? Math.min($pos.end(), pos + 1) : pos)
  const boundaries = new Set([block.start, block.end])
  doc.nodeAt(block.start - 1)!.descendants((child, offset) => {
    const start = block.start + offset
    if (child.isText) {
      boundaries.add(start)
      for (const part of segmenter.segment(child.text!)) boundaries.add(start + part.index + part.segment.length)
    } else if (child.isInline) {
      boundaries.add(start); boundaries.add(start + child.nodeSize)
      if (child.isAtom) return false
    }
    return true
  })
  // These duplicate DOM caret boundaries have no intervening glyph.
  if (boundaryAnchor !== pos) boundaries.delete(boundaryAnchor)
  const ordered = [...boundaries].sort((a, b) => a - b)
  const target = forward ? ordered.find(p => p > pos) : ordered.slice().reverse().find(p => p < pos)
  return at(target ?? (forward ? adjacent?.start : adjacent?.end) ?? pos)
}
