import { useCallback, useMemo, useRef, type RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import { normalizeWebBookPaletteSnapshot } from '../../editor-core/export/webBookPaletteSnapshot'
import { resolveWebBookTypographySnapshotFromDisplay } from '../../editor-core/export/webBookTypographySnapshot'
import { resolveWebBookAutoTcySnapshotFromDisplay } from '../../editor-core/export/webBookAutoTcySnapshot'
import type { WebBookOutputProfile } from '../../editor-core/export/webBookAssetPlan'
import type {
  DisplaySettings,
  DocumentColorSettings,
  DocumentHeadingFont,
  UiLanguageMode,
  WritingMode,
} from '../../settings/types'
import type { EditorTab } from './useAppUiState'
import type { SaveFailureAction, SaveFailureInfo } from '../components/SaveFailureModal'
import { getUiText } from '../i18n/uiText'
import { suggestWebBookExportPath } from '../utils/suggestWebBookExportPath'
import type { ExternalExportOptionsSelection } from './useExternalExportOptionsPrompt'
import { mapWebBookAssetFailuresToDisplayItems } from '../utils/mapBookExportWarningsToDisplayItems'
import type { BookExportResultDetailsPromptState } from './useBookExportResultDetailsPrompt'
import type { WebBookCapacityConfirmDecision } from './useWebBookCapacityConfirmPrompt'
import type { WebBookCapacityReport } from '../../../electron/webBookCapacity'

type UseWebBookExportInput = {
  coreRef: RefObject<EditorCoreHandle | null>
  activeTab: EditorTab
  internalDocActive: boolean
  fullPlainEditActive: boolean
  paragraphPlainModeActive: boolean
  uiLanguageMode: UiLanguageMode
  writingMode: WritingMode
  docColorSettings: DocumentColorSettings
  docHeadingFont: DocumentHeadingFont
  displaySettings: DisplaySettings
  showGlobalNotice: (message: string) => void
  showEditorInlineHint: (message: string) => void
  showBackupWarningIfPresent: (warning: string | undefined | null) => void
  requestSaveFailureAction: (info: SaveFailureInfo) => Promise<SaveFailureAction>
  requestExportOptions: (format: 'webBook') => Promise<ExternalExportOptionsSelection | null>
  showBookExportResultDetails: (state: BookExportResultDetailsPromptState) => void
  /** WB-IMG-3A: soft capacity confirm (App-owned). */
  requestCapacityConfirm: (report: WebBookCapacityReport) => Promise<WebBookCapacityConfirmDecision>
}

function deriveDocumentTitle(tabTitle: string): string {
  const dot = tabTitle.lastIndexOf('.')
  return dot > 0 ? tabTitle.slice(0, dot) : tabTitle
}

/** Web Book は既存HTMLとは別の pure exporter / IPC format を使う。 */
export function useWebBookExport({
  coreRef,
  activeTab,
  internalDocActive,
  fullPlainEditActive,
  paragraphPlainModeActive,
  uiLanguageMode,
  writingMode,
  docColorSettings,
  docHeadingFont,
  displaySettings,
  showGlobalNotice,
  showEditorInlineHint,
  showBackupWarningIfPresent,
  requestSaveFailureAction,
  requestExportOptions,
  showBookExportResultDetails,
  requestCapacityConfirm,
}: UseWebBookExportInput) {
  const activeTabIdentityRef = useRef({ id: activeTab.id, filePath: activeTab.filePath })
  activeTabIdentityRef.current = { id: activeTab.id, filePath: activeTab.filePath }

  const exportActiveDocument = useCallback(async () => {
    if (internalDocActive) return
    if (fullPlainEditActive || paragraphPlainModeActive) {
      showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookPlainModeBlocked'))
      return
    }

    const targetTabId = activeTab.id
    const targetFilePath = activeTab.filePath
    const selection = await requestExportOptions('webBook')
    if (!selection) return
    if (
      activeTabIdentityRef.current.id !== targetTabId ||
      activeTabIdentityRef.current.filePath !== targetFilePath
    ) {
      return
    }

    let paletteSnapshot
    try {
      paletteSnapshot = normalizeWebBookPaletteSnapshot({
        pageColor: docColorSettings.pageColor,
        textColor: docColorSettings.textColor,
        headingColor: docColorSettings.headingColor,
      })
    } catch {
      showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookPaletteInvalid'))
      return
    }

    let typographySnapshot
    try {
      typographySnapshot = resolveWebBookTypographySnapshotFromDisplay({
        docHeadingFont,
        displaySettings,
      })
    } catch {
      showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookTypographyInvalid'))
      return
    }

    let autoTcySnapshot
    try {
      autoTcySnapshot = resolveWebBookAutoTcySnapshotFromDisplay(displaySettings)
    } catch {
      showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookAutoTcyInvalid'))
      return
    }

    const exported = coreRef.current?.exportWebBook({
      pageBreak: selection.pageBreak,
      pageBreakBeforeHeading: selection.pageBreakBeforeHeading,
      pageBreakBeforeHeadingMaxLevel: selection.pageBreakBeforeHeadingMaxLevel,
      title: deriveDocumentTitle(activeTab.title),
      writingMode,
      includeDocumentInfo: selection.includeDocumentInfo,
      includeTableOfContents: selection.includeTableOfContents,
      tableOfContentsMaxLevel: selection.tableOfContentsMaxLevel,
      showRoleLabels: selection.showRoleLabels,
      documentInfo: {
        title: activeTab.frontmatterFields.title,
        author: activeTab.frontmatterFields.author,
        translator: activeTab.frontmatterFields.translator,
      },
      breakAfterDocumentInfo: selection.breakAfterDocumentInfo,
      documentInfoTitlePage: selection.documentInfoTitlePage,
      documentInfoTitlePageWritingMode: selection.documentInfoTitlePageWritingMode,
      documentInfoTitlePageLayout: selection.documentInfoTitlePageLayout,
      authorPaletteSnapshot: paletteSnapshot,
      typographySnapshot,
      autoTcySnapshot,
      outputProfile: selection.webBookOutputProfile,
    })
    if (!exported) return

    const bridge = window.nyozeBridge?.fs?.exportWebBook
    if (!bridge) return
    const suggestedPath = suggestWebBookExportPath(activeTab.filePath)

    // One-shot profile override for capacity "switch to package" — never writes defaults.
    let effectiveProfile: WebBookOutputProfile = selection.webBookOutputProfile
    let capacityWarningsAcknowledged = false
    let retry = true
    while (retry) {
      retry = false
      const result = await bridge(
        exported.template,
        exported.assetRequests,
        activeTab.filePath ?? undefined,
        paletteSnapshot,
        typographySnapshot,
        autoTcySnapshot,
        suggestedPath,
        effectiveProfile,
        capacityWarningsAcknowledged,
      )
      if (result.saved) {
        showBackupWarningIfPresent(result.backupWarning)
        showGlobalNotice(
          exported.warnings.length > 0
            ? getUiText(uiLanguageMode, 'export.webBookSuccessWithWarnings')
            : getUiText(uiLanguageMode, 'export.webBookSuccess'),
        )
        return
      }
      if (result.errorKind === 'canceled') return
      if (result.errorKind === 'source-document-unavailable') {
        showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookFailureSourceUnavailable'))
        return
      }
      if (result.errorKind === 'asset-error') {
        showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookFailureAssetError'))
        showBookExportResultDetails({
          format: 'webBook',
          outcome: 'asset-error',
          chapterWarnings: [],
          conversionWarnings: [],
          assetFailures: mapWebBookAssetFailuresToDisplayItems(result.assetFailures ?? []),
        })
        return
      }
      if (result.errorKind === 'html-too-large') {
        showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookFailureHtmlTooLarge'))
        return
      }
      if (result.errorKind === 'needs-capacity-confirm') {
        if (!result.capacity) return
        const decision = await requestCapacityConfirm(result.capacity)
        if (decision.action === 'cancel') return
        if (decision.action === 'switch-to-package') {
          effectiveProfile = 'package'
          capacityWarningsAcknowledged = false
          retry = true
          continue
        }
        capacityWarningsAcknowledged = true
        retry = true
        continue
      }
      const action = await requestSaveFailureAction({
        tabTitle: activeTab.title,
        filePath: result.filePath ?? null,
        errorKind: result.errorKind ?? 'write-failed',
        errorMessage: result.errorMessage,
      })
      if (action === 'retry' || action === 'saveAs') retry = true
    }
  }, [
    activeTab.filePath,
    activeTab.frontmatterFields,
    activeTab.id,
    activeTab.title,
    coreRef,
    displaySettings,
    docColorSettings.headingColor,
    docColorSettings.pageColor,
    docColorSettings.textColor,
    docHeadingFont,
    fullPlainEditActive,
    internalDocActive,
    paragraphPlainModeActive,
    requestCapacityConfirm,
    requestExportOptions,
    requestSaveFailureAction,
    showBackupWarningIfPresent,
    showBookExportResultDetails,
    showEditorInlineHint,
    showGlobalNotice,
    uiLanguageMode,
    writingMode,
  ])

  return useMemo(() => ({ exportActiveDocument }), [exportActiveDocument])
}
