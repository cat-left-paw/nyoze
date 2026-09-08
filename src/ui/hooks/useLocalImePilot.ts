/** Author-only Local Window Pilot UI binding. */

import { useCallback, useEffect, useState } from 'react'
import {
  cancelLocalImePilotForceReset,
  configureLocalImePilot,
  confirmLocalImePilotForceReset,
  copyLocalImeLocalWindowRecoveryMarkdown,
  discardLocalImeLocalWindowRecoveryDraft,
  getLocalImePilotHudState,
  killLocalImePilot,
  requestLocalImePilotForceReset,
  restartLocalImeLocalWindowRuntime,
  resumeLocalImePilot,
  retryLocalImeLocalWindowRecoveryToOff,
  startLocalImePilot,
  stopLocalImePilot,
  subscribeLocalImePilot,
  type LocalImePilotHudSnapshot,
} from '../../editor-core/features/localImePilotRuntime'
import {
  getLocalImeLocalWindowRecoveryPort,
  type LocalImeLocalWindowRecoveryDiagnostics,
} from '../../editor-core/features/localImeLocalWindowRecoveryRuntime'

export type LocalImePilotView = {
  hud: LocalImePilotHudSnapshot
  localWindowRecovery: LocalImeLocalWindowRecoveryDiagnostics | null
  onLocalWindowRetryToOff: () => void
  onLocalWindowCopyDraft: () => void
  onLocalWindowDiscardDraft: () => void
  onLocalWindowRestart: () => void
  onStart: () => void
  onResume: () => void
  onStop: () => void
  onKill: () => void
  onRequestForceReset: () => void
  onConfirmForceReset: () => void
  onCancelForceReset: () => void
}

function readLocalImePilotAvailable(): boolean {
  if (typeof window === 'undefined') return false
  return window.nyozeBridge?.localImePilot?.available === true
}

export function useLocalImePilot(): LocalImePilotView | null {
  const [available] = useState(readLocalImePilotAvailable)
  const [hud, setHud] = useState<LocalImePilotHudSnapshot | null>(null)

  useEffect(() => {
    if (!available) return
    configureLocalImePilot({ available: true })
    setHud(getLocalImePilotHudState())
    const unsubscribe = subscribeLocalImePilot(setHud)
    return () => {
      unsubscribe()
      configureLocalImePilot({ available: false })
    }
  }, [available])

  const onLocalWindowCopyDraft = useCallback(() => {
    void copyLocalImeLocalWindowRecoveryMarkdown(async (markdown) => {
      if (typeof navigator === 'undefined' || !navigator.clipboard) return false
      await navigator.clipboard.writeText(markdown)
      return true
    })
  }, [])

  if (!available || !hud) return null
  return {
    hud,
    localWindowRecovery: getLocalImeLocalWindowRecoveryPort()?.diagnostics() ?? null,
    onLocalWindowRetryToOff: () => { retryLocalImeLocalWindowRecoveryToOff() },
    onLocalWindowCopyDraft,
    onLocalWindowDiscardDraft: () => { discardLocalImeLocalWindowRecoveryDraft(true) },
    onLocalWindowRestart: () => { restartLocalImeLocalWindowRuntime() },
    onStart: () => { startLocalImePilot() },
    onResume: () => { resumeLocalImePilot() },
    onStop: () => { stopLocalImePilot() },
    onKill: () => { killLocalImePilot() },
    onRequestForceReset: () => { requestLocalImePilotForceReset() },
    onConfirmForceReset: () => { confirmLocalImePilotForceReset() },
    onCancelForceReset: () => { cancelLocalImePilotForceReset() },
  }
}
