/**
 * STICKY-NOTE-DISCARD-CONSISTENCY1: 未保存 anchor に対応する付箋の
 * provisional 追跡と、明示的な破棄時の限定 cleanup（pure helper）。
 *
 * 付箋追加は「notes.json write → 本文 anchor 挿入」の順で行う。この順序は
 * 「本文に marker だけが残りメモが存在しない」という、より危険な不整合を避ける
 * ために採用されており、逆転しない。代わりに、anchor がまだ durable save されて
 * いない期間だけ note を **provisional** として追跡し、ユーザーが本文変更を
 * 明示的に破棄したときにその note entry **だけ**を取り除く。
 *
 * 不変条件:
 * - 照合は note id + project 相対 file + entry fingerprint の再証明だけで行う。
 *   title / text の文字列一致による推測は行わない。
 * - notes.json 全体と PM Doc を突き合わせて「見つからない marker」を一括削除
 *   しない。削除対象は常に、このセッションで追跡した provisional id に限る。
 * - fingerprint が一致しない entry（＝外部変更された entry）は削除せず、
 *   fail-closed にする。呼び出し側は document leave を完了させてはならない。
 * - 既に store から消えている id は正常系（idempotent）として skip する。
 */

import type { NyozeNote, NyozeNotesStore } from './noteStore'
import { formatNoteAnchorComment } from '../editor-core/io/noteAnchor'

/** 追跡中の provisional note 1 件。 */
export type ProvisionalNoteRecord = {
  readonly noteId: string
  /** main が `project:resolveForFile` で返した project root（renderer で組み立てない）。 */
  readonly projectRoot: string
  /** anchor を追加した時点の document 絶対 path。 */
  readonly filePath: string
  /** notes.json に保存された project 相対 file。 */
  readonly relativeFile: string
  /** anchor を追加した時点の tab identity。 */
  readonly tabId: string
  /** 作成時 entry の fingerprint（外部変更検出用）。 */
  readonly fingerprint: string
}

/** fingerprint の field 区切り。note field には現れない unit separator を使う。 */
const FINGERPRINT_UNIT_SEPARATOR = '\u001f'
/** tags 配列の要素区切り。要素内の文字と衝突しない record separator。 */
const FINGERPRINT_LIST_SEPARATOR = '\u001e'

/**
 * optional field を「欠損」と「空文字」で区別できるように符号化する。
 * 欠損と空 title を同じ fingerprint にすると、外部変更を見逃す。
 */
function encodeOptional(value: string | undefined): string {
  return value === undefined ? '\u0000' : `\u0001${value}`
}

/**
 * note entry の再証明用 fingerprint。
 *
 * 表示用ではなく同一性証明用なので、正規化・整形はせず保存 field をそのまま連結する。
 */
export function computeNoteEntryFingerprint(note: NyozeNote): string {
  return [
    note.file,
    note.status,
    note.color,
    encodeOptional(note.title),
    note.text,
    note.createdAt,
    note.updatedAt,
    encodeOptional(note.tags?.join(FINGERPRINT_LIST_SEPARATOR)),
    encodeOptional(note.contextBefore),
    encodeOptional(note.contextAfter),
  ].join(FINGERPRINT_UNIT_SEPARATOR)
}

/** 同じ id を二重に追跡しない。 */
export function addProvisionalNote(
  list: readonly ProvisionalNoteRecord[],
  record: ProvisionalNoteRecord,
): ProvisionalNoteRecord[] {
  return [...list.filter((entry) => entry.noteId !== record.noteId), record]
}

export function removeProvisionalNotes(
  list: readonly ProvisionalNoteRecord[],
  noteIds: readonly string[],
): ProvisionalNoteRecord[] {
  if (noteIds.length === 0) return [...list]
  const removed = new Set(noteIds)
  return list.filter((entry) => !removed.has(entry.noteId))
}

/** 指定 document（tab identity + 絶対 path）に属する provisional note。 */
export function selectProvisionalNotesForDocument(
  list: readonly ProvisionalNoteRecord[],
  document: { readonly tabId: string; readonly filePath: string | null },
): ProvisionalNoteRecord[] {
  if (document.filePath === null) return []
  return list.filter(
    (entry) => entry.tabId === document.tabId && entry.filePath === document.filePath,
  )
}

/**
 * disk write 成功した本文から durable になった note を確定する。
 *
 * **保存された本文に anchor が実在する id だけ**を durable として追跡解除する。
 * anchor を undo してから保存した場合などは durable にせず、追跡を続ける。
 */
export function resolveDurableProvisionalNotes(
  list: readonly ProvisionalNoteRecord[],
  saved: {
    readonly tabId: string
    readonly filePath: string | null
    readonly markdown: string
  },
): { readonly next: ProvisionalNoteRecord[]; readonly durableIds: string[] } {
  if (saved.filePath === null) return { next: [...list], durableIds: [] }
  const durableIds = list
    .filter(
      (entry) =>
        entry.tabId === saved.tabId &&
        entry.filePath === saved.filePath &&
        saved.markdown.includes(formatNoteAnchorComment(entry.noteId)),
    )
    .map((entry) => entry.noteId)
  return { next: removeProvisionalNotes(list, durableIds), durableIds }
}

/** cleanup 要求 1 件（note 単位）。 */
export type ProvisionalNoteCleanupEntry = {
  readonly id: string
  readonly file: string
  readonly fingerprint: string
}

/** `project:discardProvisionalNotes` の要求 payload。 */
export type ProvisionalNoteCleanupRequest = {
  readonly projectRoot: string
  readonly entries: readonly ProvisionalNoteCleanupEntry[]
}

/** cleanup IPC 1 回分の要求単位（project root ごとにまとめる）。 */
export type ProvisionalNoteCleanupGroup = {
  readonly projectRoot: string
  /** main 側で project root を再解決させるための代表 document path。 */
  readonly filePath: string
  readonly entries: readonly ProvisionalNoteCleanupEntry[]
}

/**
 * project root 単位へまとめる。同じ project の複数 document を 1 回の
 * read-modify-write で処理し、重複 cleanup を作らない。
 */
export function groupProvisionalNotesByProject(
  records: readonly ProvisionalNoteRecord[],
): ProvisionalNoteCleanupGroup[] {
  const order: string[] = []
  const groups = new Map<
    string,
    { filePath: string; entries: ProvisionalNoteCleanupEntry[] }
  >()
  for (const record of records) {
    const entry: ProvisionalNoteCleanupEntry = {
      id: record.noteId,
      file: record.relativeFile,
      fingerprint: record.fingerprint,
    }
    const existing = groups.get(record.projectRoot)
    if (!existing) {
      order.push(record.projectRoot)
      groups.set(record.projectRoot, { filePath: record.filePath, entries: [entry] })
      continue
    }
    if (existing.entries.some((candidate) => candidate.id === entry.id)) continue
    existing.entries.push(entry)
  }
  return order.map((projectRoot) => {
    const group = groups.get(projectRoot)!
    return { projectRoot, filePath: group.filePath, entries: group.entries }
  })
}

export type ProvisionalNoteCleanupPlan =
  | { readonly ok: true; readonly store: NyozeNotesStore; readonly removedIds: string[] }
  | {
      readonly ok: false
      /** identity-mismatch: 保存 file が一致しない。fingerprint-mismatch: 外部変更。 */
      readonly reason: 'identity-mismatch' | 'fingerprint-mismatch'
      readonly noteId: string
    }

/**
 * 現在の store から provisional id **だけ**を取り除いた store を作る。
 *
 * 既に存在しない id は skip（idempotent）。file / fingerprint を再証明できない
 * entry は削除せず fail-closed にする。他の note entry と `stickyNoteTags` は
 * そのまま引き継ぐ。
 */
export function buildProvisionalNoteCleanupPlan(
  store: NyozeNotesStore,
  entries: readonly ProvisionalNoteCleanupEntry[],
): ProvisionalNoteCleanupPlan {
  const removedIds: string[] = []
  for (const entry of entries) {
    const current = store.notes[entry.id]
    if (current === undefined) continue
    if (current.file !== entry.file) {
      return { ok: false, reason: 'identity-mismatch', noteId: entry.id }
    }
    if (computeNoteEntryFingerprint(current) !== entry.fingerprint) {
      return { ok: false, reason: 'fingerprint-mismatch', noteId: entry.id }
    }
    if (!removedIds.includes(entry.id)) removedIds.push(entry.id)
  }
  if (removedIds.length === 0) return { ok: true, store, removedIds }
  const notes: Record<string, NyozeNote> = {}
  for (const [id, note] of Object.entries(store.notes)) {
    if (removedIds.includes(id)) continue
    notes[id] = note
  }
  return { ok: true, store: { ...store, notes }, removedIds }
}
