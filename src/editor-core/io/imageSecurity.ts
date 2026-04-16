/**
 * SEC-5: Image reference safety for beta.
 *
 * Pure validation functions (no side effects, no Node.js dependencies).
 * Runs in the renderer process — must not import node:path or node:fs.
 */

/** Extensions allowed for image display in beta. */
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif',
])

/**
 * Extract the file extension (lowercase, without dot) from a src string.
 * Handles query strings and fragments gracefully.
 */
export function getImageFileExtension(src: string): string {
  // Strip query string and fragment
  const clean = src.split(/[?#]/)[0]
  const match = clean.match(/\.([^./\\]+)$/)
  return match ? match[1].toLowerCase() : ''
}

/**
 * Check whether a file extension is in the beta-allowed image set.
 */
export function isAllowedImageExtension(src: string): boolean {
  return ALLOWED_IMAGE_EXTENSIONS.has(getImageFileExtension(src))
}

/** Classification of an image src attribute. */
export type ImageSrcKind = 'local' | 'remote' | 'dangerous'

/**
 * Classify an image `src` attribute for security purposes.
 *
 * - `dangerous`: javascript:, data:, blob:, vbscript:, file:, or unknown schemes
 * - `remote`: http: or https:
 * - `local`: relative path or absolute local path (no scheme)
 */
export function classifyImageSrc(src: string): ImageSrcKind {
  if (!src || !src.trim()) return 'dangerous'

  // Check for dangerous schemes first (case-insensitive)
  if (/^(javascript|data|blob|vbscript|file):/i.test(src)) return 'dangerous'

  // Check for remote URLs
  if (/^https?:/i.test(src)) return 'remote'

  // Any other scheme is unknown → dangerous
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return 'dangerous'

  // No scheme → local path (relative or absolute)
  return 'local'
}

/**
 * Check whether a src string looks like an absolute path.
 * Works without Node.js path module (renderer-safe).
 */
export function isAbsoluteImageSrc(src: string): boolean {
  if (src.startsWith('/')) return true
  // Windows absolute: C:\, D:/, etc.
  if (/^[A-Za-z]:[/\\]/.test(src)) return true
  return false
}

/**
 * Build a `nyoze-img://` protocol URL for displaying a local image.
 *
 * Returns `null` if the image should not be displayed (dangerous scheme,
 * remote URL, disallowed extension, or absolute path).
 *
 * No document directory is included in the URL — main tracks the active dir
 * internally via the `document:setActiveFilePath` IPC channel, so the
 * renderer cannot spoof the base directory.
 */
export function buildImageDisplayUrl(src: string): string | null {
  if (!src) return null
  if (classifyImageSrc(src) !== 'local') return null
  if (!isAllowedImageExtension(src)) return null
  // Beta: only relative paths — absolute paths could reference arbitrary files
  if (isAbsoluteImageSrc(src)) return null

  return `nyoze-img://img?src=${encodeURIComponent(src)}`
}
