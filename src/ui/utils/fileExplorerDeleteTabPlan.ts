import { isSameOrDescendantPath } from './path'

/**
 * FILE-EXPLORER-DELETE-OPEN-TABS1
 *
 * Nyoze 自身の File Explorer から削除した項目（ファイル / フォルダ）と、open tab の
 * lifecycle を整合させるための pure helper 群。React にも DOM にも filesystem にも
 * 触れない。
 *
 * 契約:
 * - affected tab 判定は path の正本（{@link isSameOrDescendantPath}）だけを使う。
 *   basename 比較も無境界 `startsWith()` も使わない。
 * - dirty な affected tab が 1 件でもあれば、confirm も trash も行わずに拒否する
 *   （`tab.dirty` だけでなく Source Mode / Paragraph Plain / Local Window の
 *   未確定 draft も dirty として扱う）。
 * - 生成した plan は immutable な値で、trash 直前と close 直前に
 *   {@link proveFileExplorerDeleteTabPlan} で再証明する。証明できなければ何もしない
 *   （fail-closed）。timer / polling / quiet period で状態を推測しない。
 */

/** affected 判定に必要な最小の tab 形。 */
export type DeleteTabCandidate = {
  readonly id: string
  readonly filePath: string | null
  /** MANUAL / ショートカット一覧などの内部文書。disk 上のファイルを持たない。 */
  readonly internalDocId?: string | null
}

/** preflight に必要な tab 形（affected 判定 + dirty 判定）。 */
export type DeleteTabPreflightTab = DeleteTabCandidate & {
  readonly dirty: boolean
}

export type LocalImeDraftDirtyNoticeLike = {
  readonly dirty: boolean
  readonly documentIdentity: string | null
}

export type FileExplorerDeleteTabState = {
  readonly tabs: readonly DeleteTabPreflightTab[]
  readonly activeTabId: string
  /** Local Window の未 commit draft の所有 tab。dirty でないときは null。 */
  readonly localImeDraftDirtyOwnerTabId: string | null
  readonly localImeDraftDirtyNotice: LocalImeDraftDirtyNoticeLike
  /** Local Window の document action barrier が進行中か。 */
  readonly localImeDocumentActionPending: boolean
  /**
   * active 文書に Source Mode draft / Paragraph Plain の未確定 overlay 入力があるか。
   * これらは `tab.dirty` に即時反映されないため、別 probe として渡す。
   */
  readonly activeDocumentHasUncommittedDraft: boolean
}

/** trash 直前 / close 直前に再証明するための immutable な plan。 */
export type FileExplorerDeleteTabPlan = {
  readonly targetPath: string
  /** 現在の tab 並び順のままの affected tab id。 */
  readonly affectedTabIds: readonly string[]
  readonly activeTabId: string
  readonly activeTabAffected: boolean
  /** preflight 時点の全 tab の並び（構成変化の検出に使う）。 */
  readonly tabIdOrder: readonly string[]
  /** preflight 時点の Local Window document identity（generation 交代の検出に使う）。 */
  readonly localImeDocumentIdentity: string | null
}

export type FileExplorerDeleteTabBlockReason =
  | 'dirty-tab'
  | 'active-document-draft'
  | 'local-window-dirty'
  | 'local-window-action-pending'

export type FileExplorerDeleteTabPreflight =
  | { readonly ok: true; readonly plan: FileExplorerDeleteTabPlan }
  | {
      readonly ok: false
      readonly reason: FileExplorerDeleteTabBlockReason
      readonly message: string
    }

export const DELETE_BLOCKED_BY_DIRTY_TAB_MESSAGE =
  '開いている文書に未保存の変更があります。保存するかタブを閉じてから削除してください。'

export const DELETE_BLOCKED_BY_PENDING_DOCUMENT_ACTION_MESSAGE =
  '文書の切り替え処理が完了していないため削除できません。少し待ってからもう一度お試しください。'

/**
 * 削除対象 path に一致する open tab を、現在の並び順のまま返す。
 *
 * - ファイル削除: 同じ filePath の tab。
 * - フォルダ削除: そのフォルダ自身、または配下 path を filePath に持つ全 tab。
 * - `filePath` を持たない tab（untitled / 内部文書）は決して affected にしない。
 */
export function resolveAffectedTabIdsForDeletedPath(
  tabs: readonly DeleteTabCandidate[],
  targetPath: string,
): string[] {
  if (!targetPath) return []
  return tabs
    .filter(
      (tab) =>
        !tab.internalDocId &&
        tab.filePath !== null &&
        isSameOrDescendantPath(tab.filePath, targetPath),
    )
    .map((tab) => tab.id)
}

/**
 * 削除実行前の preflight。affected tab が 1 件でも dirty なら拒否する。
 *
 * affected 0 件でも ok を返す（削除自体は通し、finalize は何もしない）。
 */
export function resolveFileExplorerDeleteTabPreflight(
  state: FileExplorerDeleteTabState,
  targetPath: string,
): FileExplorerDeleteTabPreflight {
  const affectedTabIds = resolveAffectedTabIdsForDeletedPath(state.tabs, targetPath)
  const affected = new Set(affectedTabIds)
  const activeTabAffected = affected.has(state.activeTabId)

  const plan: FileExplorerDeleteTabPlan = {
    targetPath,
    affectedTabIds,
    activeTabId: state.activeTabId,
    activeTabAffected,
    tabIdOrder: state.tabs.map((tab) => tab.id),
    localImeDocumentIdentity: state.localImeDraftDirtyNotice.documentIdentity,
  }

  // affected が 0 件なら open tab には一切影響しないので、dirty 検査もしない。
  if (affectedTabIds.length === 0) return { ok: true, plan }

  // Local Window の document action が進行中なら、どの tab の状態も確定していない。
  if (state.localImeDocumentActionPending) {
    return {
      ok: false,
      reason: 'local-window-action-pending',
      message: DELETE_BLOCKED_BY_PENDING_DOCUMENT_ACTION_MESSAGE,
    }
  }

  // Local Window 側にだけ存在する未 commit 内容は tab.dirty に乗らない。
  // owner を特定できない / active 以外が owner という不整合は fail-closed で拒否する。
  if (state.localImeDraftDirtyNotice.dirty) {
    const owner = state.localImeDraftDirtyOwnerTabId
    if (
      owner === null ||
      owner !== state.activeTabId ||
      affected.has(owner)
    ) {
      return {
        ok: false,
        reason: 'local-window-dirty',
        message: DELETE_BLOCKED_BY_DIRTY_TAB_MESSAGE,
      }
    }
  }

  if (state.tabs.some((tab) => affected.has(tab.id) && tab.dirty)) {
    return {
      ok: false,
      reason: 'dirty-tab',
      message: DELETE_BLOCKED_BY_DIRTY_TAB_MESSAGE,
    }
  }

  // Source Mode draft / Paragraph Plain 未確定 overlay は active 文書にだけ存在する。
  // 対象が active 文書のときだけ probe を効かせる（背景 tab の close は editor へ触れない）。
  if (activeTabAffected && state.activeDocumentHasUncommittedDraft) {
    return {
      ok: false,
      reason: 'active-document-draft',
      message: DELETE_BLOCKED_BY_DIRTY_TAB_MESSAGE,
    }
  }

  return { ok: true, plan }
}

/**
 * trash 成功後の tab finalize の結果。
 *
 * trash は既に成功しているため「何もしない」結果は持たない。affected tab は必ず
 * close されるか detach（`filePath` を外して untitled 化）されるかへ収束する。
 * `closed-with-detached` は呼び出し側が利用者へ通知するための区別で、どちらの結果でも
 * 削除済み path を持つ tab は残らない。
 */
export type FileExplorerDeleteTabFinalizeResult =
  | "closed"
  | "closed-with-detached"
  | "no-affected-tabs"

/**
 * trash 成功後の tab finalize 計画。
 *
 * **trash 前と違い、ここでは「証明できないから何もしない」を選べない。** ファイルは
 * 既にゴミ箱にあるので、affected tab を「閉じる」か「path から切り離す」かのどちらかへ
 * 必ず収束させる。
 *
 * - `closeTabIds`: clean なので安全に閉じられる affected tab。
 * - `detachTabIds`: trash 待ちの間に未保存内容が乗る等で閉じられない affected tab。
 *   閉じずに `filePath` を外して untitled 化する（本文は残し、削除済み path を持つ
 *   編集可能タブにはしない。自動保存もファイル再作成もしない）。
 * - `nextActiveTabId`: close 適用後に active にする tab。null は「残る tab が 0 件」で、
 *   呼び出し側が空の untitled tab を 1 件だけ作る合図。
 * - `requiresDocumentSwitch`: active tab を close するので別文書へ切り替えが要る場合だけ true。
 */
export type FileExplorerDeleteTabFinalizePlan = {
  readonly targetPath: string
  readonly closeTabIds: readonly string[]
  readonly detachTabIds: readonly string[]
  readonly nextActiveTabId: string | null
  readonly requiresDocumentSwitch: boolean
}

/**
 * finalize 時点の live state から close / detach を決める。
 *
 * 閉じられない条件（= detach 行き）は preflight の dirty 条件と同じ根拠を使う:
 * `tab.dirty` / Local Window の未 commit draft / active 文書の Source Mode・
 * Paragraph Plain 未確定 draft。Local Window の document action が進行中なら
 * active 文書の切替は証明できないので、active tab だけ detach へ寄せる。
 */
export function resolveFileExplorerDeleteTabFinalizePlan(
  state: FileExplorerDeleteTabState,
  targetPath: string,
): FileExplorerDeleteTabFinalizePlan {
  const tabIdOrder = state.tabs.map((tab) => tab.id)
  const affected = new Set(resolveAffectedTabIdsForDeletedPath(state.tabs, targetPath))
  const draftOwner = state.localImeDraftDirtyNotice.dirty
    ? state.localImeDraftDirtyOwnerTabId ?? state.activeTabId
    : null

  const cannotClose = (tab: DeleteTabPreflightTab): boolean => {
    if (tab.dirty) return true
    if (draftOwner !== null && draftOwner === tab.id) return true
    if (tab.id !== state.activeTabId) return false
    if (state.activeDocumentHasUncommittedDraft) return true
    // active tab の close は document 切替を伴う。barrier 進行中は証明できない。
    return state.localImeDocumentActionPending
  }

  const closeTabIds: string[] = []
  const detachTabIds: string[] = []
  for (const tab of state.tabs) {
    if (!affected.has(tab.id)) continue
    if (cannotClose(tab)) detachTabIds.push(tab.id)
    else closeTabIds.push(tab.id)
  }

  const activeClosed = closeTabIds.includes(state.activeTabId)
  const nextActiveTabId = activeClosed
    ? resolveNextActiveTabIdAfterDeleteClose(tabIdOrder, closeTabIds, state.activeTabId)
    : state.activeTabId
  return {
    targetPath,
    closeTabIds,
    detachTabIds,
    nextActiveTabId,
    requiresDocumentSwitch: activeClosed,
  }
}

/**
 * active tab の document 切替が成立しなかったときに、その tab を close から detach へ降格する。
 *
 * trash は既に成功しているので「切替できなかったから何もしない」は選べない。降格すれば
 * editor / focus / 本文へ触れずに、削除済み path だけを tab から外せる。
 */
export function demoteFileExplorerDeleteTabFinalizePlanToDetach(
  plan: FileExplorerDeleteTabFinalizePlan,
  activeTabId: string,
  tabIdOrder: readonly string[],
): FileExplorerDeleteTabFinalizePlan {
  if (!plan.closeTabIds.includes(activeTabId)) return plan
  const detach = new Set([...plan.detachTabIds, activeTabId])
  return {
    targetPath: plan.targetPath,
    closeTabIds: plan.closeTabIds.filter((id) => id !== activeTabId),
    detachTabIds: tabIdOrder.filter((id) => detach.has(id)),
    nextActiveTabId: activeTabId,
    requiresDocumentSwitch: false,
  }
}

/** finalize 適用対象の tab に必要な最小 shape。 */
export type DeleteTabFinalizeApplyTab = {
  readonly id: string
  readonly filePath: string | null
  readonly savedStat: unknown
  readonly dirty: boolean
  readonly title: string
}

/**
 * finalize 計画を tab 配列へ適用する（単一の functional update で使う正本）。
 *
 * detach された tab は本文をそのまま残し、`filePath` / `savedStat` を外して dirty 化する。
 * これで削除済み path を指す tab は 0 件になり、以降の保存は Save As 経路へ回る
 * （削除したファイルを自動で再作成しない）。
 */
export function applyFileExplorerDeleteTabFinalizePlan<T extends DeleteTabFinalizeApplyTab>(
  tabs: readonly T[],
  plan: FileExplorerDeleteTabFinalizePlan,
  makeDetachedTitle: () => string,
): T[] {
  const close = new Set(plan.closeTabIds)
  const detach = new Set(plan.detachTabIds)
  return tabs
    .filter((tab) => !close.has(tab.id))
    .map((tab) =>
      detach.has(tab.id)
        ? // savedStat / filePath だけを外す patch。呼び出し側の tab 型を保つ。
          ({
            ...tab,
            filePath: null,
            savedStat: null,
            dirty: true,
            title: makeDetachedTitle(),
          } as T)
        : tab,
    )
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * plan を現在の state に対して再証明する。
 *
 * 確認ダイアログ表示中 / 非同期 trash 中に tab 構成・active tab・dirty・
 * document identity が変わっていたら false を返す。`resolve...Preflight()` を
 * 現在 state で再実行し、同一の plan が出ることだけを合格条件にする。
 */
export function proveFileExplorerDeleteTabPlan(
  plan: FileExplorerDeleteTabPlan,
  state: FileExplorerDeleteTabState,
): boolean {
  const current = resolveFileExplorerDeleteTabPreflight(state, plan.targetPath)
  if (!current.ok) return false
  const next = current.plan
  return (
    next.targetPath === plan.targetPath &&
    next.activeTabId === plan.activeTabId &&
    next.activeTabAffected === plan.activeTabAffected &&
    next.localImeDocumentIdentity === plan.localImeDocumentIdentity &&
    sameOrder(next.affectedTabIds, plan.affectedTabIds) &&
    sameOrder(next.tabIdOrder, plan.tabIdOrder)
  )
}

/**
 * affected tab を閉じたあとに active にすべき tab id を決める。
 *
 * - active tab が affected でなければそのまま維持する。
 * - active tab が affected なら、既存 `closeTab` と同じ「右隣優先、末尾なら左隣」規則を
 *   複数 close へ一般化する（元の位置より前に残る unaffected tab の数を index にする）。
 * - 残る tab が 0 件なら null（呼び出し側が空の untitled tab を 1 件だけ作る）。
 */
export function resolveNextActiveTabIdAfterDeleteClose(
  tabIdOrder: readonly string[],
  affectedTabIds: readonly string[],
  activeTabId: string,
): string | null {
  const affected = new Set(affectedTabIds)
  const remaining = tabIdOrder.filter((id) => !affected.has(id))
  if (remaining.length === 0) return null
  if (!affected.has(activeTabId)) {
    return remaining.includes(activeTabId) ? activeTabId : null
  }
  const activeIndex = tabIdOrder.indexOf(activeTabId)
  if (activeIndex < 0) return null
  const remainingBeforeActive = tabIdOrder
    .slice(0, activeIndex)
    .filter((id) => !affected.has(id)).length
  return remaining[Math.min(remainingBeforeActive, remaining.length - 1)] ?? null
}
