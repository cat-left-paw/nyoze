import { IconCheck, IconX } from '@tabler/icons-react'
import type { createUiTextGetter, UiTextKey } from '../i18n/uiText'
import type { ProjectTitleEditError, ProjectTitleEditorApi } from '../hooks/useProjectTitleEditor'
import { ProjectPaneIconButton } from './ProjectPaneIconButton'

type TextGetter = ReturnType<typeof createUiTextGetter>

const TITLE_ERROR_KEY: Record<
  ProjectTitleEditError,
  'projectPanel.titleEditErrorEmpty' | 'projectPanel.titleEditErrorTooLong' | 'projectPanel.titleEditErrorSave'
> = {
  empty: 'projectPanel.titleEditErrorEmpty',
  'too-long': 'projectPanel.titleEditErrorTooLong',
  'save-failed': 'projectPanel.titleEditErrorSave',
}

type ProjectTitleEditorProps = {
  titleEditor: ProjectTitleEditorApi
  t: TextGetter
  onSave: () => void
  onBeginUnregister: () => void
  readOnly?: boolean
  unregisterErrorKey?: UiTextKey | null
}

/**
 * Project タブ header 展開時の作品 title 編集 form。
 * 通常表示（作品名 + edit icon）は ProjectPaneHeader が担当する。
 */
export function ProjectTitleEditor({
  titleEditor,
  t,
  onSave,
  onBeginUnregister,
  readOnly = false,
  unregisterErrorKey = null,
}: ProjectTitleEditorProps) {
  const { editState, leaveBlocked } = titleEditor
  const isEditing = editState.kind === 'editing' && !readOnly

  if (!isEditing && !leaveBlocked && !unregisterErrorKey) {
    return null
  }

  if (!isEditing) {
    return (
      <div className="project-pane-title-edit-compact">
        {leaveBlocked ? (
          <p className="project-pane-title-edit-error">{t('projectPanel.titleEditLeaveBlocked')}</p>
        ) : null}
        {unregisterErrorKey ? (
          <p className="project-pane-book-edit-error">{t(unregisterErrorKey)}</p>
        ) : null}
      </div>
    )
  }

  const saveLabel = editState.saving
    ? t('projectPanel.titleEditSaving')
    : t('projectPanel.save')

  return (
    <div className="project-pane-title-edit-compact">
      <div className="project-pane-title-edit">
        <input
          type="text"
          className="project-pane-title-input"
          value={editState.draft}
          onChange={(e) => titleEditor.setDraft(e.target.value)}
          disabled={editState.saving}
          aria-label={t('projectPanel.titleEditInputLabel')}
          autoFocus
        />
        <div className="project-pane-title-edit-actions">
          <ProjectPaneIconButton
            icon={IconCheck}
            label={saveLabel}
            onClick={onSave}
            disabled={editState.saving}
          />
          <ProjectPaneIconButton
            icon={IconX}
            label={t('projectPanel.cancel')}
            onClick={() => titleEditor.cancelEdit()}
            disabled={editState.saving}
          />
          <button
            type="button"
            className="project-pane-book-btn project-pane-unregister-trigger"
            onClick={onBeginUnregister}
            disabled={editState.saving}
            title={t('projectPanel.unregisterProject', 'tooltip')}
            aria-label={t('projectPanel.unregisterProject', 'tooltip')}
          >
            {t('projectPanel.unregisterProject')}
          </button>
        </div>
        {editState.error ? (
          <p className="project-pane-title-edit-error">{t(TITLE_ERROR_KEY[editState.error])}</p>
        ) : null}
        {leaveBlocked ? (
          <p className="project-pane-title-edit-error">{t('projectPanel.titleEditLeaveBlocked')}</p>
        ) : null}
        {unregisterErrorKey ? (
          <p className="project-pane-book-edit-error">{t(unregisterErrorKey)}</p>
        ) : null}
      </div>
    </div>
  )
}
