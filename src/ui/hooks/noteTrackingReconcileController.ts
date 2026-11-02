/**
 * STICKY-NOTE-LIFECYCLE1（REVIEWFIX1）: 本文の disk write が成功した後に、追跡中の付箋の
 * status を保存した本文の anchor の有無へ合わせる controller（DI / unit テスト対象）。
 *
 * 書き込みは main の `project:reconcileTrackedNotes`（project 単位 notes lock の中で
 * read → 再証明 → write を不可分に行う）に任せる。renderer は計画と record の更新だけを持つ。
 * 失敗はそのまま返し、record は残す（次の保存で改めて確定する。timer / 再試行はしない）。
 */

import {
  applyTrackedNoteReconciliation,
  planTrackedNoteReconciliation,
  selectTrackedNotesForDocument,
  type TrackedNoteReconciliationRequest,
  type TrackedNoteRecord,
} from '../../project/noteLifecycleTracking'
import type { ProjectReconcileTrackedNotesResult } from '../../project/projectIpcTypes'

export const NOTE_TRACKING_RECONCILE_ERROR_MESSAGE =
  '付箋データ (notes.json) を更新できませんでした。\n' +
  '本文は保存しました。付箋の追加・削除は、次の保存で改めて確定します。'

export type NoteTrackingReconcileBridge = {
  reconcileTrackedNotes: (filePath: string, request: TrackedNoteReconciliationRequest) => Promise<ProjectReconcileTrackedNotesResult>
}

export type NoteTrackingReconcileOutcome =
  | { kind: 'reconciled'; deletedIds: string[]; reopenedIds: string[]; skippedIds: string[] }
  | { kind: 'failed'; message: string; reason: string }

/**
 * 1 回の確定。`records` は呼び出しの時点の snapshot で、結果は `apply` で**その時点の list への差分**
 * として反映する（並んだ呼び出しの片方の結果を消さない）。
 */
export async function reconcileTrackedNotesAfterSave(
  bridge: NoteTrackingReconcileBridge | null,
  records: readonly TrackedNoteRecord[],
  saved: { readonly tabId: string; readonly filePath: string | null; readonly markdown: string },
): Promise<{ outcome: NoteTrackingReconcileOutcome; apply: (current: readonly TrackedNoteRecord[]) => TrackedNoteRecord[] }> {
  const snapshot = selectTrackedNotesForDocument(records, saved)
  const entries = planTrackedNoteReconciliation(snapshot, saved)
  const settle = (outcome: { deletedIds: string[]; reopenedIds: string[]; skippedIds: string[] }) =>
    (current: readonly TrackedNoteRecord[]) => applyTrackedNoteReconciliation(current, snapshot, outcome)
  const keep = (current: readonly TrackedNoteRecord[]) => [...current]
  if (snapshot.length === 0) return { outcome: { kind: 'reconciled', deletedIds: [], reopenedIds: [], skippedIds: [] }, apply: keep }
  if (entries.length === 0) {
    const outcome = { deletedIds: [], reopenedIds: [], skippedIds: [] }
    return { outcome: { kind: 'reconciled', ...outcome }, apply: settle(outcome) }
  }
  if (!bridge || saved.filePath === null) {
    return { outcome: { kind: 'failed', message: NOTE_TRACKING_RECONCILE_ERROR_MESSAGE, reason: 'bridge-unavailable' }, apply: keep }
  }
  let result: ProjectReconcileTrackedNotesResult
  try {
    result = await bridge.reconcileTrackedNotes(saved.filePath, { projectRoot: snapshot[0].projectRoot, entries })
  } catch {
    return { outcome: { kind: 'failed', message: NOTE_TRACKING_RECONCILE_ERROR_MESSAGE, reason: 'bridge-threw' }, apply: keep }
  }
  if (!result.ok) {
    return { outcome: { kind: 'failed', message: NOTE_TRACKING_RECONCILE_ERROR_MESSAGE, reason: result.reason }, apply: keep }
  }
  const outcome = { deletedIds: result.deletedIds, reopenedIds: result.reopenedIds, skippedIds: result.skipped.map((entry) => entry.id) }
  return { outcome: { kind: 'reconciled', ...outcome }, apply: settle(outcome) }
}
