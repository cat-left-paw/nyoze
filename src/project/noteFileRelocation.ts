/**
 * 付箋 note.file の追従 helper (File Explorer rename / move 対応)。
 *
 * Nyoze 自身の File Explorer でファイル / フォルダを rename / move したとき、
 * `.nyoze/notes.json` の `note.file` (project root 相対パス) を新しい相対パスへ
 * 追従させるための pure helper。renderer / main どちらからも使えるよう
 * node:path には依存しない (path は project relative の文字列としてのみ扱う)。
 *
 * 方針:
 * - 入力 path は必ず project relative の検証 (isProjectRelativeFilePath) を通し、
 *   絶対 path・`..` 脱出・空 segment は黙って無視する (changed=false)。
 * - 追従対象は `open` / `resolved` / `orphaned` の note。
 *   `deleted` note は追従しない (missing-file cleanup 側の整理に委ねる方針を
 *   テストで固定する)。
 * - 一致が無ければ元の store 参照をそのまま返し changed=false。
 *   呼び出し側はこのとき notes.json を書かない (不要な write / 失敗を避ける)。
 * - 本文 Markdown の marker (`<!-- nyoze-note:ID -->`) はこのモジュールでは
 *   一切触らない。位置の source of truth は本文側のままで、ここは notes.json
 *   の参照先 path だけを直す。
 */

import { isProjectRelativeFilePath } from './noteStore'
import type { NyozeNote, NyozeNotesStore } from './noteStore'
import { noteFilePathComparisonKey } from './notePath'

/** 追従対象とする status。deleted は対象外。 */
const RELOCATABLE_STATUSES: ReadonlySet<NyozeNote['status']> = new Set([
  'open',
  'resolved',
  'orphaned',
])

export type RelocateNotesResult = {
  /** 追従後の store。changed=false のとき入力 store と同一参照。 */
  store: NyozeNotesStore
  /** 1 件でも note.file を書き換えたか。 */
  changed: boolean
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/')
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export type RelocateFileOptions = {
  /** 旧 project relative ファイルパス */
  fromRelativePath: string
  /** 新 project relative ファイルパス */
  toRelativePath: string
}

/**
 * 単一ファイルの rename / move に追従する。
 * `note.file` が `fromRelativePath` と完全一致する追従対象 note を
 * `toRelativePath` に更新する。
 */
export function buildRelocatedNotesStore(
  store: NyozeNotesStore,
  options: RelocateFileOptions,
): RelocateNotesResult {
  const from = normalizeSeparators(options.fromRelativePath)
  const to = normalizeSeparators(options.toRelativePath)
  if (!isProjectRelativeFilePath(from) || !isProjectRelativeFilePath(to)) {
    return { store, changed: false }
  }
  if (from === to) return { store, changed: false }

  // NFC/NFD 差分を吸収するため比較 key で一致させる。書き込む新 path は操作後の `to` 由来。
  const fromKey = noteFilePathComparisonKey(from)
  let changed = false
  const notes: Record<string, NyozeNote> = {}
  for (const [id, note] of Object.entries(store.notes)) {
    if (RELOCATABLE_STATUSES.has(note.status) && noteFilePathComparisonKey(note.file) === fromKey) {
      notes[id] = { ...note, file: to }
      changed = true
    } else {
      notes[id] = note
    }
  }
  if (!changed) return { store, changed: false }
  return { store: { version: store.version, notes }, changed: true }
}

export type RelocateDirectoryOptions = {
  /** 旧 project relative ディレクトリパス (末尾スラッシュ不要) */
  fromRelativeDir: string
  /** 新 project relative ディレクトリパス (末尾スラッシュ不要) */
  toRelativeDir: string
}

/**
 * フォルダの rename / move に追従する。
 * `note.file` が `fromRelativeDir/` を prefix に持つ追従対象 note を
 * `toRelativeDir/` 配下へ付け替える。
 *
 * prefix は `/` 区切りで境界一致させるため、`foo` の追従が `foobar/...` に
 * 誤爆しない (prefix は常に末尾 `/` を伴う)。
 */
export function buildRelocatedNotesStoreForDirectory(
  store: NyozeNotesStore,
  options: RelocateDirectoryOptions,
): RelocateNotesResult {
  const fromDir = stripTrailingSlash(normalizeSeparators(options.fromRelativeDir))
  const toDir = stripTrailingSlash(normalizeSeparators(options.toRelativeDir))
  if (!isProjectRelativeFilePath(fromDir) || !isProjectRelativeFilePath(toDir)) {
    return { store, changed: false }
  }
  if (fromDir === toDir) return { store, changed: false }

  // prefix 判定は segment 単位で比較 key を使い、NFC/NFD 差分を吸収する。
  // `/` 区切りの segment 境界一致なので、`foo` の追従が `foobar/...` に誤爆しない。
  // remainder は元 path の segment 形を保ち、新 prefix は操作後の `toDir` 由来にする。
  const fromDirSegmentKeys = fromDir.split('/').map(noteFilePathComparisonKey)
  let changed = false
  const notes: Record<string, NyozeNote> = {}
  for (const [id, note] of Object.entries(store.notes)) {
    const fileSegments = normalizeSeparators(note.file).split('/')
    const isUnderFromDir =
      RELOCATABLE_STATUSES.has(note.status) &&
      fileSegments.length > fromDirSegmentKeys.length &&
      fromDirSegmentKeys.every(
        (key, index) => noteFilePathComparisonKey(fileSegments[index]!) === key,
      )
    if (isUnderFromDir) {
      const remainder = fileSegments.slice(fromDirSegmentKeys.length).join('/')
      const nextFile = `${toDir}/${remainder}`
      // 結果も project relative であることを最終確認 (防御的)。
      if (isProjectRelativeFilePath(nextFile)) {
        notes[id] = { ...note, file: nextFile }
        changed = true
        continue
      }
    }
    notes[id] = note
  }
  if (!changed) return { store, changed: false }
  return { store: { version: store.version, notes }, changed: true }
}
