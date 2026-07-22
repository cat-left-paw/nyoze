import type { NyozeNotesStore } from './noteStore'
import { DEFAULT_NOTE_COLOR } from './noteStore'

/**
 * 付箋の表示色 palette（notes.json の `color` 文字列と 1:1）。
 * 将来 tag color map を足すときは resolveNoteDisplayColor の入力源だけ拡張する。
 */
export const NOTE_COLOR_IDS = ['yellow', 'gray', 'blue', 'green', 'pink', 'purple'] as const
export type NoteColorId = (typeof NOTE_COLOR_IDS)[number]

export type NoteColorPaletteEntry = {
  id: NoteColorId
  /** i18n key (documentNotes.color.*) */
  labelKey: `documentNotes.color.${NoteColorId}`
}

export const NOTE_COLOR_PALETTE: readonly NoteColorPaletteEntry[] = [
  { id: 'yellow', labelKey: 'documentNotes.color.yellow' },
  { id: 'gray', labelKey: 'documentNotes.color.gray' },
  { id: 'blue', labelKey: 'documentNotes.color.blue' },
  { id: 'green', labelKey: 'documentNotes.color.green' },
  { id: 'pink', labelKey: 'documentNotes.color.pink' },
  { id: 'purple', labelKey: 'documentNotes.color.purple' },
] as const

const NOTE_COLOR_ID_SET = new Set<string>(NOTE_COLOR_IDS)

export function isNotePaletteColor(value: string): value is NoteColorId {
  return NOTE_COLOR_ID_SET.has(value)
}

/**
 * 表示用の palette id を返す。invalid / unknown は default へ fallback。
 * 既存 store の未知色は読み取り互換のため文字列として残るが、UI 表示は default 扱い。
 */
export function resolveNoteDisplayColor(raw: string | undefined): NoteColorId {
  if (raw !== undefined && isNotePaletteColor(raw)) {
    return raw
  }
  return DEFAULT_NOTE_COLOR as NoteColorId
}

/** 編集保存時: palette 外は default に正規化する。 */
export function normalizeNoteEditColor(raw: string | undefined): NoteColorId {
  return resolveNoteDisplayColor(raw)
}

/** 右ペインカード / marker へ渡す data-* 用の表示色 key。 */
export function getNoteDisplayColorKey(raw: string | undefined): NoteColorId {
  return resolveNoteDisplayColor(raw)
}

/**
 * 現ファイルに属する note の id → 表示色 key。
 * hover preview と同様、DOM-only 反映用。
 */
export function buildNoteAnchorColorMap(
  store: NyozeNotesStore,
  relativeFile: string,
): Record<string, NoteColorId> {
  const map: Record<string, NoteColorId> = {}
  for (const [id, note] of Object.entries(store.notes)) {
    if (note.file !== relativeFile) continue
    map[id] = getNoteDisplayColorKey(note.color)
  }
  return map
}
