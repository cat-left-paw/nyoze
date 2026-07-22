import { useCallback, useMemo } from 'react'
import type { BookExportFormat } from '../../../electron/bookExportOperation'
import type { EditorTab } from './useAppUiState'
import type { SaveFailureAction, SaveFailureInfo } from '../components/SaveFailureModal'
import type { UiLanguageMode, WritingMode, DisplaySettings, DocumentHeadingFont } from '../../settings/types'
import type { DocumentColorSettings } from '../../settings/types'
import { normalizeWebBookPaletteSnapshot } from '../../editor-core/export/webBookPaletteSnapshot'
import { resolveWebBookTypographySnapshotFromDisplay } from '../../editor-core/export/webBookTypographySnapshot'
import { resolveWebBookAutoTcySnapshotFromDisplay } from '../../editor-core/export/webBookAutoTcySnapshot'
import type { WebBookOutputProfile } from '../../editor-core/export/webBookAssetPlan'
import { getUiText } from '../i18n/uiText'
import {
  mapBookExportLoaderFailureToKey,
  mapBookExportResultToNotice,
  mapBookExportTargetFailureToKey,
} from '../utils/mapBookExportResultToNotice'
import { resolveBookExportTarget } from '../utils/resolveBookExportTarget'
import {
  mapBookExportChapterLoadWarningsToDisplayItems,
  mapBookExportConversionWarningsToDisplayItems,
  mapWebBookAssetFailuresToDisplayItems,
} from '../utils/mapBookExportWarningsToDisplayItems'
import type { ExternalExportOptionsSelection } from './useExternalExportOptionsPrompt'
import type { BookExportResultDetailsPromptState } from './useBookExportResultDetailsPrompt'
import type { WebBookCapacityConfirmDecision } from './useWebBookCapacityConfirmPrompt'
import type { WebBookCapacityReport } from '../../../electron/webBookCapacity'

type UseBookExportInput = {
  activeTab: EditorTab
  internalDocActive: boolean
  uiLanguageMode: UiLanguageMode
  showGlobalNotice: (message: string) => void
  showEditorInlineHint: (message: string) => void
  showBackupWarningIfPresent: (warning: string | undefined | null) => void
  requestSaveFailureAction: (info: SaveFailureInfo) => Promise<SaveFailureAction>
  requestBookExportOptions: (format: BookExportFormat) => Promise<ExternalExportOptionsSelection | null>
  writingMode: WritingMode
  docColorSettings: DocumentColorSettings
  docHeadingFont: DocumentHeadingFont
  displaySettings: DisplaySettings
  showBookExportResultDetails: (state: BookExportResultDetailsPromptState) => void
  requestCapacityConfirm: (report: WebBookCapacityReport) => Promise<WebBookCapacityConfirmDecision>
}

export function useBookExport({
  activeTab,
  internalDocActive,
  uiLanguageMode,
  showGlobalNotice,
  showEditorInlineHint,
  showBackupWarningIfPresent,
  requestSaveFailureAction,
  requestBookExportOptions,
  writingMode,
  docColorSettings,
  docHeadingFont,
  displaySettings,
  showBookExportResultDetails,
  requestCapacityConfirm,
}: UseBookExportInput) {
  const exportBookWithFormat = useCallback(
    async (format: BookExportFormat) => {
      if (internalDocActive) return

      const filePath = activeTab.filePath
      if (!filePath) {
        showEditorInlineHint(getUiText(uiLanguageMode, 'export.bookFailureUnavailable'))
        return
      }

      const projectBridge = window.nyozeBridge?.project
      if (!projectBridge) {
        showEditorInlineHint(getUiText(uiLanguageMode, 'export.bookFailureUnavailable'))
        return
      }

      const target = await resolveBookExportTarget(projectBridge, filePath)
      if (!target.ok) {
        const key =
          target.reason === 'loader-failed'
            ? mapBookExportLoaderFailureToKey(target.failure)
            : mapBookExportTargetFailureToKey(target.reason)
        showEditorInlineHint(getUiText(uiLanguageMode, key))
        return
      }

      if (activeTab.dirty) {
        showEditorInlineHint(getUiText(uiLanguageMode, 'export.bookDirtyNotice'))
      }

      const selection = await requestBookExportOptions(format)
      if (!selection) return

      let authorPaletteSnapshot
      let typographySnapshot
      let autoTcySnapshot
      if (format === 'webBook') {
        try {
          authorPaletteSnapshot = normalizeWebBookPaletteSnapshot({
            pageColor: docColorSettings.pageColor,
            textColor: docColorSettings.textColor,
            headingColor: docColorSettings.headingColor,
          })
        } catch {
          showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookPaletteInvalid'))
          return
        }
        try {
          typographySnapshot = resolveWebBookTypographySnapshotFromDisplay({
            docHeadingFont,
            displaySettings,
          })
        } catch {
          showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookTypographyInvalid'))
          return
        }
        try {
          autoTcySnapshot = resolveWebBookAutoTcySnapshotFromDisplay(displaySettings)
        } catch {
          showEditorInlineHint(getUiText(uiLanguageMode, 'export.webBookAutoTcyInvalid'))
          return
        }
      }

      const exportBridge = window.nyozeBridge?.fs?.exportBook
      if (!exportBridge) return

      // One-shot profile override for capacity "switch to package" — never writes defaults.
      let effectiveWebBookProfile: WebBookOutputProfile | undefined =
        format === 'webBook' ? selection.webBookOutputProfile : undefined
      let capacityWarningsAcknowledged = false

      let retry = true
      while (retry) {
        retry = false
        const result = await exportBridge({
          filePath,
          selector: { bookId: target.bookId },
          format,
          options: {
            boundary: {
              insertPageBreakBetweenChapters: selection.insertPageBreakBetweenChapters,
            },
            export: {
              pageBreak: selection.pageBreak,
              pageBreakBeforeHeading: selection.pageBreakBeforeHeading,
              pageBreakBeforeHeadingMaxLevel: selection.pageBreakBeforeHeadingMaxLevel,
              ...(format === 'leme' || format === 'denden'
                ? {
                    autoTcy: selection.autoTcy,
                    tcyMinDigits: selection.tcyMinDigits,
                    tcyMaxDigits: selection.tcyMaxDigits,
                    tcyNumbersOnly: selection.tcyNumbersOnly,
                  }
                : {}),
            },
            ...(format === 'leme' || format === 'denden' || format === 'aozora'
              ? {
                  includeBookInfo: selection.includeBookInfo,
                  includeChapterInfo: selection.includeChapterInfo,
                  showRoleLabels: selection.showRoleLabels,
                }
              : {}),
            ...(format === 'webBook'
              ? {
                  webBook: {
                    includeDocumentInfo: selection.includeBookInfo,
                    includeTableOfContents: selection.includeTableOfContents,
                    tableOfContentsMaxLevel: selection.tableOfContentsMaxLevel,
                    showRoleLabels: selection.showRoleLabels,
                    includeChapterInfo: selection.includeChapterInfo,
                    breakAfterDocumentInfo: selection.breakAfterDocumentInfo,
                    documentInfoTitlePage: selection.documentInfoTitlePage,
                    documentInfoTitlePageWritingMode: selection.documentInfoTitlePageWritingMode,
                    documentInfoTitlePageLayout: selection.documentInfoTitlePageLayout,
                    writingMode,
                    outputProfile: effectiveWebBookProfile,
                  },
                  authorPaletteSnapshot,
                  typographySnapshot,
                  autoTcySnapshot,
                  capacityWarningsAcknowledged,
                }
              : {}),
          },
        })

        if (result.kind === 'needs-capacity-confirm') {
          const decision = await requestCapacityConfirm(result.capacity)
          if (decision.action === 'cancel') return
          if (decision.action === 'switch-to-package') {
            effectiveWebBookProfile = 'package'
            capacityWarningsAcknowledged = false
            retry = true
            continue
          }
          capacityWarningsAcknowledged = true
          retry = true
          continue
        }

        const notice = mapBookExportResultToNotice(result)
        if (notice.kind === 'canceled') return

        if (notice.kind === 'success') {
          if (result.kind === 'saved') {
            showBackupWarningIfPresent(result.backupWarning)
            if (result.conversionWarnings.length > 0 || result.chapterLoadWarnings.length > 0) {
              showBookExportResultDetails({
                format,
                outcome: 'success-with-warnings',
                chapterWarnings: mapBookExportChapterLoadWarningsToDisplayItems(
                  result.chapterLoadWarnings,
                ),
                conversionWarnings: mapBookExportConversionWarningsToDisplayItems(
                  result.conversionWarnings,
                ),
              })
            }
          }
          showGlobalNotice(getUiText(uiLanguageMode, notice.key))
          return
        }

        if (notice.kind === 'failure-hint') {
          showEditorInlineHint(getUiText(uiLanguageMode, notice.key))
          if (result.kind === 'conversion-failed') {
            showBookExportResultDetails({
              format,
              outcome: 'missing-chapters',
              chapterWarnings: mapBookExportChapterLoadWarningsToDisplayItems(
                result.chapterLoadWarnings,
              ),
              conversionWarnings: [],
              totalChapterCount: result.plan.length,
            })
          }
          if (result.kind === 'asset-error') {
            showBookExportResultDetails({
              format,
              outcome: 'asset-error',
              chapterWarnings: [],
              conversionWarnings: [],
              assetFailures: mapWebBookAssetFailuresToDisplayItems(result.failures),
            })
          }
          return
        }

        const action = await requestSaveFailureAction({
          tabTitle: activeTab.title,
          filePath: notice.filePath ?? null,
          errorKind: notice.errorKind,
          errorMessage: notice.errorMessage,
        })
        if (action === 'retry' || action === 'saveAs') {
          retry = true
        }
      }
    },
    [
      activeTab.dirty,
      activeTab.filePath,
      activeTab.title,
      docColorSettings.headingColor,
      docColorSettings.pageColor,
      docColorSettings.textColor,
      docHeadingFont,
      displaySettings,
      internalDocActive,
      requestBookExportOptions,
      requestCapacityConfirm,
      requestSaveFailureAction,
      showBackupWarningIfPresent,
      showBookExportResultDetails,
      showEditorInlineHint,
      showGlobalNotice,
      uiLanguageMode,
      writingMode,
    ],
  )

  const exportBookAsLeME = useCallback(
    () => exportBookWithFormat('leme'),
    [exportBookWithFormat],
  )
  const exportBookAsDenden = useCallback(
    () => exportBookWithFormat('denden'),
    [exportBookWithFormat],
  )
  const exportBookAsAozora = useCallback(
    () => exportBookWithFormat('aozora'),
    [exportBookWithFormat],
  )
  const exportBookAsWebBook = useCallback(
    () => exportBookWithFormat('webBook'),
    [exportBookWithFormat],
  )

  return useMemo(
    () => ({
      exportBookAsLeME,
      exportBookAsDenden,
      exportBookAsAozora,
      exportBookAsWebBook,
    }),
    [exportBookAsAozora, exportBookAsDenden, exportBookAsWebBook, exportBookAsLeME],
  )
}
