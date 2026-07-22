import { deriveNoteDisplayTitle } from './documentNotesQuery'
import { isProjectRelativeFilePath, type NyozeNote, type NyozeNotesStore } from './noteStore'

export type MissingFileNoteEntry = {
  id: string
  note: NyozeNote
  relativeFile: string
}

/**
 * project root 相対の `note.file` が、project 内の通常ファイルとして存在するか。
 *
 * 解決は read-time disk resolution（Unicode NFC/NFD 差分の吸収、projectRoot 境界 /
 * 中間 symlink ガードを含む）を行う main 側 helper に委譲する前提。
 * pure 層は fs / 正規化解決を持たず、この callback へ注入する。
 */
export type ProjectFileExists = (relativeFile: string) => Promise<boolean>

/**
 * `status: "open"` の note のうち、参照先ファイルが project 内に存在しないものを返す。
 * 不正な相対 path は fs に触れず missing 扱い。deleted / resolved / orphaned は対象外。
 *
 * stored `note.file` は書き換えず、解決の成否だけを使う。
 */
export async function scanMissingFileNotes(
  store: NyozeNotesStore,
  isExistingProjectFile: ProjectFileExists,
): Promise<MissingFileNoteEntry[]> {
  const entries: MissingFileNoteEntry[] = []

  for (const [id, note] of Object.entries(store.notes)) {
    if (note.status !== 'open') continue

    // 不正な相対 path は disk 解決を呼ばず missing 扱い（fs に触れない）。
    if (!isProjectRelativeFilePath(note.file)) {
      entries.push({ id, note, relativeFile: note.file })
      continue
    }

    const exists = await isExistingProjectFile(note.file)
    if (!exists) {
      entries.push({ id, note, relativeFile: note.file })
    }
  }

  entries.sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt))
  return entries
}

export type MissingFileNoteView = {
  id: string
  displayTitle: string
  relativeFile: string
  updatedAt: string
}

export function toMissingFileNoteViews(entries: MissingFileNoteEntry[]): MissingFileNoteView[] {
  return entries.map(({ id, note, relativeFile }) => ({
    id,
    displayTitle: deriveNoteDisplayTitle(note),
    relativeFile,
    updatedAt: note.updatedAt,
  }))
}
