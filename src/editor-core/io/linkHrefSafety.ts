const ALLOWED_DOCUMENT_LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:'])

function containsAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function validateDocumentLinkHref(href: string): string | null {
  if (containsAsciiControlCharacter(href)) return null

  const trimmedHref = href.trim()
  if (trimmedHref === '') return null
  if (/\s/.test(trimmedHref)) return null
  if (trimmedHref.startsWith('#')) return trimmedHref
  if (trimmedHref.startsWith('//') || trimmedHref.startsWith('\\\\')) return null
  if (
    trimmedHref.startsWith('/') ||
    trimmedHref.startsWith('./') ||
    trimmedHref.startsWith('../')
  ) {
    return trimmedHref
  }

  const firstPathSeparatorIndex = trimmedHref.search(/[/?#]/)
  const colonIndex = trimmedHref.indexOf(':')
  const looksLikeScheme =
    colonIndex !== -1 &&
    (firstPathSeparatorIndex === -1 || colonIndex < firstPathSeparatorIndex)

  if (!looksLikeScheme) return trimmedHref

  try {
    const url = new URL(trimmedHref)
    if (!ALLOWED_DOCUMENT_LINK_PROTOCOLS.has(url.protocol)) return null
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !/^https?:\/\/[^/\\]/i.test(trimmedHref)
    ) {
      return null
    }
    if (url.username || url.password) return null
    return trimmedHref
  } catch {
    return null
  }
}
