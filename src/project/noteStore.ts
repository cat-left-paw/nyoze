/**
 * `.nyoze/notes.json` の最小データモデル (Task 3A-2 本体)。
 *
 * 付箋本文と状態の source of truth。本文 Markdown 側の
 * `<!-- nyoze-note:ID -->` (noteAnchor) は位置の source of truth であり、
 * 両者は note id で対応する。
 *
 * 保存先は必ず `project root/.nyoze/notes.json`。workspace root 直下へ
 * 一括保存しない。ファイル I/O は main process 側 (electron/noteStore.ts)
 * が担当し、このモジュールは pure helper のみを持つ。
 *
 * normalizer 方針 (初期 MVP):
 * - version は数値 1 厳密一致
 * - invalid note が 1 件でもあれば store 全体を invalid (null) にする。
 *   一部だけ落として保存し直すとユーザーのメモを静かに失うため。
 * - color は文字列として保持し、未知色も保存互換のため許容する。
 *   欠損時のみ 'yellow' に正規化する。
 * - createdAt / updatedAt は ISO 文字列を想定するが、検証は
 *   非空文字列までに留める (厳密日時 validation はしない)。
 * - title は optional。欠損は valid (既存 store 互換)、存在時は string のみ。
 *   normalizer では string をそのまま保持し trim しない (既存データを変えない)。
 *   作成時 (createNoteEntry) は UI 入力を trim し、空 / 空白のみなら省略する。
 * - 未知 field は正規化時に落ちる (version で将来形式を管理する)。
 */

export const NOTES_STORE_FILENAME = 'notes.json'
export const NOTES_STORE_VERSION = 1
export const DEFAULT_NOTE_COLOR = 'yellow'

export const NOTE_STATUSES = ['open', 'resolved', 'deleted', 'orphaned'] as const
export type NoteStatus = (typeof NOTE_STATUSES)[number]
const NOTE_ID_REGEX = /^[A-Za-z0-9_-]+$/

import {
  compactTagSlotsForSerialize,
  normalizeNoteTags,
  normalizeStickyNoteTags,
  padTagSlotsToSix,
  type StickyNoteTagSlotEntry,
} from './noteTags'

export type { StickyNoteTagDefinition, StickyNoteTagSlotEntry } from './noteTags'

export type NyozeNote = {
  /** project root 相対の本文ファイルパス (例: '本文/001_序章.md') */
  file: string
  /** 1 行タイトル (optional)。欠損は valid。 */
  title?: string
  /** 付箋本文 (複数行をそのまま保持) */
  text: string
  status: NoteStatus
  color: string
  /** 付箋タグ id の配列 (optional)。label ではなく id を保存する。 */
  tags?: string[]
  /** ISO 8601 文字列 */
  createdAt: string
  /** ISO 8601 文字列 */
  updatedAt: string
  /** アンカー周辺文脈 (復旧用, optional) */
  contextBefore?: string
  contextAfter?: string
}

export type NyozeNotesStore = {
  version: typeof NOTES_STORE_VERSION
  /** Project 単位の付箋タグ定義 (optional)。配列 index = スロット位置。null は空スロット。 */
  stickyNoteTags?: StickyNoteTagSlotEntry[]
  /** note id (noteAnchor の ID と対応) → note */
  notes: Record<string, NyozeNote>
}

function isNoteStatus(value: unknown): value is NoteStatus {
  return typeof value === 'string' && (NOTE_STATUSES as readonly string[]).includes(value)
}

function isNoteId(value: string): boolean {
  return NOTE_ID_REGEX.test(value)
}

/**
 * project root 相対パスとして妥当か。
 * 絶対パス・ドライブレター・`..` 脱出・空 segment は invalid。
 */
export function isProjectRelativeFilePath(value: string): boolean {
  if (value.length === 0) return false
  if (value.startsWith('/') || value.startsWith('\\')) return false
  if (/^[A-Za-z]:/.test(value)) return false
  const segments = value.split(/[/\\]/)
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

function normalizeNote(raw: unknown): NyozeNote | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (typeof record.file !== 'string' || !isProjectRelativeFilePath(record.file)) return null
  if (typeof record.text !== 'string') return null
  if (!isNoteStatus(record.status)) return null
  if (record.color !== undefined && (typeof record.color !== 'string' || record.color.length === 0)) return null
  if (typeof record.createdAt !== 'string' || record.createdAt.length === 0) return null
  if (typeof record.updatedAt !== 'string' || record.updatedAt.length === 0) return null
  if (record.title !== undefined && typeof record.title !== 'string') return null
  if (record.contextBefore !== undefined && typeof record.contextBefore !== 'string') return null
  if (record.contextAfter !== undefined && typeof record.contextAfter !== 'string') return null
  const tags = normalizeNoteTags(record.tags)
  if (tags === null) return null

  const note: NyozeNote = {
    file: record.file,
    text: record.text,
    status: record.status,
    color: typeof record.color === 'string' ? record.color : DEFAULT_NOTE_COLOR,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
  // title は string をそのまま保持 (trim しない。既存データを変えないため)。
  if (typeof record.title === 'string') note.title = record.title
  if (typeof record.contextBefore === 'string') note.contextBefore = record.contextBefore
  if (typeof record.contextAfter === 'string') note.contextAfter = record.contextAfter
  if (tags !== undefined) note.tags = tags
  return note
}

/**
 * unknown 値を NyozeNotesStore として検証する。
 * invalid note が 1 件でもあれば store 全体を null にする (メモ喪失防止)。
 */
export function normalizeNotesStore(raw: unknown): NyozeNotesStore | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (record.version !== NOTES_STORE_VERSION) return null
  const rawNotes = record.notes
  if (typeof rawNotes !== 'object' || rawNotes === null || Array.isArray(rawNotes)) return null

  const stickyNoteTags = normalizeStickyNoteTags(record.stickyNoteTags)
  if (stickyNoteTags === null) return null

  const notes: Record<string, NyozeNote> = {}
  for (const [id, rawNote] of Object.entries(rawNotes)) {
    if (!isNoteId(id)) return null
    const note = normalizeNote(rawNote)
    if (note === null) return null
    notes[id] = note
  }
  const store: NyozeNotesStore = { version: NOTES_STORE_VERSION, notes }
  if (stickyNoteTags !== undefined) store.stickyNoteTags = stickyNoteTags
  return store
}

/** JSON テキストを検証付きで parse する。invalid JSON / invalid shape は null。 */
export function parseNotesStore(jsonText: string): NyozeNotesStore | null {
  try {
    return normalizeNotesStore(JSON.parse(jsonText))
  } catch {
    return null
  }
}

/** 空 store。notes.json 欠損時の read 結果としても使う。 */
export function createEmptyNotesStore(): NyozeNotesStore {
  return { version: NOTES_STORE_VERSION, notes: {} }
}

/** notes.json として書き出す正規 JSON 形式 (2-space indent + 末尾改行)。 */
export function serializeNotesStore(store: NyozeNotesStore): string {
  const payload: Record<string, unknown> = {
    version: store.version,
    notes: store.notes,
  }
  const compactTags = compactTagSlotsForSerialize(padTagSlotsToSix(store.stickyNoteTags))
  if (compactTags) payload.stickyNoteTags = compactTags
  return JSON.stringify(payload, null, 2) + '\n'
}

export type CreateNoteEntryOptions = {
  /** project root 相対パス */
  file: string
  /** 1 行タイトル (optional)。trim 後に空なら entry へ入れない。 */
  title?: string
  /** 付箋本文 (複数行をそのまま保持) */
  text: string
  color?: string
  contextBefore?: string
  contextAfter?: string
  /** テスト用に現在時刻を注入できる。省略時は現在時刻。 */
  now?: Date
}

/** 新規付箋 entry を作る。status は 'open'、時刻は createdAt = updatedAt。 */
export function createNoteEntry(options: CreateNoteEntryOptions): NyozeNote {
  const timestamp = (options.now ?? new Date()).toISOString()
  const note: NyozeNote = {
    file: options.file,
    text: options.text,
    status: 'open',
    color: options.color ?? DEFAULT_NOTE_COLOR,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  // title は作成時に trim し、空 / 空白のみなら省略する。
  const trimmedTitle = options.title?.trim() ?? ''
  if (trimmedTitle.length > 0) note.title = trimmedTitle
  if (options.contextBefore !== undefined) note.contextBefore = options.contextBefore
  if (options.contextAfter !== undefined) note.contextAfter = options.contextAfter
  return note
}
