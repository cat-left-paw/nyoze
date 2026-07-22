import type { EditorView } from '@tiptap/pm/view'

const JUMP_HIGHLIGHT_CLASS = 'note-anchor--jump-target'
const DEFAULT_HIGHLIGHT_MS = 2000

export type NoteAnchorJumpController = {
  highlightNoteAnchor: (id: string) => boolean
  scheduleHighlightNoteAnchor: (id: string) => void
  destroy: () => void
}

function queryNoteAnchorMarker(root: ParentNode, id: string): Element | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id
  const marker = root.querySelector(`.note-anchor[data-note-anchor-id="${escaped}"]`)
  return marker instanceof Element ? marker : null
}

/**
 * 右ペイン等からのジャンプ先 noteAnchor marker を DOM-only で短時間強調する。
 * PM transaction / decoration には触れない。
 */
export function createNoteAnchorJumpController(view: EditorView): NoteAnchorJumpController {
  let highlightTimer: ReturnType<typeof setTimeout> | null = null
  let highlightedEl: Element | null = null
  let rafId: number | null = null

  function clearHighlight() {
    if (highlightTimer !== null) {
      clearTimeout(highlightTimer)
      highlightTimer = null
    }
    if (highlightedEl) {
      highlightedEl.classList.remove(JUMP_HIGHLIGHT_CLASS)
      highlightedEl = null
    }
  }

  function highlightNoteAnchor(id: string, durationMs = DEFAULT_HIGHLIGHT_MS): boolean {
    clearHighlight()
    const marker = queryNoteAnchorMarker(view.dom, id)
    if (!marker) return false
    marker.classList.add(JUMP_HIGHLIGHT_CLASS)
    highlightedEl = marker
    highlightTimer = setTimeout(() => {
      clearHighlight()
    }, durationMs)
    return true
  }

  function scheduleHighlightNoteAnchor(id: string) {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    const run = () => {
      rafId = null
      highlightNoteAnchor(id)
    }
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(run)
      })
    } else {
      run()
    }
  }

  return {
    highlightNoteAnchor,
    scheduleHighlightNoteAnchor,
    destroy() {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId)
      }
      rafId = null
      clearHighlight()
    },
  }
}
