export type ModifiedLinkClickInput = {
  href?: string | null
  button: number
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}

const INNER_WHITESPACE_PATTERN = /\s/

function containsAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function validateOpenableExternalHref(raw: string): string | null {
  if (containsAsciiControlCharacter(raw)) return null

  const trimmed = raw.trim()
  if (!trimmed || INNER_WHITESPACE_PATTERN.test(trimmed)) return null
  if (!/^https:\/\/[^/\\]/i.test(trimmed)) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function isModifiedLinkClick(
  input: Omit<ModifiedLinkClickInput, 'href'>,
): boolean {
  if (input.isComposing) return false
  if (input.button !== 0) return false
  if (!input.metaKey && !input.ctrlKey) return false
  if (input.altKey || input.shiftKey) return false
  return true
}

export function resolveModifiedLinkClick(
  input: ModifiedLinkClickInput,
): string | null {
  if (!isModifiedLinkClick(input)) return null
  return validateOpenableExternalHref(input.href ?? '')
}
