import type { Schema, Node as PMNode } from '@tiptap/pm/model'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import type { LineBreakPolicy } from '../types'
import {
  collectTopLevelMarkdownBlockDescriptors,
  supportsPreservedEmptyParagraphBoundary,
} from './emptyParagraphPreservation'
import { validateDocumentLinkHref } from './linkHrefSafety'
import { INLINE_PATTERN_WITH_EMPHASIS_REGEX } from './fallbackEmphasis'
import { rescueOrphanDelimiters } from './rescueOrphanDelimiters'

/**
 * Parse a Markdown string into a ProseMirror document.
 *
 * Strategy:
 * 1. Use markdown-it to tokenize the input.
 * 2. Walk the token stream and build ProseMirror nodes.
 * 3. Unknown HTML (html_inline, html_block) -> atom nodes with attrs.raw.
 * 4. Known tokens -> standard ProseMirror nodes/marks.
 * 5. Aozora ruby/tcy patterns in text -> aozoraRuby/aozoraTcy nodes.
 * 6. Rescue compound emphasis where markdown-it parsed only the inner mark
 *    and left the outer delimiter run attached to text tokens.
 * 7. Fallback emphasis: bold/italic/strike that markdown-it declined to
 *    parse entirely due to CJK punctuation adjacency -> rescued via regex.
 */

const md = MarkdownIt('commonmark', { html: true })
md.enable('strikethrough')

type MarkAttrs = Record<string, unknown>

interface MarkEntry {
  name: string
  attrs: MarkAttrs
}

export type ParseMarkdownOptions = {
  /** When false, aozora ruby patterns are kept as plain text instead of aozoraRuby nodes. */
  enableRuby?: boolean
  /** Preserve extra blank lines between top-level paragraph / heading blocks. */
  preserveEmptyParagraphs?: boolean
}

export function parseMarkdown(
  schema: Schema,
  markdown: string,
  lineBreakPolicy: LineBreakPolicy = 'commonmark-strict',
  options?: ParseMarkdownOptions,
): PMNode {
  const normalized = normalizeLineEndings(markdown)
  if (lineBreakPolicy === 'obsidian-paragraph') {
    return parseObsidianParagraphMarkdown(schema, normalized, options)
  }
  return parseCommonmarkMarkdown(schema, normalized, options)
}

function parseCommonmarkMarkdown(schema: Schema, markdown: string, options?: ParseMarkdownOptions): PMNode {
  const tokens = md.parse(markdown, {})
  const builder = new DocBuilder(schema, markdown, options)
  builder.processTokens(tokens)
  const doc = builder.build()
  if (options?.preserveEmptyParagraphs !== true) {
    return doc
  }
  return materializePreservedEmptyParagraphs(schema, doc, tokens)
}

function normalizeLineEndings(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function parseObsidianParagraphMarkdown(schema: Schema, markdown: string, options?: ParseMarkdownOptions): PMNode {
  const lines = markdown.split('\n')
  const children: PMNode[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? ''

    if (line.length === 0) {
      children.push(createParagraphNode(schema, ''))
      index++
      continue
    }

    const fencedChunk = readFencedCodeChunk(lines, index)
    if (fencedChunk) {
      appendCommonmarkChunk(schema, fencedChunk.chunk, children, options)
      index = fencedChunk.nextLine
      continue
    }

    if (isThematicBreakLine(line)) {
      appendCommonmarkChunk(schema, line, children, options)
      index++
      continue
    }

    if (isStructuralLine(line)) {
      let next = index + 1
      while (next < lines.length && lines[next] !== '') {
        next++
      }
      appendCommonmarkChunk(schema, lines.slice(index, next).join('\n'), children, options)
      index = next
      continue
    }

    children.push(parseObsidianPlainLine(schema, line, options))
    index++
  }

  return createDocNode(schema, children)
}

function materializePreservedEmptyParagraphs(
  schema: Schema,
  doc: PMNode,
  tokens: Token[],
): PMNode {
  const descriptors = collectTopLevelMarkdownBlockDescriptors(tokens)
  if (descriptors.length !== doc.childCount || descriptors.length < 2) {
    return doc
  }

  const children: PMNode[] = []
  let inserted = false
  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index)
    children.push(child)

    if (index >= doc.childCount - 1) continue
    if (!supportsPreservedEmptyParagraphBoundary(child.type.name)) continue

    const nextChild = doc.child(index + 1)
    if (!supportsPreservedEmptyParagraphBoundary(nextChild.type.name)) continue

    const extraBlankParagraphs =
      descriptors[index + 1].startLine - descriptors[index].endLine - 1
    if (extraBlankParagraphs <= 0) continue

    for (let blankIndex = 0; blankIndex < extraBlankParagraphs; blankIndex += 1) {
      children.push(createParagraphNode(schema, ''))
      inserted = true
    }
  }

  return inserted ? createDocNode(schema, children) : doc
}
function parseObsidianPlainLine(schema: Schema, line: string, options?: ParseMarkdownOptions): PMNode {
  const leadingMatch = line.match(/^[ \t\u3000]+/)
  const leading = leadingMatch?.[0] ?? ''
  const bodyWithTrailing = line.slice(leading.length)
  if (bodyWithTrailing.length === 0) {
    return createParagraphNode(schema, leading)
  }

  const trailingMatch = bodyWithTrailing.match(/[ \t\u3000]+$/)
  const trailing = trailingMatch?.[0] ?? ''
  const body = trailing.length > 0
    ? bodyWithTrailing.slice(0, bodyWithTrailing.length - trailing.length)
    : bodyWithTrailing

  if (body.length === 0) {
    return createParagraphNode(schema, line)
  }

  const parsedLine = parseCommonmarkMarkdown(schema, body, options)
  if (parsedLine.childCount !== 1 || parsedLine.child(0).type.name !== 'paragraph') {
    if (parsedLine.childCount === 1 && parsedLine.child(0).type.name === 'heading' && leading.length === 0) {
      const heading = parsedLine.child(0)
      const headingType = schema.nodes.heading
      if (!headingType) return heading

      const markerMatch = body.match(/^(#{1,6})([ \t\u3000]+)([\s\S]*)$/)
      const markerPadding = markerMatch && markerMatch[2].length > 1
        ? markerMatch[2].slice(1)
        : ''

      const content: PMNode[] = []
      if (markerPadding.length > 0) {
        content.push(schema.text(markerPadding))
      }
      heading.forEach((child) => content.push(child))
      if (trailing.length > 0) {
        content.push(schema.text(trailing))
      }
      return headingType.create(heading.attrs, content)
    }
    return createParagraphNode(schema, line)
  }

  if (leading.length === 0 && trailing.length === 0) {
    return parsedLine.child(0)
  }

  const paragraph = parsedLine.child(0)
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) return createParagraphNode(schema, line)

  const content: PMNode[] = []
  if (leading.length > 0) {
    content.push(schema.text(leading))
  }
  paragraph.forEach((child) => content.push(child))
  if (trailing.length > 0) {
    content.push(schema.text(trailing))
  }
  return paragraphType.create(null, content)
}

function appendCommonmarkChunk(schema: Schema, chunk: string, target: PMNode[], options?: ParseMarkdownOptions): void {
  const parsed = parseCommonmarkMarkdown(schema, chunk, options)
  parsed.forEach((child) => target.push(child))
}

function createDocNode(schema: Schema, children: PMNode[]): PMNode {
  if (children.length > 0) {
    return schema.node('doc', null, children)
  }
  return schema.node('doc', null, [createParagraphNode(schema, '')])
}

function createParagraphNode(schema: Schema, text: string): PMNode {
  const paragraphType = schema.nodes.paragraph
  if (!paragraphType) {
    throw new Error('paragraph node type is required for obsidian-paragraph mode')
  }
  if (text.length === 0) {
    return paragraphType.create()
  }
  return paragraphType.create(null, [schema.text(text)])
}

function isStructuralLine(line: string): boolean {
  if (isFencedCodeStart(line)) return true

  const trimmed = line.trimStart()
  if (trimmed.length === 0) return false
  if (/^>/.test(trimmed)) return true
  if (/^(?:[-+*]|\d+[.)])\s+/.test(trimmed)) return true
  if (isThematicBreakLine(trimmed)) return true
  if (/^\|.*\|$/.test(trimmed)) return true
  if (/^<[^>]+>/.test(trimmed)) return true
  if (/^(?: {4}|\t)/.test(line)) return true
  return false
}

function isThematicBreakLine(line: string): boolean {
  return /^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())
}

function isFencedCodeStart(line: string): boolean {
  return /^ {0,3}(?:`{3,}|~{3,})/.test(line)
}

function readFencedCodeChunk(
  lines: string[],
  start: number,
): { chunk: string; nextLine: number } | null {
  const firstLine = lines[start] ?? ''
  const match = firstLine.match(/^ {0,3}(`{3,}|~{3,})/)
  if (!match) return null

  const fenceRun = match[1]
  const fenceChar = fenceRun[0]
  const minFenceLength = fenceRun.length
  const closeRegex = new RegExp(`^ {0,3}${escapeForRegex(fenceChar)}{${minFenceLength},}\\s*$`)

  let end = start + 1
  while (end < lines.length) {
    if (closeRegex.test(lines[end] ?? '')) {
      end++
      break
    }
    end++
  }

  return {
    chunk: lines.slice(start, end).join('\n'),
    nextLine: end,
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractImageAltFromToken(tok: Token): string {
  if (tok.children && tok.children.length > 0) {
    let buf = ''
    for (const child of tok.children) {
      if (child.type === 'softbreak' || child.type === 'hardbreak') {
        buf += '\n'
      } else if (typeof child.content === 'string' && child.content.length > 0) {
        buf += child.content
      }
    }
    if (buf.length > 0) return buf
  }
  return tok.attrGet('alt') ?? ''
}

function formatPlainLinkClose(href: string, title?: string): string {
  if (title === undefined) return `](${href})`
  const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `](${href} "${escapedTitle}")`
}

class DocBuilder {
  private schema: Schema
  private blockStack: BlockFrame[]
  private source: string
  private lineStartOffsets: number[]
  private enableRuby: boolean
  private linkStack: Array<{ kind: 'valid' } | { kind: 'invalid'; closeText: string }>

  constructor(schema: Schema, source: string, options?: ParseMarkdownOptions) {
    this.schema = schema
    this.blockStack = [{ type: 'doc', children: [], marks: [] }]
    this.source = source
    this.lineStartOffsets = buildLineStartOffsets(source)
    this.enableRuby = options?.enableRuby !== false
    this.linkStack = []
  }

  processTokens(tokens: Token[]): void {
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      this.processToken(tok)
    }
  }

  build(): PMNode {
    // Close any remaining open blocks
    while (this.blockStack.length > 1) {
      this.closeBlock()
    }
    const root = this.blockStack[0]
    return createDocNode(this.schema, root.children)
  }

  private currentFrame(): BlockFrame {
    return this.blockStack[this.blockStack.length - 1]
  }

  private processToken(tok: Token): void {
    switch (tok.type) {
      // --- Block open/close ---
      case 'paragraph_open': {
        // Preserve leading whitespace (half-width space, tab, full-width space) for top-level
        // paragraphs. markdown-it's CommonMark parser strips these via .trim(), so we recover
        // them from the source text before the paragraph content is assembled.
        const leadingWs = this.currentFrame().type === 'doc'
          ? this.extractParagraphLeadingWs(tok)
          : undefined
        this.openBlock('paragraph', null, leadingWs)
        break
      }
      case 'paragraph_close':
        this.closeBlock()
        break

      case 'heading_open':
        this.openBlock('heading', { level: parseInt(tok.tag.slice(1), 10) })
        break
      case 'heading_close':
        this.closeBlock()
        break

      case 'blockquote_open':
        this.openBlock('blockquote')
        break
      case 'blockquote_close':
        this.closeBlock()
        break

      case 'bullet_list_open':
        this.openBlock('bulletList')
        break
      case 'bullet_list_close':
        this.closeBlock()
        break

      case 'ordered_list_open':
        this.openBlock('orderedList', { start: tok.attrGet('start') ? Number(tok.attrGet('start')) : 1 })
        break
      case 'ordered_list_close':
        this.closeBlock()
        break

      case 'list_item_open':
        this.openBlock('listItem', { checked: null })
        break
      case 'list_item_close':
        this.closeBlock()
        break

      case 'code_block':
      case 'fence':
        this.addCodeBlock(tok)
        break

      case 'hr':
        this.addNode('horizontalRule')
        break

      // --- Inline container ---
      case 'inline':
        if (tok.children) {
          this.processInlineTokens(tok.children)
        }
        break

      // --- Raw HTML block ---
      case 'html_block':
        this.addHtmlBlockAtom(tok)
        break

      default:
        // Ignore unknown token types (e.g., reference definitions)
        break
    }
  }

  private processInlineTokens(tokens: Token[]): void {
    const rescued = rescueOrphanDelimiters(tokens)
    const frame = this.currentFrame()

    for (let i = 0; i < rescued.length; i++) {
      const tok = rescued[i]

      switch (tok.type) {
        case 'text': {
          let content = tok.content
          if (content) {
            content = this.tryConsumeCheckboxPrefix(content)
            if (content) {
              this.addTextWithAozora(content, frame.marks)
            }
          }
          break
        }

        case 'softbreak':
          // Normalize inline line-break tokens to hardBreak nodes.
          if (this.shouldSkipChecklistLineBreak()) break
          this.addHardBreak()
          break

        case 'hardbreak':
          if (this.shouldSkipChecklistLineBreak()) break
          this.addHardBreak()
          break

        case 'strong_open':
          frame.marks = [...frame.marks, { name: 'bold', attrs: {} }]
          break
        case 'strong_close':
          frame.marks = frame.marks.filter((m) => m.name !== 'bold')
          break

        case 'em_open':
          frame.marks = [...frame.marks, { name: 'italic', attrs: {} }]
          break
        case 'em_close':
          frame.marks = frame.marks.filter((m) => m.name !== 'italic')
          break

        case 's_open':
          frame.marks = [...frame.marks, { name: 'strike', attrs: {} }]
          break
        case 's_close':
          frame.marks = frame.marks.filter((m) => m.name !== 'strike')
          break

        case 'code_inline':
          this.addText(tok.content, [...frame.marks, { name: 'code', attrs: {} }])
          break

        case 'link_open': {
          const rawHref = tok.attrGet('href') ?? ''
          const href = validateDocumentLinkHref(rawHref)
          const title = tok.attrGet('title') ?? undefined
          if (!href) {
            this.linkStack.push({
              kind: 'invalid',
              closeText: formatPlainLinkClose(rawHref, title),
            })
            this.addText('[', frame.marks)
            break
          }

          this.linkStack.push({ kind: 'valid' })
          frame.marks = [...frame.marks, { name: 'link', attrs: { href, title } }]
          break
        }
        case 'link_close': {
          const link = this.linkStack.pop()
          if (link?.kind === 'invalid') {
            this.addText(link.closeText, frame.marks)
            break
          }
          frame.marks = frame.marks.filter((m) => m.name !== 'link')
          break
        }

        case 'image': {
          // SEC-5: create nyoze_image node (inline atom) for Markdown images.
          // The NodeView handles display (valid local → img, else → placeholder).
          // Serializer reconstructs ![alt](src) or ![alt](src "title") losslessly.
          // alt is derived from children (unescaped) to avoid double-escaped
          // backslashes when the serializer re-escapes `]` / `\` etc.
          const alt = extractImageAltFromToken(tok)
          const src = tok.attrGet('src') ?? ''
          const title = tok.attrGet('title') ?? null
          this.addImageNode(src, alt, title)
          break
        }

        case 'html_inline':
          this.addHtmlInlineAtom(tok.content)
          break

        default:
          // Unknown inline token -> treat as text if it has content
          if (tok.content) {
            this.addText(tok.content, frame.marks)
          }
          break
      }
    }
  }

  private openBlock(typeName: string, attrs?: Record<string, unknown> | null, leadingWs?: string): void {
    this.blockStack.push({
      type: typeName,
      attrs: attrs ?? null,
      children: [],
      marks: [],
      leadingWs,
    })
  }

  /**
   * Extract leading whitespace (half-width space, tab, full-width space) from the first
   * source line of a paragraph token. Used to restore indentation that markdown-it strips.
   */
  private extractParagraphLeadingWs(tok: Token): string {
    if (!tok.map || tok.map.length < 1) return ''
    const lineIdx = tok.map[0]
    const lineStart = lineToOffset(this.lineStartOffsets, lineIdx, this.source.length)
    const nextLineStart = lineToOffset(this.lineStartOffsets, lineIdx + 1, this.source.length)
    const line = this.source.slice(lineStart, nextLineStart)
    const match = line.match(/^[ \t\u3000]+/)
    return match ? match[0] : ''
  }

  private closeBlock(): void {
    if (this.blockStack.length <= 1) return
    const frame = this.blockStack.pop()!
    const nodeType = this.schema.nodes[frame.type]
    if (!nodeType) return

    let children = frame.children
    // Restore paragraph leading whitespace that markdown-it stripped via .trim().
    // Only applied when the frame had inline content (children.length > 0).
    if (frame.type === 'paragraph' && frame.leadingWs && children.length > 0) {
      children = [this.schema.text(frame.leadingWs), ...children]
    }
    // Ensure blocks that require content have at least one child
    if (children.length === 0 && nodeType.spec.content) {
      const contentMatch = nodeType.contentMatch
      const defaultChild = contentMatch.defaultType
      if (defaultChild) {
        children = [defaultChild.create()]
      }
    }

    try {
      const node = this.schema.node(frame.type, frame.attrs ?? null, children)
      this.currentFrame().children.push(node)
    } catch {
      // If node creation fails (invalid content), wrap as paragraph
      if (frame.type !== 'paragraph') {
        const p = this.schema.node('paragraph', null, children.filter(
          (c) => c.isInline
        ))
        this.currentFrame().children.push(p)
      }
    }
  }

  private addText(text: string, marks: MarkEntry[]): void {
    const pmMarks = this.toPmMarks(marks)
    const textNode = this.schema.text(text, pmMarks)
    this.currentFrame().children.push(textNode)
  }

  private addHardBreak(): void {
    const nodeType = this.schema.nodes['hardBreak']
    if (nodeType) {
      this.currentFrame().children.push(nodeType.create())
    }
  }

  private addNode(typeName: string, attrs?: Record<string, unknown>): void {
    const nodeType = this.schema.nodes[typeName]
    if (!nodeType) return
    this.currentFrame().children.push(nodeType.create(attrs ?? null))
  }

  private addCodeBlock(tok: Token): void {
    const language = tok.info?.trim() || undefined
    // markdown-it includes a trailing \n in fence content; strip it
    let content = tok.content
    if (content.endsWith('\n')) {
      content = content.slice(0, -1)
    }
    const nodeType = this.schema.nodes['codeBlock']
    if (!nodeType) return
    const textNode = content ? this.schema.text(content) : undefined
    const children = textNode ? [textNode] : []
    this.currentFrame().children.push(
      nodeType.create({ language: language ?? null }, children)
    )
  }

  /**
   * Process text that may contain inline patterns (Aozora ruby/tcy, highlight,
   * fallback emphasis after markdown-it left the whole span as plain text).
   * Splits text at pattern boundaries and emits the appropriate nodes/marks.
   */
  private addTextWithAozora(text: string, marks: MarkEntry[]): void {
    const hasRuby = this.enableRuby ? this.schema.nodes['aozoraRuby'] : undefined
    const hasTcy = this.schema.nodes['aozoraTcy']
    const hasHighlight = this.schema.marks['highlight']
    const hasBold = this.schema.marks['bold']
    const hasItalic = this.schema.marks['italic']
    const hasStrike = this.schema.marks['strike']
    if (!hasRuby && !hasTcy && !hasHighlight && !hasBold && !hasItalic && !hasStrike) {
      this.addText(text, marks)
      return
    }

    const regex = new RegExp(INLINE_PATTERN_WITH_EMPHASIS_REGEX.source, 'g')
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      // Emit plain text before the match
      if (match.index > lastIndex) {
        this.addText(text.slice(lastIndex, match.index), marks)
      }

      if (match[4] !== undefined && hasTcy) {
        // TCY match: group [4]
        this.addTcyNode(match[4], marks)
      } else if (match[3] !== undefined && hasRuby) {
        // Ruby match: group [1]=delimiter body, [2]=kanji body, [3]=ruby
        const body = match[1] ?? match[2] ?? ''
        const ruby = match[3]
        const hasDelimiter = match[1] !== undefined
        this.addRubyNode(body, ruby, hasDelimiter, marks)
      } else if (match[5] !== undefined && hasHighlight) {
        // Highlight match: group [5] — recurse to parse ruby/tcy inside highlight
        this.addTextWithAozora(match[5], [...marks, { name: 'highlight', attrs: {} }])
      } else if (match[6] !== undefined && hasBold && hasItalic) {
        // Fallback bold+italic: group [6] (***text***)
        this.addTextWithAozora(match[6], [...marks, { name: 'bold', attrs: {} }, { name: 'italic', attrs: {} }])
      } else if (match[7] !== undefined && hasBold) {
        // Fallback bold: group [7] — markdown-it declined due to CJK punctuation adjacency
        this.addTextWithAozora(match[7], [...marks, { name: 'bold', attrs: {} }])
      } else if (match[8] !== undefined && hasItalic) {
        // Fallback italic: group [8]
        this.addTextWithAozora(match[8], [...marks, { name: 'italic', attrs: {} }])
      } else if (match[9] !== undefined && hasStrike) {
        // Fallback strike: group [9]
        this.addTextWithAozora(match[9], [...marks, { name: 'strike', attrs: {} }])
      } else {
        // Schema doesn't have the required node type; keep as text
        this.addText(match[0], marks)
      }

      lastIndex = regex.lastIndex
    }

    // Emit remaining text after last match
    if (lastIndex < text.length) {
      this.addText(text.slice(lastIndex), marks)
    } else if (lastIndex === 0) {
      // No matches at all — emit entire text
      this.addText(text, marks)
    }
  }

  /**
   * Detect `[ ]` / `[x]` checkbox prefix at the start of a list item's first paragraph.
   * If found, sets `checked` on the listItem frame and returns remaining text.
   * Otherwise returns the original text unchanged.
   */
  private tryConsumeCheckboxPrefix(text: string): string {
    if (this.blockStack.length < 3) return text
    const paragraphFrame = this.currentFrame()
    const listItemFrame = this.blockStack[this.blockStack.length - 2]
    if (listItemFrame.type !== 'listItem') return text
    if (paragraphFrame.type !== 'paragraph') return text
    if (paragraphFrame.children.length > 0) return text
    if (listItemFrame.children.length > 0) return text

    const match = text.match(/^\[([ xX])\](?: |$)/)
    if (!match) return text

    const checked = match[1] !== ' '
    listItemFrame.attrs = { ...(listItemFrame.attrs ?? {}), checked }
    return text.slice(match[0].length)
  }

  private shouldSkipChecklistLineBreak(): boolean {
    if (this.blockStack.length < 3) return false
    const paragraphFrame = this.currentFrame()
    const listItemFrame = this.blockStack[this.blockStack.length - 2]
    if (paragraphFrame.type !== 'paragraph' || listItemFrame.type !== 'listItem') return false
    if (listItemFrame.children.length > 0 || paragraphFrame.children.length > 0) return false

    const checked = listItemFrame.attrs?.checked
    return checked === true || checked === false
  }

  private addRubyNode(base: string, ruby: string, hasDelimiter: boolean, marks: MarkEntry[]): void {
    const nodeType = this.schema.nodes['aozoraRuby']
    if (!nodeType || !base || !ruby) return
    const textNode = this.schema.text(base)
    const pmMarks = this.toPmMarks(marks)
    try {
      this.currentFrame().children.push(
        nodeType.create({ ruby, hasDelimiter }, [textNode], pmMarks),
      )
    } catch {
      // Fallback: keep original text if mark constraints reject this node.
      const delimiter = hasDelimiter ? '｜' : ''
      this.addText(`${delimiter}${base}《${ruby}》`, marks)
    }
  }

  private addTcyNode(body: string, marks: MarkEntry[]): void {
    const nodeType = this.schema.nodes['aozoraTcy']
    if (!nodeType || !body) return
    const textNode = this.schema.text(body)
    const pmMarks = this.toPmMarks(marks)
    try {
      this.currentFrame().children.push(
        nodeType.create(null, [textNode], pmMarks),
      )
    } catch {
      this.addText(`｟${body}｠`, marks)
    }
  }

  private toPmMarks(marks: MarkEntry[]) {
    return marks
      .map((m) => {
        const markType = this.schema.marks[m.name]
        if (!markType) return null
        return markType.create(m.attrs)
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
  }

  private addImageNode(src: string, alt: string, title: string | null): void {
    const nodeType = this.schema.nodes['nyoze_image']
    if (!nodeType) {
      // Fallback: schema doesn't have nyoze_image → use html_inline_atom
      const raw = title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
      this.addHtmlInlineAtom(raw)
      return
    }
    this.currentFrame().children.push(
      nodeType.create({ src, alt, title })
    )
  }

  private addHtmlInlineAtom(raw: string): void {
    const nodeType = this.schema.nodes['html_inline_atom']
    if (!nodeType) return
    this.currentFrame().children.push(
      nodeType.create({ raw })
    )
  }

  private addHtmlBlockAtom(tok: Token): void {
    const nodeType = this.schema.nodes['html_block_atom']
    if (!nodeType) return
    const raw = this.extractRawByLineMap(tok)
    this.currentFrame().children.push(
      nodeType.create({ raw })
    )
  }

  private extractRawByLineMap(tok: Token): string {
    if (!tok.map || tok.map.length < 2) {
      return tok.content
    }
    const [fromLine, toLine] = tok.map
    const start = lineToOffset(this.lineStartOffsets, fromLine, this.source.length)
    const end = lineToOffset(this.lineStartOffsets, toLine, this.source.length)
    return this.source.slice(start, end)
  }
}

interface BlockFrame {
  type: string
  attrs?: Record<string, unknown> | null
  children: PMNode[]
  marks: MarkEntry[]
  /** Leading whitespace to prepend to paragraph inline content (commonmark-strict only) */
  leadingWs?: string
}

function buildLineStartOffsets(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      starts.push(i + 1)
    }
  }
  return starts
}

function lineToOffset(lineStarts: number[], line: number, fallbackEnd: number): number {
  if (line < 0) return 0
  if (line >= lineStarts.length) return fallbackEnd
  return lineStarts[line]
}
