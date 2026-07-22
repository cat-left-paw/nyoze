import path from 'node:path'
import { NYOZE_DIR_NAME, PROJECT_METADATA_FILENAME, parseProjectMetadata } from './projectMetadata'
import type { ProjectMetadata } from './projectMetadata'

/**
 * project root resolver (Task 3A-2 前段)。
 *
 * 現在ファイルの親フォルダから祖先へ辿り、最も近い `.nyoze/project.json` を
 * 持つフォルダを project root として返す。
 *
 * - workspace root が指定され、かつファイルがその配下にある場合は、
 *   探索範囲を workspace root まで (workspace root 自身を含む) に制限する。
 * - workspace root 外 / 単独ファイルの場合はファイルシステムの根まで辿る。
 * - workspace root 直下を project root と決め打ちしない。
 *   workspace root 自身が `.nyoze/project.json` を持つ場合のみ project root になる。
 * - invalid JSON / invalid shape の project.json を見つけた場合は null を返す。
 *   壊れた内側 project を飛ばして外側 project へ紐づけると、作品をまたいで
 *   notes.json 等が混ざるため。
 *
 * fs は deps 注入の pure helper。renderer からは直接 import せず、
 * main process (electron/projectStore.ts) と unit test から使う。
 */

export type ProjectRootResolverDeps = {
  /** ファイルを UTF-8 で読む。存在しない / 読めない場合は null を返す。 */
  readTextFile: (filePath: string) => string | null
}

export type ResolvedProjectRoot = {
  /** project root フォルダの絶対パス */
  projectRoot: string
  /** `.nyoze/project.json` の絶対パス */
  metadataPath: string
  metadata: ProjectMetadata
}

export type ResolveProjectRootOptions = {
  /** 現在の文書ファイルの絶対パス。探索はこの親フォルダから始まる。 */
  filePath: string
  /** Nyoze で開いている workspace root (任意)。 */
  workspaceRoot?: string | null
  deps: ProjectRootResolverDeps
}

export function resolveProjectRootForPath(options: ResolveProjectRootOptions): ResolvedProjectRoot | null {
  const { workspaceRoot, deps } = options
  if (!path.isAbsolute(options.filePath)) return null

  const startDir = path.dirname(path.resolve(options.filePath))

  // workspace root 配下のファイルのみ探索を workspace root で bound する。
  // workspace root 外のファイル (単独ファイル編集等) は祖先全体を探索する。
  let boundDir: string | null = null
  if (typeof workspaceRoot === 'string' && workspaceRoot.length > 0 && path.isAbsolute(workspaceRoot)) {
    const resolvedRoot = path.resolve(workspaceRoot)
    if (isWithinOrEqual(startDir, resolvedRoot)) {
      boundDir = resolvedRoot
    }
  }

  let dir = startDir
  for (;;) {
    const metadataPath = path.join(dir, NYOZE_DIR_NAME, PROJECT_METADATA_FILENAME)
    const text = deps.readTextFile(metadataPath)
    if (text !== null) {
      const metadata = parseProjectMetadata(text)
      if (metadata !== null) {
        return { projectRoot: dir, metadataPath, metadata }
      }
      return null
    }

    if (boundDir !== null && dir === boundDir) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function isWithinOrEqual(target: string, base: string): boolean {
  const rel = path.relative(base, target)
  if (rel === '') return true
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}
