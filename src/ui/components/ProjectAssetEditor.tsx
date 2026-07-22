import type { createUiTextGetter } from '../i18n/uiText'
import type { ProjectAssetEditorApi } from '../hooks/useProjectAssetEditor'

/**
 * Slice B4: Project タブ資料の右ペイン内編集ビュー（横書き textarea）。
 *
 * - 縦書き WYSIWYG にはしない。素の横書き textarea のみ。
 * - 保存 / キャンセルは明示ボタン。外部変更 / 保存失敗時も編集内容を保持する。
 * - 表示専用。状態遷移ロジックは {@link useProjectAssetEditor} に閉じている。
 */

type TextGetter = ReturnType<typeof createUiTextGetter>

export function ProjectAssetEditor({
  editor,
  t,
  centerLocked = false,
}: {
  editor: ProjectAssetEditorApi
  t: TextGetter
  /**
   * 編集中の資料が中央 active tab と同一になった状態。dirty draft を無言破棄しないため
   * 編集 UI は残すが、二重編集を避けるため textarea を read-only 化し警告を出す。
   */
  centerLocked?: boolean
}) {
  const { editState, leaveBlocked, isDirty } = editor
  if (editState.kind !== 'editing') return null

  const loadFailed = editState.status.kind === 'load-error'
  const saving = editState.saving
  const canSave = isDirty && !saving && !loadFailed && !centerLocked

  return (
    <div className="project-pane-edit">
      <textarea
        className="project-pane-edit-textarea"
        value={editState.draft}
        spellCheck={false}
        readOnly={saving || loadFailed || centerLocked}
        onChange={(event) => editor.setDraft(event.target.value)}
        aria-label={t('projectPanel.editTextareaLabel')}
      />

      <div className="project-pane-edit-status">
        {centerLocked ? (
          <p className="project-pane-edit-notice project-pane-edit-notice--warn">
            {t('projectPanel.editCenterLocked')}
          </p>
        ) : null}
        {leaveBlocked ? (
          <p className="project-pane-edit-notice project-pane-edit-notice--warn">
            {t('projectPanel.editLeaveBlocked')}
          </p>
        ) : null}
        {editState.status.kind === 'load-error' ? (
          <p className="project-pane-edit-notice project-pane-edit-notice--error">
            {t('projectPanel.editLoadError')}
          </p>
        ) : null}
        {editState.status.kind === 'save-error' ? (
          <p className="project-pane-edit-notice project-pane-edit-notice--error">
            {t('projectPanel.editSaveError')}
          </p>
        ) : null}
        {editState.status.kind === 'conflict' ? (
          <div className="project-pane-edit-notice project-pane-edit-notice--warn">
            <p>{t('projectPanel.editConflict')}</p>
            <div className="project-pane-edit-conflict-actions">
              <button
                type="button"
                className="project-pane-edit-btn"
                disabled={saving}
                onClick={() => void editor.reloadFromDisk()}
              >
                {t('projectPanel.editReload')}
              </button>
              <button
                type="button"
                className="project-pane-edit-btn project-pane-edit-btn--danger"
                disabled={saving}
                onClick={() => void editor.overwriteSave()}
              >
                {t('projectPanel.editOverwrite')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="project-pane-edit-footer">
        {isDirty ? (
          <span className="project-pane-edit-dirty">{t('projectPanel.editDirty')}</span>
        ) : null}
        <span className="project-pane-edit-footer-spacer" />
        <button
          type="button"
          className="project-pane-edit-btn"
          onClick={() => editor.cancelEdit()}
        >
          {t('projectPanel.cancel')}
        </button>
        <button
          type="button"
          className="project-pane-edit-btn project-pane-edit-btn--primary"
          disabled={!canSave}
          onClick={() => void editor.save()}
        >
          {saving ? t('projectPanel.editSaving') : t('projectPanel.save')}
        </button>
      </div>
    </div>
  )
}
