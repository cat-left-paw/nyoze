import type { NyozeNote, NyozeNotesStore } from './noteStore'
import { noteFilePathComparisonKey } from './notePath'

export type DocumentNoteEntry = {
  id: string
  note: NyozeNote
}

const UNTITLED_NOTE_LABEL = '（無題）'
const DERIVED_TITLE_MAX_CHARS = 48

/** 一覧表示用タイトル。title が無ければ本文先頭行から短く作る。 */
export function deriveNoteDisplayTitle(note: Pick<NyozeNote, 'title' | 'text'>): string {
  const trimmedTitle = note.title?.trim() ?? ''
  if (trimmedTitle.length > 0) return trimmedTitle

  const firstLine =
    note.text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''

  if (firstLine.length === 0) return UNTITLED_NOTE_LABEL
  if (firstLine.length <= DERIVED_TITLE_MAX_CHARS) return firstLine
  return `${firstLine.slice(0, DERIVED_TITLE_MAX_CHARS)}…`
}

/** 現ファイルに属する open note だけを返す。deleted / resolved / orphaned は除外。 */
export function listOpenNotesForFile(
  store: NyozeNotesStore,
  relativeFile: string,
): DocumentNoteEntry[] {
  // NFC/NFD 差分を吸収するため、stored path は書き換えず比較 key で一致させる。
  const targetKey = noteFilePathComparisonKey(relativeFile)
  const entries: DocumentNoteEntry[] = []
  for (const [id, note] of Object.entries(store.notes)) {
    if (noteFilePathComparisonKey(note.file) !== targetKey) continue
    if (note.status !== 'open') continue
    entries.push({ id, note })
  }
  entries.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
  return entries
}

/** 現ファイルに属する resolved note だけを返す。 */
export function listResolvedNotesForFile(
  store: NyozeNotesStore,
  relativeFile: string,
): DocumentNoteEntry[] {
  const targetKey = noteFilePathComparisonKey(relativeFile)
  const entries: DocumentNoteEntry[] = []
  for (const [id, note] of Object.entries(store.notes)) {
    if (noteFilePathComparisonKey(note.file) !== targetKey) continue
    if (note.status !== 'resolved') continue
    entries.push({ id, note })
  }
  entries.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
  return entries
}
