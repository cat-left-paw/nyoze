import type { Node as PmNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration } from '@tiptap/pm/view'

/** Resolved innermost textblock containing the selection head (Visual Focus active block). */
export type VisualFocusActiveTextblockRange = { from: number; to: number }

const DIM_BLOCK_CLASS = 'nyoze-visual-focus-dim-block'

type ActiveResolveOpts = {
  getSourceModeActive: () => boolean
  getParagraphPlainActive: () => boolean
  getComposing: () => boolean
}

/**
 * Single source of truth for Phase 1 highlight and Phase 2 dimming: same guards as legacy block highlight.
 */
export function resolveVisualFocusActiveTextblockRange(
  state: EditorState,
  opts: ActiveResolveOpts,
): VisualFocusActiveTextblockRange | null {
  if (opts.getSourceModeActive() || opts.getParagraphPlainActive()) {
    return null
  }
  if (!state.selection.empty && !opts.getComposing()) {
    return null
  }

  const $head = state.selection.$head
  for (let ad = $head.depth; ad > 0; ad -= 1) {
    if ($head.node(ad).type.name === 'codeBlock') {
      return null
    }
  }

  for (let d = $head.depth; d > 0; d -= 1) {
    const node = $head.node(d)
    if (!node.isTextblock) {
      continue
    }
    const from = $head.before(d)
    const to = $head.after(d)
    return { from, to }
  }
  return null
}

function hasCodeBlockAncestor(doc: PmNode, pos: number): boolean {
  const $p = doc.resolve(Math.min(pos + 1, doc.content.size))
  for (let ad = $p.depth; ad > 0; ad -= 1) {
    if ($p.node(ad).type.name === 'codeBlock') {
      return true
    }
  }
  return false
}

/** Dim decorations for every textblock except the active one; skips blocks under codeBlock. */
export function collectDimTextblockDecorations(
  doc: PmNode,
  activeRange: VisualFocusActiveTextblockRange,
): Decoration[] {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true
    }
    if (hasCodeBlockAncestor(doc, pos)) {
      return true
    }
    const from = pos
    const to = pos + node.nodeSize
    if (from === activeRange.from && to === activeRange.to) {
      return true
    }
    decorations.push(
      Decoration.node(from, to, {
        class: DIM_BLOCK_CLASS,
        'data-visual-focus-dim-block': 'true',
      }),
    )
    return true
  })
  return decorations
}
