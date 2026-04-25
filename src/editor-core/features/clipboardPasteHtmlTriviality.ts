/**
 * Classifies clipboard `text/html` for normal paste routing.
 * "Trivial" HTML is structural chrome and line breaks only (div/p/br/span + document head noise),
 * without semantic rich-text we should preserve via the native rich-text paste path.
 */

const TRIVIAL_CLIPBOARD_TAGS = new Set([
  'html',
  'head',
  'body',
  'meta',
  'title',
  'link',
  'div',
  'p',
  'span',
  'br',
])

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

function stripBogusDoctype(html: string): string {
  return html.replace(/<!DOCTYPE[^>]*>/gi, '')
}

function styleImpliesMeaningfulFormatting(styleValue: string): boolean {
  const s = styleValue.toLowerCase().replace(/\s+/g, ' ').trim()
  if (s.length === 0) return false
  if (/\bmso-/.test(s)) return true
  if (/font-weight\s*:\s*(?!normal\b|400\b)[^;]+/i.test(s)) return true
  if (/font-style\s*:\s*(?!normal\b)[^;]+/i.test(s)) return true
  if (/text-decoration[^;]*\b(underline|line-through)\b/i.test(s)) return true
  return false
}

function attrsImplyMeaningfulFormatting(attrs: string): boolean {
  if (/\son\w+\s*=/i.test(attrs)) return true
  if (/\sclass\s*=\s*["'][^"']*mso[^"']*["']/i.test(attrs)) return true

  const styleMatch = attrs.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i)
  if (styleMatch && styleImpliesMeaningfulFormatting(styleMatch[2])) {
    return true
  }
  return false
}

/**
 * Returns true when `text/html` is only trivial wrappers (and optional head chrome),
 * so plain-text / Markdown-aware paste should handle the payload using `text/plain`.
 */
export function isTrivialClipboardHtml(html: string): boolean {
  const trimmed = html.trim()
  if (trimmed.length === 0) return true

  const withoutNoise = stripBogusDoctype(stripHtmlComments(trimmed))
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(withoutNoise)) !== null) {
    const isClose = m[1] === '/'
    const tagName = m[2].toLowerCase()
    const attrs = m[3] ?? ''
    if (!TRIVIAL_CLIPBOARD_TAGS.has(tagName)) {
      return false
    }
    if (!isClose && attrsImplyMeaningfulFormatting(attrs)) {
      return false
    }
  }
  return true
}
