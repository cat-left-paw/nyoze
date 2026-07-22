import {
  addStickyNoteTag,
  applyTagSlotDrafts,
  padTagSlotsToSix,
  removeStickyNoteTag,
  renameStickyNoteTag,
  STICKY_NOTE_TAG_LABEL_MAX_LENGTH,
  type StickyNoteTagSlotDraft,
  type TagManagerError,
  type TagSlotValidationError,
} from '../../project/noteTags'
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
 * Project 単位の付箋タグスロット編集。
 * notes.json の stickyNoteTags のみ更新し、本文 Markdown / marker には触れない。
 */

export const NOTE_TAG_SLOTS_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できませんでした。付箋タグは変更していません。'

export type NoteTagSlotsDeps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
}

export type NoteTagSlotsPrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteTagSlotsCommitResult =
  | { kind: 'saved' }
  | { kind: 'failed'; message: string }
  | { kind: 'validation-failed'; error: TagSlotValidationError }

export type NoteTagSlotsSaveResult =
  | { kind: 'saved' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

export type NoteTagManagerSaveResult =
  | { kind: 'saved' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

export function tagManagerValidationMessage(error: TagManagerError): string {
  switch (error.kind) {
    case 'duplicate-label':
      return `同じ名前のタグが既にあります: ${error.label}`
    case 'empty-label':
      return 'タグ名を入力してください。'
    case 'label-too-long':
      return `タグ名は ${STICKY_NOTE_TAG_LABEL_MAX_LENGTH} 文字以内にしてください。`
    case 'max-tags':
      return 'タグは最大6件まで登録できます。'
    case 'tag-not-found':
      return 'タグが見つかりませんでした。'
    default:
      return 'タグを保存できませんでした。'
  }
}

export function tagSlotValidationMessage(error: TagSlotValidationError): string {
  switch (error.kind) {
    case 'duplicate-label':
      return `同じ名前のタグが既にあります: ${error.label}`
    case 'in-use':
      return '付箋で使用中のタグは空にできません。'
    case 'label-too-long':
      return `タグ名は ${STICKY_NOTE_TAG_LABEL_MAX_LENGTH} 文字以内にしてください。`
    case 'invalid-slots':
      return 'タグスロットの数が不正です。'
    default:
      return 'タグを保存できませんでした。'
  }
}

/** unit test 用: スロット draft を適用した store を返す。 */
export function buildTagSlotsStore(
  store: NyozeNotesStore,
  drafts: readonly StickyNoteTagSlotDraft[],
): { store: NyozeNotesStore } | { error: TagSlotValidationError } {
  const previousSlots = padTagSlotsToSix(store.stickyNoteTags)
  return applyTagSlotDrafts(store, drafts, previousSlots)
}

export async function prepareNoteTagSlotsSave(
  deps: NoteTagSlotsDeps,
): Promise<NoteTagSlotsPrepareResult> {
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

export async function commitNoteTagSlotsSave(
  deps: NoteTagSlotsDeps,
  options: {
    activeFilePath: string
    drafts: readonly StickyNoteTagSlotDraft[]
  },
): Promise<NoteTagSlotsCommitResult> {
  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const resolved = await bridge.resolveForFile(options.activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const applied = buildTagSlotsStore(notes.store, options.drafts)
  if ('error' in applied) {
    return { kind: 'validation-failed', error: applied.error }
  }

  const written = await bridge.writeNotes(options.activeFilePath, applied.store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_TAG_SLOTS_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'saved' }
}

export type NoteTagManagerCommitResult =
  | { kind: 'saved' }
  | { kind: 'failed'; message: string }
  | { kind: 'validation-failed'; error: TagManagerError }

async function commitNoteTagMutation(
  deps: NoteTagSlotsDeps,
  options: {
    activeFilePath: string
    apply: (store: NyozeNotesStore) => { store: NyozeNotesStore } | { error: TagManagerError }
  },
): Promise<NoteTagManagerCommitResult> {
  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  const resolved = await bridge.resolveForFile(options.activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE }
  }

  const notes = await bridge.readNotes(options.activeFilePath)
  if (!notes.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  const applied = options.apply(notes.store)
  if ('error' in applied) {
    return { kind: 'validation-failed', error: applied.error }
  }

  const written = await bridge.writeNotes(options.activeFilePath, applied.store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_TAG_SLOTS_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'saved' }
}

export async function commitNoteTagAdd(
  deps: NoteTagSlotsDeps,
  options: { activeFilePath: string; label: string },
): Promise<NoteTagManagerCommitResult> {
  return commitNoteTagMutation(deps, {
    activeFilePath: options.activeFilePath,
    apply: (store) => addStickyNoteTag(store, options.label),
  })
}

export async function commitNoteTagRename(
  deps: NoteTagSlotsDeps,
  options: { activeFilePath: string; tagId: string; label: string },
): Promise<NoteTagManagerCommitResult> {
  return commitNoteTagMutation(deps, {
    activeFilePath: options.activeFilePath,
    apply: (store) => renameStickyNoteTag(store, options.tagId, options.label),
  })
}

export async function commitNoteTagDelete(
  deps: NoteTagSlotsDeps,
  options: { activeFilePath: string; tagId: string },
): Promise<NoteTagManagerCommitResult> {
  return commitNoteTagMutation(deps, {
    activeFilePath: options.activeFilePath,
    apply: (store) => removeStickyNoteTag(store, options.tagId),
  })
}
