import { discardParagraphPlainAfterCleanup } from '../utils/documentCloseGuard'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProvisionalNoteRecord } from '../../project/provisionalNoteCleanup'
import {
  collectTrackedNoteIdsForDocument,
  hasUnsettledTrackedNotesForTab,
  markTrackedNotesDetachedByEdit,
  pruneTrackedNotesForTabs,
  removeTrackedNotes,
  selectProvisionalNoteRecords,
  selectTrackedNotesForDocument,
  trackNoteDelete,
  trackNoteInsert,
  updateTrackedNoteFingerprint,
  type TrackedNoteRecord,
} from '../../project/noteLifecycleTracking'
import { discardProvisionalNotes } from './provisionalNoteDiscardController'
import { reconcileTrackedNotesAfterSave } from './noteTrackingReconcileController'
import { setTabDirtyContribution } from './dirtyTracking'
import { detectExternalEditConflict, type SavedFileStat } from '../utils/externalEditConflict'
import { isInputSurfacePayloadBearing } from '../../editor-core/features/inputSurface/documentAction'
import { requestLocalImeDocumentAction } from '../../editor-core/features/localImeDocumentActionBarrier'

/**
 * STICKY-NOTE-DISCARD-CONSISTENCY1 / STICKY-NOTE-LIFECYCLE1: この tab で追加または削除の操作をした
 * 付箋 id の追跡と、保存での確定（status を本文の anchor の有無へ合わせる）・明示的な破棄での
 * 取り消しをまとめた hook。
 *
 * 判定本体は `noteLifecycleTracking.ts` / `provisionalNoteCleanup.ts`（pure）と
 * `provisionalNoteDiscardController.ts` / `noteTrackingReconcileController.ts`（DI）にあり、
 * ここは「ref を正本に保つ」「確定を 1 件ずつ順に行う」「既存 authority から呼べる形にする」
 * 「main からの discard handshake へ応答する」「未確定の操作を dirty へ寄与させる」だけを持つ。
 * document leave の authority 自体は既存の共通経路のままで、第二の state machine は作らない。
 */

export type UseProvisionalNotesOptions = {
  discardParagraphPlain?: () => void
  /** 生きている tab（id + filePath + 保存時の stat）。対応しない record は捨てる。 */
  tabs: readonly { id: string; filePath: string | null; savedStat: SavedFileStat }[]
  /** active document。追跡中の付箋を右ペインの orphan 一覧から隠すために使う。 */
  activeDocument: { tabId: string; filePath: string | null }
  /** R4: 本文が保存時と同じ状態で確定が済んだ後に、dirty を計算し直す。 */
  recalcDirtyFromCore: () => void
  /** cleanup / 確定の失敗をユーザーへ見せる（付箋 notice modal）。 */
  showNotice: (message: string) => void
  /** cleanup / 確定の成功後に付箋表示を再反映する。 */
  refreshNoteViews: () => void
}

export type ProvisionalNoteLeaveScope =
  | { tabId: string; filePath: string | null }
  | 'all'

export function useProvisionalNotes({
  tabs,
  discardParagraphPlain,
  activeDocument,
  recalcDirtyFromCore,
  showNotice,
  refreshNoteViews,
}: UseProvisionalNotesOptions) {
  const discardParagraphPlainRef = useRef(discardParagraphPlain)
  discardParagraphPlainRef.current = discardParagraphPlain
  // React state ではなく ref を正本にする（document leave の同期判定から読むため）。
  const recordsRef = useRef<TrackedNoteRecord[]>([])
  // 確定は 1 件ずつ順に行う（同じ project の tab が複数あっても read → write を重ねない）。
  const reconcileQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  // 右ペインの表示（隠す id）だけに使う再描画用の版。正本は ref。
  const [trackingVersion, setTrackingVersion] = useState(0)
  // R4: 本文が保存時と同じ状態での確定。同じ tab で重ねない。失敗した tab は record が変わるまで再び試みない。
  const settlingTabsRef = useRef(new Set<string>())
  const settleFailedTabsRef = useRef(new Set<string>())
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const recalcDirtyRef = useRef(recalcDirtyFromCore)
  recalcDirtyRef.current = recalcDirtyFromCore
  const bumpVersion = useCallback(() => {
    settleFailedTabsRef.current.clear()
    setTrackingVersion((value) => value + 1)
  }, [])


  /**
   * 付箋追加成功時に追跡を開始する（一度も保存を通っていない間は、破棄で entry を取り除く対象）。
   * untitled tab（filePath なし）では追跡しない（付箋追加自体が成立しない）。
   */
  const trackInsertedNote = useCallback(
    (
      inserted: { id: string; projectRoot: string; relativeFile: string; fingerprint: string },
      document: { tabId: string; filePath: string | null },
    ) => {
      if (document.filePath === null) return
      recordsRef.current = trackNoteInsert(recordsRef.current, {
        noteId: inserted.id,
        projectRoot: inserted.projectRoot,
        filePath: document.filePath,
        relativeFile: inserted.relativeFile,
        tabId: document.tabId,
        fingerprint: inserted.fingerprint,
      })
      bumpVersion()
    },
    [bumpVersion],
  )

  /** 「付箋を削除」の成功時に追跡する（notes.json は保存まで書かない）。 */
  const trackDeletedNote = useCallback(
    (
      deleted: { id: string; projectRoot: string; relativeFile: string },
      document: { tabId: string; filePath: string | null },
    ) => {
      if (document.filePath === null) return
      recordsRef.current = trackNoteDelete(recordsRef.current, {
        noteId: deleted.id,
        projectRoot: deleted.projectRoot,
        filePath: document.filePath,
        relativeFile: deleted.relativeFile,
        tabId: document.tabId,
      })
      bumpVersion()
    },
    [bumpVersion],
  )

  /**
   * R3 / R5: 文字の編集（Paragraph Plain の確定・Source Mode の適用）で anchor が消えた id を記録する。
   * その付箋は anchor がない間（Undo の後の Redo で再び消えたときも）隠さず「マーカーのない付箋」として
   * 右ペインに出し、保存でも deleted にしない。印は同じ id への明示の操作（新しい record）でだけ外れる。
   */
  const markNoteAnchorsDetachedByEdit = useCallback((ids: readonly string[]) => {
    const next = markTrackedNotesDetachedByEdit(recordsRef.current, activeDocument, ids)
    if (next.some((entry, index) => entry !== recordsRef.current[index])) {
      recordsRef.current = next
      bumpVersion()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocument.tabId, activeDocument.filePath, bumpVersion])

  /** 編集・状態変更で entry を書き換えた後、provisional の fingerprint を書き込んだ entry のものへ更新する。 */
  const refreshProvisionalNoteFingerprint = useCallback((saved: { id: string; fingerprint: string }) => {
    recordsRef.current = updateTrackedNoteFingerprint(recordsRef.current, saved.id, saved.fingerprint)
  }, [])

  /**
   * この document に、まだ一度も保存を通っていない付箋の追加があるか。
   *
   * Save As は保存先 path が変わり、追跡中の record（旧 path / 旧 project）と
   * 対応が取れなくなるため、呼び出し側はこれが true のとき fail-closed にする。
   */
  const hasProvisionalNotesForDocument = useCallback(
    (document: { tabId: string; filePath: string | null }): boolean =>
      selectProvisionalNoteRecords(recordsRef.current, document).length > 0,
    [],
  )

  /** 追跡中の付箋の id（右ペインの orphan 一覧から隠す）。正本は ref で、版は再描画のためだけ。 */
  const hiddenNoteIds = useMemo(
    () => collectTrackedNoteIdsForDocument(recordsRef.current, activeDocument),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackingVersion, activeDocument.tabId, activeDocument.filePath],
  )

  /**
   * 本文 disk write 成功時に確定する: 追跡中の id の status を、保存した本文の anchor の有無へ合わせる。
   * 1 件ずつ順に行い、結果はその時点の record への差分として反映する。
   * notes.json を書けなかったときは false を返す（本文は保存済み。record は残り、次の保存で確定する）。
   */
  const reconcileNotesAfterSave = useCallback(
    (saved: { tabId: string; filePath: string | null; markdown: string }, options?: { silent?: boolean }): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        if (selectTrackedNotesForDocument(recordsRef.current, saved).length === 0) return true
        const { outcome, apply } = await reconcileTrackedNotesAfterSave(
          window.nyozeBridge?.project ?? null,
          recordsRef.current,
          saved,
        )
        recordsRef.current = apply(recordsRef.current)
        bumpVersion()
        if (outcome.kind === 'failed') {
          if (!options?.silent) showNotice(outcome.message)
          return false
        }
        for (const id of outcome.skippedIds) console.warn('[Nyoze] sticky note reconciliation skipped (not provable):', id)
        if (outcome.deletedIds.length > 0 || outcome.reopenedIds.length > 0) refreshNoteViews()
        return true
      }
      const queued = reconcileQueueRef.current.then(run, run)
      reconcileQueueRef.current = queued.catch(() => undefined)
      return queued
    },
    [bumpVersion, refreshNoteViews, showNotice],
  )

  /**
   * R4: 本文が保存時の内容と同じで、未確定の record があるとき、保存を待たずにその場で確定する
   * （保存の後と同じ確定を、保存済みの本文に対して行う）。きっかけは既存の全文の同期（dirty の計算）で、
   * timer・rAF・polling は足さない。失敗・外部の変更を検出した tab では何もしない（離脱の確認が出る）。
   */
  const settleCleanBody = useCallback((tabId: string, cleanMarkdown: string) => {
    if (settlingTabsRef.current.has(tabId) || settleFailedTabsRef.current.has(tabId)) return
    const tab = tabsRef.current.find((entry) => entry.id === tabId)
    if (!tab || tab.filePath === null) return
    const filePath = tab.filePath
    settlingTabsRef.current.add(tabId)
    void (async () => {
      try {
        const live = await window.nyozeBridge?.fs?.getFileStat?.(filePath).catch(() => null)
        if (detectExternalEditConflict(tab.savedStat, live ? { mtimeMs: live.mtimeMs, size: live.size } : null)) {
          settleFailedTabsRef.current.add(tabId)
          return
        }
        const ok = await reconcileNotesAfterSave({ tabId, filePath, markdown: cleanMarkdown }, { silent: true })
        if (!ok) { settleFailedTabsRef.current.add(tabId); return }
        recalcDirtyRef.current()
      } finally {
        settlingTabsRef.current.delete(tabId)
      }
    })()
  }, [reconcileNotesAfterSave])

  // 最後の操作の後に保存を通っていない record がある tab は、本文が保存時と同じでも「未保存あり」として扱う。
  // 本文が保存時と同じなら、その場で確定を始める（R4）。
  useEffect(() => {
    setTabDirtyContribution((tabId, context) => {
      const unsettled = hasUnsettledTrackedNotesForTab(recordsRef.current, tabId)
      if (unsettled && context.bodyMatchesClean) settleCleanBody(tabId, context.cleanMarkdown)
      return unsettled
    })
    return () => setTabDirtyContribution(null)
  }, [settleCleanBody])

  /**
   * 明示的な破棄時の cleanup。
   * 一度も保存を通っていない追加は notes.json から entry を取り除く。ほかの record は捨てるだけ
   * （本文は disk のままなので anchor と status が整合する）。
   * fail-closed: false を返したら呼び出し側は document leave を完了させない。
   */
  const discardProvisionalNotesForLeave = useCallback(
    async (scope: ProvisionalNoteLeaveScope): Promise<boolean> => {
      const targets: ProvisionalNoteRecord[] = selectProvisionalNoteRecords(recordsRef.current, scope)
      if (targets.length > 0) {
        const outcome = await discardProvisionalNotes(
          window.nyozeBridge?.project ?? null,
          targets,
        )
        if (outcome.kind === 'failed') {
          showNotice(outcome.message)
          return false
        }
        // 既に store から消えていた id も cleanup 側で skip 済みなので、対象の record はすべて解除する。
        recordsRef.current = removeTrackedNotes(recordsRef.current, targets.map((entry) => entry.noteId))
      }
      const scoped = scope === 'all' ? recordsRef.current : selectTrackedNotesForDocument(recordsRef.current, scope)
      if (scoped.length > 0) {
        recordsRef.current = removeTrackedNotes(recordsRef.current, scoped.map((entry) => entry.noteId))
      }
      if (targets.length > 0 || scoped.length > 0) {
        bumpVersion()
        refreshNoteViews()
      }
      return true
    },
    [bumpVersion, refreshNoteViews, showNotice],
  )

  // tab を閉じた・別の文書を読み込んだ（filePath が変わった）後の record を捨てる。
  // 離脱の前に保存か破棄で解決しているので、ここでは notes.json を書かない。
  const liveTabKeys = tabs.map((tab) => `${tab.id}\u0000${tab.filePath ?? ''}`).join('\u0001')
  useEffect(() => {
    const next = pruneTrackedNotesForTabs(recordsRef.current, tabs)
    if (next.length === recordsRef.current.length) return
    recordsRef.current = next
    bumpVersion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTabKeys, bumpVersion])

  // window close / 明示 app quit の「破棄」。window 全体を捨てるので追跡中すべてが
  // 対象になる。false を返すと main は window / process を閉じない。
  useEffect(() => {
    const appState = window.nyozeBridge?.appState
    if (!appState?.onRequestDiscardBeforeClose || !appState?.reportSaveBeforeClose) {
      return
    }
    return appState.onRequestDiscardBeforeClose((requestId) => {
      if (isInputSurfacePayloadBearing() && requestLocalImeDocumentAction('discard-before-close').status !== 'ready') {
        appState.reportSaveBeforeClose(requestId, false)
        return
      }
      void discardParagraphPlainAfterCleanup(() => discardProvisionalNotesForLeave('all'), () => discardParagraphPlainRef.current?.()).then((ok) => {
        appState.reportSaveBeforeClose(requestId, ok)
      }).catch(() => appState.reportSaveBeforeClose(requestId, false))
    })
  }, [discardProvisionalNotesForLeave])

  return {
    trackInsertedNote,
    trackDeletedNote,
    markNoteAnchorsDetachedByEdit,
    refreshProvisionalNoteFingerprint,
    hasProvisionalNotesForDocument,
    hiddenNoteIds,
    reconcileNotesAfterSave,
    discardProvisionalNotesForLeave,
  }
}
