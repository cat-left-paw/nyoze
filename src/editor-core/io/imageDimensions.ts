/**
 * WB-IMG-3B-1: pure, decode-free image dimensions parser.
 *
 * This intentionally reads only the format headers after magic-byte sniffing;
 * it never invokes a browser decoder, canvas, native image library, or fs.
 */
import type { SniffedImageFormat } from './imageFormatSniff'

export type ImageDimensions = { width: number; height: number }

export const MAX_WEB_BOOK_IMAGE_PIXELS = 100_000_000

function u16be(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function u16le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function u24le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 > bytes.length) return null
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function u32be(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
}

function u32le(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null
  return bytes[offset] + (bytes[offset + 1] * 0x100) + (bytes[offset + 2] * 0x10000) + (bytes[offset + 3] * 0x1000000)
}

function valid(width: number | null, height: number | null): ImageDimensions | null {
  if (width === null || height === null || width <= 0 || height <= 0) return null
  return { width, height }
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset + value.length > bytes.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function parsePng(bytes: Uint8Array): ImageDimensions | null {
  if (!asciiAt(bytes, 12, 'IHDR') || u32be(bytes, 8) !== 13 || bytes.length < 33) return null
  return valid(u32be(bytes, 16), u32be(bytes, 20))
}

function isJpegSof(marker: number): boolean {
  return (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
}

function parseJpeg(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) return null
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda || marker === 0x00) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const segmentLength = u16be(bytes, offset)
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) return null
    if (isJpegSof(marker)) {
      const componentCount = bytes[offset + 7]
      if (
        segmentLength < 11 ||
        bytes[offset + 2] === 0 ||
        componentCount === 0 ||
        segmentLength !== 8 + (3 * componentCount)
      ) return null
      return valid(u16be(bytes, offset + 5), u16be(bytes, offset + 3))
    }
    offset += segmentLength
  }
  return null
}

function parseWebp(bytes: Uint8Array): ImageDimensions | null {
  if (!asciiAt(bytes, 0, 'RIFF') || !asciiAt(bytes, 8, 'WEBP')) return null
  const riffSize = u32le(bytes, 4)
  if (riffSize === null || riffSize < 4 || riffSize + 8 > bytes.length) return null
  let offset = 12
  const end = riffSize + 8
  while (offset < end) {
    if (offset + 8 > end) return null
    const chunkSize = u32le(bytes, offset + 4)
    if (chunkSize === null) return null
    const dataOffset = offset + 8
    if (dataOffset + chunkSize > end) return null
    if (asciiAt(bytes, offset, 'VP8 ')) {
      if (chunkSize < 10 || !asciiAt(bytes, dataOffset + 3, '\x9d\x01\x2a')) return null
      const widthWord = u16le(bytes, dataOffset + 6)
      const heightWord = u16le(bytes, dataOffset + 8)
      return valid(widthWord === null ? null : widthWord & 0x3fff, heightWord === null ? null : heightWord & 0x3fff)
    }
    if (asciiAt(bytes, offset, 'VP8L')) {
      if (chunkSize < 5 || bytes[dataOffset] !== 0x2f) return null
      const b1 = bytes[dataOffset + 1]
      const b2 = bytes[dataOffset + 2]
      const b3 = bytes[dataOffset + 3]
      const b4 = bytes[dataOffset + 4]
      return valid(1 + b1 + ((b2 & 0x3f) << 8), 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10))
    }
    if (asciiAt(bytes, offset, 'VP8X')) {
      if (chunkSize < 10) return null
      const width = u24le(bytes, dataOffset + 4)
      const height = u24le(bytes, dataOffset + 7)
      return valid(width === null ? null : width + 1, height === null ? null : height + 1)
    }
    offset = dataOffset + chunkSize + (chunkSize % 2)
  }
  return null
}

function parseGif(bytes: Uint8Array): ImageDimensions | null {
  if ((!asciiAt(bytes, 0, 'GIF87a') && !asciiAt(bytes, 0, 'GIF89a')) || bytes.length < 10) return null
  return valid(u16le(bytes, 6), u16le(bytes, 8))
}

/** Returns null for malformed / truncated supported-format bytes. */
export function parseImageDimensions(bytes: Uint8Array, format: SniffedImageFormat): ImageDimensions | null {
  switch (format.mediaType) {
    case 'image/png': return parsePng(bytes)
    case 'image/jpeg': return parseJpeg(bytes)
    case 'image/webp': return parseWebp(bytes)
    case 'image/gif': return parseGif(bytes)
  }
}

/** Division comparison avoids unchecked width * height multiplication. */
export function exceedsImagePixelLimit(
  dimensions: ImageDimensions,
  maxPixels = MAX_WEB_BOOK_IMAGE_PIXELS,
): boolean {
  return dimensions.width > Math.floor(maxPixels / dimensions.height)
}
