import type { NyozeNote, NyozeNotesStore } from '../../project/noteStore'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import {
  NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE,
  NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE,
  NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE,
  NOTE_ANCHOR_UNSAVED_FILE_MESSAGE,
} from './noteAnchorInsertController'
import { getPlainFormattingUnavailableMessage, type PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * orphan note（本文 marker なし open note）の整理。
 * notes.json の status を deleted にする soft delete のみ。本文 PM doc / Markdown には触れない。
 */

export const NOTE_ORPHAN_DELETE_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できませんでした。付箋データは変更していません。'

export const NOTE_ORPHAN_DELETE_NOT_FOUND_MESSAGE =
  '削除対象の付箋が見つかりません。'

export const NOTE_ORPHAN_DELETE_HAS_MARKER_MESSAGE =
  '本文中にマーカーがある付箋は、この操作では削除できません。'

export type NoteOrphanDeleteDeps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  /** 現 PM doc 内に存在する noteAnchor id。orphan 削除の安全確認用。 */
  getAnchoredNoteIds: () => ReadonlySet<string>
}

export type NoteOrphanDeletePrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteOrphanDeleteCommitResult =
  | { kind: 'deleted'; id: string }
  | { kind: 'failed'; message: string }

/** unit test 用: 対象 note だけ soft delete した store を返す。 */
export function buildOrphanNoteSoftDeleteStore(
  store: NyozeNotesStore,
  id: string,
  now: string,
): NyozeNotesStore | null {
  const existing = store.notes[id]
  if (!existing || existing.status !== 'open') return null
  return {
    version: store.version,
    notes: {
      ...store.notes,
      [id]: {
        ...existing,
        status: 'deleted',
        updatedAt: now,
      },
    },
  }
}

export async function prepareOrphanNoteDelete(
  deps: NoteOrphanDeleteDeps,
): Promise<NoteOrphanDeletePrepareResult> {
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

export async function commitOrphanNoteDelete(
  deps: NoteOrphanDeleteDeps,
  options: {
    activeFilePath: string
    id: string
  },
): Promise<NoteOrphanDeleteCommitResult> {
  if (deps.getAnchoredNoteIds().has(options.id)) {
    return { kind: 'failed', message: NOTE_ORPHAN_DELETE_HAS_MARKER_MESSAGE }
  }

  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const existing: NyozeNote | undefined = notes.store.notes[options.id]
  if (!existing || existing.status !== 'open') {
    return { kind: 'failed', message: NOTE_ORPHAN_DELETE_NOT_FOUND_MESSAGE }
  }

  const now = new Date().toISOString()
  const store = buildOrphanNoteSoftDeleteStore(notes.store, options.id, now)
  if (!store) {
    return { kind: 'failed', message: NOTE_ORPHAN_DELETE_NOT_FOUND_MESSAGE }
  }

  const written = await bridge.writeNotes(options.activeFilePath, store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_ORPHAN_DELETE_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'deleted', id: options.id }
}
