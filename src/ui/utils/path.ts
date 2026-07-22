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
 * `filePath` が `root` 配下（root 自身は含まない）かを判定する表示専用 pure helper。
 *
 * - 区切りは `/` / `\` 両方を許容し、比較前に `/` へ正規化する。
 * - いずれかが backslash を含む（Windows パス）場合は case-insensitive 比較に寄せる。
 * - 末尾区切りは無視する。root か filePath が空なら false。
 * - filesystem には触れない（realpath / symlink 解決はしない）。表示用途のみ。
 */
export function isPathWithinRoot(filePath: string, root: string): boolean {
  if (!filePath || !root) return false
  const caseInsensitive = filePath.includes('\\') || root.includes('\\')
  const toKey = (value: string): string => {
    const unified = value.replace(/\\/g, '/').replace(/\/+$/g, '')
    return caseInsensitive ? unified.toLowerCase() : unified
  }
  const fileKey = toKey(filePath)
  const rootKey = toKey(root)
  if (!rootKey || !fileKey) return false
  if (fileKey === rootKey) return false
  return fileKey.startsWith(`${rootKey}/`)
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
  const caseInsensitive = looksLikeWindowsPath(a) || looksLikeWindowsPath(b)
  const toKey = (value: string): string => {
    const unified = value.replace(/\\/g, '/').replace(/\/+$/g, '')
    return caseInsensitive ? unified.toLowerCase() : unified
  }
  const keyA = toKey(a)
  const keyB = toKey(b)
  if (!keyA || !keyB) return false
  return keyA === keyB
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
