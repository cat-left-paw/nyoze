import type { NyozeNotesStore } from '../../project/noteStore'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import {
  NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE,
  NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE,
  NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE,
  NOTE_ANCHOR_UNSAVED_FILE_MESSAGE,
} from './noteAnchorInsertController'
import { getPlainFormattingUnavailableMessage, type PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * missing-file note（参照先 Markdown が project 内に無い open note）の整理。
 * notes.json の status を deleted にする soft delete のみ。本文 PM doc / Markdown には触れない。
 *
 * 次スライス候補: Nyoze 内 rename/move/delete 時の note.file 追従更新。
 */

export const NOTE_MISSING_FILE_DELETE_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できませんでした。付箋データは変更していません。'

export const NOTE_MISSING_FILE_DELETE_NOT_FOUND_MESSAGE =
  '削除対象の付箋が見つかりません。'

export type NoteMissingFileDeleteDeps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
}

export type NoteMissingFileDeletePrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteMissingFileDeleteCommitResult =
  | { kind: 'deleted'; ids: string[] }
  | { kind: 'noop' }
  | { kind: 'failed'; message: string }

/** unit test 用: 対象 note だけ soft delete した store を返す。 */
export function buildMissingFileNotesSoftDeleteStore(
  store: NyozeNotesStore,
  ids: Iterable<string>,
  now: string,
): NyozeNotesStore | null {
  const notes = { ...store.notes }
  let changed = false

  for (const id of ids) {
    const existing = notes[id]
    if (!existing || existing.status !== 'open') continue
    notes[id] = {
      ...existing,
      status: 'deleted',
      updatedAt: now,
    }
    changed = true
  }

  if (!changed) return null
  return { version: store.version, notes }
}

export async function prepareMissingFileNoteDelete(
  deps: NoteMissingFileDeleteDeps,
): Promise<NoteMissingFileDeletePrepareResult> {
  if (deps.isInternalDoc()) {
    return { kind: 'blocked', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }
  const plainModeKind = deps.getPlainModeKind()
  if (plainModeKind !== null) {
    return { kind: 'blocked', message: getPlainFormattingUnavailableMessage(plainModeKind) }
  }
  const activeFilePath = deps.getActiveFilePath()
  if (!activeFilePath) {
    return { kind: 'blocked', message: NOTE_ANCHOR_UNSAVED_FILE_MESSAGE }
  }
  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'blocked', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const resolved = await bridge.resolveForFile(activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'blocked', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }

  const notes = await bridge.readNotes(activeFilePath)
  if (!notes.ok) {
    return { kind: 'blocked', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  return { kind: 'ready', activeFilePath }
}

export async function commitMissingFileNoteDelete(
  deps: NoteMissingFileDeleteDeps,
  options: {
    activeFilePath: string
    id: string
  },
): Promise<NoteMissingFileDeleteCommitResult> {
  return commitMissingFileNotesBulkDelete(deps, {
    activeFilePath: options.activeFilePath,
    ids: [options.id],
  })
}

export async function commitMissingFileNotesBulkDelete(
  deps: NoteMissingFileDeleteDeps,
  options: {
    activeFilePath: string
    ids: readonly string[]
  },
): Promise<NoteMissingFileDeleteCommitResult> {
  if (options.ids.length === 0) {
    return { kind: 'noop' }
  }

  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const targetIds = options.ids.filter((id) => {
    const existing = notes.store.notes[id]
    return existing?.status === 'open'
  })
  if (targetIds.length === 0) {
    return { kind: 'failed', message: NOTE_MISSING_FILE_DELETE_NOT_FOUND_MESSAGE }
  }

  const now = new Date().toISOString()
  const store = buildMissingFileNotesSoftDeleteStore(notes.store, targetIds, now)
  if (!store) {
    return { kind: 'failed', message: NOTE_MISSING_FILE_DELETE_NOT_FOUND_MESSAGE }
  }

  const written = await bridge.writeNotes(options.activeFilePath, store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_MISSING_FILE_DELETE_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'deleted', ids: targetIds }
}
