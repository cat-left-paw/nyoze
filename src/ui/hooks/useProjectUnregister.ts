import { useCallback, useState } from 'react'
import type { UiTextKey } from '../i18n/uiText'
import type { ProjectPanelWriteAnchor, ProjectUnregisterResult } from '../../project/projectIpcTypes'

/**
 * Project 登録解除 UI の状態 hook。
 *
 * - renderer は context write anchor だけを渡す（projectRoot は送らない）。
 * - 成功時に onUnregistered を呼ぶ（Project タブ refresh / Explorer badge 更新）。
 */

type ProjectUnregisterBridge = NonNullable<typeof window.nyozeBridge>['project']

export type ProjectUnregisterState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'unregistering' }
  | { kind: 'error'; messageKey: UiTextKey }

type UnregisterErrorReason = Extract<ProjectUnregisterResult, { ok: false }>['reason']

function unregisterErrorMessageKey(reason: UnregisterErrorReason): UiTextKey {
  if (reason === 'notes-exist') return 'projectPanel.unregisterErrorNotesExist'
  return 'projectPanel.unregisterErrorGeneric'
}

function getProjectBridge(): ProjectUnregisterBridge | null {
  return window.nyozeBridge?.project ?? null
}

type UseProjectUnregisterOptions = {
  onUnregistered: () => void
}

export function useProjectUnregister({ onUnregistered }: UseProjectUnregisterOptions) {
  const [unregisterState, setUnregisterState] = useState<ProjectUnregisterState>({ kind: 'idle' })

  const beginUnregister = useCallback(() => {
    setUnregisterState({ kind: 'confirming' })
  }, [])

  const cancelUnregister = useCallback(() => {
    setUnregisterState({ kind: 'idle' })
  }, [])

  const resetUnregisterState = useCallback(() => {
    setUnregisterState({ kind: 'idle' })
  }, [])

  const confirmUnregister = useCallback(
    async (writeAnchor: ProjectPanelWriteAnchor | null) => {
      if (!writeAnchor) {
        setUnregisterState({ kind: 'error', messageKey: 'projectPanel.unregisterErrorGeneric' })
        return
      }
      const bridge = getProjectBridge()
      if (!bridge) {
        setUnregisterState({ kind: 'error', messageKey: 'projectPanel.unregisterErrorGeneric' })
        return
      }
      setUnregisterState({ kind: 'unregistering' })
      const result = await bridge.unregisterProject(writeAnchor).catch(() => null)
      if (!result || !result.ok) {
        setUnregisterState({
          kind: 'error',
          messageKey: result
            ? unregisterErrorMessageKey(result.reason)
            : 'projectPanel.unregisterErrorGeneric',
        })
        return
      }
      setUnregisterState({ kind: 'idle' })
      onUnregistered()
    },
    [onUnregistered],
  )

  return {
    unregisterState,
    beginUnregister,
    cancelUnregister,
    confirmUnregister,
    resetUnregisterState,
  }
}

export type ProjectUnregisterApi = ReturnType<typeof useProjectUnregister>
