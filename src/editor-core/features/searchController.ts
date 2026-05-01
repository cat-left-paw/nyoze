import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { LineBreakPolicy, SearchState } from '../types'
import { createSearchRefreshScheduler } from './searchRefreshScheduler'

type LogPush = (event: string, detail: string) => void
type SearchMatchLike = { from: number; to: number }
type SearchPluginStateLike = { matches: SearchMatchLike[]; currentIndex: number }

type CreateSearchControllerOptions = {
  getIsComposing: () => boolean
  getLineBreakPolicy: () => LineBreakPolicy
  setSearchQueryCommand: (query: string, caseSensitive: boolean) => void
  refreshSearchCommand: (anchorPos?: number | null) => void
  setSearchCurrentIndexCommand: (index: number) => void
  closeSearchCommand: () => void
  getSearchStateSnapshot: () => SearchState
  getSearchPluginState: () => SearchPluginStateLike | null
  getEditorState: () => EditorState
  dispatch: (tr: Transaction) => void
  replaceMatchInDoc: (
    state: EditorState,
    match: SearchMatchLike,
    replacement: string,
    lineBreakPolicy: LineBreakPolicy,
  ) => Transaction
  replaceAllMatchesInDoc: (
    state: EditorState,
    matches: SearchMatchLike[],
    replacement: string,
    lineBreakPolicy: LineBreakPolicy,
  ) => Transaction
  emitSearchStateChange: () => void
  scrollToPos: (pos: number) => void
  pushLog: LogPush
}

export function createSearchController({
  getIsComposing,
  getLineBreakPolicy,
  setSearchQueryCommand,
  refreshSearchCommand,
  setSearchCurrentIndexCommand,
  closeSearchCommand,
  getSearchStateSnapshot,
  getSearchPluginState,
  getEditorState,
  dispatch,
  replaceMatchInDoc,
  replaceAllMatchesInDoc,
  emitSearchStateChange,
  scrollToPos,
  pushLog,
}: CreateSearchControllerOptions): {
  setSearchQuery: (query: string, caseSensitive: boolean) => number
  scheduleRefreshForDocChange: () => boolean
  refreshImmediately: (anchorPos?: number | null) => boolean
  searchNext: () => number
  searchPrev: () => number
  replaceCurrentMatch: (replacement: string) => number
  replaceAllMatches: (replacement: string) => number
  closeSearch: () => void
  destroy: () => void
} {
  function refreshSearchMatches(anchorPos?: number | null): void {
    const state = getSearchStateSnapshot()
    if (!state.query) return
    refreshSearchCommand(anchorPos)
    emitSearchStateChange()
  }

  const refreshScheduler = createSearchRefreshScheduler({
    delayMs: 120,
    getIsComposing,
    hasActiveQuery: () => !!getSearchStateSnapshot().query,
    runRefresh: () => {
      refreshSearchMatches()
    },
  })

  function setSearchQuery(query: string, caseSensitive: boolean): number {
    refreshScheduler.cancel()
    setSearchQueryCommand(query, caseSensitive)
    const state = getSearchStateSnapshot()
    emitSearchStateChange()

    if (state.matchCount > 0 && state.currentIndex >= 0) {
      const pluginState = getSearchPluginState()
      const match = pluginState?.matches[state.currentIndex]
      if (match) scrollToPos(match.from)
    }

    pushLog('search', `query="${query}" case=${caseSensitive} count=${state.matchCount}`)
    return state.matchCount
  }

  function scheduleRefreshForDocChange(): boolean {
    return refreshScheduler.schedule()
  }

  function refreshImmediately(anchorPos?: number | null): boolean {
    refreshScheduler.cancel()
    const state = getSearchStateSnapshot()
    if (!state.query) return false
    refreshSearchMatches(anchorPos)
    return true
  }

  function searchNext(): number {
    refreshScheduler.flushNow()
    const pluginState = getSearchPluginState()
    if (!pluginState || pluginState.matches.length === 0) return -1

    const nextIndex = (pluginState.currentIndex + 1) % pluginState.matches.length
    setSearchCurrentIndexCommand(nextIndex)
    emitSearchStateChange()

    const match = pluginState.matches[nextIndex]
    if (match) scrollToPos(match.from)
    return nextIndex
  }

  function searchPrev(): number {
    refreshScheduler.flushNow()
    const pluginState = getSearchPluginState()
    if (!pluginState || pluginState.matches.length === 0) return -1

    const prevIndex =
      (pluginState.currentIndex - 1 + pluginState.matches.length) % pluginState.matches.length
    setSearchCurrentIndexCommand(prevIndex)
    emitSearchStateChange()

    const match = pluginState.matches[prevIndex]
    if (match) scrollToPos(match.from)
    return prevIndex
  }

  function replaceCurrentMatch(replacement: string): number {
    if (getIsComposing()) return -1

    refreshScheduler.flushNow()
    const pluginState = getSearchPluginState()
    if (!pluginState || pluginState.currentIndex < 0) return -1
    const match = pluginState.matches[pluginState.currentIndex]
    if (!match) return -1

    refreshScheduler.cancel()
    const tr = replaceMatchInDoc(getEditorState(), match, replacement, getLineBreakPolicy())
    dispatch(tr)
    refreshScheduler.cancel()
    refreshSearchMatches(match.from)
    pushLog('search', `replace "${match.from}-${match.to}" → "${replacement}"`)
    return getSearchStateSnapshot().matchCount
  }

  function replaceAllMatches(replacement: string): number {
    if (getIsComposing()) return 0

    refreshScheduler.flushNow()
    const pluginState = getSearchPluginState()
    if (!pluginState || pluginState.matches.length === 0) return 0

    const count = pluginState.matches.length
    refreshScheduler.cancel()
    const tr = replaceAllMatchesInDoc(
      getEditorState(),
      pluginState.matches,
      replacement,
      getLineBreakPolicy(),
    )
    dispatch(tr)
    refreshScheduler.cancel()
    refreshSearchMatches()
    pushLog('search', `replaceAll count=${count} → "${replacement}"`)
    return count
  }

  function closeSearch(): void {
    refreshScheduler.cancel()
    closeSearchCommand()
    emitSearchStateChange()
    pushLog('search', 'close')
  }

  return {
    setSearchQuery,
    scheduleRefreshForDocChange,
    refreshImmediately,
    searchNext,
    searchPrev,
    replaceCurrentMatch,
    replaceAllMatches,
    closeSearch,
    destroy: () => refreshScheduler.cancel(),
  }
}
