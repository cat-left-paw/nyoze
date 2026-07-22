import type { EditorView } from '@tiptap/pm/view'
import type { NoteColorId } from '../../project/noteColor'
import { NOTE_PREVIEW_FALLBACK } from '../../project/notePreview'

export type NoteAnchorPreviewController = {
  setNoteAnchorPreviews: (previews: Record<string, string>) => void
  setNoteAnchorColors: (colors: Record<string, NoteColorId>) => void
  scheduleApply: () => void
  destroy: () => void
}

/**
 * editor DOM 内の noteAnchor marker へ hover preview 文字列を反映する。
 * PM doc / transaction / serialize には触れない display-only 更新。
 */
export function applyNoteAnchorPreviewsToDom(
  root: ParentNode,
  previews: Readonly<Record<string, string>>,
  fallback: string = NOTE_PREVIEW_FALLBACK,
): void {
  const markers = root.querySelectorAll('.note-anchor[data-note-anchor-id]')
  for (const marker of markers) {
    if (!(marker instanceof Element)) continue
    const id = marker.getAttribute('data-note-anchor-id')
    if (!id) continue
    const preview = previews[id] ?? fallback
    marker.setAttribute('data-note-anchor-preview', preview)
  }
}

/**
 * editor DOM 内の noteAnchor marker へ表示色 key を反映する (DOM-only)。
 */
export function applyNoteAnchorColorsToDom(
  root: ParentNode,
  colors: Readonly<Record<string, NoteColorId>>,
): void {
  const markers = root.querySelectorAll('.note-anchor[data-note-anchor-id]')
  for (const marker of markers) {
    if (!(marker instanceof Element)) continue
    const id = marker.getAttribute('data-note-anchor-id')
    if (!id) continue
    const colorKey = colors[id]
    if (colorKey) {
      marker.setAttribute('data-note-anchor-color', colorKey)
    } else {
      marker.removeAttribute('data-note-anchor-color')
    }
  }
}

export function createNoteAnchorPreviewController(
  view: EditorView,
): NoteAnchorPreviewController {
  let previews: Record<string, string> = {}
  let colors: Record<string, NoteColorId> = {}
  let scheduled = false
  let rafId: number | null = null

  function apply() {
    scheduled = false
    rafId = null
    applyNoteAnchorPreviewsToDom(view.dom, previews)
    applyNoteAnchorColorsToDom(view.dom, colors)
  }

  function scheduleApply() {
    if (scheduled) return
    scheduled = true
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(apply)
    } else {
      apply()
    }
  }

  return {
    setNoteAnchorPreviews(next: Record<string, string>) {
      previews = { ...next }
      scheduleApply()
    },
    setNoteAnchorColors(next: Record<string, NoteColorId>) {
      colors = { ...next }
      scheduleApply()
    },
    scheduleApply,
    destroy() {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId)
      }
      scheduled = false
      rafId = null
      previews = {}
      colors = {}
    },
  }
}
