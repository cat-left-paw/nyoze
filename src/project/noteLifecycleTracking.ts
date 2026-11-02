/**
 * STICKY-NOTE-LIFECYCLE1（REVIEWFIX1）: このセッション（tab）で追加または削除の操作をした
 * 付箋 id の追跡（pure helper）。規則は 1 つ:
 *
 * **追跡中の id は、本文の保存が成功するたびに、保存した本文の anchor の有無へ status を合わせる。**
 *
 * - anchor あり → `open` であること（この追跡が `deleted` にしたものなら `open` へ戻す）
 * - anchor なし → `deleted` にする（一度も保存を通っていない追加も同じ。D1）
 *
 * 例外（REVIEWFIX2 R3、2026-10-08 の作者の判断）: **文字の編集（Paragraph Plain の確定、Source Mode の適用）で
 * anchor が消えた付箋は、いつ追加したものでも削除しない。**「マーカーのない付箋」として右ペインに出し、
 * 保存しても `open` のまま（record の `detachedByEdit`）。この印は anchor がないときの扱いだけを決め、
 * anchor が本文へ戻っても外さない（REVIEWFIX3 R5: Redo で再び消えても、見える側へ倒す）。外れるのは、
 * 同じ id に改めて明示の操作（「付箋を削除」、追加）をして新しい record になったときだけ。
 *
 * 追加の record は、保存を 1 回通ったら、破棄で entry を取り除く対象（provisional）でなくなる。
 * 追跡は tab の間続ける（後の Undo / Redo で anchor が消えたり戻ったりしても、次の保存で合わせる）。
 * Undo / Redo のたびに notes.json は書かない。明示の破棄では provisional の entry を取り除き、
 * record をすべて捨てる（本文は disk のままなので、anchor と status が整合する）。
 *
 * 不変条件:
 * - 対象は常に追跡中の id だけ。notes.json 全体と PM Doc を突き合わせない。
 * - 書き戻すときは store 全体を保持し、対象の id の status / updatedAt だけを変える。
 * - 書く前に id・file・期待する status を再証明する。一度も保存を通っていない追加を `deleted` に
 *   するときは fingerprint も確かめる。合わなければその id は書かず、呼び出し側が record を捨てる。
 */

import type { NyozeNote, NyozeNotesStore } from './noteStore'
import type { ProvisionalNoteRecord } from './provisionalNoteCleanup'
import { computeNoteEntryFingerprint } from './provisionalNoteCleanup'
import { formatNoteAnchorComment } from '../editor-core/io/noteAnchor'

export type TrackedNoteRecord = {
  readonly noteId: string
  /** main が `project:resolveForFile` で返した project root。 */
  readonly projectRoot: string
  /** 操作した時点の document 絶対 path。 */
  readonly filePath: string
  /** notes.json 上の project 相対 file。 */
  readonly relativeFile: string
  /** 操作した時点の tab identity。 */
  readonly tabId: string
  /** 最後の操作。 */
  readonly lastOperation: 'insert' | 'delete'
  /** 一度も保存を通っていない追加の entry の fingerprint（破棄で取り除く対象）。保存を通ると null。 */
  readonly provisionalFingerprint: string | null
  /** 最後の操作の後に保存を通った（true なら dirty へ寄与しない）。 */
  readonly settled: boolean
  /** この追跡が最後に書いた status（`deleted` なら、anchor が戻った保存で `open` へ戻す根拠）。 */
  readonly lastWrittenStatus: 'open' | 'deleted' | null
  /**
   * 文字の編集（Paragraph Plain の確定・Source Mode の適用）で anchor が外れたことが一度でもある。
   * anchor がない間は隠さず、保存でも deleted にしない。anchor が戻っても外さない（新しい record でだけ false に戻る）。
   */
  readonly detachedByEdit: boolean
}

type DocumentKey = { readonly tabId: string; readonly filePath: string | null }

function belongsToDocument(record: TrackedNoteRecord, document: DocumentKey): boolean {
  return document.filePath !== null && record.tabId === document.tabId && record.filePath === document.filePath
}

export function trackNoteInsert(
  list: readonly TrackedNoteRecord[],
  inserted: { noteId: string; projectRoot: string; filePath: string; relativeFile: string; tabId: string; fingerprint: string },
): TrackedNoteRecord[] {
  const { fingerprint, ...identity } = inserted
  return [
    ...list.filter((entry) => entry.noteId !== inserted.noteId),
    { ...identity, lastOperation: 'insert', provisionalFingerprint: fingerprint, settled: false, lastWrittenStatus: 'open', detachedByEdit: false },
  ]
}

/** 追加の record があれば（provisional の fingerprint と最後に書いた status を保ったまま）削除へ切り替える。 */
export function trackNoteDelete(
  list: readonly TrackedNoteRecord[],
  deleted: { noteId: string; projectRoot: string; filePath: string; relativeFile: string; tabId: string },
): TrackedNoteRecord[] {
  const existing = list.find((entry) => entry.noteId === deleted.noteId)
  return [
    ...list.filter((entry) => entry.noteId !== deleted.noteId),
    {
      ...deleted,
      lastOperation: 'delete',
      provisionalFingerprint: existing?.provisionalFingerprint ?? null,
      settled: false,
      lastWrittenStatus: existing?.lastWrittenStatus ?? null,
      // 改めて「付箋を削除」の操作をした id は新しい record として扱う（文字の編集の記録は引き継がない）。
      detachedByEdit: false,
    },
  ]
}

/** 2 つの id の列から、消えた id を返す（文字の編集の前後の anchor の差）。 */
export function noteAnchorIdsRemoved(before: readonly string[], after: readonly string[]): string[] {
  const remaining = new Set(after)
  return before.filter((id) => !remaining.has(id))
}

/** 文字の編集で anchor が外れた id を、その document の record へ記録する（追跡していない id は変えない）。 */
export function markTrackedNotesDetachedByEdit(
  list: readonly TrackedNoteRecord[],
  document: DocumentKey,
  ids: readonly string[],
): TrackedNoteRecord[] {
  if (ids.length === 0) return [...list]
  const detached = new Set(ids)
  return list.map((entry) =>
    belongsToDocument(entry, document) && detached.has(entry.noteId) && !entry.detachedByEdit
      ? { ...entry, detachedByEdit: true }
      : entry,
  )
}


/** 編集・状態変更で entry を書き換えた後、provisional の fingerprint を書き込んだ entry のものへ更新する。 */
export function updateTrackedNoteFingerprint(
  list: readonly TrackedNoteRecord[],
  noteId: string,
  fingerprint: string,
): TrackedNoteRecord[] {
  return list.map((entry) =>
    entry.noteId === noteId && entry.provisionalFingerprint !== null ? { ...entry, provisionalFingerprint: fingerprint } : entry,
  )
}

export function removeTrackedNotes(list: readonly TrackedNoteRecord[], noteIds: readonly string[]): TrackedNoteRecord[] {
  if (noteIds.length === 0) return [...list]
  const removed = new Set(noteIds)
  return list.filter((entry) => !removed.has(entry.noteId))
}

export function selectTrackedNotesForDocument(list: readonly TrackedNoteRecord[], document: DocumentKey): TrackedNoteRecord[] {
  return list.filter((entry) => belongsToDocument(entry, document))
}

/** 破棄で entry を取り除く対象（一度も保存を通っていない追加）を、既存の cleanup の形で返す。 */
export function selectProvisionalNoteRecords(
  list: readonly TrackedNoteRecord[],
  scope: DocumentKey | 'all',
): ProvisionalNoteRecord[] {
  return (scope === 'all' ? [...list] : selectTrackedNotesForDocument(list, scope))
    .filter((entry): entry is TrackedNoteRecord & { provisionalFingerprint: string } => entry.provisionalFingerprint !== null)
    .map((entry) => ({
      noteId: entry.noteId,
      projectRoot: entry.projectRoot,
      filePath: entry.filePath,
      relativeFile: entry.relativeFile,
      tabId: entry.tabId,
      fingerprint: entry.provisionalFingerprint,
    }))
}

/** tab の集合（id + filePath）に対応しない record を捨てる（notes.json は書かない）。 */
export function pruneTrackedNotesForTabs(
  list: readonly TrackedNoteRecord[],
  tabs: readonly { readonly id: string; readonly filePath: string | null }[],
): TrackedNoteRecord[] {
  const live = new Set(tabs.filter((tab) => tab.filePath !== null).map((tab) => `${tab.id}\u0000${tab.filePath}`))
  return list.filter((entry) => live.has(`${entry.tabId}\u0000${entry.filePath}`))
}

/**
 * 右ペインの orphan 一覧から隠す id（「付箋を削除」や history で anchor を消した追跡中の id）。
 * 文字の編集で外れた付箋は隠さない（R3）。anchor が本文にあれば anchored 一覧に出る。
 */
export function collectTrackedNoteIdsForDocument(list: readonly TrackedNoteRecord[], document: DocumentKey): Set<string> {
  return new Set(selectTrackedNotesForDocument(list, document).filter((entry) => !entry.detachedByEdit).map((entry) => entry.noteId))
}

/** 最後の操作の後に保存を通っていない record があるか（dirty への寄与）。 */
export function hasUnsettledTrackedNotesForTab(list: readonly TrackedNoteRecord[], tabId: string): boolean {
  return list.some((entry) => entry.tabId === tabId && !entry.settled)
}

export type TrackedNoteReconciliationEntry = {
  readonly id: string
  readonly file: string
  readonly action: 'delete' | 'reopen'
  /** 一度も保存を通っていない追加を `deleted` にするときだけ付ける。 */
  readonly fingerprint?: string
}

export type TrackedNoteReconciliationRequest = {
  readonly projectRoot: string
  readonly entries: readonly TrackedNoteReconciliationEntry[]
}

/** 保存した本文の anchor の有無から、書く必要のある entry を決める（追跡中の id だけ）。 */
export function planTrackedNoteReconciliation(
  list: readonly TrackedNoteRecord[],
  saved: { readonly tabId: string; readonly filePath: string | null; readonly markdown: string },
): TrackedNoteReconciliationEntry[] {
  const entries: TrackedNoteReconciliationEntry[] = []
  for (const record of selectTrackedNotesForDocument(list, saved)) {
    const anchored = saved.markdown.includes(formatNoteAnchorComment(record.noteId))
    // 文字の編集で外れた付箋は、anchor がなくても deleted を書かない（open の orphan として残す）。
    if (!anchored && record.detachedByEdit) continue
    if (!anchored && record.lastWrittenStatus !== 'deleted') {
      entries.push(
        record.provisionalFingerprint !== null
          ? { id: record.noteId, file: record.relativeFile, action: 'delete', fingerprint: record.provisionalFingerprint }
          : { id: record.noteId, file: record.relativeFile, action: 'delete' },
      )
    } else if (anchored && record.lastWrittenStatus === 'deleted') {
      entries.push({ id: record.noteId, file: record.relativeFile, action: 'reopen' })
    }
  }
  return entries
}

export type TrackedNoteReconciliationSkipReason = 'missing' | 'file-mismatch' | 'status-mismatch' | 'fingerprint-mismatch'

export type TrackedNoteReconciliationStoreResult = {
  readonly store: NyozeNotesStore
  readonly deletedIds: string[]
  readonly reopenedIds: string[]
  readonly skipped: { readonly id: string; readonly reason: TrackedNoteReconciliationSkipReason }[]
}

/**
 * 対象の id の status だけを更新した store を作る（store 全体を保持する）。
 * 期待の状態でない entry は書かず `skipped` へ返す（呼び出し側は record を捨てる）。
 * 書くものが 0 件なら入力の store object をそのまま返す（write しない）。
 */
export function buildTrackedNoteReconciliationStore(
  store: NyozeNotesStore,
  entries: readonly TrackedNoteReconciliationEntry[],
  now: string,
): TrackedNoteReconciliationStoreResult {
  const notes: Record<string, NyozeNote> = { ...store.notes }
  const result: TrackedNoteReconciliationStoreResult = { store, deletedIds: [], reopenedIds: [], skipped: [] }
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    const existing = notes[entry.id]
    if (!existing) { result.skipped.push({ id: entry.id, reason: 'missing' }); continue }
    if (existing.file !== entry.file) { result.skipped.push({ id: entry.id, reason: 'file-mismatch' }); continue }
    const expected: NyozeNote['status'] = entry.action === 'delete' ? 'open' : 'deleted'
    if (existing.status !== expected) { result.skipped.push({ id: entry.id, reason: 'status-mismatch' }); continue }
    if (entry.fingerprint !== undefined && computeNoteEntryFingerprint(existing) !== entry.fingerprint) {
      result.skipped.push({ id: entry.id, reason: 'fingerprint-mismatch' })
      continue
    }
    notes[entry.id] = { ...existing, status: entry.action === 'delete' ? 'deleted' : 'open', updatedAt: now }
    ;(entry.action === 'delete' ? result.deletedIds : result.reopenedIds).push(entry.id)
  }
  if (result.deletedIds.length === 0 && result.reopenedIds.length === 0) return result
  return { ...result, store: { ...store, notes } }
}

/**
 * 保存の後の確定の結果を、**その時点の list への差分**として反映する（置き換えない）。
 * 対象は `snapshot`（計画の時点の record）と同じ object のまま残っている record だけで、
 * 確定の途中で改めて操作された id は触らない（次の保存で合わせる）。
 */
export function applyTrackedNoteReconciliation(
  list: readonly TrackedNoteRecord[],
  snapshot: readonly TrackedNoteRecord[],
  outcome: { readonly deletedIds: readonly string[]; readonly reopenedIds: readonly string[]; readonly skippedIds: readonly string[] },
): TrackedNoteRecord[] {
  const snapshotById = new Map(snapshot.map((entry) => [entry.noteId, entry]))
  const deleted = new Set(outcome.deletedIds), reopened = new Set(outcome.reopenedIds), skipped = new Set(outcome.skippedIds)
  const next: TrackedNoteRecord[] = []
  for (const entry of list) {
    if (snapshotById.get(entry.noteId) !== entry) { next.push(entry); continue }
    if (skipped.has(entry.noteId)) continue
    next.push({
      ...entry,
      settled: true,
      provisionalFingerprint: null,
      lastWrittenStatus: deleted.has(entry.noteId) ? 'deleted' : reopened.has(entry.noteId) ? 'open' : entry.lastWrittenStatus,
    })
  }
  return next
}
