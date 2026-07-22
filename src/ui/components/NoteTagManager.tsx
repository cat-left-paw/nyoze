import { useCallback, useId, useState } from 'react'
import {
  IconChevronDown,
  IconHelpCircle,
  IconPencil,
  IconPlus,
  IconTag,
  IconTrash,
} from '@tabler/icons-react'
import type { UiLanguageMode } from '../../settings/types'
import {
  STICKY_NOTE_TAG_SLOT_COUNT,
  TAG_SUGGESTION_LABELS,
  type StickyNoteTagDefinition,
} from '../../project/noteTags'
import { createUiTextGetter } from '../i18n/uiText'
import type { NoteTagManagerSaveResult } from '../hooks/noteTagSlotsController'
import { ProjectPaneIconButton } from './ProjectPaneIconButton'
import { PaneTablerIcon } from './PaneTablerIcon'

type NoteTagManagerProps = {
  definedTags: readonly StickyNoteTagDefinition[]
  disabled: boolean
  uiLanguageMode: UiLanguageMode
  onAddTag: (label: string) => Promise<NoteTagManagerSaveResult>
  onRenameTag: (tagId: string, label: string) => Promise<NoteTagManagerSaveResult>
  onDeleteTag: (tagId: string) => Promise<NoteTagManagerSaveResult>
}

type EditorMode =
  | { kind: 'idle' }
  | { kind: 'add' }
  | { kind: 'edit'; tagId: string; initialLabel: string }

export function NoteTagManager({
  definedTags,
  disabled,
  uiLanguageMode,
  onAddTag,
  onRenameTag,
  onDeleteTag,
}: NoteTagManagerProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const datalistId = useId()
  const [expanded, setExpanded] = useState(true)
  const [editorMode, setEditorMode] = useState<EditorMode>({ kind: 'idle' })
  const [draftLabel, setDraftLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atMaxTags = definedTags.length >= STICKY_NOTE_TAG_SLOT_COUNT
  const controlsDisabled = disabled || busy

  const resetEditor = useCallback(() => {
    setEditorMode({ kind: 'idle' })
    setDraftLabel('')
    setError(null)
  }, [])

  const startAdd = useCallback(() => {
    setEditorMode({ kind: 'add' })
    setDraftLabel('')
    setError(null)
  }, [])

  const startEdit = useCallback((tag: StickyNoteTagDefinition) => {
    setEditorMode({ kind: 'edit', tagId: tag.id, initialLabel: tag.label })
    setDraftLabel(tag.label)
    setError(null)
  }, [])

  const handleSaveDraft = useCallback(async () => {
    if (controlsDisabled) return
    setError(null)
    setBusy(true)
    let result: NoteTagManagerSaveResult
    if (editorMode.kind === 'add') {
      result = await onAddTag(draftLabel)
    } else if (editorMode.kind === 'edit') {
      result = await onRenameTag(editorMode.tagId, draftLabel)
    } else {
      setBusy(false)
      return
    }
    setBusy(false)
    if (result.kind === 'failed') {
      setError(result.message)
      return
    }
    if (result.kind === 'saved') {
      resetEditor()
    }
  }, [controlsDisabled, draftLabel, editorMode, onAddTag, onRenameTag, resetEditor])

  const handleDelete = useCallback(
    async (tagId: string) => {
      if (controlsDisabled) return
      setError(null)
      setBusy(true)
      const result = await onDeleteTag(tagId)
      setBusy(false)
      if (result.kind === 'failed') {
        setError(result.message)
        return
      }
      if (result.kind === 'saved' && editorMode.kind === 'edit' && editorMode.tagId === tagId) {
        resetEditor()
      }
    },
    [controlsDisabled, editorMode, onDeleteTag, resetEditor],
  )

  const editorOpen = editorMode.kind !== 'idle'

  return (
    <section className="document-notes-tag-manager" aria-label={t('documentNotes.tagSlotsTitle')}>
      <div className="document-notes-tag-manager-header">
        <button
          type="button"
          className="document-notes-tag-manager-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="document-notes-tag-manager-title">{t('documentNotes.tagSlotsTitle')}</span>
          <IconChevronDown
            size={16}
            stroke={1.75}
            className={`document-notes-tag-manager-chevron${expanded ? ' is-expanded' : ''}`}
            aria-hidden
          />
        </button>
        <ProjectPaneIconButton
          icon={IconHelpCircle}
          label={t('documentNotes.tagSlotsHint')}
          className="document-notes-tag-manager-help-btn"
        />
      </div>

      {expanded ? (
        <div className="document-notes-tag-manager-body">
          {definedTags.length > 0 ? (
            <ul className="document-notes-tag-manager-list">
              {definedTags.map((tag) =>
                editorMode.kind === 'edit' && editorMode.tagId === tag.id ? null : (
                  <li key={tag.id} className="document-notes-tag-manager-item">
                    <span className="document-notes-tag-manager-item-main">
                      <PaneTablerIcon
                        icon={IconTag}
                        size="sm"
                        className="document-notes-tag-manager-item-icon"
                      />
                      <span className="document-notes-tag-manager-item-label">{tag.label}</span>
                    </span>
                    <div className="document-notes-tag-manager-item-actions">
                      <ProjectPaneIconButton
                        icon={IconPencil}
                        label={t('documentNotes.tagEdit')}
                        className="document-notes-tag-manager-action-btn"
                        disabled={controlsDisabled || editorOpen}
                        onClick={() => startEdit(tag)}
                      />
                      <ProjectPaneIconButton
                        icon={IconTrash}
                        label={t('documentNotes.tagDelete')}
                        className="document-notes-tag-manager-action-btn"
                        disabled={controlsDisabled || editorOpen}
                        onClick={() => void handleDelete(tag.id)}
                      />
                    </div>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="document-notes-muted document-notes-tag-manager-empty">
              {t('documentNotes.tagsUnsetHint')}
            </p>
          )}

          {editorOpen ? (
            <div className="document-notes-tag-manager-editor">
              <label className="document-notes-tag-manager-editor-label">
                <span className="document-notes-tag-manager-editor-caption">
                  {editorMode.kind === 'add'
                    ? t('documentNotes.tagAddLabel')
                    : t('documentNotes.tagEditLabel')}
                </span>
                <input
                  type="text"
                  className="document-notes-tag-manager-input"
                  list={datalistId}
                  value={draftLabel}
                  disabled={controlsDisabled}
                  maxLength={32}
                  autoFocus
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleSaveDraft()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      resetEditor()
                    }
                  }}
                />
              </label>
              <datalist id={datalistId}>
                {TAG_SUGGESTION_LABELS.map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
              <div className="document-notes-tag-manager-editor-actions">
                <button
                  type="button"
                  className="document-notes-tag-manager-save"
                  disabled={controlsDisabled}
                  onClick={() => void handleSaveDraft()}
                >
                  {t('documentNotes.tagSave')}
                </button>
                <button
                  type="button"
                  className="document-notes-tag-manager-cancel"
                  disabled={controlsDisabled}
                  onClick={resetEditor}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="document-notes-tag-manager-add"
              disabled={controlsDisabled || atMaxTags}
              onClick={startAdd}
            >
              <IconPlus size={16} stroke={1.75} aria-hidden />
              <span>{t('documentNotes.tagAdd')}</span>
            </button>
          )}

          <div className="document-notes-tag-manager-ops-help">
            <ProjectPaneIconButton
              icon={IconHelpCircle}
              label={t('documentNotes.tagOpsHint')}
              className="document-notes-tag-manager-help-btn"
            />
          </div>

          {error ? (
            <p className="document-notes-error" role="status">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
