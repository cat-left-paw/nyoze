import { Selection, TextSelection } from '@tiptap/pm/state'
import { joinBackward } from '@tiptap/pm/commands'
import type { EditorView } from '@tiptap/pm/view'
import { resolveOwnerDeletion } from './inputSurface/deletionRules'

/** P1: inline node の内側・隣の bare 削除は、Chromium の layout による DOM 削除へ任せず、PIS と同じ規則を使う。 */
export function handleInlineNodeDeletion(view: EditorView, event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || event.keyCode === 229 || !view.editable) return false
  const state = view.state, selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const head = selection.$head
  const special = (node: typeof head.nodeBefore) => !!node && node.isInline && !node.isText
  if (head.parent.isTextblock && !special(head.nodeBefore) && !special(head.nodeAfter)) return false
  const plan = resolveOwnerDeletion(state, event.key)
  // 付箋の拒否・通知は既存 handleNoteAnchorDeleteKey が扱う。範囲・通常本文の keymap は変えない。
  if (plan.kind === 'blocked') return false
  if (plan.kind === 'delete' || plan.kind === 'delegate' && plan.from !== plan.to) {
    const tr = state.tr.delete(plan.from, plan.to)
    tr.setSelection(Selection.near(tr.doc.resolve(plan.kind === 'delete' ? plan.caret : plan.from), -1))
    view.dispatch(tr.scrollIntoView())
  } else if (plan.kind === 'boundary' || plan.kind === 'collapse') {
    const outside = state.apply(state.tr.setSelection(TextSelection.create(state.doc, plan.caret)))
    if (plan.kind !== 'boundary' || !joinBackward(outside, tr => view.dispatch(tr.scrollIntoView()))) {
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, plan.caret)).setMeta('addToHistory', false))
    }
  } else return false
  event.preventDefault()
  return true
}
