import { useCallback, useEffect } from 'react'
import { useProjectList } from './useProjectList'

/**
 * 左ペイン「作品一覧」タブ用の Project 一覧 query。
 *
 * Project タブ switcher とは別 instance の {@link useProjectList} を使う。
 * 「作品一覧」タブを開いていて、かつ workspace root が設定済みのときだけ load / refresh し、
 * それ以外は reset する。active 書庫 root が変わったときも再取得する。
 * `project:listProjects` は main 側で workspace root を正本に走査するため、
 * 現在の表示フォルダ（書庫 root / project root いずれでも）に依存せず一覧を返せる。
 */
export function useExplorerProjectList(
  workspaceRoot: string | null,
  projectListTabActive: boolean,
  projectRefreshNonce: number,
) {
  const { projectListState, load, refresh, reset } = useProjectList()
  // 作品一覧タブを開いていて workspace root（書庫）がある間だけ一覧を取得する。
  const projectListTabEnabled = Boolean(workspaceRoot) && projectListTabActive

  useEffect(() => {
    if (projectListTabEnabled) {
      void load()
    } else {
      reset()
    }
  }, [workspaceRoot, projectListTabEnabled, load, reset])

  useEffect(() => {
    if (!projectListTabEnabled) return
    refresh()
  }, [projectRefreshNonce, projectListTabEnabled, refresh])

  const refreshExplorerProjectList = useCallback(() => {
    if (projectListTabEnabled) {
      refresh()
    }
  }, [projectListTabEnabled, refresh])

  return {
    projectListState,
    refreshExplorerProjectList,
  }
}
