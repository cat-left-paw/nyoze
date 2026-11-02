import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import {
  NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE,
  NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE,
  NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE,
  NOTE_ANCHOR_UNSAVED_FILE_MESSAGE,
} from './noteAnchorInsertController'
import { toProjectRelativeFilePath } from '../../project/notePath'
import { getPlainFormattingUnavailableMessage, type PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * 付箋専用削除（STICKY-NOTE-LIFECYCLE1 で「仮の削除」になった）:
 * 1. notes.json の entry が open で現行文書に属することを確かめる（読むだけ）
 * 2. 本文 anchor を削除する（meta 付き transaction 1、history 1）
 *
 * notes.json は**ここでは書かない**。呼び出し側が削除の record を追跡し、本文の保存で
 * 「保存した本文に anchor がなければ `deleted`」と確定する（`pendingNoteDeletion.ts`）。
 * Undo で anchor が戻れば付箋も戻る。破棄では record を捨てるだけで、本文は disk のまま。
 */

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
  | {
      kind: 'deleted'
      id: string
      /** 呼び出し側が tab identity を足して、仮の削除として追跡する。 */
      tracking: { projectRoot: string; relativeFile: string }
    }
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

  const resolved = await bridge.resolveForFile(options.activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }
  const relativeFile = toProjectRelativeFilePath(resolved.project.projectRoot, options.activeFilePath)
  if (relativeFile === null) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const existing = notes.store.notes[options.id]
  if (!existing || existing.status !== 'open' || existing.file !== relativeFile) {
    return { kind: 'failed', message: NOTE_ANCHOR_DELETE_NOT_FOUND_MESSAGE }
  }

  if (!deps.removeAnchor(options.id)) {
    return { kind: 'failed', message: NOTE_ANCHOR_DELETE_REMOVE_ERROR_MESSAGE }
  }

  // notes.json はここでは書かない（仮の削除。確定は本文の保存で行う）。
  return {
    kind: 'deleted',
    id: options.id,
    tracking: { projectRoot: resolved.project.projectRoot, relativeFile },
  }
}
