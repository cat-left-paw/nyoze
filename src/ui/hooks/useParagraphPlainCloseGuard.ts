import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'

export function useParagraphPlainCloseGuard(
  coreRef: { current: EditorCoreHandle | null },
  readActiveTabId: () => string,
  showNotice: (message: string) => void,
) {
  const [dirtyTabId, setDirtyTabId] = useState<string | null>(null)
  const current = useRef({ readActiveTabId, showNotice })
  current.current = { readActiveTabId, showNotice }
  const onPendingChanges = useCallback((pending: boolean) => {
    setDirtyTabId(pending ? current.current.readActiveTabId() : null)
  }, [])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!coreRef.current?.hasParagraphPlainPendingOverlayChanges()) return
      event.preventDefault()
      event.returnValue = ''
      void window.nyozeBridge?.appState?.setDocumentDirty(true).catch(() => {})
      current.current.showNotice('段落プレーン編集に未確定の文字があります。もう一度閉じて保存または破棄を選んでください。')
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [coreRef])
  return { dirtyTabId, onPendingChanges }
}
