import { useCallback, useRef } from 'react'
import type { useAppUiState } from './useAppUiState'
import type { SourceModeController } from './useSourceModeController'
import { guardSourceModeDraft, type GuardResult } from './sourceModeDraftGuard'
import type { SaveDocumentTarget } from '../utils/saveDocumentFirstWins'

type Options = { localImeDocumentActionPrepared?: boolean; proveBeforeDiskWrite?: () => boolean }
type Save = (force: boolean, target?: SaveDocumentTarget, prepared?: boolean, prove?: () => boolean) => Promise<boolean>
export function useSourceModeDraftGuard(ui: ReturnType<typeof useAppUiState>, source: SourceModeController, save: Save,
  requestAction: () => Promise<'save' | 'discard' | 'cancel'>, readCore: () => string | null) {
  const { documentIdentity, readTabs } = ui
  const runtime = useRef({ save, close: () => {}, requestAction })
  runtime.current.save = save
  runtime.current.requestAction = requestAction
  const guard = useCallback((options?: Options): Promise<GuardResult> => {
    const session = documentIdentity.readSource()
    const sameSession = () => documentIdentity.readSource() === session
    return guardSourceModeDraft({
      fullPlainEditActive: session !== null,
      getSourceModeDraft: source.getValue,
      getCoreMarkdown: readCore,
      saveDocument: async () => {
        if (!sameSession()) return false
        const saved = await runtime.current.save(false, undefined, options?.localImeDocumentActionPrepared, options?.proveBeforeDiskWrite)
        return saved && sameSession() && readTabs().find(tab => tab.id === session?.ownerTabId)?.dirty === false
      },
      closeFullPlainEdit: () => { if (sameSession()) runtime.current.close() },
      requestUnsavedContinueAction: async () => {
        const action = await runtime.current.requestAction()
        return sameSession() ? action : 'cancel'
      },
    })
  }, [documentIdentity, readTabs, source, readCore])
  return { guard, bindClose: (close: () => void) => { runtime.current.close = close } }
}
