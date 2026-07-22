import { useEffect, useRef } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import type { ProjectCreateModalTarget } from '../components/ProjectCreateModal'
import type { FileExplorerProjectCreateModalTarget } from './useFileExplorer'
import { useProjectCreate } from './useProjectCreate'

type UseExplorerProjectCreateModalOptions = {
  target: FileExplorerProjectCreateModalTarget | null
  onCancel: () => void
  notifyProjectCreatedForFolder: (folderPath: string) => Promise<void>
  onProjectCreated: () => void
}

/**
 * File Explorer から開く Project 作成モーダルの状態と submit 配線。
 * App.tsx を薄く保つため、useProjectCreate + refresh 連携をここへ閉じる。
 */
export function useExplorerProjectCreateModal({
  target,
  onCancel,
  notifyProjectCreatedForFolder,
  onProjectCreated,
}: UseExplorerProjectCreateModalOptions) {
  const targetRef = useRef(target)
  targetRef.current = target

  const { createState, createProjectForFolder, resetCreateState } = useProjectCreate({
    onCreated: () => {
      const current = targetRef.current
      if (current) {
        void notifyProjectCreatedForFolder(current.folderPath)
      }
      onProjectCreated()
    },
  })

  useEffect(() => {
    if (target) {
      resetCreateState()
    }
  }, [target, resetCreateState])

  const modalTarget: ProjectCreateModalTarget | null = target
    ? { folderPath: target.folderPath, folderName: target.folderName }
    : null

  const submit = (projectTitle: string, initialBookName: string) => {
    if (!target) return
    void createProjectForFolder(target.folderPath, { projectTitle, initialBookName })
  }

  return {
    modalProps: {
      target: modalTarget,
      createState,
      onSubmit: submit,
      onCancel,
    } satisfies {
      target: ProjectCreateModalTarget | null
      createState: ReturnType<typeof useProjectCreate>['createState']
      onSubmit: (projectTitle: string, initialBookName: string) => void
      onCancel: () => void
    },
  }
}

export type ExplorerProjectCreateModalProps = ReturnType<
  typeof useExplorerProjectCreateModal
>['modalProps'] & {
  uiLanguageMode: UiLanguageMode
}
