import { useState } from 'react'
import type { createUiTextGetter } from '../i18n/uiText'
import type { ProjectCreateState } from '../hooks/useProjectCreate'

/**
 * Project 作成フォーム（Project タブ not-in-project / File Explorer modal で共有）。
 *
 * - 「作品として設定」トリガでフォームを開き、作品名 / 最初の Book 名を入力して作成する。
 *   即実行ではなくフォーム経由にすることで、作成時に project.json と books.json（最初の Book）を
 *   揃えて作る前提を満たす。
 * - 初期値: 作品名=対象フォルダ名 / 最初の Book 名=本編。
 * - 空白 trim 後にどちらかが空なら作成不可（ボタン無効）。
 * - renderer は解決済み root を渡さない。realpath 解決 / 境界検査 / 既存 project 検出は main 側。
 * - 作成は {@link ProjectCreateForm} → container / modal → useProjectCreate → bridge.createProject。
 */

type TextGetter = ReturnType<typeof createUiTextGetter>

/** renderer 側の最初の Book 名の既定。main 側も同じ既定でフォールバックする。 */
export const DEFAULT_INITIAL_BOOK_NAME = '本編'

export type ProjectCreateFormVariant = 'inline' | 'modal'

export function ProjectCreateForm({
  createTargetName,
  createState,
  onCreateProject,
  onCancel,
  variant = 'inline',
  t,
}: {
  /** 作成対象フォルダ名（作品名の初期値）。 */
  createTargetName: string
  createState: ProjectCreateState
  /** 作品名 / 最初の Book 名を渡して作成を実行する。 */
  onCreateProject: (projectTitle: string, initialBookName: string) => void
  /** modal variant のキャンセル。inline ではフォームを閉じる。 */
  onCancel?: () => void
  variant?: ProjectCreateFormVariant
  t: TextGetter
}) {
  const [open, setOpen] = useState(variant === 'modal')
  const [projectTitle, setProjectTitle] = useState(createTargetName)
  const [bookName, setBookName] = useState(DEFAULT_INITIAL_BOOK_NAME)

  const isCreating = createState.kind === 'creating'
  const canSubmit =
    projectTitle.trim().length > 0 && bookName.trim().length > 0 && !isCreating
  const formVisible = variant === 'modal' || open

  const handleCancel = () => {
    if (isCreating) return
    if (variant === 'modal') {
      onCancel?.()
      return
    }
    setOpen(false)
  }

  if (!formVisible) {
    return (
      <>
        <p className="project-pane-create-target">
          {t('projectPanel.createTarget')}: {createTargetName}
        </p>
        <button
          type="button"
          className="project-pane-create-button"
          onClick={() => setOpen(true)}
        >
          {t('projectPanel.createButton')}
        </button>
      </>
    )
  }

  return (
    <div className="project-pane-create-form">
      <p className="project-pane-create-target">
        {t('projectPanel.createTarget')}: {createTargetName}
      </p>
      <label className="project-pane-create-field">
        <span className="project-pane-create-field-label">
          {t('projectPanel.createProjectTitleLabel')}
        </span>
        <input
          type="text"
          className="project-pane-create-input"
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          disabled={isCreating}
          aria-label={t('projectPanel.createProjectTitleLabel')}
          autoFocus
        />
      </label>
      <label className="project-pane-create-field">
        <span className="project-pane-create-field-label">
          {t('projectPanel.createBookNameLabel')}
        </span>
        <input
          type="text"
          className="project-pane-create-input"
          value={bookName}
          onChange={(e) => setBookName(e.target.value)}
          disabled={isCreating}
          aria-label={t('projectPanel.createBookNameLabel')}
        />
      </label>
      <div className="project-pane-create-actions">
        <button
          type="button"
          className="project-pane-create-button"
          onClick={() => onCreateProject(projectTitle, bookName)}
          disabled={!canSubmit}
        >
          {isCreating ? t('projectPanel.creating') : t('projectPanel.createSubmit')}
        </button>
        <button
          type="button"
          className="project-pane-create-cancel"
          onClick={handleCancel}
          disabled={isCreating}
        >
          {t('projectPanel.cancel')}
        </button>
      </div>
      {createState.kind === 'error' ? (
        <p className="project-pane-create-error">{t(createState.messageKey)}</p>
      ) : null}
    </div>
  )
}
