import { useEffect, useMemo, useState } from 'react'
import type { EditorTab } from './useAppUiState'
import type { FileExplorerRole } from '../../project/fileExplorerRoles'
import { normalizeForCompare } from './useFileExplorer'

/**
 * 開いている全 editor tab の Project role（`.nyoze/books.json` v3 正本）を
 * display-only に解決する hook。エディタタブへ role アイコンを出すためだけに使う。
 *
 * 境界:
 * - `EditorTab` へ role を持たせない。この hook の戻り値は
 *   `filePath -> FileExplorerRole` の read-only map で、タブの保存状態には混入しない。
 * - `useFileExplorer` の visible file role 検出と同じ方針
 *   （`window.nyozeBridge.project.detectFileRoles` を batched 1 回呼び、
 *   frontmatter へ fallback しない。renderer から projectRoot は渡さない）。
 * - untitled tab / internal read-only document は `filePath === null` のため対象外。
 * - stale response は tab 集合の依存 key で無効化する（`cancelled` guard）。
 */
export function useEditorTabRoles(
  tabs: EditorTab[],
  projectRefreshNonce = 0,
): ReadonlyMap<string, FileExplorerRole> {
  const [tabRoles, setTabRoles] = useState<ReadonlyMap<string, FileExplorerRole>>(
    () => new Map(),
  )

  const filePaths = useMemo(() => {
    const seen = new Set<string>()
    const paths: string[] = []
    for (const tab of tabs) {
      if (!tab.filePath || tab.internalDocId) continue
      if (seen.has(tab.filePath)) continue
      seen.add(tab.filePath)
      paths.push(tab.filePath)
    }
    return paths
  }, [tabs])
  const filePathsKey = useMemo(() => filePaths.join('\n'), [filePaths])

  useEffect(() => {
    const detect = window.nyozeBridge?.project?.detectFileRoles
    if (!detect || filePaths.length === 0) {
      setTabRoles((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }
    let cancelled = false
    void detect(filePaths)
      .then((entries) => {
        if (cancelled) return
        setTabRoles(new Map(entries.map((entry) => [normalizeForCompare(entry.path), entry.role])))
      })
      .catch(() => {
        if (!cancelled) setTabRoles((prev) => (prev.size === 0 ? prev : new Map()))
      })
    return () => {
      cancelled = true
    }
    // filePaths の中身（key）が変わったとき、または Project metadata 更新の
    // projectRefreshNonce bump 時に再検出する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePathsKey, projectRefreshNonce])

  return tabRoles
}
