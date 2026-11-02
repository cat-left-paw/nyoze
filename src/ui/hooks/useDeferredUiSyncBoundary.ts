import { useMemo, useRef } from 'react'
import { createSynchronizedUiTabsSnapshot } from './deferredUiCloseSnapshot'

/** UI hooks declared before the gate can explicitly flush its current instance. */
export function useDeferredUiSyncBoundary() {
  const current = useRef<(reason: string) => number | undefined>(() => undefined)
  return useMemo(() => {
    const snapshot = createSynchronizedUiTabsSnapshot()
    return {
      bind: (run: typeof current.current) => { current.current = run },
      flush: (reason: string) => current.current(reason),
      publishSnapshot: snapshot.publish,
      readTabs: snapshot.read,
      invalidateSnapshot: snapshot.invalidate,
    }
  }, [])
}
