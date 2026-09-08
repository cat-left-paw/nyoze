/** writing-mode中立の collapsed PM selection → DOM Selection exact復元。 */
import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export function syncWritingModeArrowDomSelectionFromPm(view: EditorView): boolean {
  const selection = view.state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  return syncWritingModeArrowDomSelectionAtPmPosition(view, selection.from)
}

export function syncWritingModeArrowDomSelectionAtPmPosition(
  view: EditorView,
  position: number,
): boolean {
  try { view.focus() } catch { return false }
  const domSelection = view.dom.ownerDocument.defaultView?.getSelection()
  if (!domSelection) return false
  try {
    const fromDom = view.domAtPos(position)
    const range = view.dom.ownerDocument.createRange()
    const node = fromDom.node
    const offset = fromDom.offset
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text
      range.setStart(text, Math.max(0, Math.min(offset, text.data.length)))
    } else {
      range.setStart(node, Math.max(0, Math.min(offset, node.childNodes.length)))
    }
    range.collapse(true)
    domSelection.removeAllRanges()
    domSelection.addRange(range)
    if (!domSelection.focusNode || !view.dom.contains(domSelection.focusNode)) return false
    return view.posAtDOM(domSelection.focusNode, domSelection.focusOffset, 1) === position
  } catch {
    return false
  }
}
