import { useEffect, useRef, useState } from 'react'
import {
  resolveLocalImeDraftDirtyOwnerUpdate,
  type LocalImeDraftDirtyOwner,
} from '../../editor-core/features/localImeDraftDirtyState'
import {
  getLocalImeDraftDirtyNotice,
  subscribeLocalImeDraftDirty,
} from '../../editor-core/features/localImePilotRuntime'

export function useLocalImeDraftDirtyTabId(
  activeTabId: string | undefined,
): string | null {
  const activeTabIdRef = useRef<string | null>(activeTabId ?? null)
  activeTabIdRef.current = activeTabId ?? null
  const [owner, setOwner] = useState<LocalImeDraftDirtyOwner | null>(null)

  useEffect(() => {
    const apply = (notice: { dirty: boolean; documentIdentity: string | null }) => {
      setOwner((current) => resolveLocalImeDraftDirtyOwnerUpdate({
        current,
        dirty: notice.dirty,
        documentIdentity: notice.documentIdentity,
        activeTabId: activeTabIdRef.current,
      }))
    }
    apply(getLocalImeDraftDirtyNotice())
    return subscribeLocalImeDraftDirty(apply)
  }, [])

  return owner?.tabId ?? null
}
