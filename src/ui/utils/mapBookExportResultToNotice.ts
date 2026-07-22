import type { BookExportIpcResult } from '../../../electron/bookExportOperation'
import type { BookExportChapterLoadWarning } from '../../../electron/bookExportChapterLoader'
import type { SaveErrorKind } from '../utils/externalEditConflict'
import type { UiTextKey } from '../i18n/uiTextRegistry'

export type BookExportTargetFailureReason = 'not-in-project' | 'no-current-book' | 'unavailable'

export type BookExportNotice =
  | { kind: 'canceled' }
  | { kind: 'success'; key: UiTextKey }
  | { kind: 'failure-hint'; key: UiTextKey }
  | {
      kind: 'write-failed'
      errorKind: SaveErrorKind
      errorMessage: string
      filePath?: string
    }

const LOADER_FAILURE_KEYS: Record<string, UiTextKey> = {
  'manifest-diagnostics': 'export.bookFailureManifestDiagnostics',
  'book-not-found': 'export.bookFailureBookNotFound',
  'book-has-no-body-items': 'export.bookFailureNoBodyItems',
}

export function mapBookExportLoaderFailureToKey(failure: {
  kind: string
}): UiTextKey {
  return LOADER_FAILURE_KEYS[failure.kind] ?? 'export.bookFailureManifest'
}

/** `chapter-missing` / `chapter-read-error` warnings are included in saved / missing-chapters results. */
export function hasChapterLoadWarnings(warnings: readonly BookExportChapterLoadWarning[]): boolean {
  return warnings.some(
    (warning) => warning.kind === 'chapter-missing' || warning.kind === 'chapter-read-error',
  )
}

export function mapBookExportTargetFailureToKey(
  reason: BookExportTargetFailureReason,
): UiTextKey {
  switch (reason) {
    case 'not-in-project':
      return 'export.bookFailureNotInProject'
    case 'no-current-book':
      return 'export.bookFailureNoBodyChapter'
    case 'unavailable':
      return 'export.bookFailureUnavailable'
  }
}

export function mapBookExportResultToNotice(result: BookExportIpcResult): BookExportNotice {
  if (result.kind === 'canceled') return { kind: 'canceled' }

  if (result.kind === 'saved') {
    const hasWarnings =
      result.conversionWarnings.length > 0 ||
      result.chapterLoadWarnings.length > 0 ||
      hasChapterLoadWarnings(result.chapterLoadWarnings)
    return {
      kind: 'success',
      key: hasWarnings
        ? 'export.bookSuccessFromDiskWithWarnings'
        : 'export.bookSuccessFromDisk',
    }
  }

  if (result.kind === 'write-failed') {
    return {
      kind: 'write-failed',
      errorKind: result.errorKind,
      errorMessage: result.errorMessage,
    }
  }

  if (result.kind === 'validation-failed') {
    return { kind: 'failure-hint', key: 'export.bookFailureValidation' }
  }

  if (result.kind === 'not-in-project') {
    return { kind: 'failure-hint', key: 'export.bookFailureNotInProject' }
  }

  if (result.kind === 'conversion-failed') {
    return { kind: 'failure-hint', key: 'export.bookFailureMissingChapters' }
  }

  if (result.kind === 'asset-error') {
    return { kind: 'failure-hint', key: 'export.bookFailureAssetError' }
  }

  if (result.kind === 'html-too-large') {
    return { kind: 'failure-hint', key: 'export.bookFailureHtmlTooLarge' }
  }

  if (result.kind === 'needs-capacity-confirm') {
    // Handled by useBookExport before this mapper; defensive fallback.
    return { kind: 'canceled' }
  }

  if (result.kind === 'loader-failed') {
    return { kind: 'failure-hint', key: mapBookExportLoaderFailureToKey(result.failure) }
  }

  return { kind: 'failure-hint', key: 'export.bookFailureUnavailable' }
}
