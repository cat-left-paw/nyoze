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
 * 付箋専用削除の順序 (insert の逆):
 * 1. 本文 anchor 削除
 * 2. notes.json で status: 'deleted'
 *
 * anchor 削除失敗時は notes.json に触れない。
 * write 失敗時は anchor は既に消えているがメモ本文は open のまま残る (許容 orphan)。
 */

export const NOTE_ANCHOR_DELETE_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できませんでした。\n本文のマーカーは削除済みです。付箋データは変更していません。'

export const NOTE_ANCHOR_DELETE_REMOVE_ERROR_MESSAGE =
  '本文の付箋マーカーを削除できませんでした。'

export const NOTE_ANCHOR_DELETE_NOT_FOUND_MESSAGE =
  '削除対象の付箋が見つかりません。'

export type NoteAnchorDeleteDeps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  removeAnchor: (id: string) => boolean
}

export type NoteAnchorDeletePrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteAnchorDeleteCommitResult =
  | { kind: 'deleted'; id: string }
  | { kind: 'failed'; message: string }

export async function prepareNoteAnchorDelete(
  deps: NoteAnchorDeleteDeps,
): Promise<NoteAnchorDeletePrepareResult> {
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

export async function commitNoteAnchorDelete(
  deps: NoteAnchorDeleteDeps,
  options: {
    activeFilePath: string
    id: string
  },
): Promise<NoteAnchorDeleteCommitResult> {
  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const existing = notes.store.notes[options.id]
  if (!existing || existing.status !== 'open') {
    return { kind: 'failed', message: NOTE_ANCHOR_DELETE_NOT_FOUND_MESSAGE }
  }

  if (!deps.removeAnchor(options.id)) {
    return { kind: 'failed', message: NOTE_ANCHOR_DELETE_REMOVE_ERROR_MESSAGE }
  }

  const now = new Date().toISOString()
  const store: NyozeNotesStore = {
    version: notes.store.version,
    notes: {
      ...notes.store.notes,
      [options.id]: {
        ...existing,
        status: 'deleted',
        updatedAt: now,
      },
    },
  }

  const written = await bridge.writeNotes(options.activeFilePath, store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_DELETE_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'deleted', id: options.id }
}
