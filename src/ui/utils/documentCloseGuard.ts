export function hasDocumentCloseChanges(input: {
  tabDirty: boolean
  paragraphPlainPending: boolean
  localImeDraft: boolean
  deferredSync: boolean
}): boolean {
  return input.tabDirty || input.paragraphPlainPending || input.localImeDraft || input.deferredSync
}

/** Separate from Local Window's post-barrier proof: that barrier does not commit Paragraph Plain. */
export function withParagraphPlainCloseContribution<T extends { id: string; dirty: boolean }>(
  tabs: readonly T[], activeTabId: string, pending: boolean,
): T[] {
  return tabs.map(tab => pending && tab.id === activeTabId ? { ...tab, dirty: true } : tab)
}

export async function discardParagraphPlainAfterCleanup(
  cleanup: () => Promise<boolean>, discard: () => void,
): Promise<boolean> {
  if (!await cleanup()) return false
  discard()
  return true
}
