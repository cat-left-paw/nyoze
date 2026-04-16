import type {
  LineBreakPolicyListener,
  LogListener,
  SearchStateListener,
  SelectionListener,
  UpdateListener,
} from '../types'

type CreateListenerSubscriptionsOptions = {
  logListeners: Set<LogListener>
  selectionListeners: Set<SelectionListener>
  updateListeners: Set<UpdateListener>
  foldChangeListeners: Set<UpdateListener>
  lineBreakPolicyListeners: Set<LineBreakPolicyListener>
  searchStateListeners: Set<SearchStateListener>
}

export function createListenerSubscriptions({
  logListeners,
  selectionListeners,
  updateListeners,
  foldChangeListeners,
  lineBreakPolicyListeners,
  searchStateListeners,
}: CreateListenerSubscriptionsOptions): {
  onLog: (listener: LogListener) => () => void
  onSelectionUpdate: (listener: SelectionListener) => () => void
  onUpdate: (listener: UpdateListener) => () => void
  onFoldChange: (listener: UpdateListener) => () => void
  onLineBreakPolicyChange: (listener: LineBreakPolicyListener) => () => void
  onSearchStateChange: (listener: SearchStateListener) => () => void
  clearAll: () => void
} {
  function subscribe<T>(listeners: Set<T>, listener: T): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function clearAll(): void {
    logListeners.clear()
    selectionListeners.clear()
    updateListeners.clear()
    foldChangeListeners.clear()
    lineBreakPolicyListeners.clear()
    searchStateListeners.clear()
  }

  return {
    onLog: (listener) => subscribe(logListeners, listener),
    onSelectionUpdate: (listener) => subscribe(selectionListeners, listener),
    onUpdate: (listener) => subscribe(updateListeners, listener),
    onFoldChange: (listener) => subscribe(foldChangeListeners, listener),
    onLineBreakPolicyChange: (listener) => subscribe(lineBreakPolicyListeners, listener),
    onSearchStateChange: (listener) => subscribe(searchStateListeners, listener),
    clearAll,
  }
}
