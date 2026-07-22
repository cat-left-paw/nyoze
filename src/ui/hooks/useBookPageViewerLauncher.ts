import { useCallback, useMemo } from 'react'
import type { BookExportChapterLoadFailure } from '../../../electron/bookExportChapterLoader'
import type { EditorTab } from './useAppUiState'
import type {
  DisplaySettings,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  UiLanguageMode,
  WritingMode,
} from '../../settings/types'
import { getUiText } from '../i18n/uiText'
import type { UiTextKey } from '../i18n/uiTextRegistry'
import { resolveBookExportTarget } from '../utils/resolveBookExportTarget'
import {
  buildPageViewerAppearanceSnapshot,
  buildPageViewerMetadataDisplaySnapshot,
  capturePageViewerUiThemeSnapshotFromMainWindow,
  readPageViewerReadingSettingsSnapshot,
  type PageViewerAppearanceSnapshot,
  type PageViewerMetadataDisplaySnapshot,
} from './usePageViewerLauncher'

type UseBookPageViewerLauncherInput = {
  activeTab: EditorTab
  internalDocActive: boolean
  uiLanguageMode: UiLanguageMode
  showEditorInlineHint: (message: string) => void
  writingMode: WritingMode
  docColorSettings: DocumentColorSettings
  docFontPreset: DocumentFontPreset
  selectedFont: string | null
  docHeadingFont: DocumentHeadingFont
  displaySettings: DisplaySettings
  /** PV-SET-2: metadata field visibility（appearance とは別経路）。 */
  frontmatterVisible: boolean
  frontmatterShowAuthors: boolean
  frontmatterShowTranslators: boolean
  frontmatterShowRoleLabels: boolean
  /** Book chapterInfo 専用（既定 OFF の Display Settings と同名）。 */
  frontmatterShowInProjectFiles: boolean
  frontmatterProjectShowTitle: boolean
  frontmatterProjectShowAuthors: boolean
}

const LOADER_FAILURE_KEYS: Record<string, UiTextKey> = {
  'manifest-diagnostics': 'pageViewer.bookFailureManifestDiagnostics',
  'book-not-found': 'pageViewer.bookFailureBookNotFound',
  'book-has-no-body-items': 'pageViewer.bookFailureNoBodyItems',
}

function mapBookPageViewerLoaderFailureToKey(failure: BookExportChapterLoadFailure): UiTextKey {
  return LOADER_FAILURE_KEYS[failure.kind] ?? 'pageViewer.bookFailureManifest'
}

function mapBookPageViewerTargetFailureToKey(
  reason: 'not-in-project' | 'no-current-book' | 'unavailable',
): UiTextKey {
  switch (reason) {
    case 'not-in-project':
      return 'pageViewer.bookFailureNotInProject'
    case 'no-current-book':
      return 'pageViewer.bookFailureNoBodyChapter'
    case 'unavailable':
      return 'pageViewer.bookFailureUnavailable'
  }
}

function toBookPageViewerAppearanceSnapshot(
  appearance: PageViewerAppearanceSnapshot,
): import('../../../electron/bookPageViewerOperation').BookPageViewerAppearanceSnapshot {
  return {
    writingMode: appearance.writingMode,
    pageColor: appearance.pageColor,
    textColor: appearance.textColor,
    headingColor: appearance.headingColor,
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    lineHeight: appearance.lineHeight,
    headingFontFamily: appearance.headingFontFamily,
    headingMarginAfter: appearance.headingMarginAfter,
    headingDividerLevels: appearance.headingDividerLevels,
    headingAlignHorizontal: appearance.headingAlignHorizontal,
    headingAlignVertical: appearance.headingAlignVertical,
    rubySize: appearance.rubySize,
    autoTcyEnabled: appearance.autoTcyEnabled,
    autoTcyNumbersOnly: appearance.autoTcyNumbersOnly,
    autoTcyMinDigits: appearance.autoTcyMinDigits,
    autoTcyMaxDigits: appearance.autoTcyMaxDigits,
    // PV-COL-15: active document viewer と同じ header-only UI theme snapshot。
    uiTheme: capturePageViewerUiThemeSnapshotFromMainWindow(),
  }
}

export function useBookPageViewerLauncher({
  activeTab,
  internalDocActive,
  uiLanguageMode,
  showEditorInlineHint,
  writingMode,
  docColorSettings,
  docFontPreset,
  selectedFont,
  docHeadingFont,
  displaySettings,
  frontmatterVisible,
  frontmatterShowAuthors,
  frontmatterShowTranslators,
  frontmatterShowRoleLabels,
  frontmatterShowInProjectFiles,
  frontmatterProjectShowTitle,
  frontmatterProjectShowAuthors,
}: UseBookPageViewerLauncherInput) {
  const openBookPageViewer = useCallback(async () => {
    if (internalDocActive) return
    const filePath = activeTab.filePath
    if (!filePath) {
      showEditorInlineHint(getUiText(uiLanguageMode, 'pageViewer.bookFailureUnavailable'))
      return
    }

    const projectBridge = window.nyozeBridge?.project
    const pageViewerBridge = window.nyozeBridge?.pageViewer?.openBook
    if (!projectBridge || !pageViewerBridge) {
      showEditorInlineHint(getUiText(uiLanguageMode, 'pageViewer.bookFailureUnavailable'))
      return
    }

    const target = await resolveBookExportTarget(projectBridge, filePath)
    if (!target.ok) {
      const key =
        target.reason === 'loader-failed'
          ? mapBookPageViewerLoaderFailureToKey(target.failure)
          : mapBookPageViewerTargetFailureToKey(target.reason)
      showEditorInlineHint(getUiText(uiLanguageMode, key))
      return
    }

    if (activeTab.dirty) {
      showEditorInlineHint(getUiText(uiLanguageMode, 'pageViewer.bookDirtyNotice'))
    }

    const appearance = toBookPageViewerAppearanceSnapshot(
      buildPageViewerAppearanceSnapshot({
        writingMode,
        docColorSettings,
        docFontPreset,
        selectedFont,
        docHeadingFont,
        displaySettings,
      }),
    )

    const metadataDisplay: PageViewerMetadataDisplaySnapshot = buildPageViewerMetadataDisplaySnapshot({
      frontmatterVisible,
      frontmatterShowAuthors,
      frontmatterShowTranslators,
      frontmatterShowRoleLabels,
      frontmatterShowInProjectFiles,
      frontmatterProjectShowTitle,
      frontmatterProjectShowAuthors,
    })

    // PV-SET-4A: 通常 Book Viewer にも読書用 heading pagination default を適用する。
    const readingSettings = await readPageViewerReadingSettingsSnapshot()

    const result = await pageViewerBridge(filePath, {
      selector: { bookId: target.bookId },
      appearance,
      metadataDisplay,
      readingSettings,
    })

    switch (result.kind) {
      case 'opened':
        return
      case 'not-in-project':
        showEditorInlineHint(getUiText(uiLanguageMode, 'pageViewer.bookFailureNotInProject'))
        return
      case 'loader-failed':
        showEditorInlineHint(getUiText(uiLanguageMode, mapBookPageViewerLoaderFailureToKey(result.failure)))
        return
      case 'missing-chapters':
        showEditorInlineHint(getUiText(uiLanguageMode, 'pageViewer.bookFailureMissingChapters'))
        return
      case 'validation-failed':
        showEditorInlineHint(getUiText(uiLanguageMode, 'pageViewer.bookFailureValidation'))
        return
    }
  }, [
    activeTab.dirty,
    activeTab.filePath,
    displaySettings,
    docColorSettings,
    docFontPreset,
    docHeadingFont,
    frontmatterShowAuthors,
    frontmatterShowInProjectFiles,
    frontmatterProjectShowAuthors,
    frontmatterProjectShowTitle,
    frontmatterShowRoleLabels,
    frontmatterShowTranslators,
    frontmatterVisible,
    internalDocActive,
    selectedFont,
    showEditorInlineHint,
    uiLanguageMode,
    writingMode,
  ])

  return useMemo(() => ({ openBookPageViewer }), [openBookPageViewer])
}
