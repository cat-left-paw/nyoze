import type { EditorView } from '@tiptap/pm/view'
import { selectionTouchesNoteAnchor } from './noteAnchorProtection'

function escapeClipboardHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function plainTextToClipboardHtml(text: string): string {
  const escaped = escapeClipboardHtmlText(text).replace(/\r?\n/g, '<br>')
  return `<div data-nyoze-plain-copy="true">${escaped}</div>`
}

/**
 * Mirrors ProseMirror's default copy/cut clipboard write, and adds `text/markdown`
 * with the same Aozora-aware payload as `text/plain` (from `clipboardTextSerializer`).
 * noteAnchor を含む selection では HTML flavor からも marker DOM を落とし、
 * 同一 ID の付箋 anchor が paste で複製されないようにする。
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
  const touchesNoteAnchor = selectionTouchesNoteAnchor(view.state)
  event.preventDefault()
  data.clearData()
  data.setData('text/html', touchesNoteAnchor ? plainTextToClipboardHtml(text) : dom.innerHTML)
  data.setData('text/plain', text)
  data.setData('text/markdown', text)

  if (event.type === 'cut') {
    if (!touchesNoteAnchor) {
      view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'))
    }
  }
  return true
}

export const editorClipboardCopyCutDOMHandlers = {
  copy: handleEditorClipboardCopyOrCut,
  cut: handleEditorClipboardCopyOrCut,
} as const
