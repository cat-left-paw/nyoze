/**
 * WB-IMG-1: pure magic-byte image format sniffing.
 *
 * Extension-only checks are not sufficient to trust a file's real format
 * (§`docs/web-book-assets-design-2026-07.md` §5.2). This module inspects the
 * leading bytes only and never trusts a filename / extension. No Node.js
 * dependency — operates on `Uint8Array` so it stays testable without fs and
 * could in principle run in either process, even though only main calls it.
 */

export type SniffedImageFormat = {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  extension: 'png' | 'jpg' | 'webp' | 'gif'
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]

function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

/**
 * Detect PNG / JPEG / GIF / WebP from the leading bytes of a file. Returns
 * `null` for any other (or unrecognized/truncated) format — callers must
 * treat that as a hard rejection, not a fallback to extension-based guessing.
 */
export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat | null {
  if (matchesAt(bytes, 0, PNG_SIGNATURE)) {
    return { mediaType: 'image/png', extension: 'png' }
  }
  if (matchesAt(bytes, 0, JPEG_SIGNATURE)) {
    return { mediaType: 'image/jpeg', extension: 'jpg' }
  }
  if (matchesAt(bytes, 0, GIF87A_SIGNATURE) || matchesAt(bytes, 0, GIF89A_SIGNATURE)) {
    return { mediaType: 'image/gif', extension: 'gif' }
  }
  if (matchesAt(bytes, 0, RIFF_SIGNATURE) && matchesAt(bytes, 8, WEBP_SIGNATURE)) {
    return { mediaType: 'image/webp', extension: 'webp' }
  }
  return null
}
