import type { EditorView } from '@tiptap/pm/view'
import { stripNoteAnchorsFromSlice } from './clipboardNoteAnchorStrip'
import { markNyozeClipboardDom } from './clipboardInternalMark'
import { canRestoreSliceFromHtml } from './clipboardNodeCodec'
import { selectionTouchesNoteAnchor } from './noteAnchorProtection'
import { notifyNoteAnchorProtection } from './noteAnchorProtectionNotice'

type SurfaceCutContext = { from: number; to: number; deleteSelection(): void }
const surfaceCutContexts = new WeakMap<EditorView, SurfaceCutContext>()

/** The original Host handler keeps its OFF path; S5 scopes the cut override to one call. */
export function withInputSurfaceCutContext<T>(view: EditorView, context: SurfaceCutContext, run: () => T): T {
  if (surfaceCutContexts.has(view)) throw new Error('reentrant input surface cut')
  surfaceCutContexts.set(view, context)
  try { return run() } finally { surfaceCutContexts.delete(view) }
}

/**
 * Mirrors ProseMirror's default copy/cut clipboard write, and adds `text/markdown`
 * with the same Aozora-aware payload as `text/plain` (from `clipboardTextSerializer`).
 * 書く slice からは noteAnchor を取り除き（HTML も文字も）、同一 ID の付箋 anchor が
 * paste で複製されないようにする。
 * CLIPBOARD-INTERNAL-PASTE1: HTML の `data-pm-slice` の要素に Nyoze の印を付ける。貼り付けは
 * 印のある HTML を ProseMirror の標準の貼り付けに任せ、`text/plain` を Markdown として
 * 読み直さない（`editorPropsPaste.ts`）。HTML から戻せない node を含む slice には印を付けない。
 * CLIPBOARD-INTERNAL-PASTE3: HTML は editorProps の `clipboardSerializer`（`clipboardNodeCodec.ts`）が
 * 書き、画像・改ページなどの属性も持つので、それらを含む slice にも印が付く。
 * Returns false when the system clipboard API is unavailable so the editor can fall back.
 */
export function handleEditorClipboardCopyOrCut(view: EditorView, event: Event): boolean {
  if (!(event instanceof ClipboardEvent)) return false
  if (event.type !== 'copy' && event.type !== 'cut') return false
  const sel = view.state.selection
  if (sel.empty) return false
  const data = event.clipboardData
  if (!data) return false

  const cutContext = event.type === 'cut' ? surfaceCutContexts.get(view) : undefined
  const slice = cutContext && (cutContext.from !== sel.from || cutContext.to !== sel.to)
    ? view.state.doc.slice(cutContext.from, cutContext.to) : sel.content()
  const writeSlice = stripNoteAnchorsFromSlice(slice)
  const { dom, text } = view.serializeForClipboard(writeSlice)
  // clipboard の parser が戻せない node を含む slice は、印を付けず、これまでの貼り付け
  // （`text/plain` を Markdown として読む）に任せる。
  if (canRestoreSliceFromHtml(writeSlice)) markNyozeClipboardDom(dom)
  const touchesNoteAnchor = selectionTouchesNoteAnchor(view.state)
  event.preventDefault()
  data.clearData()
  data.setData('text/html', dom.innerHTML)
  data.setData('text/plain', text)
  data.setData('text/markdown', text)

  if (event.type === 'cut') {
    if (!touchesNoteAnchor) {
      if (cutContext) cutContext.deleteSelection()
      else view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut'))
    } else {
      // STICKY-NOTE-LIFECYCLE1: clipboard へは書くが本文は消さない。理由を知らせる（Host / PIS 共通）。
      notifyNoteAnchorProtection(view, 'cut')
    }
  }
  return true
}

export const editorClipboardCopyCutDOMHandlers = {
  copy: handleEditorClipboardCopyOrCut,
  cut: handleEditorClipboardCopyOrCut,
} as const
