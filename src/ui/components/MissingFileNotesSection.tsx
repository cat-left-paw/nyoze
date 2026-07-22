import { useCallback, useState } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { MissingFileNotesViewState } from '../hooks/useMissingFileNotes'

export type MissingFileNoteDeleteResult =
  | { kind: 'deleted' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

type MissingFileNotesSectionProps = {
  state: MissingFileNotesViewState
  uiLanguageMode: UiLanguageMode
  deleteEnabled?: boolean
  onDeleteNote?: (id: string) => Promise<MissingFileNoteDeleteResult>
  onDeleteAll?: () => Promise<MissingFileNoteDeleteResult>
}

function formatUpdatedAt(value: string, uiLanguageMode: UiLanguageMode): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const locale = uiLanguageMode === 'en' ? 'en-US' : 'ja-JP'
  return date.toLocaleString(locale)
}

export function MissingFileNotesSection({
  state,
  uiLanguageMode,
  deleteEnabled = true,
  onDeleteNote,
  onDeleteAll,
}: MissingFileNotesSectionProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDeleteNote = useCallback(
    async (id: string) => {
      if (!onDeleteNote) return
      setDeleteError(null)
      const result = await onDeleteNote(id)
      if (result.kind === 'failed') {
        setDeleteError(result.message)
      }
    },
    [onDeleteNote],
  )

  const handleDeleteAll = useCallback(async () => {
    if (!onDeleteAll) return
    setDeleteError(null)
    const result = await onDeleteAll()
    if (result.kind === 'failed') {
      setDeleteError(result.message)
    }
  }, [onDeleteAll])

  if (state.kind === 'unavailable') {
    return null
  }

  if (state.kind === 'loading') {
    return (
      <section
        className="document-notes-missing-file-section"
        aria-label={t('documentNotes.missingFileSectionTitle')}
      >
        <h2 className="document-notes-missing-file-title">
          {t('documentNotes.missingFileSectionTitle')}
        </h2>
        <p className="document-notes-muted">{t('documentNotes.loading')}</p>
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section
        className="document-notes-missing-file-section"
        aria-label={t('documentNotes.missingFileSectionTitle')}
      >
        <h2 className="document-notes-missing-file-title">
          {t('documentNotes.missingFileSectionTitle')}
        </h2>
        <p className="document-notes-error" role="status">
          {state.message}
        </p>
      </section>
    )
  }

  if (state.kind === 'empty') {
    return null
  }

  return (
    <section
      className="document-notes-missing-file-section"
      aria-label={t('documentNotes.missingFileSectionTitle')}
    >
      <div className="document-notes-missing-file-header">
        <h2 className="document-notes-missing-file-title">
          {t('documentNotes.missingFileSectionTitle')}
        </h2>
        {onDeleteAll ? (
          <button
            type="button"
            className="document-notes-delete-all-button"
            disabled={!deleteEnabled}
            onClick={() => void handleDeleteAll()}
          >
            {t('documentNotes.deleteAllMissingFile')}
          </button>
        ) : null}
      </div>
      <p className="document-notes-muted document-notes-missing-file-hint">
        {t('documentNotes.missingFileHint')}
      </p>
      {deleteError ? (
        <p className="document-notes-error" role="status">
          {deleteError}
        </p>
      ) : null}
      <ul className="document-notes-list document-notes-list-missing-file">
        {state.notes.map((note) => (
          <li key={note.id} className="document-notes-item document-notes-item-missing-file">
            <div className="document-notes-item-header">
              <div className="document-notes-missing-file-meta">
                <h3 className="document-notes-item-title">{note.displayTitle}</h3>
                <p className="document-notes-missing-file-path">{note.relativeFile}</p>
                <p className="document-notes-missing-file-updated">
                  {formatUpdatedAt(note.updatedAt, uiLanguageMode)}
                </p>
              </div>
              {onDeleteNote ? (
                <div className="document-notes-item-actions">
                  <button
                    type="button"
                    className="document-notes-delete-button"
                    disabled={!deleteEnabled}
                    onClick={() => void handleDeleteNote(note.id)}
                  >
                    {t('documentNotes.deleteMissingFile')}
                  </button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
