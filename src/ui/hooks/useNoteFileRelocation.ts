import { useCallback, useRef } from 'react'
import { relocateNotesForMovedPath } from './noteFileRelocationController'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'

/**
 * File Explorer の rename / move / delete に notes.json path 追従を配線する hook。
 *
 * 単一ファイルの rename / move は main 側の統合 transfer operation
 * (`project:transferExplorerEntry`) が notes.json と books.json v3 を整合更新する。
 * この hook はフォルダ rename / move 時の notes.json dir 追従と、delete 後の refresh だけを担う。
 *
 * projectRoot を renderer から渡さない方針は controller / main 側で担保している。
 */

export const NOTE_RELOCATION_ERROR_MESSAGE =
  '付箋データの移動追従に失敗しました。手動で確認してください。'

function getProjectBridge(): NoteAnchorProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

type UseNoteFileRelocationOptions = {
  /** 追従で notes.json を書き換えたとき (document / missing-file / preview を refresh) */
  onRelocated: () => void
  /** delete to trash 後など、付箋一覧を refresh したいとき */
  onRefreshAfterDelete: () => void
  /** 追従失敗時 (read invalid / write 失敗)。表示 or ログに留める */
  onError?: (message: string) => void
}

export function useNoteFileRelocation({
  onRelocated,
  onRefreshAfterDelete,
  onError,
}: UseNoteFileRelocationOptions) {
  const onRelocatedRef = useRef(onRelocated)
  const onRefreshAfterDeleteRef = useRef(onRefreshAfterDelete)
  const onErrorRef = useRef(onError)
  onRelocatedRef.current = onRelocated
  onRefreshAfterDeleteRef.current = onRefreshAfterDelete
  onErrorRef.current = onError

  // フォルダ rename / move 時の notes.json dir 追従専用。単一ファイルは統合 transfer 側で処理する。
  const relocateNotesForMove = useCallback(async (fromPath: string, toPath: string) => {
    const bridge = getProjectBridge()
    if (!bridge) return
    const outcome = await relocateNotesForMovedPath(bridge, fromPath, toPath)
    if (outcome.kind === 'relocated') {
      onRelocatedRef.current()
    } else if (outcome.kind === 'error') {
      onErrorRef.current?.(NOTE_RELOCATION_ERROR_MESSAGE)
    }
  }, [])

  const refreshNotesAfterDelete = useCallback(() => {
    onRefreshAfterDeleteRef.current()
  }, [])

  return { relocateNotesForMove, refreshNotesAfterDelete }
}
