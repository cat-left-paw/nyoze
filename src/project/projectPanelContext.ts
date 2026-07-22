/**
 * Project タブの表示文脈（context）型と pure resolver。
 *
 * filesystem / project 所属判定は行わない。main 側 IPC / query へ委ねる。
 * renderer から projectRoot を resolve/write IPC へ送る境界は別レイヤで維持する。
 */

import type { ProjectPanelContextIpcRequest, ProjectPanelWriteAnchor } from './projectIpcTypes'

/** File Explorer 選択行の最小形状（hook 型への依存を避ける）。 */
export type FileExplorerSelectionEntry = {
  path: string
  isDirectory: boolean
  isProjectRoot: boolean
}

export type ProjectPanelContextSource =
  | 'active-file'
  | 'file-explorer-selection'
  | 'project-switcher'

export type ProjectPanelContext =
  | {
      kind: 'file'
      source: ProjectPanelContextSource
      filePath: string
    }
  | {
      kind: 'directory'
      source: ProjectPanelContextSource
      dirPath: string
    }
  | {
      kind: 'project-root'
      source: ProjectPanelContextSource
      projectRoot: string
    }
  | {
      kind: 'none'
    }

export const PROJECT_PANEL_CONTEXT_NONE: ProjectPanelContext = { kind: 'none' }

function isUsableContext(context: ProjectPanelContext): context is Exclude<
  ProjectPanelContext,
  { kind: 'none' }
> {
  return context.kind !== 'none'
}

export function makeActiveFileProjectPanelContext(
  activeFilePath: string | null,
  isInternalDoc: boolean,
): ProjectPanelContext {
  if (isInternalDoc || !activeFilePath) {
    return PROJECT_PANEL_CONTEXT_NONE
  }
  return {
    kind: 'file',
    source: 'active-file',
    filePath: activeFilePath,
  }
}

export function makeFileExplorerSelectionProjectPanelContext(
  entry: FileExplorerSelectionEntry | null,
): ProjectPanelContext {
  if (!entry) {
    return PROJECT_PANEL_CONTEXT_NONE
  }

  const source: ProjectPanelContextSource = 'file-explorer-selection'

  if (entry.isProjectRoot) {
    return {
      kind: 'project-root',
      source,
      projectRoot: entry.path,
    }
  }

  if (entry.isDirectory) {
    return {
      kind: 'directory',
      source,
      dirPath: entry.path,
    }
  }

  return {
    kind: 'file',
    source,
    filePath: entry.path,
  }
}

export function makeProjectSwitcherPanelContext(projectRoot: string): ProjectPanelContext {
  return {
    kind: 'project-root',
    source: 'project-switcher',
    projectRoot,
  }
}

export function selectProjectPanelContext(options: {
  explorerSelection: ProjectPanelContext
  switcherSelection: ProjectPanelContext
  activeFile: ProjectPanelContext
}): ProjectPanelContext {
  if (isUsableContext(options.explorerSelection)) {
    return options.explorerSelection
  }
  if (isUsableContext(options.switcherSelection)) {
    return options.switcherSelection
  }
  if (isUsableContext(options.activeFile)) {
    return options.activeFile
  }
  return PROJECT_PANEL_CONTEXT_NONE
}

/** active-file context のみ metadata / asset write UI を許可する。 */
export function isProjectPanelContextWriteCapable(context: ProjectPanelContext): boolean {
  return context.kind === 'file' && context.source === 'active-file'
}

/**
 * context から v3 manifest write 用 anchor を作る。
 * renderer は解決済み projectRoot として扱わず、main 側検証用の selected path を渡す。
 */
export function projectPanelContextToWriteAnchor(
  context: ProjectPanelContext,
  activeFilePath: string | null,
): ProjectPanelWriteAnchor | null {
  if (context.kind === 'none') {
    return null
  }
  if (context.kind === 'file' && context.source === 'active-file') {
    return activeFilePath
  }
  return projectPanelContextToIpcRequest(context)
}

/** v3 write anchor の安定キー（draft 凍結 / reset 用）。 */
export function projectPanelWriteAnchorRefreshKey(anchor: ProjectPanelWriteAnchor | null): string {
  if (anchor === null) return 'none'
  if (typeof anchor === 'string') return `file:active-file:${anchor}`
  return `${anchor.kind}:${anchor.source}:${anchor.selectedPath}`
}

/** hook refresh / stale guard 用の安定キー。 */
export function projectPanelContextRefreshKey(context: ProjectPanelContext): string {
  switch (context.kind) {
    case 'none':
      return 'none'
    case 'file':
      return `file:${context.source}:${context.filePath}`
    case 'directory':
      return `directory:${context.source}:${context.dirPath}`
    case 'project-root':
      return `project-root:${context.source}:${context.projectRoot}`
  }
}

/**
 * context を `project:resolvePanelContext` request へ変換する。
 * active-file / none は null（legacy resolveProjectBooks 経路を使う）。
 */
export function projectPanelContextToIpcRequest(
  context: ProjectPanelContext,
): ProjectPanelContextIpcRequest | null {
  if (context.kind === 'none') {
    return null
  }
  if (context.kind === 'file') {
    if (context.source === 'active-file') {
      return null
    }
    return {
      kind: 'file',
      source: context.source,
      selectedPath: context.filePath,
    }
  }
  if (context.kind === 'directory') {
    if (context.source === 'active-file') {
      return null
    }
    return {
      kind: 'directory',
      source: context.source,
      selectedPath: context.dirPath,
    }
  }
  if (context.source === 'active-file') {
    return null
  }
  return {
    kind: 'project-root',
    source: context.source,
    selectedPath: context.projectRoot,
  }
}
