import { toProjectRelativeFilePath } from '../../project/notePath'
import {
  buildRelocatedNotesStore,
  buildRelocatedNotesStoreForDirectory,
} from '../../project/noteFileRelocation'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'

/**
 * File Explorer の rename / move 完了後に notes.json の `note.file` を追従させる
 * controller (DI 構成、React / Electron 非依存)。
 *
 * 設計:
 * - projectRoot は renderer から IPC 引数として渡さない。新しい場所 (toPath) を
 *   `project:resolveForFile` に渡し、main が返した projectRoot だけを使う。
 *   旧 path (fromPath) は既に存在しないため fs には触れず、projectRoot を基準に
 *   pure な文字列計算で相対 path を求める。
 * - notes.json の read / write は本文保存経路と分離し、既存の project IPC
 *   (readNotes / writeNotes) と main 側 atomic write を使う。
 * - notes.json 欠損は read が空 store を返すため helper で changed=false となり
 *   write しない。invalid notes.json は read が ok=false を返すため上書きしない。
 * - 本文 Markdown の marker は一切編集しない。
 */

export type NoteRelocationOutcome =
  | { kind: 'relocated' }
  | { kind: 'noop'; reason: 'not-in-project' | 'unchanged' }
  | { kind: 'error'; reason: 'read-failed' | 'write-failed' }

export async function relocateNotesForMovedPath(
  bridge: NoteAnchorProjectBridge,
  fromPath: string,
  toPath: string,
): Promise<NoteRelocationOutcome> {
  // 追従先 (新しい場所) から project を解決する。project 未所属・単独ファイルは
  // notes.json を作らない方針なので何もしない。
  const resolved = await bridge.resolveForFile(toPath)
  if (!resolved.ok || resolved.project === null) {
    return { kind: 'noop', reason: 'not-in-project' }
  }
  const projectRoot = resolved.project.projectRoot

  // 旧 / 新を project 相対へ変換 (pure)。どちらかが project 外なら追従しない。
  const fromRelative = toProjectRelativeFilePath(projectRoot, fromPath)
  const toRelative = toProjectRelativeFilePath(projectRoot, toPath)
  if (fromRelative === null || toRelative === null) {
    return { kind: 'noop', reason: 'not-in-project' }
  }

  const read = await bridge.readNotes(toPath)
  if (!read.ok) {
    // invalid notes.json はここで止める (上書きしない)。
    return { kind: 'error', reason: 'read-failed' }
  }

  // ファイル一致 (exact) とフォルダ prefix の両方を順に適用する。
  // 両者の対象集合は排他なので、ファイル rename / フォルダ rename いずれも
  // この組み合わせで安全に追従できる。
  const afterFile = buildRelocatedNotesStore(read.store, {
    fromRelativePath: fromRelative,
    toRelativePath: toRelative,
  })
  const afterDir = buildRelocatedNotesStoreForDirectory(afterFile.store, {
    fromRelativeDir: fromRelative,
    toRelativeDir: toRelative,
  })
  if (!afterFile.changed && !afterDir.changed) {
    // 追従対象が無い (notes.json 欠損 / 一致なし) ので write しない。
    return { kind: 'noop', reason: 'unchanged' }
  }

  const written = await bridge.writeNotes(toPath, afterDir.store)
  if (!written.ok) {
    return { kind: 'error', reason: 'write-failed' }
  }
  return { kind: 'relocated' }
}
