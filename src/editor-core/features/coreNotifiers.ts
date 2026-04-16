import type {
  LineBreakPolicy,
  LineBreakPolicyListener,
  LogEntry,
  LogListener,
  SearchState,
  SearchStateListener,
  UpdateListener,
} from '../types'

const LOG_COUNTER_GLOBAL_KEY = '__nyozeLogCounterV1'

function nextGlobalLogId(): number {
  const holder = globalThis as typeof globalThis & Record<string, number | undefined>
  const current = holder[LOG_COUNTER_GLOBAL_KEY] ?? 0
  const next = current + 1
  holder[LOG_COUNTER_GLOBAL_KEY] = next
  return next
}

type CreateCoreNotifiersOptions = {
  logListeners: Set<LogListener>
  lineBreakPolicyListeners: Set<LineBreakPolicyListener>
  foldChangeListeners: Set<UpdateListener>
  searchStateListeners: Set<SearchStateListener>
  getSearchStateSnapshot: () => SearchState
}

export function createCoreNotifiers({
  logListeners,
  lineBreakPolicyListeners,
  foldChangeListeners,
  searchStateListeners,
  getSearchStateSnapshot,
}: CreateCoreNotifiersOptions): {
  pushLog: (event: string, detail: string) => void
  emitLineBreakPolicyChange: (nextPolicy: LineBreakPolicy) => void
  emitFoldChange: () => void
  emitSearchStateChange: () => void
} {
  function pushLog(event: string, detail: string): void {
    const entry: LogEntry = {
      id: nextGlobalLogId(),
      event,
      detail,
      at: new Date().toLocaleTimeString('ja-JP', { hour12: false }),
    }
    for (const listener of logListeners) {
      listener(entry)
    }
  }

  function emitLineBreakPolicyChange(nextPolicy: LineBreakPolicy): void {
    for (const listener of lineBreakPolicyListeners) {
      listener(nextPolicy)
    }
  }

  function emitFoldChange(): void {
    for (const listener of foldChangeListeners) {
      listener()
    }
  }

  function emitSearchStateChange(): void {
    const state = getSearchStateSnapshot()
    for (const listener of searchStateListeners) {
      listener(state)
    }
  }

  return {
    pushLog,
    emitLineBreakPolicyChange,
    emitFoldChange,
    emitSearchStateChange,
  }
}
