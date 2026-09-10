export function detectPathSeparator(path: string): '/' | '\\' {
  const lastSlash = path.lastIndexOf('/')
  const lastBackslash = path.lastIndexOf('\\')
  return lastBackslash > lastSlash ? '\\' : '/'
}

export function joinPath(base: string, child: string): string {
  const separator = detectPathSeparator(base)
  if (base.endsWith('/') || base.endsWith('\\')) {
    return base + child
  }
  return base + separator + child
}

export function getPathBaseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  if (!trimmed) return path
  const segments = trimmed.split(/[\\/]/)
  return segments[segments.length - 1] ?? path
}

/**
 * Windows 由来のパスらしさを判定する。case-insensitive 比較へ寄せるかの判定に使う。
 *
 * - backslash を含む（`C:\...` / `\\server\...`）
 * - ドライブレター形式（`C:/...` / `C:`）
 * - UNC 形式（`//server/share`、forward slash 表記）
 *
 * forward slash で書かれた Windows パス（`C:/WS/a.md` や `//SERVER/...`）も拾うことで、
 * backslash の有無に依存せず case 差を吸収する。
 */
function looksLikeWindowsPath(value: string): boolean {
  return value.includes('\\') || /^[A-Za-z]:/.test(value) || value.startsWith('//')
}

/**
 * path 比較の正本となる正規化。`/` へ寄せ、末尾区切りを落とす。
 *
 * `caseInsensitive` は「どちらかが Windows パスらしい」ときだけ true にする。
 * macOS / Linux の path を無条件に case-insensitive 化しない（`/book/A.md` と
 * `/book/a.md` は別物として扱う）。
 */
function toComparablePathKey(value: string, caseInsensitive: boolean): string {
  const unified = value.replace(/\\/g, '/').replace(/\/+$/g, '')
  return caseInsensitive ? unified.toLowerCase() : unified
}

/** 2 つの path を同じ規則で正規化した key に揃える。片方でも空なら null。 */
function toComparablePathKeyPair(
  a: string,
  b: string,
): { readonly left: string; readonly right: string } | null {
  const caseInsensitive = looksLikeWindowsPath(a) || looksLikeWindowsPath(b)
  const left = toComparablePathKey(a, caseInsensitive)
  const right = toComparablePathKey(b, caseInsensitive)
  if (!left || !right) return null
  return { left, right }
}

/**
 * `filePath` が `root` 配下（root 自身は含まない）かを判定する表示専用 pure helper。
 *
 * - 区切りは `/` / `\` 両方を許容し、比較前に `/` へ正規化する。
 * - いずれかが Windows パス（backslash / ドライブレター / UNC）なら case-insensitive 比較に寄せる。
 * - 末尾区切りは無視する。root か filePath が空なら false。
 * - `/book/a` と `/book/ab` は混同しない（区切りを含む prefix でだけ一致させる）。
 * - filesystem には触れない（realpath / symlink 解決はしない）。表示用途のみ。
 */
export function isPathWithinRoot(filePath: string, root: string): boolean {
  if (!filePath || !root) return false
  const keys = toComparablePathKeyPair(filePath, root)
  if (!keys) return false
  if (keys.left === keys.right) return false
  return keys.left.startsWith(`${keys.right}/`)
}

/**
 * 2 つのパスが同じファイルを指すかを判定する表示専用 pure helper。
 *
 * - 区切りは `/` / `\` 両方を許容し、比較前に `/` へ正規化する。
 * - いずれかが Windows パス（backslash / ドライブレター / UNC）なら case-insensitive 比較に寄せる。
 * - 末尾区切りは無視する。どちらかが空 / null なら false。
 * - filesystem には触れない（realpath / symlink 解決はしない）。表示・分岐用途のみ。
 */
export function isSamePath(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false
  const keys = toComparablePathKeyPair(a, b)
  if (!keys) return false
  return keys.left === keys.right
}

/**
 * `filePath` が `target` 自身、または `target` 配下かを判定する pure helper。
 *
 * File Explorer からの削除のように「ファイル 1 件」と「フォルダ配下すべて」を
 * 同じ規則で扱いたい箇所の正本。判定規則は {@link isSamePath} /
 * {@link isPathWithinRoot} と同一で、basename 比較や無境界 `startsWith()` は使わない。
 */
export function isSameOrDescendantPath(
  filePath: string | null | undefined,
  target: string | null | undefined,
): boolean {
  if (!filePath || !target) return false
  return isSamePath(filePath, target) || isPathWithinRoot(filePath, target)
}

export function getParentPath(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, '')
  if (!trimmed) return null

  const match = trimmed.match(/^(.*)[\\/][^\\/]+$/)
  if (!match) return null
  const parent = match[1]
  if (!parent) return trimmed.startsWith('/') ? '/' : null

  if (/^[A-Za-z]:$/.test(parent)) return parent + '\\'
  return parent
}
