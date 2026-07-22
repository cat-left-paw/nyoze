import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { DocumentNoteView, DocumentNotesViewState } from '../hooks/useDocumentNotes'
import type { NoteEditDraft, NoteEditResult } from '../hooks/noteEditController'
import type { NoteStatusActionResult } from '../hooks/useNoteStatusAction'
import { useNoteCardHighlight } from '../hooks/useNoteCardHighlight'
import { useNoteCardCollapse } from '../hooks/useNoteCardCollapse'
import { useNotePreviewCollapse } from '../hooks/useNotePreviewCollapse'
import { shouldOfferPreviewCollapse } from '../utils/notePreviewCollapse'
import { DocumentNotesResolvedSection } from './DocumentNotesResolvedSection'
import { NoteColorPalettePicker } from './NoteColorPalettePicker'
import { NoteTagFilterBar } from './NoteTagFilterBar'
import { NoteTagPicker } from './NoteTagPicker'
import { NoteTagManager } from './NoteTagManager'
import { ProjectPaneIconButton } from './ProjectPaneIconButton'
import { normalizeNoteEditColor, type NoteColorId } from '../../project/noteColor'
import {
  filterNoteViewsByTag,
  isRegisteredFilterTagId,
  noteViewHasRegisteredTag,
  type StickyNoteTagDefinition,
} from '../../project/noteTags'
import type { DocumentNotesTagContext } from '../hooks/useDocumentNotes'
import type { NoteTagManagerSaveResult } from '../hooks/noteTagSlotsController'

export type { NoteEditResult }
export type { NoteStatusActionResult }

export type OrphanNoteDeleteResult =
  | { kind: 'deleted' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

type DocumentNotesPanelProps = {
  state: DocumentNotesViewState
  uiLanguageMode: UiLanguageMode
  anchoredNoteIds?: ReadonlySet<string>
  focusedNoteId?: string | null
  /** marker click ごとに増える単調キー。reveal 再発火に使う。 */
  focusedNoteEventKey?: number
  onJumpToNote?: (id: string) => boolean
  orphanDeleteEnabled?: boolean
  onDeleteOrphanNote?: (id: string) => Promise<OrphanNoteDeleteResult>
  /** 編集を許可するか (Source Mode / Paragraph Plain 中は false)。 */
  noteEditEnabled?: boolean
  /** タグスロット編集を許可するか。 */
  tagSlotsEnabled?: boolean
  tagContext?: DocumentNotesTagContext
  onAddTag?: (label: string) => Promise<NoteTagManagerSaveResult>
  onRenameTag?: (tagId: string, label: string) => Promise<NoteTagManagerSaveResult>
  onDeleteTag?: (tagId: string) => Promise<NoteTagManagerSaveResult>
  onSaveNoteEdit?: (id: string, draft: NoteEditDraft) => Promise<NoteEditResult>
  /** resolve / reopen を許可するか (plain mode 中は false)。 */
  statusUpdateEnabled?: boolean
  onMarkResolved?: (id: string) => Promise<NoteStatusActionResult>
  onReopenNote?: (id: string) => Promise<NoteStatusActionResult>
}

const MISSING_ANCHOR_DISMISS_MS = 3000

function NoteEditForm({
  noteId,
  initialTitle,
  initialText,
  initialColor,
  initialTagIds,
  definedTags,
  uiLanguageMode,
  saving,
  error,
  onSubmit,
  onCancel,
  t,
}: {
  noteId: string
  initialTitle: string
  initialText: string
  initialColor: NoteColorId
  initialTagIds: string[]
  definedTags: readonly StickyNoteTagDefinition[]
  uiLanguageMode: UiLanguageMode
  saving: boolean
  error: string | null
  onSubmit: (id: string, draft: NoteEditDraft) => void
  onCancel: () => void
  t: ReturnType<typeof createUiTextGetter>
}) {
  const [title, setTitle] = useState(initialTitle)
  const [text, setText] = useState(initialText)
  const [color, setColor] = useState<NoteColorId>(initialColor)
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds)

  // 空タイトル + 空本文は保存させない (作成 UI と同じ整合)。
  const canSave = title.trim().length > 0 || text.trim().length > 0

  const submit = useCallback(() => {
    if (saving || !canSave) return
    onSubmit(noteId, { title, text, color, tagIds })
  }, [canSave, color, noteId, onSubmit, saving, tagIds, text, title])

  const handleTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter は改行。Cmd/Ctrl+Enter で保存、Escape でキャンセル。
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        submit()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }
    },
    [onCancel, submit],
  )

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }
    },
    [onCancel],
  )

  return (
    <form
      className="document-notes-edit-form"
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="document-notes-edit-label">
        <span className="document-notes-edit-label-text">{t('documentNotes.editTitleLabel')}</span>
        <input
          className="document-notes-edit-title"
          type="text"
          value={title}
          disabled={saving}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
      </label>
      <label className="document-notes-edit-label">
        <span className="document-notes-edit-label-text">{t('documentNotes.editTextLabel')}</span>
        <textarea
          className="document-notes-edit-text"
          value={text}
          rows={5}
          disabled={saving}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleTextKeyDown}
        />
      </label>
      <div className="document-notes-edit-label">
        <span className="document-notes-edit-label-text">{t('documentNotes.editColorLabel')}</span>
        <NoteColorPalettePicker
          value={color}
          disabled={saving}
          onChange={setColor}
          t={t}
        />
      </div>
      <div className="document-notes-edit-label">
        <span className="document-notes-edit-label-text">{t('documentNotes.editTagsLabel')}</span>
        <NoteTagPicker
          definedTags={definedTags}
          selectedIds={tagIds}
          disabled={saving}
          uiLanguageMode={uiLanguageMode}
          onChange={setTagIds}
        />
      </div>
      {error ? (
        <p className="document-notes-error" role="status">
          {error}
        </p>
      ) : null}
      <div className="document-notes-edit-actions">
        <button
          type="button"
          className="document-notes-edit-cancel"
          disabled={saving}
          onClick={onCancel}
        >
          {t('documentNotes.editCancel')}
        </button>
        <button
          type="submit"
          className="document-notes-edit-save"
          disabled={saving || !canSave}
        >
          {t('documentNotes.editSave')}
        </button>
      </div>
    </form>
  )
}

function buildItemClassName(extra: {
  reveal: boolean
  selected: boolean
  editing: boolean
  resolved?: boolean
  cardCollapsed?: boolean
}): string {
  let className = 'document-notes-item'
  if (extra.resolved) className += ' document-notes-item--resolved'
  if (extra.editing) className += ' document-notes-item--editing'
  if (extra.cardCollapsed) className += ' document-notes-item--card-collapsed'
  // selected を先に、reveal を後に付けて、重なった時は reveal の見た目を優先する。
  if (extra.selected) className += ' document-notes-item--selected'
  if (extra.reveal) className += ' document-notes-item--reveal'
  return className
}

function buildPreviewRegionId(noteId: string): string {
  return `note-preview-${noteId}`
}

function buildPreviewBodyClassName(options: {
  previewCollapsed: boolean
  previewExpandedScroll: boolean
}): string {
  let className = 'document-notes-item-body note-markdown-preview'
  if (options.previewCollapsed) {
    className += ' document-notes-item-body--collapsed'
  } else if (options.previewExpandedScroll) {
    className += ' document-notes-item-body--expanded-scroll'
  }
  return className
}

function NoteListItem({
  note,
  showJumpButton,
  showDeleteButton,
  deleteDisabled,
  showEditButton,
  editEnabled,
  showMarkResolvedButton,
  markResolvedDisabled,
  showReopenButton,
  reopenDisabled,
  isResolved,
  isEditing,
  isSaving,
  editError,
  isRevealed,
  isSelected,
  missingAnchor,
  isPreviewExpanded,
  onTogglePreviewExpanded,
  isCardCollapsed,
  onToggleCardCollapsed,
  onSelect,
  onJumpToNote,
  onDeleteOrphanNote,
  onMarkResolved,
  onReopenNote,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  definedTags,
  uiLanguageMode,
  t,
}: {
  note: DocumentNoteView
  showJumpButton: boolean
  showDeleteButton: boolean
  deleteDisabled: boolean
  showEditButton: boolean
  editEnabled: boolean
  showMarkResolvedButton: boolean
  markResolvedDisabled: boolean
  showReopenButton: boolean
  reopenDisabled: boolean
  isResolved: boolean
  isEditing: boolean
  isSaving: boolean
  editError: string | null
  isRevealed: boolean
  isSelected: boolean
  missingAnchor: boolean
  isPreviewExpanded: boolean
  onTogglePreviewExpanded: (id: string) => void
  isCardCollapsed: boolean
  onToggleCardCollapsed: (id: string) => void
  onSelect: (id: string) => void
  onJumpToNote?: (id: string) => void
  onDeleteOrphanNote?: (id: string) => void
  onMarkResolved?: (id: string) => void
  onReopenNote?: (id: string) => void
  onStartEdit?: (id: string) => void
  onSubmitEdit?: (id: string, draft: NoteEditDraft) => void
  onCancelEdit?: () => void
  definedTags: readonly StickyNoteTagDefinition[]
  uiLanguageMode: UiLanguageMode
  t: ReturnType<typeof createUiTextGetter>
}) {
  const itemRef = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    if (!isRevealed) return
    itemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isRevealed])

  // カード click で選択。内側の button / 編集フォーム click も選択するだけに留め、
  // パネル余白への伝播は止めて (外側 click=選択解除) と衝突しないようにする。
  const handleCardClick = useCallback(
    (event: MouseEvent<HTMLLIElement>) => {
      event.stopPropagation()
      onSelect(note.id)
    },
    [note.id, onSelect],
  )

  const previewRegionId = buildPreviewRegionId(note.id)

  const handleToggleCardCollapsedClick = useCallback(() => {
    onToggleCardCollapsed(note.id)
  }, [note.id, onToggleCardCollapsed])

  if (isEditing && onSubmitEdit && onCancelEdit) {
    return (
      <li
        ref={itemRef}
        data-note-id={note.id}
        data-note-color={note.displayColorKey}
        className={buildItemClassName({
          reveal: isRevealed,
          selected: isSelected,
          editing: true,
          resolved: isResolved,
        })}
        onClick={handleCardClick}
      >
        <NoteEditForm
          noteId={note.id}
          initialTitle={note.rawTitle ?? ''}
          initialText={note.rawText}
          initialColor={normalizeNoteEditColor(note.rawColor)}
          initialTagIds={note.tagIds.filter((id) =>
            definedTags.some((tag) => tag.id === id),
          )}
          definedTags={definedTags}
          uiLanguageMode={uiLanguageMode}
          saving={isSaving}
          error={editError}
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
          t={t}
        />
      </li>
    )
  }

  const hasActions =
    showJumpButton ||
    showDeleteButton ||
    showEditButton ||
    showMarkResolvedButton ||
    showReopenButton

  const offersPreviewCollapse = shouldOfferPreviewCollapse(note.rawText)
  const previewBodyClassName = buildPreviewBodyClassName({
    previewCollapsed: offersPreviewCollapse && !isPreviewExpanded,
    previewExpandedScroll: offersPreviewCollapse && isPreviewExpanded,
  })

  return (
    <li
      ref={itemRef}
      data-note-id={note.id}
      data-note-color={note.displayColorKey}
      className={buildItemClassName({
        reveal: isRevealed,
        selected: isSelected,
        editing: false,
        resolved: isResolved,
        cardCollapsed: isCardCollapsed,
      })}
      onClick={handleCardClick}
    >
      <div className="document-notes-item-header">
        <div className="document-notes-item-title-row">
          <span
            className="document-notes-card-collapse-host"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ProjectPaneIconButton
              icon={IconChevronDown}
              label={
                isCardCollapsed
                  ? t('documentNotes.expandCard')
                  : t('documentNotes.collapseCard')
              }
              className={`document-notes-card-collapse-btn${isCardCollapsed ? ' is-collapsed' : ''}`}
              ariaExpanded={!isCardCollapsed}
              ariaControls={previewRegionId}
              onClick={handleToggleCardCollapsedClick}
            />
          </span>
          <h3 className="document-notes-item-title">{note.displayTitle}</h3>
        </div>
        {note.displayTags.length > 0 ? (
          <div className="document-notes-item-tags" aria-label={t('documentNotes.noteTagsLabel')}>
            {note.displayTags.map((tag) => (
              <span
                key={tag.id}
                className="document-notes-tag-chip document-notes-tag-chip--display"
                data-note-tag-id={tag.id}
              >
                {tag.label}
              </span>
            ))}
          </div>
        ) : null}
        {hasActions ? (
          <div className="document-notes-item-actions-row">
            <div className="document-notes-item-actions">
              {showJumpButton && onJumpToNote ? (
                <button
                  type="button"
                  className="document-notes-jump-button"
                  onClick={() => onJumpToNote(note.id)}
                >
                  {t('documentNotes.jumpToText')}
                </button>
              ) : null}
              {showEditButton && onStartEdit ? (
                <button
                  type="button"
                  className="document-notes-edit-button"
                  disabled={!editEnabled}
                  onClick={() => onStartEdit(note.id)}
                >
                  {t('documentNotes.edit')}
                </button>
              ) : null}
              {showMarkResolvedButton && onMarkResolved ? (
                <button
                  type="button"
                  className="document-notes-resolve-button"
                  disabled={markResolvedDisabled}
                  onClick={() => onMarkResolved(note.id)}
                >
                  {t('documentNotes.markResolved')}
                </button>
              ) : null}
              {showReopenButton && onReopenNote ? (
                <button
                  type="button"
                  className="document-notes-reopen-button"
                  disabled={reopenDisabled}
                  onClick={() => onReopenNote(note.id)}
                >
                  {t('documentNotes.reopen')}
                </button>
              ) : null}
              {showDeleteButton && onDeleteOrphanNote ? (
                <button
                  type="button"
                  className="document-notes-delete-button"
                  disabled={deleteDisabled}
                  onClick={() => onDeleteOrphanNote(note.id)}
                >
                  {t('documentNotes.deleteOrphan')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {missingAnchor ? (
        <p className="document-notes-missing-anchor" role="status">
          {t('documentNotes.missingAnchor')}
        </p>
      ) : null}
      {offersPreviewCollapse ? (
        <div
          id={previewRegionId}
          className={
            isPreviewExpanded
              ? 'document-notes-preview-wrap'
              : 'document-notes-preview-wrap document-notes-preview-wrap--collapsed'
          }
        >
          <div
            className={previewBodyClassName}
            dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
          />
          <button
            type="button"
            className="document-notes-preview-toggle"
            onClick={(event) => {
              event.stopPropagation()
              onTogglePreviewExpanded(note.id)
            }}
          >
            {isPreviewExpanded
              ? t('documentNotes.showLess')
              : t('documentNotes.showMore')}
          </button>
        </div>
      ) : (
        <div
          id={previewRegionId}
          className="document-notes-item-body note-markdown-preview"
          dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
        />
      )}
    </li>
  )
}

export function DocumentNotesPanel({
  state,
  uiLanguageMode,
  anchoredNoteIds,
  focusedNoteId = null,
  focusedNoteEventKey = 0,
  onJumpToNote,
  orphanDeleteEnabled = true,
  onDeleteOrphanNote,
  noteEditEnabled = true,
  tagSlotsEnabled = true,
  tagContext,
  onAddTag,
  onRenameTag,
  onDeleteTag,
  onSaveNoteEdit,
  statusUpdateEnabled = true,
  onMarkResolved,
  onReopenNote,
}: DocumentNotesPanelProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const [missingAnchorId, setMissingAnchorId] = useState<string | null>(null)
  const [orphanDeleteError, setOrphanDeleteError] = useState<string | null>(null)
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editSavingId, setEditSavingId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [selectedFilterTagId, setSelectedFilterTagId] = useState<string | null>(null)
  const missingAnchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearMissingAnchorTimer = useCallback(() => {
    if (missingAnchorTimerRef.current !== null) {
      clearTimeout(missingAnchorTimerRef.current)
      missingAnchorTimerRef.current = null
    }
  }, [])

  useEffect(() => clearMissingAnchorTimer, [clearMissingAnchorTimer])

  useEffect(() => {
    setStatusUpdateError(null)
  }, [state])

  const tagManagerAvailable = Boolean(
    onAddTag && onRenameTag && onDeleteTag && tagContext,
  )
  const definedTags = useMemo(
    () => tagContext?.definedTags ?? [],
    [tagContext?.definedTags],
  )

  const filterScopeKey = useMemo(() => {
    if (state.kind === 'ready') {
      return [...state.notes, ...state.resolvedNotes]
        .map((note) => note.id)
        .sort()
        .join(',')
    }
    if (state.kind === 'empty') return 'empty'
    return state.kind
  }, [state])

  // active file 切替相当（当該 file の note id 群が変わったとき）だけフィルタを戻す。
  useEffect(() => {
    setSelectedFilterTagId(null)
  }, [filterScopeKey])

  // 選択中タグが定義から消えたら「すべて」へ戻す。
  useEffect(() => {
    if (!isRegisteredFilterTagId(selectedFilterTagId, definedTags)) {
      setSelectedFilterTagId(null)
    }
  }, [definedTags, selectedFilterTagId])

  const { rawAnchoredNotes, rawOrphanNotes, rawResolvedNotes } = useMemo(() => {
    if (state.kind !== 'ready') {
      return {
        rawAnchoredNotes: [] as DocumentNoteView[],
        rawOrphanNotes: [] as DocumentNoteView[],
        rawResolvedNotes: [] as DocumentNoteView[],
      }
    }
    if (!anchoredNoteIds || anchoredNoteIds.size === 0) {
      return {
        rawAnchoredNotes: [],
        rawOrphanNotes: state.notes,
        rawResolvedNotes: state.resolvedNotes,
      }
    }
    const anchored: DocumentNoteView[] = []
    const orphan: DocumentNoteView[] = []
    for (const note of state.notes) {
      if (anchoredNoteIds.has(note.id)) anchored.push(note)
      else orphan.push(note)
    }
    return {
      rawAnchoredNotes: anchored,
      rawOrphanNotes: orphan,
      rawResolvedNotes: state.resolvedNotes,
    }
  }, [anchoredNoteIds, state])

  const anchoredNotes = useMemo(
    () => filterNoteViewsByTag(rawAnchoredNotes, selectedFilterTagId),
    [rawAnchoredNotes, selectedFilterTagId],
  )
  const orphanNotes = useMemo(
    () => filterNoteViewsByTag(rawOrphanNotes, selectedFilterTagId),
    [rawOrphanNotes, selectedFilterTagId],
  )
  const filteredResolvedNotes = useMemo(
    () => filterNoteViewsByTag(rawResolvedNotes, selectedFilterTagId),
    [rawResolvedNotes, selectedFilterTagId],
  )

  const filterActive = selectedFilterTagId !== null
  const filteredNoteCount =
    anchoredNotes.length + orphanNotes.length + filteredResolvedNotes.length
  const showTagFilterEmpty =
    filterActive &&
    filteredNoteCount === 0 &&
    (state.kind === 'ready' || state.kind === 'empty')

  // marker reveal 対象がフィルタ外なら「すべて」へ戻してカードを見せる。
  useEffect(() => {
    if (!focusedNoteId || selectedFilterTagId === null) return
    if (state.kind !== 'ready') return
    const allNotes = [...state.notes, ...state.resolvedNotes]
    const note = allNotes.find((item) => item.id === focusedNoteId)
    if (note && !noteViewHasRegisteredTag(note, selectedFilterTagId)) {
      setSelectedFilterTagId(null)
    }
  }, [focusedNoteId, focusedNoteEventKey, selectedFilterTagId, state])

  // 表示中 note id 群 (active file 変更 / reload / filter 時の不整合 selection 解消用)。
  const presentNoteIds = useMemo<ReadonlySet<string> | null>(() => {
    if (state.kind !== 'ready') return null
    return new Set([
      ...anchoredNotes.map((note) => note.id),
      ...orphanNotes.map((note) => note.id),
      ...filteredResolvedNotes.map((note) => note.id),
    ])
  }, [anchoredNotes, filteredResolvedNotes, orphanNotes, state.kind])

  const { revealNoteId, selectedNoteId, selectNote, clearSelection } = useNoteCardHighlight({
    focusedNoteId,
    focusedNoteEventKey,
    presentNoteIds,
  })

  const { isPreviewExpanded, togglePreviewExpanded } = useNotePreviewCollapse({
    presentNoteIds,
  })

  const { isCardCollapsed, toggleCardCollapsed } = useNoteCardCollapse({
    presentNoteIds,
  })

  // 別タブ / 別ファイルへ切り替わって対象 note が消えたら編集 UI を閉じる。
  // Source Mode / Paragraph Plain へ入ったときも安全側で閉じる。
  useEffect(() => {
    if (editingNoteId === null) return
    if (!noteEditEnabled) {
      setEditingNoteId(null)
      setEditError(null)
      setEditSavingId(null)
      return
    }
    const stillPresent =
      state.kind === 'ready' &&
      (state.notes.some((note) => note.id === editingNoteId) ||
        state.resolvedNotes.some((note) => note.id === editingNoteId))
    if (!stillPresent) {
      setEditingNoteId(null)
      setEditError(null)
      setEditSavingId(null)
    }
  }, [editingNoteId, noteEditEnabled, state])

  const handleJumpToNote = useCallback(
    (id: string) => {
      if (!onJumpToNote) return
      const jumped = onJumpToNote(id)
      if (jumped) {
        clearMissingAnchorTimer()
        setMissingAnchorId(null)
        return
      }
      setMissingAnchorId(id)
      clearMissingAnchorTimer()
      missingAnchorTimerRef.current = setTimeout(() => {
        setMissingAnchorId((current) => (current === id ? null : current))
        missingAnchorTimerRef.current = null
      }, MISSING_ANCHOR_DISMISS_MS)
    },
    [clearMissingAnchorTimer, onJumpToNote],
  )

  const handleDeleteOrphanNote = useCallback(
    async (id: string) => {
      if (!onDeleteOrphanNote) return
      setOrphanDeleteError(null)
      const result = await onDeleteOrphanNote(id)
      if (result.kind === 'failed') {
        setOrphanDeleteError(result.message)
      }
    },
    [onDeleteOrphanNote],
  )

  const handleStartEdit = useCallback((id: string) => {
    setEditError(null)
    setEditSavingId(null)
    setEditingNoteId(id)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingNoteId(null)
    setEditError(null)
    setEditSavingId(null)
  }, [])

  const handleMarkResolved = useCallback(
    async (id: string) => {
      if (!onMarkResolved) return
      setStatusUpdateError(null)
      const result = await onMarkResolved(id)
      if (result.kind === 'failed') {
        setStatusUpdateError(result.message)
      }
    },
    [onMarkResolved],
  )

  const handleReopenNote = useCallback(
    async (id: string) => {
      if (!onReopenNote) return
      setStatusUpdateError(null)
      const result = await onReopenNote(id)
      if (result.kind === 'failed') {
        setStatusUpdateError(result.message)
      }
    },
    [onReopenNote],
  )

  const handleSubmitEdit = useCallback(
    async (id: string, draft: NoteEditDraft) => {
      if (!onSaveNoteEdit) return
      setEditError(null)
      setEditSavingId(id)
      const result = await onSaveNoteEdit(id, draft)
      setEditSavingId((current) => (current === id ? null : current))
      if (result.kind === 'edited' || result.kind === 'cancelled') {
        setEditingNoteId((current) => (current === id ? null : current))
        return
      }
      setEditError(result.message)
    },
    [onSaveNoteEdit],
  )

  if (state.kind === 'unavailable') {
    return null
  }

  const editButtonAvailable = Boolean(onSaveNoteEdit)
  const markResolvedAvailable = Boolean(onMarkResolved)
  const reopenAvailable = Boolean(onReopenNote)

  const renderItem = (note: DocumentNoteView, options: {
    showJumpButton: boolean
    showDeleteButton: boolean
    deleteDisabled: boolean
    showMarkResolvedButton: boolean
    showReopenButton: boolean
    isResolved: boolean
    missingAnchor: boolean
  }) => {
    const isEditing = editingNoteId === note.id
    return (
      <NoteListItem
        key={note.id}
        note={note}
        showJumpButton={options.showJumpButton}
        showDeleteButton={options.showDeleteButton}
        deleteDisabled={options.deleteDisabled}
        showEditButton={editButtonAvailable}
        editEnabled={noteEditEnabled}
        showMarkResolvedButton={options.showMarkResolvedButton && markResolvedAvailable}
        markResolvedDisabled={!statusUpdateEnabled}
        showReopenButton={options.showReopenButton && reopenAvailable}
        reopenDisabled={!statusUpdateEnabled}
        isResolved={options.isResolved}
        isEditing={isEditing}
        isSaving={editSavingId === note.id}
        editError={isEditing ? editError : null}
        isRevealed={revealNoteId === note.id}
        isSelected={selectedNoteId === note.id}
        missingAnchor={options.missingAnchor}
        isPreviewExpanded={isPreviewExpanded(note.id)}
        onTogglePreviewExpanded={togglePreviewExpanded}
        isCardCollapsed={isCardCollapsed(note.id)}
        onToggleCardCollapsed={toggleCardCollapsed}
        onSelect={selectNote}
        onJumpToNote={options.showJumpButton ? handleJumpToNote : undefined}
        onDeleteOrphanNote={
          options.showDeleteButton && onDeleteOrphanNote ? handleDeleteOrphanNote : undefined
        }
        onMarkResolved={
          options.showMarkResolvedButton && markResolvedAvailable ? handleMarkResolved : undefined
        }
        onReopenNote={
          options.showReopenButton && reopenAvailable ? handleReopenNote : undefined
        }
        onStartEdit={editButtonAvailable ? handleStartEdit : undefined}
        onSubmitEdit={editButtonAvailable ? handleSubmitEdit : undefined}
        onCancelEdit={editButtonAvailable ? handleCancelEdit : undefined}
        definedTags={definedTags}
        uiLanguageMode={uiLanguageMode}
        t={t}
      />
    )
  }

  return (
    <section
      className="document-notes-panel"
      aria-label={t('documentNotes.panelTitle')}
      onClick={clearSelection}
    >
      <h2 className="document-notes-panel-title">{t('documentNotes.panelTitle')}</h2>

      {tagManagerAvailable && tagContext ? (
        <NoteTagManager
          definedTags={tagContext.definedTags}
          disabled={!tagSlotsEnabled || state.kind === 'error'}
          uiLanguageMode={uiLanguageMode}
          onAddTag={onAddTag!}
          onRenameTag={onRenameTag!}
          onDeleteTag={onDeleteTag!}
        />
      ) : null}

      {tagContext ? (
        <NoteTagFilterBar
          definedTags={definedTags}
          selectedFilterTagId={selectedFilterTagId}
          onSelectFilter={setSelectedFilterTagId}
          uiLanguageMode={uiLanguageMode}
        />
      ) : null}

      {state.kind === 'loading' ? (
        <p className="document-notes-muted">{t('documentNotes.loading')}</p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="document-notes-error" role="status">
          {state.message}
        </p>
      ) : null}

      {state.kind === 'empty' ? (
        showTagFilterEmpty ? (
          <p className="document-notes-muted" role="status">
            {t('documentNotes.tagFilterEmpty')}
          </p>
        ) : (
          <p className="document-notes-muted">{t('documentNotes.empty')}</p>
        )
      ) : null}

      {state.kind === 'ready' ? (
        <>
          {statusUpdateError ? (
            <p className="document-notes-error" role="status">
              {statusUpdateError}
            </p>
          ) : null}

          {showTagFilterEmpty ? (
            <p className="document-notes-muted" role="status">
              {t('documentNotes.tagFilterEmpty')}
            </p>
          ) : null}

          {!showTagFilterEmpty && anchoredNotes.length > 0 ? (
            <ul className="document-notes-list">
              {anchoredNotes.map((note) =>
                renderItem(note, {
                  showJumpButton: Boolean(onJumpToNote),
                  showDeleteButton: false,
                  deleteDisabled: false,
                  showMarkResolvedButton: true,
                  showReopenButton: false,
                  isResolved: false,
                  missingAnchor: missingAnchorId === note.id,
                }),
              )}
            </ul>
          ) : null}

          {!showTagFilterEmpty && orphanNotes.length > 0 ? (
            <section className="document-notes-orphan-section" aria-label={t('documentNotes.orphanSectionTitle')}>
              <h3 className="document-notes-orphan-title">{t('documentNotes.orphanSectionTitle')}</h3>
              <p className="document-notes-muted document-notes-orphan-hint">{t('documentNotes.orphanHint')}</p>
              {orphanDeleteError ? (
                <p className="document-notes-error" role="status">
                  {orphanDeleteError}
                </p>
              ) : null}
              <ul className="document-notes-list document-notes-list-orphan">
                {orphanNotes.map((note) =>
                  renderItem(note, {
                    showJumpButton: false,
                    showDeleteButton: Boolean(onDeleteOrphanNote),
                    deleteDisabled: !orphanDeleteEnabled,
                    showMarkResolvedButton: false,
                    showReopenButton: false,
                    isResolved: false,
                    missingAnchor: false,
                  }),
                )}
              </ul>
            </section>
          ) : null}

          {!showTagFilterEmpty &&
          anchoredNotes.length === 0 &&
          orphanNotes.length === 0 &&
          filteredResolvedNotes.length === 0 &&
          !filterActive ? (
            <p className="document-notes-muted">{t('documentNotes.empty')}</p>
          ) : null}

          {!showTagFilterEmpty && filteredResolvedNotes.length > 0 ? (
            <DocumentNotesResolvedSection uiLanguageMode={uiLanguageMode}>
              {filteredResolvedNotes.map((note) =>
                renderItem(note, {
                  showJumpButton: Boolean(onJumpToNote),
                  showDeleteButton: false,
                  deleteDisabled: false,
                  showMarkResolvedButton: false,
                  showReopenButton: true,
                  isResolved: true,
                  missingAnchor: missingAnchorId === note.id,
                }),
              )}
            </DocumentNotesResolvedSection>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
