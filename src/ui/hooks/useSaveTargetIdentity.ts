import { useMemo } from 'react'
import type { RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { useAppUiState } from './useAppUiState'
import type { useSourceModeController } from './useSourceModeController'
import { readSaveCompletionMarkdownForE2e } from '../utils/savedStatPatchLatchForE2e'
import {
  canFinalizeDocumentSave, matchesDocumentIdentity, resolveSaveContentDecision, savedDocumentPatch, saveTargetRefusal,
  type DocumentIdentity, type IdentityTab, type SaveIdentityRefusal, type SaveIdentityFailureDetail,
} from '../utils/saveTargetIdentity'

type Ui = ReturnType<typeof useAppUiState>
export function useSaveTargetIdentity(ui: Ui, coreRef: RefObject<EditorCoreHandle | null>, source: ReturnType<typeof useSourceModeController>, onRefusal: (detail: SaveIdentityFailureDetail) => void) {
  const { readTabs, readActiveTabId, documentIdentity, patchTab, showLineBreakPolicyNotice } = ui
  return useMemo(() => {
    const row = (id: string) => readTabs().find(tab => tab.id === id)
    const refuse = (reason: SaveIdentityRefusal): false => {
      onRefusal({ identityRefusal: reason, errorKind: 'write-failed', errorMessage: '保存する文書が切り替わったため、保存を中断しました。' })
      console.warn('[save-target-identity]', reason)
      showLineBreakPolicyNotice('保存する文書を確認して、もう一度保存してください。', false)
      return false
    }
    const patch = (target: DocumentIdentity, value: Parameters<Ui['patchTab']>[1]) => {
      if (canFinalizeDocumentSave(target, row(target.tabId))) patchTab(target.tabId, value)
    }
    const complete = (target: DocumentIdentity, markdown: string) => {
      const tab = row(target.tabId)
      if (!tab || !canFinalizeDocumentSave(target, tab)) return
      const current = matchesDocumentIdentity(documentIdentity.readEditor(), tab)
        ? readSaveCompletionMarkdownForE2e(() => coreRef.current?.peekMarkdown()) ?? tab.markdownSnapshot : tab.markdownSnapshot
      const draft = documentIdentity.readSource()?.ownerTabId === tab.id && source.hasEditor() ? source.getValue() : null
      patchTab(tab.id, savedDocumentPatch(tab, markdown, current, draft))
    }
    return {
      row, patch, complete, refuse,
      authorizeWrite: (target: DocumentIdentity) => {
        const reason = saveTargetRefusal(target, row(target.tabId))
        return reason === null || refuse(reason)
      },
      canOpenSource: () => {
        const tab = row(readActiveTabId())
        if (matchesDocumentIdentity(documentIdentity.readEditor(), tab)) return true
        console.warn('[save-target-identity]', 'source-mode-open', tab ? 'editor-document-mismatch' : 'target-missing')
        return false
      },
      forSnapshot: (tabs: readonly IdentityTab[]) => {
        const identities = new Map(tabs.map(tab => [tab.id, { tabId: tab.id, documentInstanceId: tab.documentInstanceId }]))
        const identity = (id: string) => identities.get(id) ?? { tabId: id, documentInstanceId: '' }
        return {
          identity,
          patch: (id: string, value: Parameters<Ui['patchTab']>[1]) => patch(identity(id), value),
          complete: (id: string, markdown: string) => complete(identity(id), markdown),
          allClean: () => [...identities.values()].every(value => canFinalizeDocumentSave(value, row(value.tabId)))
            && readTabs().every(tab => !tab.dirty),
        }
      },
      active: () => row(readActiveTabId()),
      decision: (target: DocumentIdentity) => {
        const tab = row(target.tabId)
        const reason = saveTargetRefusal(target, tab)
        if (reason) return { kind: 'refused' as const, reason }
        return resolveSaveContentDecision({ target: tab, editorDocument: documentIdentity.readEditor(),
          sourceSession: documentIdentity.readSource(), hasSourceEditor: source.hasEditor() })
      },
      isClean: (id: string) => row(id)?.dirty === false,
    }
  }, [readTabs, readActiveTabId, documentIdentity, patchTab, coreRef, source, onRefusal, showLineBreakPolicyNotice])
}
