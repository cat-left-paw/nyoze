import { useCallback, useRef } from 'react'
import { getPathBaseName } from '../utils/path'

/**
 * File Explorer の単一ファイル rename / move と、open tab / 付箋 / 作品タブの整合を仲介する hook。
 *
 * App.tsx を thin glue に保つため、次をここへ集約する:
 * - 移動した path に一致する open tab の filePath / title 追従（remap）
 * - 統合 transfer を行う前の dirty / 未保存 open tab ガード
 *   （単一ファイルの統合 transfer は main 側で notes.json / books.json v3 を整合更新するため、
 *    dirty tab の保存先 path を無言で変えないよう、dirty なら拒否させる）
 *   dirty フラグだけでは Source Mode draft や Paragraph Plain の未確定 overlay 入力を取りこぼすため、
 *   active file についてはそれらの未確定 draft probe も併用してガードする。
 * - 統合 transfer 成功後の Notes / preview / 作品タブ refresh
 *
 * 単一ファイルの notes.json / books.json v3 追従は main 側の統合 transfer が担う。
 * この hook はフォルダ rename / move のときだけ notes.json の dir 追従（`relocateNotesForMove`）を呼ぶ。
 */

export type ExplorerMetadataBridgeTab = {
  id: string
  filePath: string | null
  dirty: boolean
}

type UseExplorerMetadataBridgeOptions = {
  tabs: ExplorerMetadataBridgeTab[]
  patchTab: (tabId: string, patch: { filePath: string; title: string }) => void
  relocateNotesForMove: (fromPath: string, toPath: string) => void | Promise<void>
  refreshAllNotePanels: () => void
  bumpProjectRefresh: () => void
  /** 現在 active な tab のファイル path（draft probe の対象判定に使う）。 */
  activeFilePath: string | null
  /**
   * active file に Source Mode draft / Paragraph Plain の未確定 overlay 入力があるか。
   * `tab.dirty` は textarea 入力では即時更新されないため、これを併用して安全側で拒否する。
   */
  hasActiveFileUncommittedDraft: () => boolean
}

export type ExplorerMetadataBridge = {
  onFileMoved: (fromPath: string, toPath: string, opts?: { isDirectory?: boolean }) => void
  canTransferEntry: (absolutePath: string) => { ok: boolean; message?: string }
  onProjectFileTransferred: () => void
}

/**
 * `currentPath` が `fromPath` 自身、または `fromPath/` 配下なら、`toPath` 起点の新しい path を返す。
 * 一致しなければ null。separator / Windows drive の大小差を吸収する。
 */
export function remapMovedPath(
  currentPath: string,
  fromPath: string,
  toPath: string,
): string | null {
  const normalize = (value: string) => {
    const normalized = value.replace(/\\/g, '/')
    return normalized === '/' ? normalized : normalized.replace(/\/+$/g, '')
  }
  const normalizedCurrent = normalize(currentPath)
  const normalizedFrom = normalize(fromPath)
  const normalizedTo = normalize(toPath)
  const windowsLike =
    /^[A-Za-z]:/.test(normalizedCurrent) ||
    /^[A-Za-z]:/.test(normalizedFrom) ||
    /^[A-Za-z]:/.test(normalizedTo)
  const toComparable = (value: string) => (windowsLike ? value.toLowerCase() : value)
  const currentCmp = toComparable(normalizedCurrent)
  const fromCmp = toComparable(normalizedFrom)

  if (currentCmp === fromCmp) return toPath

  const prefix = `${fromCmp}/`
  if (!currentCmp.startsWith(prefix)) return null
  const relative = normalizedCurrent.slice(normalizedFrom.length)
  const remapped = `${normalizedTo}${relative}`
  return toPath.includes('\\') ? remapped.replace(/\//g, '\\') : remapped
}

export const DIRTY_TAB_TRANSFER_BLOCK_MESSAGE =
  '編集中（未保存）のファイルは移動 / 改名できません。先に保存してください。'

export function useExplorerMetadataBridge({
  tabs,
  patchTab,
  relocateNotesForMove,
  refreshAllNotePanels,
  bumpProjectRefresh,
  activeFilePath,
  hasActiveFileUncommittedDraft,
}: UseExplorerMetadataBridgeOptions): ExplorerMetadataBridge {
  // canTransferEntry は transfer 実行時に imperative に呼ぶため、最新値を ref 経由で読む。
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const activeFilePathRef = useRef(activeFilePath)
  activeFilePathRef.current = activeFilePath
  const hasActiveDraftRef = useRef(hasActiveFileUncommittedDraft)
  hasActiveDraftRef.current = hasActiveFileUncommittedDraft

  const onFileMoved = useCallback(
    (fromPath: string, toPath: string, opts?: { isDirectory?: boolean }) => {
      for (const tab of tabs) {
        if (!tab.filePath) continue
        const remappedPath = remapMovedPath(tab.filePath, fromPath, toPath)
        if (!remappedPath) continue
        patchTab(tab.id, { filePath: remappedPath, title: getPathBaseName(remappedPath) })
      }
      // 単一ファイルは main 側統合 transfer が notes.json / books.json v3 を更新済み。
      // フォルダ rename / move だけ notes.json の dir 追従を renderer 経由で行う
      // （フォルダ配下 books.json v3 一括追従は本スライス対象外）。
      if (opts?.isDirectory) {
        void relocateNotesForMove(fromPath, toPath)
      }
    },
    [tabs, patchTab, relocateNotesForMove],
  )

  const canTransferEntry = useCallback(
    (absolutePath: string): { ok: boolean; message?: string } => {
      const matches = (filePath: string) =>
        remapMovedPath(filePath, absolutePath, absolutePath) !== null
      const dirtyBlocked = tabsRef.current.some(
        (tab) => tab.filePath && tab.dirty && matches(tab.filePath),
      )
      // active file の Source Mode draft / Paragraph Plain 未確定 overlay は dirty に乗らないので、
      // 対象が active file のときだけ draft probe を併用する。
      const activePath = activeFilePathRef.current
      const draftBlocked =
        activePath !== null && matches(activePath) && hasActiveDraftRef.current()
      return dirtyBlocked || draftBlocked
        ? { ok: false, message: DIRTY_TAB_TRANSFER_BLOCK_MESSAGE }
        : { ok: true }
    },
    [],
  )

  const onProjectFileTransferred = useCallback(() => {
    refreshAllNotePanels()
    bumpProjectRefresh()
  }, [refreshAllNotePanels, bumpProjectRefresh])

  return { onFileMoved, canTransferEntry, onProjectFileTransferred }
}
