import { useCallback, useMemo, useRef, type RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import type { EditorTab } from './useAppUiState'
import type { SaveFailureAction, SaveFailureInfo } from '../components/SaveFailureModal'
import type { UiLanguageMode } from '../../settings/types'
import { getUiText } from '../i18n/uiText'
import { suggestLeMEExportPath } from '../utils/suggestLeMEExportPath'
import type { ExternalExportFormat, ExternalExportOptionsSelection } from './useExternalExportOptionsPrompt'

type UseLeMEMarkdownExportInput = {
  coreRef: RefObject<EditorCoreHandle | null>
  activeTab: EditorTab
  internalDocActive: boolean
  fullPlainEditActive: boolean
  paragraphPlainModeActive: boolean
  uiLanguageMode: UiLanguageMode
  showGlobalNotice: (message: string) => void
  showEditorInlineHint: (message: string) => void
  showBackupWarningIfPresent: (warning: string | undefined | null) => void
  requestSaveFailureAction: (info: SaveFailureInfo) => Promise<SaveFailureAction>
  /** 共有 options 確認 UI（`useExternalExportOptionsPrompt`）を `scope: 'document'` で
   *  呼び出す、呼び出し側 (App.tsx) が bind 済みの request 関数。`format` はこの hook
   *  自身が `'leme'` を渡す。 */
  requestExportOptions: (format: ExternalExportFormat) => Promise<ExternalExportOptionsSelection | null>
}

export function useLeMEMarkdownExport({
  coreRef,
  activeTab,
  internalDocActive,
  fullPlainEditActive,
  paragraphPlainModeActive,
  uiLanguageMode,
  showGlobalNotice,
  showEditorInlineHint,
  showBackupWarningIfPresent,
  requestSaveFailureAction,
  requestExportOptions,
}: UseLeMEMarkdownExportInput) {
  // Kept fresh every render (not part of the async closure snapshot) so we can
  // detect whether the active tab or its loaded file changed while the options
  // modal was open. `id` alone misses the "same tab loads a different file"
  // path (e.g. Open reusing the current tab), so both are tracked.
  const activeTabIdentityRef = useRef({ id: activeTab.id, filePath: activeTab.filePath })
  activeTabIdentityRef.current = { id: activeTab.id, filePath: activeTab.filePath }

  const exportActiveDocument = useCallback(async () => {
    if (internalDocActive) return
    if (fullPlainEditActive || paragraphPlainModeActive) {
      showEditorInlineHint(getUiText(uiLanguageMode, 'export.lemePlainModeBlocked'))
      return
    }

    const targetTabId = activeTab.id
    const targetFilePath = activeTab.filePath
    const selection = await requestExportOptions('leme')
    if (!selection) return
    // The options modal awaits user input; if the active tab, or the file loaded
    // into it, changed while it was open (e.g. native menu tab switch, or Open
    // reusing the same tab), abort rather than exporting coreRef's now-different
    // live content under the stale activeTab's suggested path.
    if (
      activeTabIdentityRef.current.id !== targetTabId ||
      activeTabIdentityRef.current.filePath !== targetFilePath
    ) {
      return
    }

    const exported = coreRef.current?.exportLeMEMarkdown({
      pageBreak: selection.pageBreak,
      pageBreakBeforeHeading: selection.pageBreakBeforeHeading,
      pageBreakBeforeHeadingMaxLevel: selection.pageBreakBeforeHeadingMaxLevel,
      autoTcy: selection.autoTcy,
      tcyMinDigits: selection.tcyMinDigits,
      tcyMaxDigits: selection.tcyMaxDigits,
      tcyNumbersOnly: selection.tcyNumbersOnly,
      includeDocumentInfo: selection.includeDocumentInfo,
      showRoleLabels: selection.showRoleLabels,
      // Document info is sourced from the active tab's own frontmatter fields
      // (not Project/Book v3 metadata) — the pure converter never reads
      // frontmatter itself, so this hook is the single point that resolves it.
      documentInfo: {
        title: activeTab.frontmatterFields.title,
        author: activeTab.frontmatterFields.author,
        translator: activeTab.frontmatterFields.translator,
      },
    })
    if (!exported) return

    const bridge = window.nyozeBridge?.fs?.exportLeMEMarkdown
    if (!bridge) return

    const suggestedPath = suggestLeMEExportPath(activeTab.filePath)
    let retry = true

    while (retry) {
      retry = false
      const result = await bridge(exported.text, suggestedPath)

      if (result.saved) {
        showBackupWarningIfPresent(result.backupWarning)
        showGlobalNotice(
          exported.warnings.length > 0
            ? getUiText(uiLanguageMode, 'export.lemeSuccessWithWarnings')
            : getUiText(uiLanguageMode, 'export.lemeSuccess'),
        )
        return
      }

      if (result.errorKind === 'canceled') return

      const action = await requestSaveFailureAction({
        tabTitle: activeTab.title,
        filePath: result.filePath ?? null,
        errorKind: result.errorKind ?? 'write-failed',
        errorMessage: result.errorMessage,
      })
      if (action === 'retry' || action === 'saveAs') {
        retry = true
      }
    }
  }, [
    activeTab.filePath,
    activeTab.frontmatterFields,
    activeTab.id,
    activeTab.title,
    coreRef,
    fullPlainEditActive,
    internalDocActive,
    paragraphPlainModeActive,
    requestExportOptions,
    requestSaveFailureAction,
    showBackupWarningIfPresent,
    showEditorInlineHint,
    showGlobalNotice,
    uiLanguageMode,
  ])

  return useMemo(
    () => ({
      exportActiveDocument,
    }),
    [exportActiveDocument],
  )
}
