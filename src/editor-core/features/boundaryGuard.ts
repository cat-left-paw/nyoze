import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

const NON_STICKY_MARKS = ['bold', 'italic', 'strike', 'link'] as const

function hasMarkOnNode(
  state: EditorState,
  node: PMNode | null | undefined,
  markName: string,
): boolean {
  if (!node) return false
  const markType = state.schema.marks[markName]
  if (!markType) return false
  return node.marks.some((mark) => mark.type === markType)
}

function isBoundaryOutsideCursor(state: EditorState): boolean {
  const { selection } = state
  if (!selection.empty) return false
  const { $from } = selection
  const before = $from.nodeBefore
  const after = $from.nodeAfter

  return NON_STICKY_MARKS.some((markName) => {
    const beforeHas = hasMarkOnNode(state, before, markName)
    const afterHas = hasMarkOnNode(state, after, markName)
    return beforeHas !== afterHas
  })
}

export function clearStoredMarksAtBoundary(editor: Editor): boolean {
  if (!isBoundaryOutsideCursor(editor.state)) return false
  editor.view.dispatch(editor.state.tr.setStoredMarks([]))
  return true
}
