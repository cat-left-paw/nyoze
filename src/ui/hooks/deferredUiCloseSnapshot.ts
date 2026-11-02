import { resolveDirtyState } from './dirtyTracking'
import type { EditorTab } from './useAppUiState'

/** React updates are asynchronous. Close uses live content, never a timer snapshot. */
export function reconcileDeferredUiCloseTabs(tabs: EditorTab[], activeTabId: string, markdown: string | undefined): EditorTab[] {
  if (markdown === undefined) return tabs
  return tabs.map(tab => tab.id !== activeTabId ? tab : {
    ...tab,
    markdownSnapshot: markdown,
    dirty: resolveDirtyState(tab, markdown) ?? tab.dirty,
  })
}

/** Only the exact pre-render tab object may receive this completed full-sync result. */
export function createSynchronizedUiTabsSnapshot() {
  let completed: { tab: EditorTab; markdown: string } | null = null
  return {
    invalidate() { completed = null },
    publish(tab: EditorTab, markdown: string) { completed = { tab, markdown } },
    read(tabs: EditorTab[], activeTabId: string) {
      if (!completed || completed.tab.id !== activeTabId || tabs.find(tab => tab.id === activeTabId) !== completed.tab) return tabs
      return reconcileDeferredUiCloseTabs(tabs, activeTabId, completed.markdown)
    },
  }
}
