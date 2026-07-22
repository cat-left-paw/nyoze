import { useRef } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { ProjectCreateState } from '../hooks/useProjectCreate'
import { ProjectCreateForm } from './ProjectCreateForm'

export type ProjectCreateModalTarget = {
  folderPath: string
  folderName: string
}

type ProjectCreateModalProps = {
  target: ProjectCreateModalTarget | null
  createState: ProjectCreateState
  uiLanguageMode: UiLanguageMode
  onSubmit: (projectTitle: string, initialBookName: string) => void
  onCancel: () => void
}

/**
 * File Explorer など Project タブ外から開く Project 作成モーダル。
 * 入力 UI は {@link ProjectCreateForm} を modal variant で共有する。
 */
export function ProjectCreateModal({
  target,
  createState,
  uiLanguageMode,
  onSubmit,
  onCancel,
}: ProjectCreateModalProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, target !== null)

  if (!target) return null

  return (
    <div
      ref={overlayRef}
      className="prompt-overlay"
      onClick={() => {
        if (createState.kind !== 'creating') onCancel()
      }}
    >
      <div
        className="prompt-dialog project-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-create-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="project-create-modal-title" className="prompt-title">
          {t('projectPanel.createModalTitle')}
        </h2>
        <ProjectCreateForm
          key={target.folderPath}
          variant="modal"
          createTargetName={target.folderName}
          createState={createState}
          onCreateProject={onSubmit}
          onCancel={onCancel}
          t={t}
        />
      </div>
    </div>
  )
}
