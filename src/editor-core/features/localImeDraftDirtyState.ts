/** Display-only ownership for an uncommitted Local Window draft. */

export type LocalImeDraftDirtyOwner = {
  tabId: string
  documentIdentity: string
}

export function resolveLocalImeDraftDirtyOwnerUpdate(input: {
  current: LocalImeDraftDirtyOwner | null
  dirty: boolean
  documentIdentity: string | null
  activeTabId: string | null
}): LocalImeDraftDirtyOwner | null {
  if (!input.dirty) {
    if (!input.current) return null
    if (
      input.documentIdentity !== null &&
      input.documentIdentity !== input.current.documentIdentity
    ) return input.current
    return null
  }
  if (input.documentIdentity === null || input.activeTabId === null) return input.current
  if (
    input.current?.tabId === input.activeTabId &&
    input.current.documentIdentity === input.documentIdentity
  ) return input.current
  return { tabId: input.activeTabId, documentIdentity: input.documentIdentity }
}

export function resolveLocalImeEffectiveTabDirty(input: {
  canonicalHostDirty: boolean
  tabId: string
  draftDirtyTabId: string | null
}): boolean {
  return input.canonicalHostDirty || input.draftDirtyTabId === input.tabId
}
