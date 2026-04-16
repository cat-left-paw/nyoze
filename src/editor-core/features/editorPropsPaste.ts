import { Slice } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { parseMarkdown } from '../io/parseMarkdown'
import type { LineBreakPolicy } from '../types'

type LogPush = (event: string, detail: string) => void

type CreateEditorPropsPasteHandlerOptions = {
  getIsComposing: (viewComposing: boolean) => boolean
  getLineBreakPolicy: () => LineBreakPolicy
  pushLog: LogPush
}

function isSelectionInsideCodeBlock(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === 'codeBlock') {
      return true
    }
  }
  return false
}

export function createEditorPropsPasteHandler({
  getIsComposing,
  getLineBreakPolicy,
  pushLog,
}: CreateEditorPropsPasteHandlerOptions): (
  view: EditorView,
  event: ClipboardEvent,
  _slice: Slice,
) => boolean {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    if (getIsComposing(view.composing)) return false
    if (isSelectionInsideCodeBlock(view.state)) return false

    const clipboardData = event.clipboardData
    if (!clipboardData) return false

    const plainText = clipboardData.getData('text/plain')
    if (!plainText) return false

    // Prefer native rich-text paste when HTML payload exists.
    const htmlText = clipboardData.getData('text/html')
    if (htmlText.trim().length > 0) return false

    const lineBreakPolicy = getLineBreakPolicy()
    const parsedDoc = parseMarkdown(view.state.schema, plainText, lineBreakPolicy)
    if (parsedDoc.content.size === 0) return false

    event.preventDefault()
    const tr = view.state.tr.replaceSelection(new Slice(parsedDoc.content, 0, 0))
    view.dispatch(tr.scrollIntoView())
    pushLog('paste', `markdownPlain policy=${lineBreakPolicy} chars=${plainText.length}`)
    return true
  }
}

