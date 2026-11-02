import { useCallback, useEffect, useRef, useState } from 'react'
import { createCoreUiSyncGate } from './coreUiSyncGate'
import type { LogEntry } from '../../editor-core/types'

type UseImePhaseAUpdateGateOptions = {
  enabled: boolean
  minSyncIntervalMs: number
  onFullSync: () => number | undefined
  onLightSync: () => boolean | void
  onDeferredSyncStart?: () => void
}

type UseImePhaseAUpdateGateResult = {
  handleCoreLog: (entry: LogEntry) => void
  handleCoreUpdate: (docChanged?: boolean) => void
  flushDeferredSync: (reason: string) => number | undefined
  hasPendingDeferredSync: () => boolean
  fullSyncRevision: number
  /** Whether an IME composition session is currently active (Phase A tracking). */
  isComposingRef: React.RefObject<boolean>
}

export function useImePhaseAUpdateGate(options: UseImePhaseAUpdateGateOptions): UseImePhaseAUpdateGateResult {
  const latest = useRef(options)
  latest.current = options
  const [fullSyncRevision, setFullSyncRevision] = useState(0)
  const [gate] = useState(() => createCoreUiSyncGate(() => ({
    ...latest.current,
    onFullSync() {
      const result = latest.current.onFullSync()
      // Even a clean -> clean sync must acknowledge deferred main dirty.
      setFullSyncRevision(revision => revision + 1)
      return result
    },
  })))
  useEffect(() => { gate.activate(); return () => gate.destroy() }, [gate])
  const handleCoreLog = useCallback((entry: LogEntry) => {
    if (entry.event === 'compositionstart') gate.compositionStart()
    if (entry.event === 'compositionend') gate.compositionEnd()
  }, [gate])
  return {
    handleCoreLog,
    handleCoreUpdate: gate.update,
    flushDeferredSync: gate.flush,
    hasPendingDeferredSync: gate.hasPending,
    fullSyncRevision,
    isComposingRef: gate.isComposingRef,
  }
}
