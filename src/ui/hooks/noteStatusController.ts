import type { NoteStatus, NyozeNote, NyozeNotesStore } from '../../project/noteStore'
import { toProjectRelativeFilePath } from '../../project/notePath'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import {
  NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE,
  NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE,
  NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE,
  NOTE_ANCHOR_UNSAVED_FILE_MESSAGE,
} from './noteAnchorInsertController'
import { getPlainFormattingUnavailableMessage, type PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * 付箋 status の open ↔ resolved 遷移。
 * notes.json の status / updatedAt のみ更新し、本文 Markdown / marker には触れない。
 */

export const NOTE_STATUS_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できませんでした。付箋データは変更していません。'

export const NOTE_STATUS_NOT_FOUND_MESSAGE =
  '対象の付箋が見つかりません。'

export type NoteStatusTransition = 'resolve' | 'reopen'

export type NoteStatusDeps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
}

export type NoteStatusPrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteStatusCommitResult =
  | { kind: 'updated'; id: string; status: 'open' | 'resolved' }
  | { kind: 'failed'; message: string }

function expectedStatusForTransition(transition: NoteStatusTransition): NoteStatus {
  return transition === 'resolve' ? 'open' : 'resolved'
}

function nextStatusForTransition(transition: NoteStatusTransition): 'open' | 'resolved' {
  return transition === 'resolve' ? 'resolved' : 'open'
}

/** unit test 用: 対象 note の status だけ更新した store を返す。 */
export function buildNoteStatusStore(
  store: NyozeNotesStore,
  id: string,
  nextStatus: 'open' | 'resolved',
  now: string,
): NyozeNotesStore | null {
  const existing = store.notes[id]
  if (!existing) return null
  return {
    ...store,
    notes: {
      ...store.notes,
      [id]: {
        ...existing,
        status: nextStatus,
        updatedAt: now,
      },
    },
  }
}

export async function prepareNoteStatusUpdate(
  deps: NoteStatusDeps,
): Promise<NoteStatusPrepareResult> {
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

export async function commitNoteStatusUpdate(
  deps: NoteStatusDeps,
  options: {
    activeFilePath: string
    id: string
    transition: NoteStatusTransition
  },
): Promise<NoteStatusCommitResult> {
  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const resolved = await bridge.resolveForFile(options.activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }
  const relativeFile = toProjectRelativeFilePath(
    resolved.project.projectRoot,
    options.activeFilePath,
  )
  if (relativeFile === null) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const existing: NyozeNote | undefined = notes.store.notes[options.id]
  const expectedStatus = expectedStatusForTransition(options.transition)
  if (!existing || existing.status !== expectedStatus || existing.file !== relativeFile) {
    return { kind: 'failed', message: NOTE_STATUS_NOT_FOUND_MESSAGE }
  }

  const nextStatus = nextStatusForTransition(options.transition)
  const now = new Date().toISOString()
  const store = buildNoteStatusStore(notes.store, options.id, nextStatus, now)
  if (!store) {
    return { kind: 'failed', message: NOTE_STATUS_NOT_FOUND_MESSAGE }
  }

  const written = await bridge.writeNotes(options.activeFilePath, store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_STATUS_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'updated', id: options.id, status: nextStatus }
}
