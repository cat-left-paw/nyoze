import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EditorCoreHandle, SearchState } from '../../editor-core/types'

type UseSearchUiStateOptions = {
  coreRef: RefObject<EditorCoreHandle | null>
}

type SearchUiState = {
  /** Whether the search bar is visible */
  open: boolean
  /** Whether the replace section is expanded */
  replaceOpen: boolean
  /** Current search query */
  query: string
  /** Replacement text */
  replacement: string
  /** Case-sensitive toggle */
  caseSensitive: boolean
  /** Search results from the plugin */
  searchState: SearchState
}

const EMPTY_SEARCH_STATE: SearchState = {
  query: '',
  caseSensitive: false,
  matchCount: 0,
  currentIndex: -1,
}

export function useSearchUiState({ coreRef }: UseSearchUiStateOptions) {
  const [open, setOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [searchState, setSearchState] = useState<SearchState>(EMPTY_SEARCH_STATE)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Track the last query/case that was actually submitted to the plugin
  const committedRef = useRef<{ query: string; caseSensitive: boolean }>({
    query: '',
    caseSensitive: false,
  })

  // Subscribe to search state changes from EditorCore.
  // Depend on `open` so that we (re-)subscribe when the search bar opens —
  // at that point `coreRef.current` is guaranteed to be initialized.
  useEffect(() => {
    if (!open) return
    const core = coreRef.current
    if (!core) return
    return core.onSearchStateChange((state) => {
      setSearchState(state)
    })
  }, [coreRef, open])

  const openSearch = useCallback(() => {
    setOpen(true)
    // Select all text in search input when opening
    setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 0)
  }, [])

  const openSearchReplace = useCallback(() => {
    setOpen(true)
    setReplaceOpen(true)
    setTimeout(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }, 0)
  }, [])

  const closeSearch = useCallback(() => {
    setOpen(false)
    setReplaceOpen(false)
    coreRef.current?.closeSearch()
    setSearchState(EMPTY_SEARCH_STATE)
    committedRef.current = { query: '', caseSensitive: false }
    // Restore focus to the editor (BETA-A11Y1)
    setTimeout(() => coreRef.current?.focusEditor(), 0)
  }, [coreRef])

  // Only updates local state — does NOT trigger a search
  const updateQuery = useCallback((newQuery: string) => {
    setQuery(newQuery)
  }, [])

  /** Execute search with the current query. Called on Enter / search button. */
  const executeSearch = useCallback(() => {
    coreRef.current?.setSearchQuery(query, caseSensitive)
    committedRef.current = { query, caseSensitive }
    // Restore focus to the search input after the editor command
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [coreRef, query, caseSensitive])

  const toggleCaseSensitive = useCallback(() => {
    const next = !caseSensitive
    setCaseSensitive(next)
    // Re-execute search immediately with the new case setting
    coreRef.current?.setSearchQuery(query, next)
    committedRef.current = { query, caseSensitive: next }
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [coreRef, caseSensitive, query])

  /** Returns true if the current input differs from the last executed search */
  const isQueryDirty = useCallback(() => {
    return (
      query !== committedRef.current.query ||
      caseSensitive !== committedRef.current.caseSensitive
    )
  }, [query, caseSensitive])

  const searchNext = useCallback(() => {
    // If query changed since last search, re-execute first
    if (isQueryDirty()) {
      coreRef.current?.setSearchQuery(query, caseSensitive)
      committedRef.current = { query, caseSensitive }
    } else {
      coreRef.current?.searchNext()
    }
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [coreRef, query, caseSensitive, isQueryDirty])

  const searchPrev = useCallback(() => {
    if (isQueryDirty()) {
      coreRef.current?.setSearchQuery(query, caseSensitive)
      committedRef.current = { query, caseSensitive }
    } else {
      coreRef.current?.searchPrev()
    }
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [coreRef, query, caseSensitive, isQueryDirty])

  const replaceOne = useCallback(() => {
    coreRef.current?.replaceCurrentMatch(replacement)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [coreRef, replacement])

  const replaceAll = useCallback(() => {
    coreRef.current?.replaceAllMatches(replacement)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [coreRef, replacement])

  const state: SearchUiState = {
    open,
    replaceOpen,
    query,
    replacement,
    caseSensitive,
    searchState,
  }

  return {
    state,
    searchInputRef,
    openSearch,
    openSearchReplace,
    closeSearch,
    updateQuery,
    executeSearch,
    setReplacement,
    toggleCaseSensitive,
    setReplaceOpen,
    searchNext,
    searchPrev,
    replaceOne,
    replaceAll,
  }
}
