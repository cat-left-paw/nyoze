import type { EditorState, Selection } from '@tiptap/pm/state'
import type { LineBreakPolicy } from '../types'

function hasAncestorType(selection: Selection, typeName: string): boolean {
  const { $from } = selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === typeName) return true
  }
  return false
}

function isRegularBodyTextblock(selection: Selection): boolean {
  const parentType = selection.$from.parent.type.name
  if (parentType !== 'paragraph' && parentType !== 'heading') return false

  // In structural containers (list/quote), Shift+Enter remains available as hardBreak.
  if (hasAncestorType(selection, 'listItem')) return false
  if (hasAncestorType(selection, 'blockquote')) return false
  return true
}

export function shouldInsertHardBreakOnShiftEnterInRegularBody(
  state: EditorState,
  lineBreakPolicy: LineBreakPolicy,
): boolean {
  if (lineBreakPolicy !== 'commonmark-strict') return false
  return isRegularBodyTextblock(state.selection)
}

export function shouldBlockShiftEnterInRegularBody(
  state: EditorState,
  lineBreakPolicy: LineBreakPolicy,
): boolean {
  if (lineBreakPolicy !== 'obsidian-paragraph') return false
  return isRegularBodyTextblock(state.selection)
}

export function shouldBlockShiftEnterInParagraphPlain(typeName: string | null): boolean {
  // Paragraph Plain uses a block-level textarea. Inline hard breaks are not represented
  // reliably there. Block Shift+Enter for the supported plain-block targets.
  return typeName === 'paragraph' || typeName === 'heading'
}
