/**
 * project / notes IPC の結果型 (Task 3A-2 仕上げ)。
 *
 * main (electron/projectIpc.ts)・preload・renderer で共有する型のみを置く。
 * stack trace や raw exception は含めず、renderer 表示に使える
 * discriminated union だけを返す。
 */

import type { ProjectMetadata } from './projectMetadata'
import type { NyozeNotesStore } from './noteStore'
import type { BookOutlineItem } from './bookOutlineTypes'
import type { ProjectBookGroup, ProjectAssetGroup, ProjectAssetItem } from './projectBooksQuery'
import type { BookOutlineChapter, BookDisplayMeta } from './bookFullOutlineQuery'
import type { FileExplorerRole } from './fileExplorerRoles'
import type { BookManifestV3MaterialRole } from './bookManifestV3'
import type { UnregisteredProjectFile } from './bookManifestV3UnregisteredFiles'
import type { MissingFileNoteView } from './missingFileNotesQuery'
import type { WritingMode } from '../settings/types'

/**
 * `project:detectFileRoles`（Slice B16 / File Explorer role アイコン）の 1 件。
 * `path` は renderer が渡した入力文字列のまま返す（visible entry と突き合わせるため）。
 */
export type FileRoleEntry = {
  path: string
  role: FileExplorerRole
}

export type ProjectInfo = {
  /** 解決済み project root の絶対パス (main 側で realpath 済み) */
  projectRoot: string
  metadata: ProjectMetadata
}

/**
 * v3 manifest read loader の observability 用 warning。
 * read query は fallback しないため、`manifestSource: 'none'` と組み合わせて原因を識別する。
 */
export type ProjectManifestWarning =
  | 'unsupported-version'
  | 'invalid'
  | 'read-error'

/**
 * `project:listProjects` の 1 件（workspace root 配下の Project 一覧、read-only）。
 * renderer は projectRoot を送らず、main 側で workspace root を正本に走査する。
 */
export type ProjectListEntry = {
  /** Project root の絶対 path（main 側走査で組み立て。symlink は辿らない）。 */
  projectRoot: string
  /** workspace root からの相対 path（posix 区切り）。並び順のキーでもある。 */
  relativePath: string
  /** `.nyoze/project.json` の title。空 / 不正ならフォルダ名 fallback。 */
  title: string
  /** `.nyoze/books.json` が通常ファイルとして存在するか。 */
  hasBooksManifest: boolean
}

/**
 * `project:listProjects` の結果。
 * - `unavailable`: workspace root（書庫）未設定。
 * - `ready`: workspace root 配下の Project を相対 path 昇順で返す。
 * - `scan-limit-exceeded`: 走査エントリ数が上限を超えた（巨大書庫対策）。
 * - `scan-failed`: workspace root が実在しない / ディレクトリでない等、走査自体に失敗。
 *
 * 書き込みは一切行わない。`.nyoze/project.json` / `books.json` / Markdown / notes.json は不変。
 */
export type ProjectListResult =
  | { ok: true; kind: 'ready'; projects: ProjectListEntry[] }
  | { ok: true; kind: 'unavailable' }
  | { ok: false; reason: 'scan-limit-exceeded' | 'scan-failed' }

/**
 * `project:resolveForFile` の結果。
 * - project 未所属 (祖先に valid な `.nyoze/project.json` がない、または
 *   invalid な project.json で解決が止まった) は `{ ok: true, project: null }`。
 * - invalid-path: 引数不正・実在しない・document 境界外。
 */
export type ProjectResolveResult =
  | { ok: true; project: ProjectInfo | null }
  | { ok: false; reason: 'invalid-path' }

export type ProjectCreateResult =
  | { ok: true; projectRoot: string; metadata: ProjectMetadata }
  | {
      ok: false
      reason:
        | 'invalid-path'
        | 'invalid-args'
        | 'outside-workspace'
        | 'workspace-root-not-allowed'
        | 'not-a-directory'
        | 'already-exists'
        | 'inside-existing-project'
        | 'contains-existing-project'
        | 'write-failed'
    }

/**
 * `project:unregister` の結果。
 * renderer は active file path だけを渡し、main 側で project root を解決する。
 */
export type ProjectUnregisterResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'invalid-path'
        | 'not-in-project'
        | 'notes-exist'
        | 'read-error'
        | 'delete-error'
    }

/**
 * `project:resolveProjectBooks` の結果（Slice B3 / Project タブ）。
 * renderer は active file path だけを渡し、main 側で project root を解決して全体 scan する。
 * - `ready`: 同一 Project 内の Book group と role 別資料を返す。
 * - `not-in-project`: active file が project 未所属。
 * - `invalid-path`: 引数不正・実在しない・document 境界外。
 * - `scan-failed`: project root の走査自体が失敗。
 *
 * 「book 未指定 / body 一覧が空 / 資料が空」は UI 側で ready から導出する。
 */
export type ProjectBooksResult =
  | {
      ok: true
      kind: 'ready'
      project: ProjectInfo
      books: ProjectBookGroup[]
      assets: ProjectAssetGroup[]
      /** active file の project 相対 path（posix）。未解決なら null。 */
      currentRelativePath: string | null
      /**
       * `.nyoze/books.json` v3 loader の状態（observability）。
       * read query は frontmatter へ fallback しない。
       */
      manifestWarning?: ProjectManifestWarning
      /**
       * Books / Materials の source。
       * - `v3`: `.nyoze/books.json` v3 registry を正本にした結果。
       * - `none`: manifest 不在、または loader が v3 ready を返せなかった状態。
       */
      manifestSource?: 'v3' | 'none'
      /** registry 順の Materials 一覧（v3 / none いずれも返す。none では空）。 */
      materialsFlat?: ProjectAssetItem[]
    }
  | { ok: true; kind: 'not-in-project' }
  | { ok: false; reason: 'invalid-path' | 'scan-failed' }

/**
 * `project:resolvePanelContext` の request。
 * renderer は bounded selectedPath + kind + source だけを渡す（active-file は使わない）。
 */
export type ProjectPanelContextIpcRequest = {
  kind: 'file' | 'directory' | 'project-root'
  source: 'file-explorer-selection' | 'project-switcher'
  selectedPath: string
}

/**
 * v3 manifest write IPC 用 anchor。
 * - `string`: active-file 互換の bounded file path
 * - object: context anchor（main 側で project root を解決する）
 */
export type ProjectPanelWriteAnchor = string | ProjectPanelContextIpcRequest

/** `project:resolvePanelContext` ready 応答（Project Books payload + context 用メタ）。 */
export type ProjectPanelContextReadyResult = {
  ok: true
  kind: 'ready'
  project: ProjectInfo
  books: ProjectBookGroup[]
  assets: ProjectAssetGroup[]
  currentRelativePath: string | null
  manifestWarning?: ProjectManifestWarning
  manifestSource?: 'v3' | 'none'
  materialsFlat?: ProjectAssetItem[]
  /**
   * 依存 read IPC（未登録ファイル query 等）用の代表 file path。
   * main 側で project 内の bounded path を選ぶ。無ければ null。
   */
  queryAnchorFilePath: string | null
}

/**
 * `project:resolvePanelContext` の結果（read-only）。
 * write 系 API は呼ばない。
 */
export type ProjectPanelContextResult =
  | ProjectPanelContextReadyResult
  | {
      ok: true
      kind: 'not-in-project'
      createTargetFolder: string | null
      createTargetName: string | null
    }
  | { ok: true; kind: 'unavailable' }
  | { ok: false; reason: 'invalid-path' | 'invalid-request' | 'scan-failed' }

/**
 * `project:resolveBookFullOutline` の結果（Outline 拡張 / Book全体Outline）。
 * renderer は active file path だけを渡し、main 側で project root 解決 + 章 scan +
 * 各章の見出し抽出を行う。read-only。
 * - `ready`: 同じ Book の body 章を章順に並べ、各章の見出しを返す。
 * - `not-in-project`: active file が project 未所属。
 * - `no-current-book`: active file が v3 registry 上の body item でない。
 * - `invalid-path`: 引数不正・実在しない・document 境界外。
 * - `scan-failed`: project root の走査自体が失敗。
 */
export type BookFullOutlineResult =
  | {
      ok: true
      kind: 'ready'
      project: ProjectInfo
      currentBook: string
      /**
       * Book manifest overlay（read-only）。`book` key は維持し displayName / title を添える。
       * manifest 不在 / 該当なしは synthetic。Outline 表示名にだけ使い、章順 / navigation は不変。
       */
      book: BookDisplayMeta
      chapters: BookOutlineChapter[]
      /** active file の project 相対 path（posix）。 */
      currentRelativePath: string
      manifestWarning?: ProjectManifestWarning
      /** Outline / 章順の source。ready は v3 registry が使えたときだけ。 */
      manifestSource?: 'v3'
    }
  | { ok: true; kind: 'not-in-project' }
  | {
      ok: true
      kind: 'no-current-book'
      manifestWarning?: ProjectManifestWarning
      manifestSource?: 'none'
    }
  | { ok: false; reason: 'invalid-path' | 'scan-failed' }

/**
 * `project:resolveChapterNeighbors` の結果（Outline 拡張 / 前後章ナビゲーション）。
 * renderer は active file path だけを渡し、main 側で project root 解決 + 章 scan を行う。
 * 見出し読み取りは伴わない軽量 scan（frontmatter のみ）。read-only。
 * - `ready`: 同一 Book 内の previous / current / next 章を返す（無ければ null）。
 * - `not-in-project`: active file が project 未所属。
 * - `no-current-book`: active file が v3 registry 上の body item でない。
 * - `invalid-path`: 引数不正・実在しない・document 境界外。
 * - `scan-failed`: project root の走査自体が失敗。
 */
export type ChapterNeighborsResult =
  | {
      ok: true
      kind: 'ready'
      project: ProjectInfo
      current: BookOutlineItem | null
      previous: BookOutlineItem | null
      next: BookOutlineItem | null
      /** active file の project 相対 path（posix）。 */
      currentRelativePath: string
      /** 章順 / 前後章の source。ready は v3 registry が使えたときだけ。 */
      manifestSource?: 'v3'
      manifestWarning?: ProjectManifestWarning
    }
  | { ok: true; kind: 'not-in-project' }
  | {
      ok: true
      kind: 'no-current-book'
      manifestWarning?: ProjectManifestWarning
      manifestSource?: 'none'
    }
  | { ok: false; reason: 'invalid-path' | 'scan-failed' }

/**
 * `project:resolveBookExportTarget` の結果（Book 全体 export UI）。
 * renderer は active file path だけを渡し、main 側で project root 解決 +
 * read-only v3 manifest から対象 Book を解決する。
 * - `ready`: active file が属する Book の `bookId` / 表示名を返す。
 * - `not-in-project`: active file が project 未所属。
 * - `no-current-book`: active file が v3 registry 上の body item でない。
 * - `loader-failed`: manifest 不在 / 非対応 version / invalid 等（chapter loader と同 taxonomy）。
 * - `invalid-path`: 引数不正・実在しない・document 境界外。
 */
export type BookExportTargetResult =
  | { ok: true; kind: 'ready'; bookId: string; bookDisplayName: string }
  | { ok: true; kind: 'not-in-project' }
  | { ok: true; kind: 'no-current-book' }
  | {
      ok: true
      kind: 'loader-failed'
      failure: import('../../electron/bookExportChapterLoader').BookExportChapterLoadFailure
    }
  | { ok: false; reason: 'invalid-path' }

export type ProjectReadNotesResult =
  | { ok: true; store: NyozeNotesStore; fileExists: boolean }
  | { ok: false; reason: 'invalid-path' | 'not-in-project' | 'invalid' | 'read-failed' }

/**
 * `project:resolveMissingFileNotes` の結果。
 * renderer は active file path だけを渡し、main 側で project root を解決して
 * open note の参照先ファイルを read-time disk resolution（NFC/NFD 差分込み）で確認する。
 * stored `note.file` は書き換えない。
 */
export type ProjectMissingFileNotesResult =
  | { ok: true; notes: MissingFileNoteView[] }
  | { ok: false; reason: 'invalid-path' | 'not-in-project' | 'read-failed' }

export type ProjectWriteNotesResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'invalid-path'
        | 'not-in-project'
        | 'invalid-store'
        | 'existing-invalid'
        | 'write-failed'
    }

/**
 * `project:updateTitle` の結果。
 * renderer は active file path だけを渡し、main 側で project root を解決して
 * `.nyoze/project.json` の `title` だけを更新する。
 */
export type ProjectUpdateTitleResult =
  | { ok: true; metadata: ProjectMetadata }
  | {
      ok: false
      reason:
        | 'invalid-path'
        | 'invalid-args'
        | 'not-in-project'
        | 'invalid-metadata'
        | 'empty-title'
        | 'title-too-long'
        | 'write-failed'
    }

/**
 * `project:updateBookManifestV3` の操作 payload（discriminated union）。
 *
 * renderer は write anchor とこの operation だけを渡す。projectRoot は送らない。
 * `add-body-item` / `add-material` の metadata は main 側で frontmatter から初回登録時だけ読む。
 */
export type BookManifestV3UpdateOperation =
  | {
      type: 'create-book'
      name: string
      authors?: string[]
      language?: string | null
      writingMode?: WritingMode | null
    }
  | {
      type: 'update-book'
      bookId: string
      name?: string
      authors?: string[]
      language?: string | null
      writingMode?: WritingMode | null
    }
  | { type: 'remove-book'; bookId: string }
  | {
      type: 'update-body-item-metadata'
      bookId: string
      itemId: string
      title?: string
      authors?: string[]
      translators?: string[]
    }
  | { type: 'add-body-item'; bookId: string; path: string }
  | { type: 'move-body-item'; bookId: string; itemId: string; toIndex: number }
  | { type: 'remove-body-item'; bookId: string; itemId: string }
  | { type: 'add-material'; path: string; role: BookManifestV3MaterialRole }
  | {
      type: 'update-material'
      materialId: string
      title?: string
      authors?: string[]
      translators?: string[]
      role?: BookManifestV3MaterialRole
    }
  | { type: 'move-material'; materialId: string; toIndex: number }
  | { type: 'remove-material'; materialId: string }

/**
 * `project:updateBookManifestV3` の結果。
 * 成功時は registry を返さない（UI 未接続）。書き込むのは `.nyoze/books.json` だけ。
 */
export type UpdateBookManifestV3Result =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'invalid-path'
        | 'invalid-args'
        | 'not-in-project'
        | 'invalid-input'
        | 'invalid-manifest'
        | 'read-error'
        | 'write-error'
      detail?: string
    }

/**
 * `project:transferExplorerEntry` の引数。
 * File Explorer 単一ファイル rename / move を main 側の統合 operation へ渡す。
 * renderer は source / destination 絶対 path・操作種別・overwrite だけを渡し、
 * project root / books.json / notes.json の内容は渡さない（main 側で解決・読み取り）。
 */
export type ExplorerTransferRequest = {
  kind: 'rename' | 'move'
  sourcePath: string
  destinationPath: string
  overwrite: boolean
}

/**
 * `project:transferExplorerEntry` の結果。
 * 物理ファイル・`.nyoze/books.json` v3 登録 path・`.nyoze/notes.json` の `note.file` を
 * 整合した状態で更新する統合 operation の構造化結果。失敗理由を renderer へ返す。
 */
export type ExplorerTransferResult =
  | { ok: true; notesChanged: boolean; manifestChanged: boolean }
  | {
      ok: false
      reason:
        | 'invalid-args'
        | 'invalid-path'
        | 'outside-workspace'
        | 'manifest-invalid'
        | 'manifest-diagnostics'
        | 'registry-path-conflict'
        | 'cross-project-registered-file'
        | 'notes-invalid'
        | 'overwrite-unsupported'
        | 'file-operation-failed'
        | 'notes-write-failed'
        | 'manifest-write-failed'
        | 'rollback-failed'
    }

/**
 * `project:checkFolderTransferGuard` の結果。
 * フォルダ rename / move 前に、配下に v3 登録済み path や非 deleted 付箋があるかを main 側で確認する。
 * フォルダ配下 path の一括追従が未実装なため、`blocked: true` の場合は renderer 側で rename を拒否する。
 * renderer は folder 絶対 path だけを渡し、project root は main 側で解決する。
 */
export type ExplorerFolderTransferGuardResult =
  | { ok: true; blocked: boolean }
  | { ok: false; reason: 'invalid-path' | 'outside-workspace' }

/**
 * `project:resolveUnregisteredFilesV3` の結果。
 * renderer は write anchor または active file path だけを渡し、main 側で project root を解決して
 * `.nyoze/books.json` v3 registry を正本に未登録テキスト系ファイルを列挙する。
 *
 * scan 自体は version 非依存で、registry filter だけが v3 を見る。Markdown / frontmatter は
 * 読み書きしない。
 *
 * - `ready`: v3 ready Project。未登録 `.md` / `.markdown` / `.txt` を返す。
 *   `books.json` absent は空 v3 registry として扱い、Project 内テキスト系ファイルを未登録として返す。
 * - `not-in-project`: anchor が project 未所属。
 * - `invalid-path`: 引数不正・実在しない・document 境界外。
 * - `manifest-invalid`: 既存 `books.json` が invalid または unsupported version。
 * - `manifest-read-error`: 既存 `books.json` の読み取り不能。
 * - `scan-failed`: project root 配下のファイル走査自体が失敗。
 */
export type BookManifestV3UnregisteredFilesIpcResult =
  | { ok: true; kind: 'ready'; project: ProjectInfo; files: UnregisteredProjectFile[] }
  | { ok: true; kind: 'not-in-project' }
  | {
      ok: false
      reason: 'invalid-path' | 'invalid-args' | 'manifest-invalid' | 'manifest-read-error' | 'scan-failed'
    }
