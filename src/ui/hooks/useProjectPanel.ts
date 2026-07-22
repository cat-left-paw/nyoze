import { useCallback, useEffect, useRef, useState } from 'react'
import { splitLeadingFrontmatter } from '../../editor-core/io/frontmatter'
import { renderNoteMarkdownPreview } from '../utils/noteMarkdownPreview'
import { getParentPath, getPathBaseName } from '../utils/path'
import type {
  ProjectBookGroup,
  ProjectAssetGroup,
  ProjectAssetItem,
} from '../../project/projectBooksQuery'
import type {
  ProjectManifestWarning,
  ProjectPanelContextIpcRequest,
} from '../../project/projectIpcTypes'
import {
  isProjectPanelContextWriteCapable,
  projectPanelContextRefreshKey,
  projectPanelContextToIpcRequest,
  type ProjectPanelContext,
} from '../../project/projectPanelContext'

/**
 * Slice B3: Project タブ（右ペイン）の一覧 / preview state hook。
 *
 * 境界:
 * - active-file context は file path だけを bridge に渡し project root 解決は main 側。
 * - explorer / switcher context は bounded selectedPath + kind + source を
 *   `resolvePanelContext` へ渡す（read-only）。
 * - renderer から projectRoot を write IPC へ送らない。
 */

export type ProjectPanelState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | {
      kind: 'not-in-project'
      createTargetFolder: string | null
      createTargetName: string | null
    }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready'
      /** 現在の project root（作品切り替え UI の current 判定に使う表示専用値）。 */
      projectRoot: string
      projectTitle: string
      books: ProjectBookGroup[]
      assets: ProjectAssetGroup[]
      currentRelativePath: string | null
      /** read IPC は v3 ready または利用不可状態を返す。 */
      manifestSource?: 'v3' | 'none'
      /** books.json が invalid / read-error のときのみ（absent では undefined）。 */
      manifestWarning?: ProjectManifestWarning
      materialsFlat?: ProjectAssetItem[]
      /** context 表示時の依存 read IPC 用 anchor（active-file 時は省略可）。 */
      queryAnchorFilePath?: string | null
    }

export type ProjectAssetPreviewState =
  | { kind: 'idle' }
  | { kind: 'loading'; absolutePath: string }
  | { kind: 'ready'; absolutePath: string; html: string }
  | { kind: 'error'; absolutePath: string }

export const PROJECT_PANEL_READ_ERROR_MESSAGE =
  '作品情報を読み込めませんでした。'

/** preview のレンダリング上限。巨大ファイルでも右ペインを重くしない。 */
const PROJECT_PREVIEW_MAX_CHARS = 20000

type ProjectPanelBridge = NonNullable<typeof window.nyozeBridge>['project']
type FsBridge = NonNullable<typeof window.nyozeBridge>['fs']

function getProjectBridge(): ProjectPanelBridge | null {
  return window.nyozeBridge?.project ?? null
}

function getFsBridge(): FsBridge | null {
  return window.nyozeBridge?.fs ?? null
}

function activeFileNotInProjectState(activeFilePath: string): ProjectPanelState {
  const parentFolder = getParentPath(activeFilePath)
  return {
    kind: 'not-in-project',
    createTargetFolder: parentFolder,
    createTargetName: parentFolder ? getPathBaseName(parentFolder) : null,
  }
}

export async function loadProjectPanelForFile(
  bridge: ProjectPanelBridge,
  activeFilePath: string,
): Promise<ProjectPanelState> {
  const result = await bridge.resolveProjectBooks(activeFilePath)
  if (!result.ok) {
    if (result.reason === 'invalid-path') return { kind: 'unavailable' }
    return { kind: 'error', message: PROJECT_PANEL_READ_ERROR_MESSAGE }
  }
  if (result.kind === 'not-in-project') {
    return activeFileNotInProjectState(activeFilePath)
  }

  return {
    kind: 'ready',
    projectRoot: result.project.projectRoot,
    projectTitle: result.project.metadata.title,
    books: result.books,
    assets: result.assets,
    currentRelativePath: result.currentRelativePath,
    manifestSource: result.manifestSource,
    manifestWarning: result.manifestWarning,
    materialsFlat: result.materialsFlat,
  }
}

export async function loadProjectPanelForContext(
  bridge: ProjectPanelBridge,
  request: ProjectPanelContextIpcRequest,
): Promise<ProjectPanelState> {
  const result = await bridge.resolvePanelContext(request)
  if (!result.ok) {
    if (result.reason === 'invalid-path' || result.reason === 'invalid-request') {
      return { kind: 'unavailable' }
    }
    return { kind: 'error', message: PROJECT_PANEL_READ_ERROR_MESSAGE }
  }
  if (result.kind === 'unavailable') {
    return { kind: 'unavailable' }
  }
  if (result.kind === 'not-in-project') {
    return {
      kind: 'not-in-project',
      createTargetFolder: result.createTargetFolder,
      createTargetName: result.createTargetName,
    }
  }

  return {
    kind: 'ready',
    projectRoot: result.project.projectRoot,
    projectTitle: result.project.metadata.title,
    books: result.books,
    assets: result.assets,
    currentRelativePath: result.currentRelativePath,
    manifestSource: result.manifestSource,
    manifestWarning: result.manifestWarning,
    materialsFlat: result.materialsFlat,
    queryAnchorFilePath: result.queryAnchorFilePath,
  }
}

/** ファイル本文を読み、frontmatter を除いた本文を safe HTML 化する。 */
export async function loadProjectAssetPreview(
  fs: FsBridge,
  absolutePath: string,
): Promise<{ ok: true; html: string } | { ok: false }> {
  const read = await fs.readFile(absolutePath).catch(() => null)
  if (!read || !read.ok) return { ok: false }
  const body = splitLeadingFrontmatter(read.content).body
  const html = renderNoteMarkdownPreview(body.slice(0, PROJECT_PREVIEW_MAX_CHARS))
  return { ok: true, html }
}

type UseProjectPanelOptions = {
  getProjectPanelContext: () => ProjectPanelContext
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
}

export function useProjectPanel({
  getProjectPanelContext,
  getActiveFilePath,
  isInternalDoc,
}: UseProjectPanelOptions) {
  const getProjectPanelContextRef = useRef(getProjectPanelContext)
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const refreshGenerationRef = useRef(0)
  const previewGenerationRef = useRef(0)
  getProjectPanelContextRef.current = getProjectPanelContext
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const [state, setState] = useState<ProjectPanelState>({ kind: 'loading' })
  const [preview, setPreview] = useState<ProjectAssetPreviewState>({ kind: 'idle' })

  const refreshProjectPanel = useCallback(async () => {
    const generation = ++refreshGenerationRef.current
    previewGenerationRef.current += 1
    setPreview({ kind: 'idle' })

    if (isInternalDocRef.current()) {
      setState({ kind: 'unavailable' })
      return
    }

    const context = getProjectPanelContextRef.current()
    const contextKey = projectPanelContextRefreshKey(context)
    const activeFilePath = getActiveFilePathRef.current()

    if (context.kind === 'none') {
      setState({ kind: 'unavailable' })
      return
    }

    const bridge = getProjectBridge()
    if (!bridge) {
      setState({ kind: 'unavailable' })
      return
    }

    setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }))

    let next: ProjectPanelState
    if (isProjectPanelContextWriteCapable(context)) {
      if (!activeFilePath) {
        setState({ kind: 'unavailable' })
        return
      }
      next = await loadProjectPanelForFile(bridge, activeFilePath)
    } else {
      const request = projectPanelContextToIpcRequest(context)
      if (!request) {
        setState({ kind: 'unavailable' })
        return
      }
      next = await loadProjectPanelForContext(bridge, request)
    }

    if (
      generation !== refreshGenerationRef.current ||
      projectPanelContextRefreshKey(getProjectPanelContextRef.current()) !== contextKey ||
      getActiveFilePathRef.current() !== activeFilePath ||
      isInternalDocRef.current()
    ) {
      return
    }
    setState(next)
  }, [])

  const selectAssetPreview = useCallback(async (absolutePath: string) => {
    const generation = ++previewGenerationRef.current
    const fs = getFsBridge()
    if (!fs) {
      setPreview({ kind: 'error', absolutePath })
      return
    }
    setPreview({ kind: 'loading', absolutePath })
    const result = await loadProjectAssetPreview(fs, absolutePath)
    if (generation !== previewGenerationRef.current) return
    if (!result.ok) {
      setPreview({ kind: 'error', absolutePath })
      return
    }
    setPreview({ kind: 'ready', absolutePath, html: result.html })
  }, [])

  const clearAssetPreview = useCallback(() => {
    previewGenerationRef.current += 1
    setPreview({ kind: 'idle' })
  }, [])

  const context = getProjectPanelContext()
  const contextKey = projectPanelContextRefreshKey(context)
  const activeFilePath = getActiveFilePath()

  useEffect(() => {
    void refreshProjectPanel()
  }, [contextKey, activeFilePath, refreshProjectPanel])

  return {
    projectPanelState: state,
    projectAssetPreview: preview,
    refreshProjectPanel,
    selectAssetPreview,
    clearAssetPreview,
  }
}
