import { useCallback, useEffect, useRef } from 'react'
import {
  addProvisionalNote,
  removeProvisionalNotes,
  resolveDurableProvisionalNotes,
  selectProvisionalNotesForDocument,
  type ProvisionalNoteRecord,
} from '../../project/provisionalNoteCleanup'
import { discardProvisionalNotes } from './provisionalNoteDiscardController'

/**
 * STICKY-NOTE-DISCARD-CONSISTENCY1: provisional 付箋（本文 anchor がまだ durable
 * save されていない付箋）の追跡と、明示的な破棄時の cleanup をまとめた hook。
 *
 * 判定本体は `provisionalNoteCleanup.ts`（pure）と
 * `provisionalNoteDiscardController.ts`（DI）にあり、ここは
 * 「ref を正本に保つ」「既存 authority から呼べる形にする」「main からの
 * discard handshake へ応答する」だけを持つ。document leave の authority 自体は
 * 既存の共通経路のままで、第二の state machine は作らない。
 */

export type UseProvisionalNotesOptions = {
  /** cleanup 失敗をユーザーへ見せる（付箋 notice modal）。 */
  showNotice: (message: string) => void
  /** cleanup 成功後に付箋表示を再反映する。 */
  refreshNoteViews: () => void
}

export type ProvisionalNoteLeaveScope =
  | { tabId: string; filePath: string | null }
  | 'all'

export function useProvisionalNotes({
  showNotice,
  refreshNoteViews,
}: UseProvisionalNotesOptions) {
  // React state ではなく ref を正本にする（document leave の同期判定から読むため）。
  const recordsRef = useRef<ProvisionalNoteRecord[]>([])

  /**
   * 付箋追加成功時に、まだ未保存の anchor として追跡を開始する。
   * untitled tab（filePath なし）では追跡しない（付箋追加自体が成立しない）。
   */
  const trackInsertedNote = useCallback(
    (
      inserted: { id: string; projectRoot: string; relativeFile: string; fingerprint: string },
      document: { tabId: string; filePath: string | null },
    ) => {
      if (document.filePath === null) return
      recordsRef.current = addProvisionalNote(recordsRef.current, {
        noteId: inserted.id,
        projectRoot: inserted.projectRoot,
        filePath: document.filePath,
        relativeFile: inserted.relativeFile,
        tabId: document.tabId,
        fingerprint: inserted.fingerprint,
      })
    },
    [],
  )

  /**
   * この document に、まだ durable save されていない付箋があるか。
   *
   * Save As は保存先 path が変わり、追跡中の record（旧 path / 旧 project）と
   * 対応が取れなくなるため、呼び出し側はこれが true のとき fail-closed にする。
   */
  const hasProvisionalNotesForDocument = useCallback(
    (document: { tabId: string; filePath: string | null }): boolean =>
      selectProvisionalNotesForDocument(recordsRef.current, document).length > 0,
    [],
  )

  /**
   * 本文 disk write 成功時に durable を確定する。
   * 保存された本文に anchor が実在する付箋だけ追跡解除する。
   */
  const resolveDurableNotesAfterSave = useCallback(
    (saved: { tabId: string; filePath: string | null; markdown: string }) => {
      recordsRef.current = resolveDurableProvisionalNotes(recordsRef.current, saved).next
    },
    [],
  )

  /**
   * 明示的な破棄時の cleanup。
   * fail-closed: false を返したら呼び出し側は document leave を完了させない。
   */
  const discardProvisionalNotesForLeave = useCallback(
    async (scope: ProvisionalNoteLeaveScope): Promise<boolean> => {
      const targets =
        scope === 'all'
          ? recordsRef.current
          : selectProvisionalNotesForDocument(recordsRef.current, scope)
      if (targets.length === 0) return true
      const outcome = await discardProvisionalNotes(
        window.nyozeBridge?.project ?? null,
        targets,
      )
      if (outcome.kind === 'failed') {
        showNotice(outcome.message)
        return false
      }
      recordsRef.current = removeProvisionalNotes(recordsRef.current, outcome.removedIds)
      refreshNoteViews()
      return true
    },
    [refreshNoteViews, showNotice],
  )

  // window close / 明示 app quit の「破棄」。window 全体を捨てるので追跡中すべてが
  // 対象になる。false を返すと main は window / process を閉じない。
  useEffect(() => {
    const appState = window.nyozeBridge?.appState
    if (!appState?.onRequestDiscardBeforeClose || !appState?.reportSaveBeforeClose) {
      return
    }
    return appState.onRequestDiscardBeforeClose((requestId) => {
      void discardProvisionalNotesForLeave('all').then((ok) => {
        appState.reportSaveBeforeClose(requestId, ok)
      })
    })
  }, [discardProvisionalNotesForLeave])

  return {
    trackInsertedNote,
    hasProvisionalNotesForDocument,
    resolveDurableNotesAfterSave,
    discardProvisionalNotesForLeave,
  }
}
