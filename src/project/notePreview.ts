import type { NyozeNotesStore } from './noteStore'

/** hover preview に note データが無いときの既定文言。 */
export const NOTE_PREVIEW_FALLBACK = '付箋'

/** hover preview 本文の最大行数。 */
export const NOTE_PREVIEW_MAX_LINES = 4

/** hover preview 本文の最大文字数 (省略記号を除く)。 */
export const NOTE_PREVIEW_MAX_CHARS = 140

export type NotePreviewInput = {
  title?: string
  text: string
}

/**
 * notes.json の title/text から hover preview 用の短い文字列を作る。
 * 改行は保持するが、行数・文字数で打ち切る。
 */
export function formatNotePreviewText(input: NotePreviewInput): string {
  const trimmedTitle = input.title?.trim() ?? ''
  const text = input.text ?? ''

  if (trimmedTitle.length === 0 && text.trim().length === 0) {
    return NOTE_PREVIEW_FALLBACK
  }

  const lines: string[] = []
  if (trimmedTitle.length > 0) {
    lines.push(trimmedTitle)
  }
  if (text.length > 0) {
    for (const line of text.split('\n')) {
      lines.push(line)
    }
  }

  const limitedLines = lines.slice(0, NOTE_PREVIEW_MAX_LINES)
  let result = limitedLines.join('\n')

  if (lines.length > NOTE_PREVIEW_MAX_LINES) {
    result += '\n…'
  }

  if (result.length > NOTE_PREVIEW_MAX_CHARS) {
    result = result.slice(0, NOTE_PREVIEW_MAX_CHARS) + '…'
  }

  return result.length > 0 ? result : NOTE_PREVIEW_FALLBACK
}

/**
 * 現ファイルに属する note だけを id → preview 文字列へ変換する。
 */
export function buildNoteAnchorPreviewMap(
  store: NyozeNotesStore,
  relativeFile: string,
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [id, note] of Object.entries(store.notes)) {
    if (note.file !== relativeFile) continue
    map[id] = formatNotePreviewText({ title: note.title, text: note.text })
  }
  return map
}
