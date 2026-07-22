import type { UiLanguageMode } from '../../settings/types'
import { ProjectCreateModal } from '../components/ProjectCreateModal'
import type { FileExplorerProjectCreateModalTarget } from '../hooks/useFileExplorer'
import { useExplorerProjectCreateModal } from '../hooks/useExplorerProjectCreateModal'

type ExplorerProjectCreateModalHostProps = {
  target: FileExplorerProjectCreateModalTarget | null
  uiLanguageMode: UiLanguageMode
  onCancel: () => void
  notifyProjectCreatedForFolder: (folderPath: string) => Promise<void>
  onProjectCreated: () => void
}

/** File Explorer 向け Project 作成モーダル。App.tsx の glue を 1 行に保つための host。 */
export function ExplorerProjectCreateModalHost({
  target,
  uiLanguageMode,
  onCancel,
  notifyProjectCreatedForFolder,
  onProjectCreated,
}: ExplorerProjectCreateModalHostProps) {
  const { modalProps } = useExplorerProjectCreateModal({
    target,
    onCancel,
    notifyProjectCreatedForFolder,
    onProjectCreated,
  })

  return <ProjectCreateModal {...modalProps} uiLanguageMode={uiLanguageMode} />
}
