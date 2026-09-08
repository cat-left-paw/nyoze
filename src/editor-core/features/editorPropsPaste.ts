import { Slice } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { parseMarkdown } from '../io/parseMarkdown'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'
import { isTrivialClipboardHtml } from './clipboardPasteHtmlTriviality'

type LogPush = (event: string, detail: string) => void

type CreateEditorPropsPasteHandlerOptions = {
  getIsComposing: (viewComposing: boolean) => boolean
  getLineBreakPolicy: () => LineBreakPolicy
  getDocumentMarkdownOptions: () => MarkdownDocumentOptions
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

function canInlineInsertIntoSelection(state: EditorState): boolean {
  const { $from, $to } = state.selection
  return $from.sameParent($to) && $from.parent.inlineContent
}

function buildInlinePasteSlice(state: EditorState, parsedDoc: EditorState['doc']): Slice | null {
  if (!canInlineInsertIntoSelection(state)) return null
  if (parsedDoc.childCount !== 1) return null
  const firstChild = parsedDoc.firstChild
  if (!firstChild || !firstChild.type.inlineContent) return null
  return new Slice(firstChild.content, 0, 0)
}

export type MarkdownPlainPasteInput = {
  state: EditorState
  plainText: string
  lineBreakPolicy: LineBreakPolicy
  documentMarkdownOptions: MarkdownDocumentOptions
}

export type MarkdownPlainPasteResult =
  | { ok: true; tr: Transaction }
  | { ok: false; reason: 'empty-parsed-content' }

/**
 * 通常 PM の Markdown-aware plain paste と局所 IME slot adapter が共有する primitive。
 * `text/plain` を Nyoze Markdown として parse し、inline / block 挿入 slice を
 * `replaceSelection` する transaction を組み立てるだけで、dispatch はしない
 * （呼び出し側が guard・composing・scrollIntoView 契約を個別に持つため）。
 */
export function buildMarkdownPlainPasteTransaction(
  input: MarkdownPlainPasteInput,
): MarkdownPlainPasteResult {
  const parsedDoc = parseMarkdown(input.state.schema, input.plainText, input.lineBreakPolicy, {
    preserveEmptyParagraphs: input.documentMarkdownOptions.preserveEmptyParagraphs,
  })
  if (parsedDoc.content.size === 0) return { ok: false, reason: 'empty-parsed-content' }

  const inlineSlice = buildInlinePasteSlice(input.state, parsedDoc)
  const tr = inlineSlice
    ? input.state.tr.replaceSelection(inlineSlice)
    : input.state.tr.replaceSelection(new Slice(parsedDoc.content, 0, 0))
  return { ok: true, tr }
}

export function createEditorPropsPasteHandler({
  getIsComposing,
  getLineBreakPolicy,
  getDocumentMarkdownOptions,
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

    const htmlText = clipboardData.getData('text/html')
    if (htmlText.trim().length > 0 && !isTrivialClipboardHtml(htmlText)) {
      return false
    }

    const lineBreakPolicy = getLineBreakPolicy()
    const result = buildMarkdownPlainPasteTransaction({
      state: view.state,
      plainText,
      lineBreakPolicy,
      documentMarkdownOptions: getDocumentMarkdownOptions(),
    })
    if (!result.ok) return false

    event.preventDefault()
    view.dispatch(result.tr.scrollIntoView())
    pushLog('paste', `markdownPlain policy=${lineBreakPolicy} chars=${plainText.length}`)
    return true
  }
}
