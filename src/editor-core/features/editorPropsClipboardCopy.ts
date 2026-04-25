import type { EditorView } from '@tiptap/pm/view'

/**
 * Mirrors ProseMirror's default copy/cut clipboard write, and adds `text/markdown`
 * with the same Aozora-aware payload as `text/plain` (from `clipboardTextSerializer`).
 * Returns false when the system clipboard API is unavailable so the editor can fall back.
 */
export function handleEditorClipboardCopyOrCut(view: EditorView, event: Event): boolean {
  if (!(event instanceof ClipboardEvent)) return false
  if (event.type !== 'copy' && event.type !== 'cut') return false
  const sel = view.state.selection
  if (sel.empty) return false
  const data = event.clipboardData
  if (!data) return false

  const { dom, text } = view.serializeForClipboard(sel.content())
  event.preventDefault()
  data.clearData()
  data.setData('text/html', dom.innerHTML)
  data.setData('text/plain', text)
  data.setData('text/markdown', text)

  if (event.type === 'cut') {
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'))
  }
  return true
}

export const editorClipboardCopyCutDOMHandlers = {
  copy: handleEditorClipboardCopyOrCut,
  cut: handleEditorClipboardCopyOrCut,
} as const
