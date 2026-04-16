import { useCallback, useRef } from 'react'
import type { LogEntry } from '../../editor-core/types'

type UseImePhaseAUpdateGateOptions = {
  enabled: boolean
  minSyncIntervalMs: number
  onFullSync: () => void
  onLightSync: () => void
}

type UseImePhaseAUpdateGateResult = {
  handleCoreLog: (entry: LogEntry) => void
  handleCoreUpdate: () => void
  flushDeferredSync: (reason: string) => void
  /** Whether an IME composition session is currently active (Phase A tracking). */
  isComposingRef: React.RefObject<boolean>
}

function normalizeMinSyncIntervalMs(value: number): number {
  if (!Number.isFinite(value)) return 400
  return Math.min(500, Math.max(300, Math.round(value)))
}

export function useImePhaseAUpdateGate({
  enabled,
  minSyncIntervalMs,
  onFullSync,
  onLightSync,
}: UseImePhaseAUpdateGateOptions): UseImePhaseAUpdateGateResult {
  const isComposingRef = useRef(false)
  const pendingHeavySyncRef = useRef(false)
  const lastLightSyncAtRef = useRef(0)

  const flushDeferredSync = useCallback((reason: string) => {
    void reason
    const hadPending = pendingHeavySyncRef.current
    pendingHeavySyncRef.current = false
    if (hadPending) {
      onFullSync()
    }
  }, [onFullSync])

  const handleCoreLog = useCallback((entry: LogEntry) => {
    // Always track composition state so that consumers (e.g. handleCoreSelectionUpdate)
    // can skip expensive work during IME input, even when Phase A gating is disabled.
    if (entry.event === 'compositionstart') {
      isComposingRef.current = true
      if (!enabled) return
      lastLightSyncAtRef.current = performance.now()
      return
    }
    if (entry.event === 'compositionend') {
      isComposingRef.current = false
      if (!enabled) return
      // Defer the full sync to the next macrotask so that EditorCore's
      // isComposing flag (cleared via queueMicrotask in compositionHandlers)
      // and ProseMirror's view.composing are both false before we re-evaluate
      // command availability.  Without this, syncCommandAvailability reads
      // composing=true and leaves canUndo/canRedo disabled after IME commit.
      setTimeout(() => {
        flushDeferredSync('compositionend')
      }, 0)
    }
  }, [enabled, flushDeferredSync])

  const handleCoreUpdate = useCallback(() => {
    if (!enabled || !isComposingRef.current) {
      onFullSync()
      return
    }
    pendingHeavySyncRef.current = true
    const now = performance.now()
    const intervalMs = normalizeMinSyncIntervalMs(minSyncIntervalMs)
    if (now - lastLightSyncAtRef.current < intervalMs) return
    lastLightSyncAtRef.current = now
    onLightSync()
  }, [enabled, minSyncIntervalMs, onFullSync, onLightSync])

  return {
    handleCoreLog,
    handleCoreUpdate,
    flushDeferredSync,
    isComposingRef,
  }
}
