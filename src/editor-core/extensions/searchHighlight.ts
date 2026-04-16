import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { findMatches } from '../features/searchReplace'
import type { SearchMatch } from '../features/searchReplace'

// ---------------------------------------------------------------------------
// Plugin key & types
// ---------------------------------------------------------------------------

export type SearchHighlightPluginState = {
  query: string
  caseSensitive: boolean
  matches: SearchMatch[]
  currentIndex: number // -1 = no selection
}

type SearchMeta =
  | { type: 'setQuery'; query: string; caseSensitive: boolean }
  | { type: 'refresh'; anchorPos?: number | null }
  | { type: 'setCurrentIndex'; index: number }
  | { type: 'close' }

export const searchHighlightPluginKey = new PluginKey<SearchHighlightPluginState>(
  'searchHighlight',
)

// ---------------------------------------------------------------------------
// Decoration builder
// ---------------------------------------------------------------------------

function buildSearchDecorations(
  state: EditorState,
  pluginState: SearchHighlightPluginState,
): DecorationSet {
  if (!pluginState.query || pluginState.matches.length === 0) {
    return DecorationSet.empty
  }

  const decorations: Decoration[] = []

  for (let i = 0; i < pluginState.matches.length; i++) {
    const match = pluginState.matches[i]
    const isCurrent = i === pluginState.currentIndex
    decorations.push(
      Decoration.inline(match.from, match.to, {
        class: isCurrent ? 'search-highlight-current' : 'search-highlight-match',
      }),
    )
  }

  return DecorationSet.create(state.doc, decorations)
}

// ---------------------------------------------------------------------------
// Recompute matches (when query or doc changes)
// ---------------------------------------------------------------------------

function recomputeMatches(
  doc: import('@tiptap/pm/model').Node,
  query: string,
  caseSensitive: boolean,
): SearchMatch[] {
  if (!query) return []
  return findMatches(doc, query, caseSensitive)
}

function mapMatchesThroughTransaction(
  tr: Transaction,
  matches: readonly SearchMatch[],
): SearchMatch[] {
  const nextMatches: SearchMatch[] = []
  const seen = new Set<string>()

  for (const match of matches) {
    const from = tr.mapping.map(match.from, -1)
    const to = tr.mapping.map(match.to, 1)
    if (from >= to) continue
    const key = `${from}:${to}`
    if (seen.has(key)) continue
    seen.add(key)
    nextMatches.push({ from, to })
  }

  return nextMatches
}

function resolveCurrentIndexAfterRefresh(
  matches: readonly SearchMatch[],
  previousMatches: readonly SearchMatch[],
  previousIndex: number,
  anchorPos?: number | null,
): number {
  if (matches.length === 0) return -1

  const fallbackAnchor =
    previousIndex >= 0 && previousIndex < previousMatches.length
      ? previousMatches[previousIndex].from
      : 0
  const targetPos = anchorPos ?? fallbackAnchor

  let closestIndex = 0
  let bestDistance = Infinity
  for (let i = 0; i < matches.length; i++) {
    const distance = Math.abs(matches[i].from - targetPos)
    if (distance < bestDistance) {
      bestDistance = distance
      closestIndex = i
    }
  }
  return closestIndex
}

// ---------------------------------------------------------------------------
// TipTap command declarations
// ---------------------------------------------------------------------------

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchQuery: (query: string, caseSensitive: boolean) => ReturnType
      refreshSearch: (anchorPos?: number | null) => ReturnType
      setSearchCurrentIndex: (index: number) => ReturnType
      closeSearch: () => ReturnType
    }
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const SearchHighlight = Extension.create({
  name: 'searchHighlight',

  addCommands() {
    return {
      setSearchQuery:
        (query: string, caseSensitive: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'setQuery',
              query,
              caseSensitive,
            } satisfies SearchMeta)
            dispatch(tr)
          }
          return true
        },

      refreshSearch:
        (anchorPos?: number | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'refresh',
              anchorPos,
            } satisfies SearchMeta)
            dispatch(tr)
          }
          return true
        },

      setSearchCurrentIndex:
        (index: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'setCurrentIndex',
              index,
            } satisfies SearchMeta)
            dispatch(tr)
          }
          return true
        },

      closeSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchHighlightPluginKey, {
              type: 'close',
            } satisfies SearchMeta)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightPluginState>({
        key: searchHighlightPluginKey,

        state: {
          init(): SearchHighlightPluginState {
            return {
              query: '',
              caseSensitive: false,
              matches: [],
              currentIndex: -1,
            }
          },

          apply(
            tr: Transaction,
            value: SearchHighlightPluginState,
          ): SearchHighlightPluginState {
            const meta = tr.getMeta(searchHighlightPluginKey) as
              | SearchMeta
              | undefined

            if (meta) {
              switch (meta.type) {
                case 'setQuery': {
                  const matches = recomputeMatches(
                    tr.doc,
                    meta.query,
                    meta.caseSensitive,
                  )
                  const currentIndex = matches.length > 0 ? 0 : -1
                  return {
                    query: meta.query,
                    caseSensitive: meta.caseSensitive,
                    matches,
                    currentIndex,
                  }
                }
                case 'refresh': {
                  if (!value.query) return value
                  const matches = recomputeMatches(
                    tr.doc,
                    value.query,
                    value.caseSensitive,
                  )
                  const currentIndex = resolveCurrentIndexAfterRefresh(
                    matches,
                    value.matches,
                    value.currentIndex,
                    meta.anchorPos,
                  )
                  return { ...value, matches, currentIndex }
                }
                case 'setCurrentIndex': {
                  const index = value.matches.length > 0
                    ? Math.max(0, Math.min(meta.index, value.matches.length - 1))
                    : -1
                  return { ...value, currentIndex: index }
                }
                case 'close':
                  return {
                    query: '',
                    caseSensitive: false,
                    matches: [],
                    currentIndex: -1,
                  }
              }
            }

            // Recompute on doc changes (edits, replacements)
            if (tr.docChanged && value.query) {
              const matches = mapMatchesThroughTransaction(tr, value.matches)
              const currentIndex =
                matches.length === 0
                  ? -1
                  : Math.max(0, Math.min(value.currentIndex, matches.length - 1))
              return { ...value, matches, currentIndex }
            }

            return value
          },
        },

        props: {
          decorations(state: EditorState) {
            const pluginState = searchHighlightPluginKey.getState(state)
            if (!pluginState) return DecorationSet.empty
            return buildSearchDecorations(state, pluginState)
          },
        },
      }),
    ]
  },
})
