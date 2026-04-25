export type FrontmatterFields = {
  title?: string
  original_title?: string
  subtitle?: string
  author?: string
  co_authors?: string[]
  translator?: string
  co_translators?: string[]
  nyozeLineBreakPolicy?: string
  nyozePreserveEmptyParagraphs?: string
  documentType?: string
  nyozeType?: string
  type?: string
}

export type FrontmatterSplit = {
  hasFrontmatter: boolean
  frontmatterPrefix: string
  body: string
}

function lineEndingLength(input: string, index: number): number {
  const char = input[index]
  if (char === '\r') {
    return input[index + 1] === '\n' ? 2 : 1
  }
  if (char === '\n') return 1
  return 0
}

function readLineRange(input: string, index: number): { lineStart: number; lineEnd: number; next: number } {
  let lineEnd = index
  while (lineEnd < input.length) {
    const endingLen = lineEndingLength(input, lineEnd)
    if (endingLen > 0) {
      return {
        lineStart: index,
        lineEnd,
        next: lineEnd + endingLen,
      }
    }
    lineEnd++
  }

  return {
    lineStart: index,
    lineEnd: input.length,
    next: input.length,
  }
}

function isYamlFence(line: string): boolean {
  return /^---[ \t]*$/.test(line)
}

export function splitLeadingFrontmatter(markdown: string): FrontmatterSplit {
  const bomOffset = markdown.charCodeAt(0) === 0xFEFF ? 1 : 0
  const first = readLineRange(markdown, bomOffset)
  const firstLine = markdown.slice(first.lineStart, first.lineEnd)

  if (!isYamlFence(firstLine)) {
    return {
      hasFrontmatter: false,
      frontmatterPrefix: '',
      body: markdown,
    }
  }

  let cursor = first.next
  while (cursor < markdown.length) {
    const line = readLineRange(markdown, cursor)
    const rawLine = markdown.slice(line.lineStart, line.lineEnd)
    if (isYamlFence(rawLine)) {
      let prefixEnd = line.lineEnd
      const trailingBreak = lineEndingLength(markdown, line.lineEnd)
      if (trailingBreak > 0) {
        // Keep one line break after closing fence hidden from normal editor view.
        prefixEnd += trailingBreak
      }
      return {
        hasFrontmatter: true,
        frontmatterPrefix: markdown.slice(0, prefixEnd),
        body: markdown.slice(prefixEnd),
      }
    }
    cursor = line.next
  }

  return {
    hasFrontmatter: false,
    frontmatterPrefix: '',
    body: markdown,
  }
}

/** Strip surrounding quotes from a YAML scalar value */
function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '')
}

function stripInlineComment(s: string): string {
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inDouble) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inDouble = false
      }
      continue
    }
    if (inSingle) {
      if (ch === "'") inSingle = false
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i).trimEnd()
    }
  }

  return s
}

/** Check if a string is wrapped in matching quotes */
function isQuotedScalar(s: string): boolean {
  return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))
}

/**
 * Split a YAML flow sequence body by commas, respecting quoted strings.
 * e.g. `"Doe, John", Smith` → [`"Doe, John"`, `Smith`]
 */
function splitFlowSequence(inner: string): string[] {
  const items: string[] = []
  let current = ''
  let quoteChar: string | null = null
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (quoteChar) {
      current += ch
      if (ch === quoteChar) quoteChar = null
    } else if (ch === '"' || ch === "'") {
      current += ch
      quoteChar = ch
    } else if (ch === ',') {
      items.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  items.push(current)
  return items
}

/**
 * Parse a YAML list value that may be:
 * - A YAML flow sequence: [a, b, c]
 * - A comma-separated single line: a, b, c
 * - An empty value followed by YAML block sequence items (- item)
 * Returns null if the value is a single scalar (not a list).
 */
function parseListValue(inlineValue: string, remainingLines: string[]): string[] | null {
  // Flow sequence: [a, b, c]
  if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
    const inner = inlineValue.slice(1, -1)
    if (!inner.trim()) return []
    return splitFlowSequence(inner).map(s => stripQuotes(s.trim())).filter(Boolean)
  }

  // Empty inline value → check for block sequence (- item)
  if (!inlineValue) {
    const items: string[] = []
    for (const nextLine of remainingLines) {
      const trimmed = nextLine.trimStart()
      if (trimmed.startsWith('- ')) {
        items.push(stripQuotes(trimmed.slice(2).trim()))
      } else if (trimmed === '-') {
        // bare dash with no value — skip
      } else {
        break
      }
    }
    return items.length > 0 ? items : null
  }

  // Quoted scalar with internal commas → single value, not a list
  if (isQuotedScalar(inlineValue)) {
    return null
  }

  // Comma-separated single line (contains at least one comma)
  if (inlineValue.includes(',')) {
    return inlineValue.split(',').map(s => stripQuotes(s.trim())).filter(Boolean)
  }

  return null
}

const SINGLE_FIELD_KEYS = new Set([
  'title',
  'original_title',
  'subtitle',
  'author',
  'translator',
  'nyozeLineBreakPolicy',
  'nyozePreserveEmptyParagraphs',
  'documentType',
  'nyozeType',
  'type',
])
const LIST_FIELD_KEYS = new Set(['co_authors', 'co_translators'])

export function parseFrontmatterFields(frontmatterPrefix: string): FrontmatterFields {
  if (!frontmatterPrefix) return {}
  const fields: FrontmatterFields = {}
  const lines = frontmatterPrefix.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx < 1) continue
    const key = line.slice(0, colonIdx).trim()
    const raw = line.slice(colonIdx + 1).trim()

    if (SINGLE_FIELD_KEYS.has(key)) {
      const value = stripQuotes(stripInlineComment(raw))
      if (!value) continue
      if (key === 'title') fields.title = value
      else if (key === 'original_title') fields.original_title = value
      else if (key === 'subtitle') fields.subtitle = value
      else if (key === 'author') fields.author = value
      else if (key === 'translator') fields.translator = value
      else if (key === 'nyozeLineBreakPolicy') fields.nyozeLineBreakPolicy = value
      else if (key === 'nyozePreserveEmptyParagraphs') fields.nyozePreserveEmptyParagraphs = value
      else if (key === 'documentType') fields.documentType = value
      else if (key === 'nyozeType') fields.nyozeType = value
      else if (key === 'type') fields.type = value
    } else if (LIST_FIELD_KEYS.has(key)) {
      const remaining = lines.slice(i + 1)
      const list = parseListValue(raw, remaining)
      if (list) {
        if (key === 'co_authors') fields.co_authors = list
        else if (key === 'co_translators') fields.co_translators = list
      } else if (raw) {
        // Single scalar value → treat as a one-element list
        const value = stripQuotes(raw)
        if (value) {
          if (key === 'co_authors') fields.co_authors = [value]
          else if (key === 'co_translators') fields.co_translators = [value]
        }
      }
    }
  }
  return fields
}

export function joinWithFrontmatter(frontmatterPrefix: string, body: string): string {
  if (!frontmatterPrefix) return body
  return `${frontmatterPrefix}${body}`
}
