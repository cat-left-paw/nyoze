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
