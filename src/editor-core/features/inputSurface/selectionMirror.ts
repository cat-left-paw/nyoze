import { TextSelection, type Selection } from '@tiptap/pm/state'
import type { OwnerInsertionSnapshot } from './editOwner'

export const SELECTION_MIRROR_LIMIT = 200
export type SelectionMirror = OwnerInsertionSnapshot & { readonly text: string }

/** D2: DOM・配置・時刻に依存しない。inlineの構造をplain textへ落とさない。 */
export function resolveSelectionMirror(snapshot: OwnerInsertionSnapshot | null, selection: Selection, allowed: boolean): SelectionMirror | null {
  if (!allowed || !snapshot || !(selection instanceof TextSelection) || selection.empty
    || selection.$from.doc !== snapshot.docRef || selection.from !== snapshot.from || selection.to !== snapshot.to
    || selection.$from.parent !== selection.$to.parent || !selection.$from.parent.isTextblock
    || snapshot.to - snapshot.from > SELECTION_MIRROR_LIMIT) return null
  const content = selection.$from.parent.content.cut(selection.$from.parentOffset, selection.$to.parentOffset)
  let text = '', onlyText = true
  content.forEach(node => { if (!node.isText) onlyText = false; else text += node.text! })
  return onlyText && text.length > 0 && text.length <= SELECTION_MIRROR_LIMIT && !/[\r\n]/.test(text) ? { ...snapshot, text } : null
}

export function sameMirrorRange(a: OwnerInsertionSnapshot | null, b: OwnerInsertionSnapshot | null): boolean {
  return !!a && !!b && a.identity === b.identity && a.docRef === b.docRef && a.from === b.from && a.to === b.to
}
