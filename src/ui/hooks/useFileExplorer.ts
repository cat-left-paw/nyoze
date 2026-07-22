import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { FILE_EXPLORER_DIR_STORAGE_KEY } from '../../settings/defaults'
import { getUiText } from '../i18n/uiText'
import { getParentPath, getPathBaseName, joinPath } from '../utils/path'
import type { FileExplorerRole } from '../../project/fileExplorerRoles'
import type { ProjectAssetRole } from '../../project/projectBooksQuery'
import {
  resolveFileExplorerRegistrationInfo,
  type FileExplorerRegisterBookOption,
} from '../../project/fileExplorerRegistration'
import type { BookManifestV3UpdateOperation } from '../../project/projectIpcTypes'
import { detectProjectTextFileExtension } from '../../project/projectTextFileScan'
import { useExplorerProjectList } from './useExplorerProjectList'

/** 左ペインのタブ（UI 表示専用。Project / Book の source of truth ではない）。 */
export type FileExplorerLeftPaneTab = 'library' | 'projects'

/**
 * `作品一覧` タブ内の表示状態（UI 表示専用）。
 * - `list`: Project 一覧
 * - `project-root`: 選択した Project root の File Explorer 表示（drill-down）
 */
export type FileExplorerProjectsPaneView = 'list' | 'project-root'

const MD_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
const EXPLORER_VISIBLE_EXTENSIONS = new Set(['.md', '.txt'])

export type ExplorerFileIconKind = 'default' | 'text'

type DirEntry = { name: string; isDirectory: boolean }

type ExplorerClipboard = {
  mode: 'cut' | 'copy'
  sourcePath: string
}

type PendingTransfer = {
  mode: 'cut' | 'copy'
  sourcePath: string
  destinationDir: string
  targetPath: string
}

export type FileExplorerVisibleEntry = {
  name: string
  path: string
  isDirectory: boolean
  depth: number
  expanded: boolean
  loading: boolean
  selected: boolean
  /**
   * このフォルダが `.nyoze/project.json` を持つ project root か（表示専用）。
   * 判定は main 側で行い、frontmatter は読まない。ファイル entry では常に false。
   */
  isProjectRoot: boolean
  /**
   * 既存 project root の配下フォルダか（自身が project root ではない）。表示専用。
   * 「このフォルダを作品にする」を UI 側で disabled にする用途。
   */
  isInsideExistingProject: boolean
  /**
   * project 内 Markdown ファイルの frontmatter `role`（表示専用）。
   * 既知の表示対象 role（body / synopsis / character / setting / material / unsorted）の
   * ときだけ値を持ち、それ以外（フォルダ / 非対象 / 読めない）は null。
   */
  role: FileExplorerRole | null
}

export type FileTransferConflictState = {
  mode: 'cut' | 'copy'
  sourcePath: string
  destinationDir: string
  targetPath: string
  errorMessage: string | null
}

export type FileExplorerNamePromptState = {
  title: string
  initialValue: string
  confirmLabel: string
  selectAllOnOpen?: boolean
}

/** File Explorer から開く Project 作成モーダルの対象フォルダ。 */
export type FileExplorerProjectCreateModalTarget = {
  folderPath: string
  folderName: string
}

/**
 * File Explorer のファイル右クリックから Project の未登録ファイルを Book / Material に
 * 登録する導線の表示専用 state（context menu 用）。
 *
 * - `loading`: 対象ファイルの登録可否を read-only IPC で確認中。
 * - `unavailable`: project 外 / 登録済み / 非対象 / v3 books.json 不在など、登録メニュー非表示。
 * - `ready`: 未登録の `.md` / `.markdown` / `.txt`。`relativePath` を writer に渡す。
 */
export type FileExplorerRegistrationState =
  | { kind: 'idle' }
  | { kind: 'loading'; filePath: string }
  | { kind: 'unavailable'; filePath: string }
  | {
      kind: 'ready'
      filePath: string
      relativePath: string
      books: FileExplorerRegisterBookOption[]
    }

/** File Explorer のファイル右クリックからの v3 登録導線 bundle（pane へ渡す）。 */
export type FileExplorerRegistrationApi = {
  state: FileExplorerRegistrationState
  /** ファイル context menu を開いたとき、登録可否を read-only で解決する。 */
  onRequest: (entry: FileExplorerVisibleEntry) => void
  /** context menu を閉じたとき、解決中 state を idle へ戻す。 */
  onClear: () => void
  onRegisterToBook: (bookId: string) => void
  onRegisterAsMaterial: (role: ProjectAssetRole) => void
}

type UseFileExplorerOptions = {
  uiLanguageMode: UiLanguageMode
  onFileContentLoaded: (filePath: string, content: string) => void
  onOpenFileInNewTab?: (filePath: string, content: string) => void
  onFileMoved?: (fromPath: string, toPath: string, opts?: { isDirectory?: boolean }) => void
  /** ゴミ箱へ移動完了後 (付箋 missing-file 一覧などを refresh する用途) */
  onFileDeleted?: (path: string) => void
  /** v3 books.json への登録成功後に Project タブを refresh させる用途（nonce bump 等）。 */
  onProjectRegistered?: () => void
  /**
   * 単一ファイル rename / move を統合 transfer へ渡す前の安全ガード。
   * 対象 path が未保存 (dirty) の open tab などで安全に動かせない場合に
   * `{ ok: false, message }` を返すと、物理移動も metadata 更新も行わず中止する。
   */
  canTransferEntry?: (absolutePath: string) => { ok: boolean; message?: string }
  /**
   * 統合 transfer（books.json v3 / notes.json 追従つき）の成功後に、
   * Notes / missing-file / hover preview / role icon / Project タブを refresh する用途。
   */
  onProjectFileTransferred?: () => void
  /** Project metadata 更新後に書庫内 Project 一覧を refresh する用途。 */
  projectRefreshNonce?: number
}

export function normalizeForCompare(path: string): string {
  if (path.includes('\\')) {
    return path.replace(/\\+$/g, '').toLowerCase()
  }
  return path.replace(/\/+$/g, '')
}

function isSamePath(left: string, right: string): boolean {
  return normalizeForCompare(left) === normalizeForCompare(right)
}

/** project root の厳密な子孫か（root 自身は false）。 */
export function isPathInsideProjectRoot(
  dirPath: string,
  projectRootDirs: Set<string>,
): boolean {
  const normalized = normalizeForCompare(dirPath)
  for (const root of projectRootDirs) {
    if (normalized === root) continue
    if (normalized.startsWith(`${root}/`)) return true
  }
  return false
}

/**
 * 「書庫に戻る」導線を出すべきか（表示専用 pure 判定）。
 * workspace root が設定済みで、現在の表示フォルダが workspace root と異なるときだけ true。
 * workspace root 表示中・未設定・dir 未設定では false。
 */
export function shouldShowReturnToLibrary(
  workspaceRoot: string | null,
  fileExplorerDir: string | null,
): boolean {
  return Boolean(
    workspaceRoot && fileExplorerDir && !isSamePath(workspaceRoot, fileExplorerDir),
  )
}

function isMarkdownFile(name: string): boolean {
  const ext = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : ''
  return MD_EXTENSIONS.has(ext)
}

function isExplorerVisibleFile(name: string): boolean {
  const ext = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : ''
  return EXPLORER_VISIBLE_EXTENSIONS.has(ext)
}

/**
 * role アイコン検出対象の `.md` / `.markdown` / `.txt`（大文字小文字無視）か。
 * v3 登録対象拡張子と一致させる。
 */
function isBookMarkdownName(name: string): boolean {
  return detectProjectTextFileExtension(name) !== null
}

export function getExplorerFileIconKind(name: string): ExplorerFileIconKind {
  const ext = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : ''
  if (ext === '.txt') return 'text'
  return 'default'
}

/**
 * After a failed non-overwriting copy/move to a candidate path: if that path
 * now exists, another writer likely won a race — advance to the next index.
 */
export function shouldRetryKeepBothAfterFailedTransfer(
  candidateExistsAfterFailure: boolean,
): boolean {
  return candidateExistsAfterFailure
}

export function getRenamePromptConfig(name: string, isDirectory: boolean): {
  title: string
  initialValue: string
} {
  if (isDirectory) {
    return { title: '名前を変更', initialValue: name }
  }

  const dotIndex = name.lastIndexOf('.')
  const hasExtension = dotIndex > 0
  if (!hasExtension) {
    return { title: '名前を変更', initialValue: name }
  }

  const originalExt = name.slice(dotIndex)
  return {
    title: `名前を変更（${originalExt}）`,
    initialValue: name.slice(0, dotIndex),
  }
}

export function buildRenameTargetName(
  originalName: string,
  isDirectory: boolean,
  input: string,
): string {
  const trimmedInput = input.trim()
  if (isDirectory) return trimmedInput

  const dotIndex = originalName.lastIndexOf('.')
  const hasExtension = dotIndex > 0
  if (!hasExtension) return trimmedInput

  const originalExt = originalName.slice(dotIndex)
  return `${trimmedInput}${originalExt}`
}

export function isValidRenameName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (trimmed === '.' || trimmed === '..') return false
  if (/[\\/]/.test(trimmed)) return false
  // Dotfiles would be hidden by Explorer's visibility filter, appearing as
  // if the file was deleted. Block names starting with '.' to prevent this.
  if (trimmed.startsWith('.')) return false
  return true
}

export function buildVisibleEntries(
  rootDir: string,
  entriesByDir: Record<string, DirEntry[]>,
  expandedDirs: Set<string>,
  loadingDirs: Set<string>,
  selectedPath: string | null,
  /** project root と判定済みのフォルダパス（normalizeForCompare 済み）。表示専用。 */
  projectRootDirs: Set<string> = new Set(),
  /** ファイルパス（normalizeForCompare 済み）-> 表示用 role。表示専用。 */
  fileRoles: Map<string, FileExplorerRole> = new Map(),
): FileExplorerVisibleEntry[] {
  const rows: FileExplorerVisibleEntry[] = []

  const walk = (dirPath: string, depth: number) => {
    const entries = entriesByDir[dirPath] ?? []
    for (const entry of entries) {
      const entryPath = joinPath(dirPath, entry.name)
      const expanded = entry.isDirectory && expandedDirs.has(entryPath)
      rows.push({
        name: entry.name,
        path: entryPath,
        isDirectory: entry.isDirectory,
        depth,
        expanded,
        loading: entry.isDirectory && loadingDirs.has(entryPath),
        selected: selectedPath != null && isSamePath(entryPath, selectedPath),
        isProjectRoot:
          entry.isDirectory &&
          projectRootDirs.has(normalizeForCompare(entryPath)),
        isInsideExistingProject:
          entry.isDirectory && isPathInsideProjectRoot(entryPath, projectRootDirs),
        role: entry.isDirectory
          ? null
          : fileRoles.get(normalizeForCompare(entryPath)) ?? null,
      })
      if (entry.isDirectory && expanded) {
        walk(entryPath, depth + 1)
      }
    }
  }

  walk(rootDir, 0)
  return rows
}

export function resolvePasteDestinationDir(
  rootDir: string,
  selectedPath: string | null,
  selectedIsDirectory: boolean,
): string {
  if (!selectedPath) return rootDir
  if (selectedIsDirectory) return selectedPath
  return getParentPath(selectedPath) ?? rootDir
}

/**
 * Collect ancestor directory paths between `dir` and `root` (exclusive).
 * Returns paths from `dir` up to (but not including) `root`.
 */
export function collectAncestors(dir: string, root: string): string[] {
  const ancestors: string[] = []
  let current = dir
  while (current && !isSamePath(current, root)) {
    ancestors.push(current)
    const parent = getParentPath(current)
    if (!parent || isSamePath(parent, current)) break
    current = parent
  }
  return ancestors
}

export function resolveCreateDestinationDir(
  rootDir: string,
  selectedPath: string | null,
  selectedIsDirectory: boolean,
): string {
  return resolvePasteDestinationDir(rootDir, selectedPath, selectedIsDirectory)
}

export function appendIndexToName(name: string, index: number): string {
  if (index <= 1) return name
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) {
    return `${name} ${index}`
  }
  const base = name.slice(0, dotIndex)
  const ext = name.slice(dotIndex)
  return `${base} ${index}${ext}`
}

export function normalizeNewNoteName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const dotIndex = trimmed.lastIndexOf('.')
  const hasExtension = dotIndex > 0 && dotIndex < trimmed.length - 1
  return hasExtension ? trimmed : `${trimmed}.md`
}

export function shouldResetExplorerRootAfterLoadFailure(
  rootDir: string | null,
  failedDir: string,
): boolean {
  return Boolean(rootDir && isSamePath(rootDir, failedDir))
}

/** 統合 transfer 失敗理由を File Explorer 表示メッセージへ変換する。 */
export function explorerTransferFailureMessage(reason: string | null): string {
  switch (reason) {
    case 'manifest-invalid':
    case 'manifest-diagnostics':
      return '作品登録 (books.json) に問題があるため、ファイルを移動しませんでした。作品タブで内容を確認してください。'
    case 'registry-path-conflict':
      return '移動先の path が作品登録内で衝突するため、ファイルを移動しませんでした。'
    case 'cross-project-registered-file':
      return '登録済みファイルや付箋付きファイルを別の作品へ移動することはできません。'
    case 'overwrite-unsupported':
      return '作品登録 / 付箋データを伴うファイルを既存ファイルへ上書き移動することはできません。別名で移動してください。'
    case 'notes-invalid':
      return '付箋データ (notes.json) に問題があるため、ファイルを移動しませんでした。'
    case 'manifest-write-failed':
    case 'notes-write-failed':
      return 'ファイルを元に戻しました。作品登録 / 付箋データの更新に失敗したため、移動を中止しました。'
    case 'rollback-failed':
      return '移動に失敗し、元に戻すこともできませんでした。Finder / Explorer でファイルの状態を確認してください。'
    case 'outside-workspace':
    case 'invalid-path':
    case 'invalid-args':
      return '移動元 / 移動先のパスが不正です。'
    default:
      return 'ファイル操作に失敗しました。パスと権限を確認してください。'
  }
}

export function useFileExplorer({
  uiLanguageMode,
  onFileContentLoaded,
  onOpenFileInNewTab,
  onFileMoved,
  onFileDeleted,
  onProjectRegistered,
  canTransferEntry,
  onProjectFileTransferred,
  projectRefreshNonce = 0,
}: UseFileExplorerOptions) {
  const [fileExplorerDir, setFileExplorerDirState] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(FILE_EXPLORER_DIR_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [entriesByDir, setEntriesByDir] = useState<Record<string, DirEntry[]>>({})
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set())
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  /** project root と判定済みのフォルダパス（normalizeForCompare 済み）。表示専用。 */
  const [projectRootDirs, setProjectRootDirs] = useState<Set<string>>(() => new Set())
  /** ファイルパス（normalizeForCompare 済み）-> 表示用 role。表示専用。 */
  const [fileRoles, setFileRoles] = useState<Map<string, FileExplorerRole>>(() => new Map())
  /**
   * project root / role 検出を強制的に再実行するための nonce。
   * フォルダ集合や file 集合が変わらない操作（例: フォルダの project 化で `.nyoze` が増える）でも
   * バッジ / role を更新できるよう、明示的に bump する。
   */
  const [detectionNonce, setDetectionNonce] = useState(0)
  const [clipboard, setClipboard] = useState<ExplorerClipboard | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const [transferConflict, setTransferConflict] =
    useState<FileTransferConflictState | null>(null)
  const [namePrompt, setNamePrompt] = useState<FileExplorerNamePromptState | null>(null)
  const [projectCreateModalTarget, setProjectCreateModalTarget] =
    useState<FileExplorerProjectCreateModalTarget | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  /**
   * main 側の workspace root（書庫 root）。renderer は path を送らず read-only で受け取るだけ。
   * 「書庫に戻る」導線の表示判定と戻り先に使う（projectRoot は main へ送らない）。
   */
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  /**
   * 左ペインの表示モード（`書庫` / `作品一覧`）。UI 表示専用 state で、Project / Book の
   * source of truth でも ProjectPane context でもない。`作品一覧` タブを開いただけでは
   * 右ペイン Project タブの active-file 連動を変えない。
   */
  const [leftPaneTab, setLeftPaneTab] = useState<FileExplorerLeftPaneTab>('library')
  /**
   * `作品一覧` タブ内の表示状態（list = Project 一覧 / project-root = 選択 Project の drill-down）。
   * `書庫` タブとは独立。表示専用で、ProjectPane context には影響しない。
   */
  const [projectsPaneView, setProjectsPaneView] =
    useState<FileExplorerProjectsPaneView>('list')
  // Project 一覧の load/refresh は「作品一覧タブで list を表示中」のときだけ行う。
  const projectListVisible = leftPaneTab === 'projects' && projectsPaneView === 'list'
  const {
    projectListState: explorerProjectListState,
    refreshExplorerProjectList,
  } = useExplorerProjectList(workspaceRoot, projectListVisible, projectRefreshNonce)
  /**
   * 右クリック中ファイルの v3 登録メニュー state（表示専用）。context menu を開いたとき
   * だけ read-only IPC で解決する。selection とは独立に持つ。
   */
  const [fileRegistration, setFileRegistration] = useState<FileExplorerRegistrationState>({
    kind: 'idle',
  })
  const fileRegistrationGenerationRef = useRef(0)
  const namePromptResolverRef = useRef<((value: string | null) => void) | null>(null)

  const bridge = window.nyozeBridge?.fs

  const loadDirectory = useCallback(
    async (dirPath: string): Promise<boolean> => {
      if (!bridge) return false
      setLoadingDirs((prev) => {
        const next = new Set(prev)
        next.add(dirPath)
        return next
      })
      try {
        const entries = await bridge.listDir(dirPath)
        const visibleEntries = entries.filter(
          (entry) => entry.isDirectory || isExplorerVisibleFile(entry.name),
        )
        setEntriesByDir((prev) => ({ ...prev, [dirPath]: visibleEntries }))
        if (fileExplorerDir && isSamePath(fileExplorerDir, dirPath)) {
          setOperationError(null)
        }
        return true
      } catch {
        if (shouldResetExplorerRootAfterLoadFailure(fileExplorerDir, dirPath)) {
          setFileExplorerDirState(null)
          setSelectedPath(null)
          setOperationError(
            '前回のフォルダを開けませんでした。ツールバーの「Load」で開き直してください。',
          )
        } else {
          setEntriesByDir((prev) => ({ ...prev, [dirPath]: [] }))
        }
        return false
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev)
          next.delete(dirPath)
          return next
        })
      }
    },
    [bridge, fileExplorerDir],
  )

  useEffect(() => {
    if (fileExplorerDir) {
      try {
        window.localStorage.setItem(FILE_EXPLORER_DIR_STORAGE_KEY, fileExplorerDir)
      } catch {
        // ignore
      }
      setExpandedDirs(new Set())
      setEntriesByDir({})

      let cancelled = false
      const init = async () => {
        // Verify main has a trusted workspace root before loading.
        // Main persists the workspace root when the user opens a folder via OS dialog,
        // and restores it on startup. Renderer never supplies the path (SEC-1).
        if (bridge?.getLastWorkspaceRoot) {
          const trustedRoot = await bridge.getLastWorkspaceRoot()
          if (!trustedRoot || cancelled) {
            if (!cancelled) {
              setFileExplorerDirState(null)
              setSelectedPath(null)
              setOperationError(
                '前回のフォルダを開けませんでした。ツールバーの「Load」で開き直してください。',
              )
            }
            return
          }
        }
        if (!cancelled) {
          void loadDirectory(fileExplorerDir)
        }
      }
      void init()

      return () => { cancelled = true }
    } else {
      setEntriesByDir({})
      setExpandedDirs(new Set())
      setSelectedPath(null)
      try {
        window.localStorage.removeItem(FILE_EXPLORER_DIR_STORAGE_KEY)
      } catch {
        // ignore
      }
    }
  }, [bridge, fileExplorerDir, loadDirectory])

  // main 側の workspace root を read-only で取得する（renderer は path を送らない）。
  // フォルダを開き直すと workspace root も変わり得るため、fileExplorerDir 変化時に再取得する。
  useEffect(() => {
    const getRoot = bridge?.getLastWorkspaceRoot
    if (!getRoot) {
      setWorkspaceRoot(null)
      return
    }
    let cancelled = false
    void getRoot()
      .then((root) => {
        if (!cancelled) setWorkspaceRoot(root)
      })
      .catch(() => {
        if (!cancelled) setWorkspaceRoot(null)
      })
    return () => {
      cancelled = true
    }
  }, [bridge, fileExplorerDir])

  const visibleEntries = useMemo(() => {
    if (!fileExplorerDir) return []
    return buildVisibleEntries(
      fileExplorerDir,
      entriesByDir,
      expandedDirs,
      loadingDirs,
      selectedPath,
      projectRootDirs,
      fileRoles,
    )
  }, [
    entriesByDir,
    expandedDirs,
    fileExplorerDir,
    fileRoles,
    loadingDirs,
    projectRootDirs,
    selectedPath,
  ])

  // 表示中フォルダのうち project root（`.nyoze/project.json` 保有）を main 側で判定する。
  // 表示専用・軽量チェックで、現在 visible なフォルダ entry だけを対象にし、frontmatter は読まない。
  // selection 等で再描画されても候補パス集合が変わらなければ再 query しない（key 文字列で比較）。
  const visibleDirPaths = useMemo(
    () => visibleEntries.filter((entry) => entry.isDirectory).map((entry) => entry.path),
    [visibleEntries],
  )
  const visibleDirPathsKey = useMemo(() => visibleDirPaths.join('\n'), [visibleDirPaths])

  useEffect(() => {
    const detect = window.nyozeBridge?.project?.detectProjectRoots
    if (!detect || visibleDirPaths.length === 0) {
      setProjectRootDirs((prev) => (prev.size === 0 ? prev : new Set()))
      return
    }
    let cancelled = false
    void detect(visibleDirPaths)
      .then((roots) => {
        if (cancelled) return
        setProjectRootDirs(new Set(roots.map(normalizeForCompare)))
      })
      .catch(() => {
        if (!cancelled) setProjectRootDirs((prev) => (prev.size === 0 ? prev : new Set()))
      })
    return () => {
      cancelled = true
    }
    // visibleDirPaths の中身（key）が変わったとき、または明示 nonce bump 時に再 query する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDirPathsKey, detectionNonce])

  // 表示中の `.md` / `.markdown` / `.txt` ファイルの books.json v3 registry role を
  // main 側で read-only 検出する。project 内かつ既知の表示対象 role のものだけが返る。
  // selection 等で再描画されても
  // 候補パス集合が変わらなければ再 query しない（key 文字列で比較）。
  const visibleMarkdownFilePaths = useMemo(
    () =>
      visibleEntries
        .filter((entry) => !entry.isDirectory && isBookMarkdownName(entry.name))
        .map((entry) => entry.path),
    [visibleEntries],
  )
  const visibleMarkdownFilePathsKey = useMemo(
    () => visibleMarkdownFilePaths.join('\n'),
    [visibleMarkdownFilePaths],
  )

  useEffect(() => {
    const detect = window.nyozeBridge?.project?.detectFileRoles
    if (!detect || visibleMarkdownFilePaths.length === 0) {
      setFileRoles((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }
    let cancelled = false
    void detect(visibleMarkdownFilePaths)
      .then((entries) => {
        if (cancelled) return
        setFileRoles(new Map(entries.map((e) => [normalizeForCompare(e.path), e.role])))
      })
      .catch(() => {
        if (!cancelled) setFileRoles((prev) => (prev.size === 0 ? prev : new Map()))
      })
    return () => {
      cancelled = true
    }
    // visibleMarkdownFilePaths の中身（key）が変わったとき、または明示 nonce bump 時に再 query する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMarkdownFilePathsKey, detectionNonce])

  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.selected) ?? null,
    [visibleEntries],
  )

  const refreshDirectories = useCallback(
    async (dirPaths: string[]) => {
      const unique = Array.from(new Set(dirPaths.filter((path) => !!path)))
      await Promise.all(unique.map((dirPath) => loadDirectory(dirPath)))
    },
    [loadDirectory],
  )

  /**
   * 単一ファイルの rename / move を main 側の統合 transfer operation で実行する。
   * 物理移動・books.json v3 登録 path・notes.json の note.file を整合更新する。
   * 失敗時は理由別メッセージを表示し、selection / clipboard を成功扱いへ進めない。
   */
  const transferSingleFile = useCallback(
    async (
      kind: 'rename' | 'move',
      sourcePath: string,
      destinationPath: string,
      overwrite: boolean,
      options?: { suppressOperationError?: boolean },
    ): Promise<boolean> => {
      const transfer = window.nyozeBridge?.project?.transferExplorerEntry
      if (!transfer) return false

      const guard = canTransferEntry?.(sourcePath)
      if (guard && !guard.ok) {
        if (!options?.suppressOperationError) {
          setOperationError(
            guard.message ??
              '編集中（未保存）のファイルは移動 / 改名できません。保存してから操作してください。',
          )
        }
        return false
      }

      let result
      try {
        result = await transfer({ kind, sourcePath, destinationPath, overwrite })
      } catch {
        result = null
      }
      if (!result || !result.ok) {
        if (!options?.suppressOperationError) {
          setOperationError(explorerTransferFailureMessage(result?.ok === false ? result.reason : null))
        }
        return false
      }
      return true
    },
    [canTransferEntry],
  )

  const executeTransfer = useCallback(
    async (
      transfer: PendingTransfer,
      options: { overwrite: boolean; suppressOperationError?: boolean },
    ): Promise<boolean> => {
      if (!bridge?.moveFile || !bridge?.copyFile) return false

      const { mode, sourcePath, destinationDir, targetPath } = transfer
      const isNoopMove = mode === 'cut' && isSamePath(sourcePath, targetPath)
      if (isNoopMove) {
        setClipboard(null)
        return true
      }

      // 単一ファイルの move（cut）は統合 transfer 経由（books.json v3 / notes.json 追従つき）。
      // copy / フォルダは従来どおり fs:copyFile / fs:moveFile。cut clipboard は file 限定なので
      // ここで isDirectory を改めて確認しなくてよい。
      if (mode === 'cut') {
        const ok = await transferSingleFile('move', sourcePath, targetPath, options.overwrite, {
          suppressOperationError: options.suppressOperationError,
        })
        if (!ok) return false
      } else {
        const ok = await bridge.copyFile(sourcePath, targetPath, options.overwrite)
        if (!ok) {
          if (!options.suppressOperationError) {
            setOperationError('ファイル操作に失敗しました。パスと権限を確認してください。')
          }
          return false
        }
      }

      const sourceDir = getParentPath(sourcePath)
      const refreshTargets = [destinationDir, sourceDir, fileExplorerDir].filter(
        (value): value is string => Boolean(value),
      )
      await refreshDirectories(refreshTargets)

      setSelectedPath(targetPath)
      setClipboard(null)
      if (mode === 'cut') {
        if (onFileMoved) onFileMoved(sourcePath, targetPath)
        onProjectFileTransferred?.()
      }
      return true
    },
    [bridge, fileExplorerDir, onFileMoved, onProjectFileTransferred, refreshDirectories, transferSingleFile],
  )

  const handleOpenFolder = useCallback(() => {
    if (!bridge) {
      console.warn('[Nyoze] nyozeBridge.fs not available — running outside Electron?')
      return
    }
    bridge
      .openFolder()
      .then((dirPath) => {
        if (dirPath) {
          setSelectedPath(null)
          setFileExplorerDirState(dirPath)
        }
      })
      .catch((err) => {
        console.error('[Nyoze] openFolder failed:', err)
      })
  }, [bridge])

  const suggestAvailableName = useCallback(
    async (destinationDir: string, baseName: string): Promise<string> => {
      if (!bridge?.pathExists) return baseName
      for (let index = 1; index < 1000; index += 1) {
        const candidate = appendIndexToName(baseName, index)
        const candidatePath = joinPath(destinationDir, candidate)
        const exists = await bridge.pathExists(candidatePath)
        if (!exists) return candidate
      }
      return `${Date.now()}-${baseName}`
    },
    [bridge],
  )

  const requestNameInput = useCallback(
    (prompt: FileExplorerNamePromptState): Promise<string | null> =>
      new Promise((resolve) => {
        if (namePromptResolverRef.current) {
          namePromptResolverRef.current(null)
        }
        namePromptResolverRef.current = resolve
        setNamePrompt(prompt)
      }),
    [],
  )

  const resolveNamePrompt = useCallback((value: string | null) => {
    const resolver = namePromptResolverRef.current
    namePromptResolverRef.current = null
    setNamePrompt(null)
    if (resolver) resolver(value)
  }, [])

  const cancelNamePrompt = useCallback(() => {
    resolveNamePrompt(null)
  }, [resolveNamePrompt])

  const submitNamePrompt = useCallback((value: string) => {
    resolveNamePrompt(value)
  }, [resolveNamePrompt])

  useEffect(() => () => {
    const resolver = namePromptResolverRef.current
    namePromptResolverRef.current = null
    if (resolver) resolver(null)
  }, [])

  const handleCreateNote = useCallback(
    async (entry: FileExplorerVisibleEntry | null) => {
      if (!fileExplorerDir || !bridge?.createFile || !bridge.pathExists) return
      const destinationDir = resolveCreateDestinationDir(
        fileExplorerDir,
        entry?.path ?? null,
        Boolean(entry?.isDirectory),
      )
      const suggestedName = await suggestAvailableName(destinationDir, 'untitled.md')
      const input = await requestNameInput({
        title: '新規ドキュメント名',
        initialValue: suggestedName,
        confirmLabel: '作成',
        selectAllOnOpen: true,
      })
      if (input === null) return
      const nextName = normalizeNewNoteName(input)
      if (!isValidRenameName(nextName)) {
        setOperationError('無効なノート名です。空文字・スラッシュ・先頭ピリオドは使えません。')
        return
      }
      const targetPath = joinPath(destinationDir, nextName)
      if (await bridge.pathExists(targetPath)) {
        setOperationError('同名のファイルが既に存在します。別名を指定してください。')
        return
      }
      const ok = await bridge.createFile(destinationDir, nextName, '')
      if (!ok) {
        setOperationError('ノート作成に失敗しました。パスと権限を確認してください。')
        return
      }
      const ancestors = collectAncestors(destinationDir, fileExplorerDir)
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestors) next.add(ancestor)
        return next
      })
      await refreshDirectories([
        fileExplorerDir,
        ...ancestors,
        getParentPath(destinationDir),
      ].filter((value): value is string => Boolean(value)))
      setSelectedPath(targetPath)
      setOperationError(null)
    },
    [bridge, fileExplorerDir, refreshDirectories, requestNameInput, suggestAvailableName],
  )

  const handleCreateFolder = useCallback(
    async (entry: FileExplorerVisibleEntry | null) => {
      if (!fileExplorerDir || !bridge?.createDir || !bridge.pathExists) return
      const destinationDir = resolveCreateDestinationDir(
        fileExplorerDir,
        entry?.path ?? null,
        Boolean(entry?.isDirectory),
      )
      const suggestedName = await suggestAvailableName(destinationDir, 'new-folder')
      const input = await requestNameInput({
        title: '新規フォルダ名',
        initialValue: suggestedName,
        confirmLabel: '作成',
        selectAllOnOpen: true,
      })
      if (input === null) return
      const nextName = input.trim()
      if (!isValidRenameName(nextName)) {
        setOperationError('無効なフォルダ名です。空文字・スラッシュ・先頭ピリオドは使えません。')
        return
      }
      const targetPath = joinPath(destinationDir, nextName)
      if (await bridge.pathExists(targetPath)) {
        setOperationError('同名のフォルダが既に存在します。別名を指定してください。')
        return
      }
      const ok = await bridge.createDir(destinationDir, nextName)
      if (!ok) {
        setOperationError('フォルダ作成に失敗しました。パスと権限を確認してください。')
        return
      }
      const ancestors = collectAncestors(destinationDir, fileExplorerDir)
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestors) next.add(ancestor)
        return next
      })
      await refreshDirectories([
        fileExplorerDir,
        ...ancestors,
        getParentPath(destinationDir),
      ].filter((value): value is string => Boolean(value)))
      setSelectedPath(targetPath)
      setOperationError(null)
    },
    [bridge, fileExplorerDir, refreshDirectories, requestNameInput, suggestAvailableName],
  )

  const handleRenameEntry = useCallback(
    async (entry: FileExplorerVisibleEntry | null) => {
      if (!bridge?.renamePath || !bridge.pathExists) return
      const targetEntry = entry ?? selectedEntry
      if (!targetEntry) return
      const promptConfig = getRenamePromptConfig(
        targetEntry.name,
        targetEntry.isDirectory,
      )

      const input = await requestNameInput({
        title: promptConfig.title,
        initialValue: promptConfig.initialValue,
        confirmLabel: '変更',
        selectAllOnOpen: true,
      })
      if (input === null) return
      const nextName = buildRenameTargetName(
        targetEntry.name,
        targetEntry.isDirectory,
        input,
      )
      if (!isValidRenameName(nextName)) {
        setOperationError('無効な名前です。空文字・スラッシュ・先頭ピリオドは使えません。')
        return
      }
      if (nextName === targetEntry.name) return
      const parentDir = getParentPath(targetEntry.path)
      if (!parentDir) {
        setOperationError('ルートディレクトリは改名できません。')
        return
      }
      const nextPath = joinPath(parentDir, nextName)
      if (!isSamePath(nextPath, targetEntry.path) && await bridge.pathExists(nextPath)) {
        setOperationError('同名の項目が既に存在します。別名を指定してください。')
        return
      }
      // 単一ファイルの改名は統合 transfer 経由（books.json v3 / notes.json 追従つき）。
      // フォルダはこのスライスの対象外。フォルダ配下の books.json v3 path 一括追従が未実装なため、
      // 配下に登録済み path / 非 deleted 付箋があるフォルダの改名は安全側で拒否する。
      if (targetEntry.isDirectory) {
        // 登録・付箋がなくても、配下に dirty / 未確定 draft の open tab があれば保存先 path を
        // 無言で変えないよう、まず単一ファイルと同じ dirty / draft ガードを通す。
        // canTransferEntry はフォルダ path 自身、または配下 path に一致する open tab を検出する。
        const draftGuard = canTransferEntry?.(targetEntry.path)
        if (draftGuard && !draftGuard.ok) {
          setOperationError(
            draftGuard.message ??
              '編集中（未保存）のファイルを含むフォルダは名前を変更できません。先に保存してください。',
          )
          return
        }
        const guard = await window.nyozeBridge?.project
          ?.checkFolderTransferGuard?.(targetEntry.path)
          .catch(() => null)
        if (!guard || !guard.ok || guard.blocked) {
          setOperationError(
            '登録済みの本文 / 資料、または付箋を含むフォルダの名前変更は現在対応していません。先にフォルダ内ファイルの登録を解除してからお試しください。',
          )
          return
        }
        const ok = await bridge.renamePath(targetEntry.path, nextName)
        if (!ok) {
          setOperationError('改名に失敗しました。パスと権限を確認してください。')
          return
        }
        await refreshDirectories([
          fileExplorerDir,
          parentDir,
          nextPath,
        ].filter((value): value is string => Boolean(value)))
        setSelectedPath(nextPath)
        if (onFileMoved) onFileMoved(targetEntry.path, nextPath, { isDirectory: true })
        setOperationError(null)
        return
      }

      const ok = await transferSingleFile('rename', targetEntry.path, nextPath, false)
      if (!ok) return
      await refreshDirectories(
        [fileExplorerDir, parentDir].filter((value): value is string => Boolean(value)),
      )
      setSelectedPath(nextPath)
      if (onFileMoved) onFileMoved(targetEntry.path, nextPath)
      onProjectFileTransferred?.()
      setOperationError(null)
    },
    [
      bridge,
      canTransferEntry,
      fileExplorerDir,
      onFileMoved,
      onProjectFileTransferred,
      refreshDirectories,
      requestNameInput,
      selectedEntry,
      transferSingleFile,
    ],
  )

  const handleRevealInFileManager = useCallback(
    async (entry: FileExplorerVisibleEntry | null) => {
      if (!bridge?.revealInFileManager) return
      const targetEntry = entry ?? selectedEntry
      if (!targetEntry) return
      const ok = await bridge.revealInFileManager(targetEntry.path)
      if (!ok) {
        setOperationError('Finder/Explorerの表示に失敗しました。')
        return
      }
      setOperationError(null)
    },
    [bridge, selectedEntry],
  )

  const handleDeleteEntry = useCallback(
    async (entry: FileExplorerVisibleEntry | null) => {
      if (!bridge?.trashItem) return
      const targetEntry = entry ?? selectedEntry
      if (!targetEntry) return
      const confirmed = window.confirm(
        `「${targetEntry.name}」をゴミ箱に移動しますか？`,
      )
      if (!confirmed) return
      const ok = await bridge.trashItem(targetEntry.path)
      if (!ok) {
        setOperationError('ゴミ箱への移動に失敗しました。パスと権限を確認してください。')
        return
      }
      if (clipboard && isSamePath(clipboard.sourcePath, targetEntry.path)) {
        setClipboard(null)
      }
      if (selectedPath && isSamePath(selectedPath, targetEntry.path)) {
        setSelectedPath(null)
      }
      const parentDir = getParentPath(targetEntry.path)
      await refreshDirectories(
        [fileExplorerDir, parentDir].filter(
          (value): value is string => Boolean(value),
        ),
      )
      // 付箋データは自動削除しない。missing-file 一覧へ出せるよう refresh だけ促す。
      if (onFileDeleted) {
        onFileDeleted(targetEntry.path)
      }
      setOperationError(null)
    },
    [bridge, clipboard, fileExplorerDir, onFileDeleted, refreshDirectories, selectedEntry, selectedPath],
  )

  /**
   * フォルダを Project 化する導線（File Explorer 右クリック）。
   *
   * - 即 `project:create` は呼ばず、共有 Project 作成モーダルを開く。
   * - renderer は対象 folder path だけを modal に渡す。realpath 解決 / workspace 境界検査 /
   *   既存 project の上書き防止は form submit 後の main 側に委ねる（projectRoot は送らない）。
   * - 既存 project root では UX 上 no-op（呼び出し前に弾く。main も already-exists を返す）。
   * - 成功後の refresh は {@link notifyProjectCreatedForFolder} で行う。
   */
  const handleCreateProjectForFolder = useCallback(
    (entry: FileExplorerVisibleEntry | null) => {
      const targetEntry = entry ?? selectedEntry
      if (!targetEntry || !targetEntry.isDirectory) return
      if (targetEntry.isProjectRoot || targetEntry.isInsideExistingProject) return
      setProjectCreateModalTarget({
        folderPath: targetEntry.path,
        folderName: targetEntry.name,
      })
    },
    [selectedEntry],
  )

  const closeProjectCreateModal = useCallback(() => {
    setProjectCreateModalTarget(null)
  }, [])

  const notifyProjectCreatedForFolder = useCallback(
    async (folderPath: string) => {
      setProjectCreateModalTarget(null)
      setSelectedPath(folderPath)
      setOperationError(null)
      setDetectionNonce((nonce) => nonce + 1)
      await refreshDirectories(
        [fileExplorerDir, getParentPath(folderPath)].filter(
          (value): value is string => Boolean(value),
        ),
      )
      refreshExplorerProjectList()
    },
    [fileExplorerDir, refreshDirectories, refreshExplorerProjectList],
  )

  const notifyProjectUnregistered = useCallback(async () => {
    setDetectionNonce((nonce) => nonce + 1)
    if (!fileExplorerDir) return
    await refreshDirectories([fileExplorerDir])
    refreshExplorerProjectList()
  }, [fileExplorerDir, refreshDirectories, refreshExplorerProjectList])

  const onProjectRegisteredRef = useRef(onProjectRegistered)
  onProjectRegisteredRef.current = onProjectRegistered

  /**
   * 右クリックしたファイルの v3 登録可否を解決する（read-only）。
   *
   * - 対象は `.md` / `.markdown` / `.txt` ファイルのみ。folder / 非対象拡張子は即 unavailable。
   * - projectRoot は送らず、対象ファイル自身を anchor に `resolveUnregisteredFilesV3` /
   *   `resolveProjectBooks` を呼ぶ。relative path / books は main 由来の結果から取る。
   * - 結果は pure helper {@link resolveFileExplorerRegistrationInfo} で判定する。
   */
  const requestFileRegistration = useCallback(
    (entry: FileExplorerVisibleEntry) => {
      const generation = ++fileRegistrationGenerationRef.current
      if (entry.isDirectory || !isMarkdownFile(entry.name)) {
        setFileRegistration({ kind: 'unavailable', filePath: entry.path })
        return
      }
      const project = window.nyozeBridge?.project
      if (!project?.resolveUnregisteredFilesV3 || !project?.resolveProjectBooks) {
        setFileRegistration({ kind: 'unavailable', filePath: entry.path })
        return
      }
      const filePath = entry.path
      setFileRegistration({ kind: 'loading', filePath })
      void Promise.all([
        project.resolveUnregisteredFilesV3(filePath).catch(() => null),
        project.resolveProjectBooks(filePath).catch(() => null),
      ]).then(([unregistered, books]) => {
        if (generation !== fileRegistrationGenerationRef.current) return
        if (!unregistered || !books) {
          setFileRegistration({ kind: 'unavailable', filePath })
          return
        }
        const info = resolveFileExplorerRegistrationInfo({ filePath, unregistered, books })
        if (info.kind === 'ready') {
          setFileRegistration({
            kind: 'ready',
            filePath,
            relativePath: info.relativePath,
            books: info.books,
          })
        } else {
          setFileRegistration({ kind: 'unavailable', filePath })
        }
      })
    },
    [],
  )

  const clearFileRegistration = useCallback(() => {
    fileRegistrationGenerationRef.current += 1
    setFileRegistration((prev) => (prev.kind === 'idle' ? prev : { kind: 'idle' }))
  }, [])

  /**
   * 解決済み（ready）の登録対象を v3 books.json へ書き込む。
   *
   * - writer の anchor には対象ファイル自身を渡し、`operation.path` には project root 相対 path
   *   （main 由来）を渡す。絶対 path は渡さない。projectRoot も渡さない。
   * - 成功後は role アイコン / project badge 検出を refresh し、Project タブにも反映を促す。
   * - 失敗は Explorer 既存の operationError notice に generic 文言で出す。
   * - 中央エディタの active file / Markdown 本文・frontmatter には触れない。
   */
  const runFileRegistration = useCallback(
    async (operation: BookManifestV3UpdateOperation, anchorFilePath: string) => {
      const project = window.nyozeBridge?.project
      if (!project?.updateBookManifestV3) {
        setOperationError(getUiText(uiLanguageMode, 'explorer.registerFailed'))
        return
      }
      const result = await project
        .updateBookManifestV3(anchorFilePath, operation)
        .catch(() => null)
      if (!result || !result.ok) {
        setOperationError(getUiText(uiLanguageMode, 'explorer.registerFailed'))
        return
      }
      setOperationError(null)
      clearFileRegistration()
      setDetectionNonce((nonce) => nonce + 1)
      if (fileExplorerDir) {
        await refreshDirectories([fileExplorerDir, ...Array.from(expandedDirs)])
      }
      onProjectRegisteredRef.current?.()
    },
    [clearFileRegistration, expandedDirs, fileExplorerDir, refreshDirectories, uiLanguageMode],
  )

  const registerFileToBook = useCallback(
    (bookId: string) => {
      const current = fileRegistration
      if (current.kind !== 'ready' || !bookId) return
      void runFileRegistration(
        { type: 'add-body-item', bookId, path: current.relativePath },
        current.filePath,
      )
    },
    [fileRegistration, runFileRegistration],
  )

  const registerFileAsMaterial = useCallback(
    (role: ProjectAssetRole) => {
      const current = fileRegistration
      if (current.kind !== 'ready') return
      void runFileRegistration(
        { type: 'add-material', path: current.relativePath, role },
        current.filePath,
      )
    },
    [fileRegistration, runFileRegistration],
  )

  const fileExplorerRegistration = useMemo<FileExplorerRegistrationApi>(
    () => ({
      state: fileRegistration,
      onRequest: requestFileRegistration,
      onClear: clearFileRegistration,
      onRegisterToBook: registerFileToBook,
      onRegisterAsMaterial: registerFileAsMaterial,
    }),
    [
      clearFileRegistration,
      fileRegistration,
      registerFileAsMaterial,
      registerFileToBook,
      requestFileRegistration,
    ],
  )

  const handleToggleDirectory = useCallback(
    (entryPath: string) => {
      setOperationError(null)
      setSelectedPath(entryPath)
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        if (next.has(entryPath)) {
          next.delete(entryPath)
        } else {
          next.add(entryPath)
          void loadDirectory(entryPath)
        }
        return next
      })
    },
    [loadDirectory],
  )

  const handleEntryActivate = useCallback(
    (entry: FileExplorerVisibleEntry) => {
      setSelectedPath(entry.path)
      setOperationError(null)
      if (entry.isDirectory) {
        handleToggleDirectory(entry.path)
        return
      }
      if (!isMarkdownFile(entry.name)) return
      if (!bridge?.openFile) return
      bridge.openFile(entry.path).then((result) => {
        if (!result.ok) {
          setOperationError(result.errorMessage)
          return
        }
        onFileContentLoaded(entry.path, result.content)
      })
    },
    [bridge, handleToggleDirectory, onFileContentLoaded],
  )

  const handleEntrySelect = useCallback((entry: FileExplorerVisibleEntry) => {
    setSelectedPath(entry.path)
    setOperationError(null)
  }, [])

  const handleOpenInNewTab = useCallback(
    (entry: FileExplorerVisibleEntry) => {
      if (entry.isDirectory || !isMarkdownFile(entry.name)) return
      if (!bridge?.openFile || !onOpenFileInNewTab) return
      bridge.openFile(entry.path).then((result) => {
        if (!result.ok) {
          setOperationError(result.errorMessage)
          return
        }
        onOpenFileInNewTab(entry.path, result.content)
      })
    },
    [bridge, onOpenFileInNewTab],
  )

  const handleCutSelectedFile = useCallback(() => {
    if (!selectedEntry || selectedEntry.isDirectory) return
    setClipboard({ mode: 'cut', sourcePath: selectedEntry.path })
    setOperationError(null)
  }, [selectedEntry])

  const handleCopySelectedFile = useCallback(() => {
    if (!selectedEntry || selectedEntry.isDirectory) return
    setClipboard({ mode: 'copy', sourcePath: selectedEntry.path })
    setOperationError(null)
  }, [selectedEntry])

  const handlePasteIntoSelection = useCallback(async () => {
    if (!bridge?.pathExists || !fileExplorerDir || !clipboard) return

    const destinationDir = resolvePasteDestinationDir(
      fileExplorerDir,
      selectedEntry?.path ?? null,
      Boolean(selectedEntry?.isDirectory),
    )
    const fileName = getPathBaseName(clipboard.sourcePath)
    const targetPath = joinPath(destinationDir, fileName)

    const transfer: PendingTransfer = {
      mode: clipboard.mode,
      sourcePath: clipboard.sourcePath,
      destinationDir,
      targetPath,
    }

    if (transfer.mode === 'cut' && isSamePath(transfer.sourcePath, transfer.targetPath)) {
      setClipboard(null)
      return
    }

    const exists = await bridge.pathExists(targetPath)
    if (!exists) {
      await executeTransfer(transfer, { overwrite: false })
      return
    }

    setPendingTransfer(transfer)
    setTransferConflict({
      mode: clipboard.mode,
      sourcePath: clipboard.sourcePath,
      destinationDir,
      targetPath,
      errorMessage: null,
    })
  }, [bridge, clipboard, executeTransfer, fileExplorerDir, selectedEntry])

  const resolveTransferConflictByOverwrite = useCallback(async () => {
    if (!pendingTransfer) return
    const ok = await executeTransfer(pendingTransfer, { overwrite: true })
    if (!ok) return
    setPendingTransfer(null)
    setTransferConflict(null)
  }, [executeTransfer, pendingTransfer])

  const resolveTransferConflictKeepBoth = useCallback(async () => {
    const transfer = pendingTransfer
    if (!transfer || !bridge?.pathExists) return

    setTransferConflict((prev) => (prev ? { ...prev, errorMessage: null } : prev))

    const baseName = getPathBaseName(transfer.targetPath)
    const destDir = transfer.destinationDir

    const tryTransferTo = async (
      targetPath: string,
    ): Promise<'ok' | 'race' | 'fail'> => {
      if (await bridge.pathExists(targetPath)) return 'race'
      const ok = await executeTransfer(
        { ...transfer, targetPath },
        { overwrite: false, suppressOperationError: true },
      )
      if (ok) return 'ok'
      const existsAfter = await bridge.pathExists(targetPath)
      return shouldRetryKeepBothAfterFailedTransfer(existsAfter) ? 'race' : 'fail'
    }

    for (let index = 2; index < 1000; index += 1) {
      const candidateName = appendIndexToName(baseName, index)
      const candidatePath = joinPath(destDir, candidateName)
      const outcome = await tryTransferTo(candidatePath)
      if (outcome === 'ok') {
        setPendingTransfer(null)
        setTransferConflict(null)
        return
      }
      if (outcome === 'race') continue
      setPendingTransfer(null)
      setTransferConflict(null)
      setOperationError(
        getUiText(uiLanguageMode, 'explorer.transferConflict.errorKeepBothUnexpected'),
      )
      return
    }

    const fallbackPath = joinPath(destDir, `${Date.now()}-${baseName}`)
    const fallbackOutcome = await tryTransferTo(fallbackPath)
    if (fallbackOutcome === 'ok') {
      setPendingTransfer(null)
      setTransferConflict(null)
      return
    }
    setPendingTransfer(null)
    setTransferConflict(null)
    setOperationError(
      getUiText(uiLanguageMode, 'explorer.transferConflict.errorKeepBothExhausted'),
    )
  }, [bridge, executeTransfer, pendingTransfer, uiLanguageMode])

  const cancelTransferConflict = useCallback(() => {
    setPendingTransfer(null)
    setTransferConflict(null)
    // Abandon the in-flight paste (incl. cut "move" intent) so the tree does not
    // keep showing the cut source as pending after the user cancels the dialog.
    setClipboard(null)
  }, [])

  const clearOperationError = useCallback(() => {
    setOperationError(null)
  }, [])

  const notifyFileSaved = useCallback(
    async (savedFilePath: string) => {
      if (!fileExplorerDir) return
      const normalizedSaved = normalizeForCompare(savedFilePath)
      const normalizedRoot = normalizeForCompare(fileExplorerDir)
      const sep = fileExplorerDir.includes('\\') ? '\\' : '/'
      const isUnderRoot =
        normalizedSaved === normalizedRoot ||
        normalizedSaved.startsWith(normalizedRoot + sep)
      if (!isUnderRoot) return
      const parentDir = getParentPath(savedFilePath)
      if (!parentDir) return
      const ancestors = collectAncestors(parentDir, fileExplorerDir)
      setExpandedDirs((prev) => {
        const next = new Set(prev)
        for (const ancestor of ancestors) next.add(ancestor)
        return next
      })
      await refreshDirectories(
        [fileExplorerDir, parentDir, ...ancestors].filter(
          (value): value is string => Boolean(value),
        ),
      )
      setSelectedPath(savedFilePath)
    },
    [fileExplorerDir, refreshDirectories],
  )

  const refreshExpandedDirs = useCallback(async () => {
    if (!fileExplorerDir) return
    const dirs = [fileExplorerDir, ...Array.from(expandedDirs)]
    await refreshDirectories(dirs)
    if (selectedPath && bridge?.pathExists) {
      const stillExists = await bridge.pathExists(selectedPath)
      if (!stillExists) setSelectedPath(null)
    }
    if (clipboard && bridge?.pathExists) {
      const clipExists = await bridge.pathExists(clipboard.sourcePath)
      if (!clipExists) setClipboard(null)
    }
  }, [bridge, clipboard, expandedDirs, fileExplorerDir, refreshDirectories, selectedPath])

  useEffect(() => {
    if (!fileExplorerDir) return
    const onFocusRefresh = () => { void refreshExpandedDirs() }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onFocusRefresh()
    }
    window.addEventListener('focus', onFocusRefresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocusRefresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [fileExplorerDir, refreshExpandedDirs])

  // Distinguish "root not yet loaded" (undefined) from "root loaded but empty" ([]).
  const rootDirLoaded = fileExplorerDir != null
    ? fileExplorerDir in entriesByDir
    : false

  const canCutCopy = Boolean(selectedEntry && !selectedEntry.isDirectory)
  const canPaste = Boolean(clipboard && fileExplorerDir)

  const clipboardSourcePath = clipboard?.sourcePath ?? null

  const setFileExplorerDir = useCallback((nextDir: string | null) => {
    setSelectedPath(null)
    if (nextDir && fileExplorerDir && isSamePath(nextDir, fileExplorerDir)) {
      void loadDirectory(nextDir)
      return
    }
    setFileExplorerDirState(nextDir)
  }, [fileExplorerDir, loadDirectory])

  /**
   * 書庫管理などで active 書庫 root が切り替わったときの glue。
   * renderer は main が確定した activeRoot だけを受け取り、File Explorer の表示整合を取る。
   */
  const handleLibraryRootActivated = useCallback(
    (activeRoot: string) => {
      setWorkspaceRoot(activeRoot)
      setProjectsPaneView((view) => {
        if (leftPaneTab === 'projects' && view === 'project-root') return 'list'
        return view
      })
      setFileExplorerDir(activeRoot)
    },
    [leftPaneTab, setFileExplorerDir],
  )

  // 「書庫」タブ: 常に workspace root（書庫）の通常 Explorer 表示へ戻す。Project root は保持しない。
  const handleSelectLibraryTab = useCallback(() => {
    setLeftPaneTab('library')
    if (workspaceRoot) setFileExplorerDir(workspaceRoot)
  }, [workspaceRoot, setFileExplorerDir])

  // 「作品一覧」タブ / 「作品一覧に戻る」: Project 一覧（list view）を表示する。
  // 表示フォルダは変えない（project-root view から戻っても workspace root へは戻さない）。
  const handleShowProjectList = useCallback(() => {
    setLeftPaneTab('projects')
    setProjectsPaneView('list')
  }, [])

  // 作品一覧の行クリック: `作品一覧` タブ内の drill-down（project-root view）で Project root の
  // file tree を見せる。表示フォルダを project root へ切り替えるだけ（中央 tab / dirty /
  // 右ペイン Project タブ context には触れない）。
  const handleOpenProjectRootFromList = useCallback(
    (projectRoot: string) => {
      setLeftPaneTab('projects')
      setProjectsPaneView('project-root')
      setFileExplorerDir(projectRoot)
    },
    [setFileExplorerDir],
  )

  return {
    fileExplorerDir,
    setFileExplorerDir,
    handleLibraryRootActivated,
    leftPaneTab,
    projectsPaneView,
    handleSelectLibraryTab,
    handleShowProjectList,
    explorerProjectListState,
    handleOpenProjectRootFromList,
    rootDirLoaded,
    visibleEntries,
    selectedPath,
    fileExplorerSelectedEntry: selectedEntry,
    clipboardMode: clipboard?.mode ?? null,
    clipboardSourcePath,
    operationError,
    transferConflict,
    namePrompt,
    canCutCopy,
    canPaste,
    handleOpenFolder,
    handleCreateNote,
    handleCreateFolder,
    handleCreateProjectForFolder,
    closeProjectCreateModal,
    projectCreateModalTarget,
    notifyProjectCreatedForFolder,
    notifyProjectUnregistered,
    fileExplorerRegistration,
    handleRenameEntry,
    handleDeleteEntry,
    handleRevealInFileManager,
    handleEntryActivate,
    handleEntrySelect,
    handleOpenInNewTab,
    handleToggleDirectory,
    handleCutSelectedFile,
    handleCopySelectedFile,
    handlePasteIntoSelection,
    resolveTransferConflictByOverwrite,
    resolveTransferConflictKeepBoth,
    cancelTransferConflict,
    cancelNamePrompt,
    submitNamePrompt,
    clearOperationError,
    notifyFileSaved,
  }
}

export type { DirEntry }
