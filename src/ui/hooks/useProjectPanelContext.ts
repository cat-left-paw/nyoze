import { useMemo } from 'react'
import {
  makeActiveFileProjectPanelContext,
  makeProjectSwitcherPanelContext,
  PROJECT_PANEL_CONTEXT_NONE,
  selectProjectPanelContext,
  type ProjectPanelContext,
} from '../../project/projectPanelContext'

export type UseProjectPanelContextOptions = {
  projectSwitcherRoot: string | null
  activeFilePath: string | null
  isInternalDoc: boolean
}

/**
 * Project タブ向けの表示文脈を合成する。
 *
 * 原則としてアクティブなタブのファイルに連動する。File Explorer の選択は Project タブの
 * 表示対象・資料編集可否を勝手に変えないよう、文脈の入力にしない。明示的な作品切り替え
 * （switcher）だけを一時的な上書きとして扱う。
 *
 * 優先順位: switcher selection > active file > none。
 */
export function useProjectPanelContext({
  projectSwitcherRoot,
  activeFilePath,
  isInternalDoc,
}: UseProjectPanelContextOptions): ProjectPanelContext {
  return useMemo(() => {
    const switcherSelection = projectSwitcherRoot
      ? makeProjectSwitcherPanelContext(projectSwitcherRoot)
      : PROJECT_PANEL_CONTEXT_NONE
    const activeFile = makeActiveFileProjectPanelContext(activeFilePath, isInternalDoc)

    return selectProjectPanelContext({
      // File Explorer 選択は文脈に反映しない（常に none）。
      explorerSelection: PROJECT_PANEL_CONTEXT_NONE,
      switcherSelection,
      activeFile,
    })
  }, [projectSwitcherRoot, activeFilePath, isInternalDoc])
}
