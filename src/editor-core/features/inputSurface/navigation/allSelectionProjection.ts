import type { Node as PMNode } from '@tiptap/pm/model'
import { Selection, TextSelection } from '@tiptap/pm/state'

/** AllSelectionの両端がatomでも、実在するtext caretだけをN1へ渡す。 */
export function projectAllSelectionToText(doc: PMNode): TextSelection | null {
  const first = Selection.findFrom(doc.resolve(0), 1, true)
  const last = Selection.findFrom(doc.resolve(doc.content.size), -1, true)
  if (!(first instanceof TextSelection) || !(last instanceof TextSelection)) return null
  return TextSelection.create(doc, first.head, last.head)
}
