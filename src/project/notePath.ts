import { isProjectRelativeFilePath } from './noteStore'

/**
 * note entry の `file` (project root 相対パス) 変換 helper (Task 3A-3)。
 *
 * renderer から使うため node:path には依存しない。
 * projectRoot は main 側 `project:resolveForFile` が返した realpath、
 * filePath は同じく main 由来の active file path を渡す前提で、
 * どちらも絶対パスであること。
 *
 * projectRoot 外・不正な相対形 (空 / `..` / `.` segment 等) は null。
 */
export function toProjectRelativeFilePath(
  projectRoot: string,
  filePath: string,
): string | null {
  const rootCandidates = pathPrefixAliases(projectRoot)
  const fileCandidates = pathPrefixAliases(filePath)

  for (const rootRaw of rootCandidates) {
    const root = rootRaw.replace(/\/+$/, '')
    if (root.length === 0) continue
    for (const file of fileCandidates) {
      if (!file.startsWith(root + '/')) continue
      const relative = file.slice(root.length + 1)
      if (isProjectRelativeFilePath(relative)) return relative
    }
  }

  return null
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, '/')
}

/**
 * note.file (project root 相対パス) の比較用 key。
 *
 * separator を `/` に揃えたうえで Unicode NFC 正規化する。case folding はしない。
 * Mac / Windows 間で `note.file` と active file の相対 path が NFC / NFD 差分を持つ場合でも
 * compare / resolve 時にこの key で一致させる。stored 文字列はこの key で
 * 書き換えないこと（compare 専用）。
 */
export function noteFilePathComparisonKey(relativeFile: string): string {
  return normalizeSeparators(relativeFile).normalize('NFC')
}

/** macOS 等で realpath と UI パスの `/var` / `/private/var` 差を吸収する。 */
function pathPrefixAliases(value: string): string[] {
  const normalized = normalizeSeparators(value)
  const aliases = new Set<string>([normalized])
  if (normalized.startsWith('/private/var/')) {
    aliases.add(normalized.slice('/private'.length))
  } else if (normalized.startsWith('/var/')) {
    aliases.add('/private' + normalized)
  }
  return [...aliases]
}

/**
 * project root と project 相対 path を安全に結合する。
 * 不正な相対 path や root 外へ脱出する結合は null。
 */
export function joinProjectRelativeFilePath(
  projectRoot: string,
  relativeFile: string,
): string | null {
  if (!isProjectRelativeFilePath(relativeFile)) return null
  const normalizedRelative = normalizeSeparators(relativeFile)
  const rootCandidates = pathPrefixAliases(projectRoot)
  for (const rootRaw of rootCandidates) {
    const root = rootRaw.replace(/\/+$/, '')
    if (root.length === 0) continue
    const absolute = `${root}/${normalizedRelative}`
    if (absolute.startsWith(`${root}/`)) return absolute
  }
  return null
}
