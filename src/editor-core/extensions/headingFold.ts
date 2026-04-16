import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// ---------------------------------------------------------------------------
// Plugin key & types
// ---------------------------------------------------------------------------

export type HeadingFoldPluginState = {
  folded: number[] // sorted positions of folded headings
}

type FoldMeta =
  | { type: 'toggle'; pos: number }
  | { type: 'unfoldAll' }

export const headingFoldPluginKey = new PluginKey<HeadingFoldPluginState>(
  'headingFold',
)

// ---------------------------------------------------------------------------
// Fold range calculation (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Given a heading's document position, compute the range of content that would
 * be hidden when folding that heading. Returns null if the heading is at the
 * end of the document (nothing to fold).
 *
 * The fold range starts immediately after the heading node and ends just
 * before the next sibling heading of the same or higher level, or at the
 * end of the document.
 */
export function resolveFoldRange(
  doc: PMNode,
  headingPos: number,
): { from: number; to: number } | null {
  if (headingPos < 0 || headingPos >= doc.content.size) return null
  let headingNode: ReturnType<PMNode['nodeAt']>
  try {
    headingNode = doc.nodeAt(headingPos)
  } catch {
    return null
  }
  if (!headingNode || headingNode.type.name !== 'heading') return null

  const headingLevel = (headingNode.attrs.level as number) ?? 1
  const foldFrom = headingPos + headingNode.nodeSize

  if (foldFrom >= doc.content.size) return null

  let foldTo = doc.content.size
  let offset = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (
      offset > headingPos &&
      child.type.name === 'heading' &&
      ((child.attrs.level as number) ?? 1) <= headingLevel
    ) {
      foldTo = offset
      break
    }
    offset += child.nodeSize
  }

  return foldTo > foldFrom ? { from: foldFrom, to: foldTo } : null
}

/**
 * Given a document position, find the folded heading whose fold range
 * contains that position. Returns the heading position or -1.
 */
export function findFoldedAncestor(
  doc: PMNode,
  folded: number[],
  pos: number,
): number {
  for (const headingPos of folded) {
    const range = resolveFoldRange(doc, headingPos)
    if (range && pos >= range.from && pos < range.to) {
      return headingPos
    }
  }
  return -1
}

// ---------------------------------------------------------------------------
// Position mapping
// ---------------------------------------------------------------------------

function mapFolded(folded: number[], tr: Transaction): number[] {
  if (folded.length === 0 || !tr.docChanged) return folded

  const mapped: number[] = []
  for (const pos of folded) {
    const newPos = tr.mapping.map(pos, 1)
    const node = tr.doc.nodeAt(newPos)
    if (node && node.type.name === 'heading') {
      mapped.push(newPos)
    }
  }
  return mapped
}

// ---------------------------------------------------------------------------
// Preview text extraction
// ---------------------------------------------------------------------------

const PREVIEW_MAX_LINES = 3
const PREVIEW_MAX_CHARS = 50

/**
 * Extract a short text preview from the fold range for tooltip display.
 */
export function extractFoldPreview(
  doc: PMNode,
  from: number,
  to: number,
): string {
  const lines: string[] = []
  doc.nodesBetween(from, Math.min(to, doc.content.size), (node) => {
    if (lines.length >= PREVIEW_MAX_LINES) return false
    if (node.isBlock && node.textContent) {
      const text = node.textContent
      lines.push(
        text.length > PREVIEW_MAX_CHARS
          ? text.slice(0, PREVIEW_MAX_CHARS) + '\u2026'
          : text,
      )
    }
    return true
  })
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Widget DOM factories
// ---------------------------------------------------------------------------

/** CSS class names used by event delegation in EditorCore */
export const FOLD_TOGGLE_CLASS = 'heading-fold-toggle'
export const FOLD_ELLIPSIS_CLASS = 'heading-fold-ellipsis'

function createToggleWidget(headingPos: number, isFolded: boolean): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = FOLD_TOGGLE_CLASS
  span.dataset.headingPos = String(headingPos)
  span.dataset.folded = isFolded ? '1' : '0'
  span.setAttribute('role', 'button')
  span.setAttribute('aria-label', isFolded ? '展開' : '折りたたみ')
  span.setAttribute('contenteditable', 'false')

  // 4 chevron icons for different writing modes and fold states
  // CSS will show/hide based on [data-folded] and parent writing-mode
  span.innerHTML =
    // horizontal + folded: chevron-right
    `<svg class="chevron-h-folded" xmlns="http://www.w3.org/2000/svg" width="18" height="18"` +
    ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"` +
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6l-6 6"/></svg>` +
    // horizontal + expanded: chevron-down
    `<svg class="chevron-h-expanded" xmlns="http://www.w3.org/2000/svg" width="18" height="18"` +
    ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"` +
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>` +
    // vertical + folded: chevron-down
    `<svg class="chevron-v-folded" xmlns="http://www.w3.org/2000/svg" width="18" height="18"` +
    ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"` +
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6l6 -6"/></svg>` +
    // vertical + expanded: chevron-left
    `<svg class="chevron-v-expanded" xmlns="http://www.w3.org/2000/svg" width="18" height="18"` +
    ` viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"` +
    ` stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>`
  return span
}

function createEllipsisWidget(headingPos: number, preview: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = FOLD_ELLIPSIS_CLASS
  span.dataset.headingPos = String(headingPos)
  span.dataset.preview = preview
  span.setAttribute('contenteditable', 'false')
  span.setAttribute('aria-label', '折りたたまれた内容')
  // Tabler Icons: message
  span.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"` +
    ` fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"` +
    ` stroke-linejoin="round"><path d="M8 9h8"/><path d="M8 13h6"/>` +
    `<path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12"/></svg>`
  return span
}

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildDecorations(
  state: EditorState,
  folded: number[],
): DecorationSet {
  const doc = state.doc
  const decorations: Decoration[] = []
  const foldedSet = new Set(folded)

  // Collect fold ranges for hiding content
  const foldRanges: { from: number; to: number }[] = []

  // Iterate all headings for toggle widgets + fold decorations
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true

    const range = resolveFoldRange(doc, pos)
    if (!range) return false // no foldable content, skip

    const isFolded = foldedSet.has(pos)

    // Toggle widget: inside heading, before text content
    decorations.push(
      Decoration.widget(pos + 1, () => createToggleWidget(pos, isFolded), {
        side: -1,
        key: `fold-toggle-${pos}-${isFolded ? 'f' : 'e'}`,
      }),
    )

    if (isFolded) {
      // Node decoration on the heading
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: 'heading-is-folded',
        }),
      )

      // Ellipsis widget: at end of heading content
      const preview = extractFoldPreview(doc, range.from, range.to)
      decorations.push(
        Decoration.widget(
          pos + node.nodeSize - 1,
          () => createEllipsisWidget(pos, preview),
          { side: 1, key: `fold-ellipsis-${pos}` },
        ),
      )

      foldRanges.push(range)
    }

    return false // don't descend into heading
  })

  // Hide folded content via node decorations
  if (foldRanges.length > 0) {
    let offset = 0
    for (let i = 0; i < doc.childCount; i++) {
      const child = doc.child(i)
      const childEnd = offset + child.nodeSize

      for (const range of foldRanges) {
        if (offset >= range.from && offset < range.to) {
          decorations.push(
            Decoration.node(offset, childEnd, {
              class: 'heading-folded-content',
            }),
          )
          break
        }
      }

      offset = childEnd
    }
  }

  return decorations.length > 0
    ? DecorationSet.create(doc, decorations)
    : DecorationSet.empty
}

// ---------------------------------------------------------------------------
// TipTap command declarations
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingFold: {
      toggleHeadingFold: (pos: number) => ReturnType
      unfoldAll: () => ReturnType
    }
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const HeadingFold = Extension.create({
  name: 'headingFold',

  addCommands() {
    return {
      toggleHeadingFold:
        (pos: number) =>
        ({ tr, state, dispatch }) => {
          const pluginState = headingFoldPluginKey.getState(state)
          if (!pluginState) return false

          const isFolded = pluginState.folded.includes(pos)

          // When folding: if cursor is inside the fold range, move it to the heading
          if (!isFolded) {
            const foldRange = resolveFoldRange(state.doc, pos)
            if (foldRange) {
              const { from: cursorFrom } = state.selection
              if (cursorFrom >= foldRange.from && cursorFrom < foldRange.to) {
                const headingNode = state.doc.nodeAt(pos)
                if (headingNode) {
                  const safePos = Math.min(
                    pos + 1,
                    pos + headingNode.nodeSize - 1,
                  )
                  tr.setSelection(TextSelection.create(state.doc, safePos))
                }
              }
            }
          }

          if (dispatch) {
            tr.setMeta(headingFoldPluginKey, {
              type: 'toggle',
              pos,
            } satisfies FoldMeta)
            dispatch(tr)
          }
          return true
        },

      unfoldAll:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(headingFoldPluginKey, {
              type: 'unfoldAll',
            } satisfies FoldMeta)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<HeadingFoldPluginState>({
        key: headingFoldPluginKey,

        state: {
          init(): HeadingFoldPluginState {
            return { folded: [] }
          },

          apply(tr, value): HeadingFoldPluginState {
            const meta = tr.getMeta(headingFoldPluginKey) as
              | FoldMeta
              | undefined

            if (meta) {
              switch (meta.type) {
                case 'toggle': {
                  const existing = value.folded.includes(meta.pos)
                  const folded = existing
                    ? value.folded.filter((p) => p !== meta.pos)
                    : [...value.folded, meta.pos].sort((a, b) => a - b)
                  return { folded }
                }
                case 'unfoldAll':
                  return { folded: [] }
              }
            }

            // Map positions through document changes
            if (tr.docChanged) {
              const mapped = mapFolded(value.folded, tr)
              if (
                mapped.length !== value.folded.length ||
                mapped.some((p, i) => p !== value.folded[i])
              ) {
                return { folded: mapped }
              }
            }

            return value
          },
        },

        props: {
          decorations(state) {
            const pluginState = headingFoldPluginKey.getState(state)
            return buildDecorations(state, pluginState?.folded ?? [])
          },
        },
      }),
    ]
  },
})
