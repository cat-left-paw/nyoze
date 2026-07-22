import { createNoteAnchorId } from '../../editor-core/io/noteAnchor'
import type { SelectionRange } from '../../editor-core/types'
import { toProjectRelativeFilePath } from '../../project/notePath'
import { createNoteEntry } from '../../project/noteStore'
import type {
  ProjectResolveResult,
  ProjectReadNotesResult,
  ProjectWriteNotesResult,
} from '../../project/projectIpcTypes'
import type { NyozeNotesStore } from '../../project/noteStore'
import { getPlainFormattingUnavailableMessage } from '../utils/plainModeCommandGate'
import type { PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * 付箋追加 flow (Task 3A-3) の controller。
 *
 * React / Electron に依存しない DI 構成で、useNoteAnchorInsert から呼ぶ。
 * projectRoot は renderer で組み立てず、main の `project:resolveForFile` が
 * 返した値だけを使う。
 *
 * 順序の決定 (テストで固定):
 * 「notes.json write → 本文 anchor 挿入」の順とする。
 * - write 失敗時は本文に一切触れないため、「本文 anchor だけが残り
 *   メモが存在しない」最悪の不整合 (spike リスク 3) を避けられる。
 * - write 成功後の挿入失敗では notes.json 側に orphan entry が残るが、
 *   本文は無傷でありメモも失われない。orphan 整理は Task 3A-5 で扱う。
 */

export const NOTE_ANCHOR_NOT_IN_PROJECT_MESSAGE =
  'このファイルは作品に属していません。\n付箋を使用するには、原稿を含むフォルダを作品として設定してください。'

export const NOTE_ANCHOR_FIRST_NOTICE_MESSAGE =
  '付箋を作成すると、位置を保持するための非表示コメントが Markdown本文に追加されます。\nこのコメントは通常の表示や書籍出力には含まれません。\nObsidianなどの外部エディタで編集する場合は、コメントを削除しないようご注意ください。'

export const NOTE_ANCHOR_UNSAVED_FILE_MESSAGE =
  '付箋を追加するには、先にファイルを保存してください。'

export const NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE =
  '付箋データ (notes.json) を読み込めませんでした。\nファイルが壊れている可能性があります。付箋データは変更していません。'

export const NOTE_ANCHOR_WRITE_ERROR_MESSAGE =
  '付箋データ (notes.json) を保存できなかったため、付箋を追加しませんでした。\n本文は変更されていません。'

export const NOTE_ANCHOR_INSERT_ERROR_MESSAGE =
  '本文へ付箋マーカーを挿入できませんでした。'

export const NOTE_ANCHOR_EMPTY_MESSAGE =
  'タイトルまたはメモを入力してください。'

export const NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE =
  'この環境では付箋機能を利用できません。'

/** window.nyozeBridge.project と同形の最小 bridge 面 (テストで差し替え可能)。 */
export type NoteAnchorProjectBridge = {
  resolveForFile: (filePath: string) => Promise<ProjectResolveResult>
  readNotes: (filePath: string) => Promise<ProjectReadNotesResult>
  writeNotes: (filePath: string, store: NyozeNotesStore) => Promise<ProjectWriteNotesResult>
}

export type NoteAnchorInsertDeps = {
  getActiveFilePath: () => string | null
  /** 内部 doc (ヘルプ等) では付箋を追加しない */
  isInternalDoc: () => boolean
  /** Source Mode / Paragraph Plain active なら kind を返す */
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  /** EditorCore.insertNoteAnchor 相当 */
  insertAnchor: (id: string, range?: SelectionRange) => boolean
}

export type NoteAnchorPrepareResult =
  | { kind: 'ready'; activeFilePath: string }
  | { kind: 'blocked'; message: string }

export type NoteAnchorCommitResult =
  | { kind: 'inserted'; id: string }
  | { kind: 'failed'; message: string }

/**
 * 付箋追加の前提条件を検査する (入力 modal を開く前に呼ぶ)。
 *
 * Source Mode / Paragraph Plain active 時は付箋追加不可 (初期スライスの方針)。
 * 一時編集状態と PM Doc の整合を取ってからの挿入は将来スライスで扱う。
 */
export async function prepareNoteAnchorInsert(
  deps: NoteAnchorInsertDeps,
): Promise<NoteAnchorPrepareResult> {
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

  // invalid notes.json はここで止める (本文・notes とも変更しない)
  const notes = await bridge.readNotes(activeFilePath)
  if (!notes.ok) {
    return { kind: 'blocked', message: NOTE_ANCHOR_NOTES_READ_ERROR_MESSAGE }
  }

  return { kind: 'ready', activeFilePath }
}

/**
 * 付箋本文の入力確定後に呼ぶ。notes.json への write が成功した場合のみ
 * 本文へ anchor を挿入する (順序はファイル冒頭コメント参照)。
 */
export async function commitNoteAnchorInsert(
  deps: NoteAnchorInsertDeps,
  options: {
    activeFilePath: string
    /** 1 行タイトル (UI 入力)。createNoteEntry 側で trim / 空省略する。 */
    title: string
    /** 付箋本文 (複数行)。notes.json に改行ごとそのまま保存する。 */
    text: string
    range?: SelectionRange
  },
): Promise<NoteAnchorCommitResult> {
  // タイトル・本文がともに空 (空白のみ含む) なら write も anchor 挿入もしない。
  if (options.title.trim().length === 0 && options.text.trim().length === 0) {
    return { kind: 'failed', message: NOTE_ANCHOR_EMPTY_MESSAGE }
  }

  const bridge = deps.getBridge()
  if (!bridge) {
    return { kind: 'failed', message: NOTE_ANCHOR_BRIDGE_UNAVAILABLE_MESSAGE }
  }

  // submit 時点の状態で再解決・再読込する (modal 表示中の外部変更に追従)
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

  const id = createNoteAnchorId()
  const store: NyozeNotesStore = {
    version: notes.store.version,
    notes: {
      ...notes.store.notes,
      // text は複数行をそのまま保存。title は createNoteEntry が trim / 空省略する。
      [id]: createNoteEntry({ file: relativeFile, title: options.title, text: options.text }),
    },
  }

  const written = await bridge.writeNotes(options.activeFilePath, store)
  if (!written.ok) {
    return { kind: 'failed', message: NOTE_ANCHOR_WRITE_ERROR_MESSAGE }
  }

  if (!deps.insertAnchor(id, options.range)) {
    // notes.json には entry が残る (orphan) が、本文は無傷でメモも失われない。
    return { kind: 'failed', message: NOTE_ANCHOR_INSERT_ERROR_MESSAGE }
  }
  return { kind: 'inserted', id }
}
