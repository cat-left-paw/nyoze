import { normalizeNoteEditColor } from '../../project/noteColor'
import {
  buildNoteTagIdsForSave,
  buildTagRegistry,
} from '../../project/noteTags'
import type { NyozeNote, NyozeNotesStore } from '../../project/noteStore'
import { toProjectRelativeFilePath } from '../../project/notePath'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import {
  NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE,
  NOTE_ANCHOR_EMPTY_MESSAGE,
  NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE,
  NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE,
  NOTE_ANCHOR_UNSAVED_FILE_MESSAGE,
} from './noteAnchorInsertController'
import { getPlainFormattingUnavailableMessage, type PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * 既存付箋の title / text 編集 (Markdown textarea 編集)。
 *
 * 編集対象は現行文書 (active file) に属する status:'open' / 'resolved' の note だけ。
 * 他ファイルの note / orphan / deleted / missing は対象外。
 * 本文 Markdown / noteAnchor marker / status / 位置には一切触れず、
 * notes.json の title / text / color / tags / updatedAt のみを更新する。
 *
 * 順序・不変条件 (insert / delete controller と統一):
 * - projectRoot は renderer から IPC 引数に渡さない。active file path を
 *   main 側 `project:resolveForFile` に渡し、返った projectRoot は
 *   relative file 照合のための pure 計算にのみ使う。
 * - notes.json の read/write は既存 project bridge を使う。
 * - invalid notes.json は read が ok=false を返すため上書きしない。
 */

export const NOTE_EDIT_NOT_FOUND_MESSAGE =
  '編集対象の付箋が見つかりません。'

export const NOTE_EDIT_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できませんでした。付箋データは変更していません。'

export type NoteEditDeps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
}

export type NoteEditDraft = {
  /** 1 行タイトル (UI 入力)。trim 後に空なら store からは省略する。 */
  title: string
  /** 付箋本文 (複数行 Markdown)。ユーザー入力をそのまま保持する。 */
  text: string
  /** palette の color id。保存時に normalize する。 */
  color: string
  /** 選択済み tag id (registry 内の既知 id のみ UI から渡す)。 */
  tagIds: string[]
}

export type NoteEditPrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteEditCommitResult =
  | { kind: 'edited'; id: string }
  | { kind: 'failed'; message: string }

/** UI (DocumentNotesPanel) へ返す保存結果。cancelled は plain/internal 等の安全停止。 */
export type NoteEditResult =
  | { kind: 'edited' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

/**
 * unit test 用: 対象 note の title / text / updatedAt だけ更新した store を返す。
 * status / file / 位置 / 他 note には触れない。
 * title は trim 後に空なら省略する (normalizer は既存値を勝手に trim しないため、
 * trim/省略は UI 入力経路であるこの helper が担う)。
 * 対象 id が無ければ null。
 */
export function buildEditedNoteStore(
  store: NyozeNotesStore,
  id: string,
  draft: NoteEditDraft,
  now: string,
): NyozeNotesStore | null {
  const existing = store.notes[id]
  if (!existing) return null

  const trimmedTitle = draft.title.trim()
  const registry = buildTagRegistry(store.stickyNoteTags)
  const nextTags = buildNoteTagIdsForSave(draft.tagIds, existing.tags, registry)
  const nextNote: NyozeNote = {
    ...existing,
    text: draft.text,
    color: normalizeNoteEditColor(draft.color),
    updatedAt: now,
  }
  if (nextTags.length > 0) {
    nextNote.tags = nextTags
  } else {
    delete nextNote.tags
  }
  if (trimmedTitle.length > 0) {
    nextNote.title = trimmedTitle
  } else {
    delete nextNote.title
  }

  return {
    ...store,
    notes: {
      ...store.notes,
      [id]: nextNote,
    },
  }
}

export async function prepareNoteEdit(
  deps: NoteEditDeps,
): Promise<NoteEditPrepareResult> {
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

export async function commitNoteEdit(
  deps: NoteEditDeps,
  options: {
    activeFilePath: string
    id: string
    draft: NoteEditDraft
  },
): Promise<NoteEditCommitResult> {
  // title / text がともに空 (空白のみ) なら拒否する (作成 UI と同じ整合)。
  if (options.draft.title.trim().length === 0 && options.draft.text.trim().length === 0) {
    return { kind: 'failed', message: NOTE_ANCHOR_EMPTY_MESSAGE }
  }

  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  // submit 時点で再解決・再読込し、編集中の外部変更に追従する。
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

  // 現行文書に属する open / resolved note だけ編集できる。
  const existing = notes.store.notes[options.id]
  if (
    !existing ||
    (existing.status !== 'open' && existing.status !== 'resolved') ||
    existing.file !== relativeFile
  ) {
    return { kind: 'failed', message: NOTE_EDIT_NOT_FOUND_MESSAGE }
  }

  const now = new Date().toISOString()
  const store = buildEditedNoteStore(notes.store, options.id, options.draft, now)
  if (!store) {
    return { kind: 'failed', message: NOTE_EDIT_NOT_FOUND_MESSAGE }
  }

  const written = await bridge.writeNotes(options.activeFilePath, store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_EDIT_WRITE_ERROR_MESSAGE }
  }

  return { kind: 'edited', id: options.id }
}
