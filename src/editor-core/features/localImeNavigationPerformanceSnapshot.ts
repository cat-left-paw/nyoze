import type { EditorView } from '@tiptap/pm/view'

export type LocalImeNavigationPerformanceSelectionSnapshot = {
  owner: 'host-pm' | 'local-window'
  ownerIdentity: string
  generation: number
  rootConnected: boolean
  pm: { anchor: number; head: number; from: number; to: number; collapsed: boolean }
  dom: { anchor: number | null; head: number | null; collapsed: boolean; rootMatches: boolean }
  pmDomCorrespond: boolean
}

/**
 * EDITOR-LONGDOC-NAV-PERF1: E2E gateから明示的に読んだときだけ動くread-only oracle。
 * listener / scheduler / timerを作らず、PM positionは実owner viewのposAtDOMで照合する。
 */
export function readLocalImeNavigationPerformanceSelectionSnapshot(input: {
  view: EditorView
  owner: LocalImeNavigationPerformanceSelectionSnapshot['owner']
  ownerIdentity: string
  generation: number
}): LocalImeNavigationPerformanceSelectionSnapshot {
  const { view } = input
  const selection = view.state.selection
  const domSelection = view.dom.ownerDocument.getSelection()
  let anchor: number | null = null
  let head: number | null = null
  let rootMatches = false

  if (domSelection?.anchorNode && domSelection.focusNode) {
    rootMatches =
      view.dom.contains(domSelection.anchorNode) &&
      view.dom.contains(domSelection.focusNode)
    if (rootMatches) {
      try {
        anchor = view.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset)
        head = view.posAtDOM(domSelection.focusNode, domSelection.focusOffset)
      } catch {
        anchor = null
        head = null
      }
    }
  }

  const collapsed = selection.empty
  return {
    owner: input.owner,
    ownerIdentity: input.ownerIdentity,
    generation: input.generation,
    rootConnected: view.dom.isConnected,
    pm: {
      anchor: selection.anchor,
      head: selection.head,
      from: selection.from,
      to: selection.to,
      collapsed,
    },
    dom: {
      anchor,
      head,
      collapsed: domSelection?.isCollapsed === true,
      rootMatches,
    },
    pmDomCorrespond:
      rootMatches &&
      anchor === selection.anchor &&
      head === selection.head &&
      domSelection?.isCollapsed === collapsed,
  }
}
