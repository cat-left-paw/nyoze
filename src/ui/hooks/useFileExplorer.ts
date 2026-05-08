import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { FILE_EXPLORER_DIR_STORAGE_KEY } from '../../settings/defaults'
import { getUiText } from '../i18n/uiText'
import { getParentPath, getPathBaseName, joinPath } from '../utils/path'

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

type UseFileExplorerOptions = {
  uiLanguageMode: UiLanguageMode
  onFileContentLoaded: (filePath: string, content: string) => void
  onOpenFileInNewTab?: (filePath: string, content: string) => void
  onFileMoved?: (fromPath: string, toPath: string) => void
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

function isMarkdownFile(name: string): boolean {
  const ext = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : ''
  return MD_EXTENSIONS.has(ext)
}

function isExplorerVisibleFile(name: string): boolean {
  const ext = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : ''
  return EXPLORER_VISIBLE_EXTENSIONS.has(ext)
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

export function useFileExplorer({
  uiLanguageMode,
  onFileContentLoaded,
  onOpenFileInNewTab,
  onFileMoved,
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
  const [clipboard, setClipboard] = useState<ExplorerClipboard | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const [transferConflict, setTransferConflict] =
    useState<FileTransferConflictState | null>(null)
  const [namePrompt, setNamePrompt] = useState<FileExplorerNamePromptState | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
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

  const visibleEntries = useMemo(() => {
    if (!fileExplorerDir) return []
    return buildVisibleEntries(
      fileExplorerDir,
      entriesByDir,
      expandedDirs,
      loadingDirs,
      selectedPath,
    )
  }, [entriesByDir, expandedDirs, fileExplorerDir, loadingDirs, selectedPath])

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

      const ok =
        mode === 'cut'
          ? await bridge.moveFile(sourcePath, targetPath, options.overwrite)
          : await bridge.copyFile(sourcePath, targetPath, options.overwrite)

      if (!ok) {
        if (!options.suppressOperationError) {
          setOperationError('ファイル操作に失敗しました。パスと権限を確認してください。')
        }
        return false
      }

      const sourceDir = getParentPath(sourcePath)
      const refreshTargets = [destinationDir, sourceDir, fileExplorerDir].filter(
        (value): value is string => Boolean(value),
      )
      await refreshDirectories(refreshTargets)

      setSelectedPath(targetPath)
      setClipboard(null)
      if (mode === 'cut' && onFileMoved) {
        onFileMoved(sourcePath, targetPath)
      }
      return true
    },
    [bridge, fileExplorerDir, onFileMoved, refreshDirectories],
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
      const ok = await bridge.renamePath(targetEntry.path, nextName)
      if (!ok) {
        setOperationError('改名に失敗しました。パスと権限を確認してください。')
        return
      }
      await refreshDirectories([
        fileExplorerDir,
        parentDir,
        targetEntry.isDirectory ? nextPath : null,
      ].filter((value): value is string => Boolean(value)))
      setSelectedPath(nextPath)
      if (onFileMoved) {
        onFileMoved(targetEntry.path, nextPath)
      }
      setOperationError(null)
    },
    [bridge, fileExplorerDir, onFileMoved, refreshDirectories, requestNameInput, selectedEntry],
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
      setOperationError(null)
    },
    [bridge, clipboard, fileExplorerDir, refreshDirectories, selectedEntry, selectedPath],
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

  return {
    fileExplorerDir,
    setFileExplorerDir,
    rootDirLoaded,
    visibleEntries,
    selectedPath,
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
