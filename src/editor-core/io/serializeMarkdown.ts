import type { Node as PMNode, Mark } from '@tiptap/pm/model'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'
import { supportsPreservedEmptyParagraphBoundary } from './emptyParagraphPreservation'
import {
  chooseCodeFence,
  escapeMarkdownBracketText,
  escapeMarkdownTitle,
  escapeMarkdownUrlDestination,
} from './markdownEscaping'
import { encodeAozoraInlineNode } from './clipboardSlicePlainText'

/**
 * Serialize a ProseMirror document to Markdown.
 *
 * Strategy:
 * - Walk the doc tree and emit Markdown text.
 * - atom nodes (html_inline_atom, html_block_atom) emit attrs.raw verbatim.
 * - Known nodes/marks use standard Markdown syntax.
 * - Priority: lossless round-trip over canonical formatting.
 */

// Mark nesting priority (lower = outermost in Markdown)
const MARK_PRIORITY: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  highlight: 4,
  code: 5,
}

function markPriority(mark: Mark): number {
  return MARK_PRIORITY[mark.type.name] ?? 99
}

function sortMarks(marks: Mark[]): Mark[] {
  return marks.sort((a, b) => markPriority(a) - markPriority(b))
}

function openDelim(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold': return '**'
    case 'italic': return '*'
    case 'strike': return '~~'
    case 'highlight': return '=='
    case 'code': return '`'
    case 'link': return '['
    default: return ''
  }
}

function closeDelim(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold': return '**'
    case 'italic': return '*'
    case 'strike': return '~~'
    case 'highlight': return '=='
    case 'code': return '`'
    case 'link': {
      const href = (mark.attrs.href as string) ?? ''
      const title = mark.attrs.title as string | undefined
      const safeHref = escapeMarkdownUrlDestination(href)
      if (title) return `](${safeHref} "${escapeMarkdownTitle(title)}")`
      return `](${safeHref})`
    }
    default: return ''
  }
}

function hasLinkMark(marks: Mark[]): boolean {
  for (const mark of marks) {
    if (mark.type.name === 'link') return true
  }
  return false
}

/**
 * Resolve the effective marks for an inline node with text children
 * (aozoraRuby, aozoraTcy).
 *
 * When bold/italic/etc. is applied in the WYSIWYG editor, ProseMirror
 * may attach the marks to the text children rather than the node itself.
 * This function merges node-level marks with marks that are common to
 * ALL text children, so the serializer treats the node as decorated.
 */
function resolveInlineNodeMarks(node: PMNode): Mark[] {
  const nodeMarks = [...node.marks]

  // Collect marks common to ALL text children
  let childCommon: Mark[] | null = null
  if (node.childCount > 0) {
    node.forEach((child) => {
      if (!child.isText) {
        childCommon = []
        return
      }
      const marks = [...child.marks]
      if (childCommon === null) {
        childCommon = marks
      } else {
        childCommon = childCommon.filter((m) => marks.some((cm) => m.eq(cm)))
      }
    })
  }
  const commonChildMarks = childCommon ?? []

  // Merge: node-level marks + child-common marks (deduplicated)
  if (commonChildMarks.length === 0) return nodeMarks
  if (nodeMarks.length === 0) return commonChildMarks

  const merged = [...nodeMarks]
  for (const cm of commonChildMarks) {
    if (!merged.some((m) => m.eq(cm))) {
      merged.push(cm)
    }
  }
  return merged
}

export function serializeMarkdown(
  doc: PMNode,
  lineBreakPolicy: LineBreakPolicy = 'commonmark-strict',
  options?: MarkdownDocumentOptions,
): string {
  const serializer = new MarkdownWriter(lineBreakPolicy, options)
  serializer.serializeDoc(doc)
  return serializer.getOutput()
}

class MarkdownWriter {
  private output = ''
  private blockSeparatorNeeded = false
  private lastDocBlockType: string | null = null

  constructor(
    private readonly lineBreakPolicy: LineBreakPolicy,
    private readonly options?: MarkdownDocumentOptions,
  ) {}

  getOutput(): string {
    if (this.lineBreakPolicy === 'obsidian-paragraph') {
      return this.output
    }
    return this.output.trimEnd() + '\n'
  }

  serializeDoc(doc: PMNode): void {
    const children: PMNode[] = []
    doc.forEach((child) => {
      children.push(child)
    })

    children.forEach((child, index) => {
      if (this.lastDocBlockType !== null) {
        if (this.lineBreakPolicy === 'obsidian-paragraph') {
          this.appendObsidianSeparator(child.type.name)
        } else {
          this.blockSeparatorNeeded = true
        }
      }

      if (this.shouldPreserveEmptyParagraph(children, index)) {
        this.ensureBlockSeparator()
        this.output += '\n'
        this.lastDocBlockType = child.type.name
        return
      }

      this.serializeBlock(child, '')
      this.lastDocBlockType = child.type.name
    })
  }

  private appendObsidianSeparator(nextBlockType: string): void {
    if (this.lastDocBlockType === null) return
    void nextBlockType
    this.output += '\n'
  }

  private inlineLineBreakToken(): string {
    return this.lineBreakPolicy === 'commonmark-strict' ? '  \n' : '\n'
  }

  private shouldPreserveEmptyParagraph(children: PMNode[], index: number): boolean {
    if (
      this.lineBreakPolicy !== 'commonmark-strict' ||
      this.options?.preserveEmptyParagraphs !== true
    ) {
      return false
    }

    const child = children[index]
    if (child.type.name !== 'paragraph' || child.childCount > 0) {
      return false
    }

    const previous = this.findAdjacentContentBlock(children, index, -1)
    const next = this.findAdjacentContentBlock(children, index, 1)
    if (!previous || !next) {
      return false
    }

    return (
      supportsPreservedEmptyParagraphBoundary(previous.type.name) &&
      supportsPreservedEmptyParagraphBoundary(next.type.name)
    )
  }

  private findAdjacentContentBlock(
    children: PMNode[],
    startIndex: number,
    step: -1 | 1,
  ): PMNode | null {
    for (let index = startIndex + step; index >= 0 && index < children.length; index += step) {
      const child = children[index]
      if (child.type.name === 'paragraph' && child.childCount === 0) {
        continue
      }
      return child
    }
    return null
  }
  private normalizeInlineText(text: string): string {
    if (this.lineBreakPolicy !== 'commonmark-strict') return text
    // commonmark-strict save: normalize paragraph-internal line breaks as hard breaks.
    return text.replace(/\n/g, this.inlineLineBreakToken())
  }

  private ensureBlockSeparator(): void {
    if (this.lineBreakPolicy === 'obsidian-paragraph') {
      this.blockSeparatorNeeded = false
      return
    }
    if (this.blockSeparatorNeeded) {
      if (this.output.endsWith('\n\n')) {
        // already separated
      } else if (this.output.endsWith('\n')) {
        this.output += '\n'
      } else {
        this.output += '\n\n'
      }
      this.blockSeparatorNeeded = false
    }
  }

  private serializeBlock(node: PMNode, prefix: string): void {
    switch (node.type.name) {
      case 'paragraph':
        this.ensureBlockSeparator()
        this.output += prefix + this.serializeInlineContent(node)
        break

      case 'heading': {
        this.ensureBlockSeparator()
        const level = (node.attrs.level as number) ?? 1
        const hashes = '#'.repeat(level)
        this.output += prefix + hashes + ' ' + this.serializeInlineContent(node)
        break
      }

      case 'blockquote':
        this.ensureBlockSeparator()
        this.serializeBlockquote(node, prefix)
        break

      case 'bulletList':
        this.serializeList(node, prefix, () => '- ')
        break

      case 'orderedList': {
        let counter = (node.attrs.start as number) ?? 1
        this.serializeList(node, prefix, () => `${counter++}. `)
        break
      }

      case 'listItem':
        // Handled by serializeList
        break

      case 'codeBlock': {
        this.ensureBlockSeparator()
        const lang = (node.attrs.language as string) ?? ''
        const body = node.textContent
        const fence = chooseCodeFence(body)
        this.output += prefix + fence + lang + '\n'
        this.output += body
        if (!body.endsWith('\n')) {
          this.output += '\n'
        }
        this.output += prefix + fence
        break
      }

      case 'horizontalRule':
        this.ensureBlockSeparator()
        this.output += prefix + '---'
        break

      case 'html_block_atom':
        this.ensureBlockSeparator()
        this.output += (node.attrs.raw as string) ?? ''
        break

      default:
        // Unknown block: try to serialize as text
        this.ensureBlockSeparator()
        this.output += prefix + node.textContent
        break
    }
  }

  private serializeBlockquote(node: PMNode, prefix: string): void {
    const childParts: string[] = []
    node.forEach((child, _offset, index) => {
      const writer = new MarkdownWriter(this.lineBreakPolicy)
      if (index > 0) {
        writer.blockSeparatorNeeded = true
      }
      writer.serializeBlock(child, '')
      childParts.push(writer.output)
    })
    const combined = childParts.join('')
    const lines = combined.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (i > 0) this.output += '\n'
      this.output += prefix + '> ' + line
    }
  }

  private serializeList(node: PMNode, prefix: string, markerFn: () => string): void {
    node.forEach((listItem, _offset, index) => {
      if (index > 0 || this.output.length > 0) {
        this.ensureBlockSeparator()
        // Lists don't get double newline between items
        if (index > 0 && !this.blockSeparatorNeeded) {
          this.output += '\n'
        }
      }
      const marker = markerFn()
      const checked = listItem.attrs.checked as boolean | null | undefined
      let checkboxToken = ''
      if (checked === true) checkboxToken = '[x]'
      else if (checked === false) checkboxToken = '[ ]'

      const fullMarker = marker + checkboxToken
      const itemPrefix = prefix + fullMarker
      const contPrefix = prefix + ' '.repeat(marker.length)

      let first = true
      listItem.forEach((child) => {
        if (first) {
          const writer = new MarkdownWriter(this.lineBreakPolicy)
          writer.serializeBlock(child, '')
          const childOutput = writer.output.trimStart()
          if (checkboxToken && childOutput) {
            this.output += itemPrefix + ' ' + childOutput
          } else {
            this.output += itemPrefix + childOutput
          }
          first = false
        } else {
          this.output += '\n'
          const writer = new MarkdownWriter(this.lineBreakPolicy)
          writer.serializeBlock(child, contPrefix)
          this.output += writer.output
        }
      })
    })
  }

  private serializeInlineContent(node: PMNode): string {
    const children: PMNode[] = []
    node.forEach((child) => children.push(child))

    let result = ''
    let activeMarks: Mark[] = []

    for (const child of children) {
      if (child.type.name === 'nyoze_image') {
        // SEC-5: serialize image node back to Markdown image syntax
        for (let i = activeMarks.length - 1; i >= 0; i--) {
          result += closeDelim(activeMarks[i])
        }
        activeMarks = []
        const alt = (child.attrs.alt as string) ?? ''
        const src = (child.attrs.src as string) ?? ''
        const title = child.attrs.title as string | null
        const safeAlt = escapeMarkdownBracketText(alt)
        const safeSrc = escapeMarkdownUrlDestination(src)
        if (title) {
          result += `![${safeAlt}](${safeSrc} "${escapeMarkdownTitle(title)}")`
        } else {
          result += `![${safeAlt}](${safeSrc})`
        }
        continue
      }

      if (child.type.name === 'html_inline_atom') {
        // Close all marks, emit atom raw, marks reopen for next node
        for (let i = activeMarks.length - 1; i >= 0; i--) {
          result += closeDelim(activeMarks[i])
        }
        activeMarks = []
        result += (child.attrs.raw as string) ?? ''
        continue
      }

      if (child.type.name === 'hardBreak') {
        for (let i = activeMarks.length - 1; i >= 0; i--) {
          result += closeDelim(activeMarks[i])
        }
        activeMarks = []
        result += this.inlineLineBreakToken()
        continue
      }

      if (!child.isText) {
        const encoded = encodeAozoraInlineNode(child)

        if (encoded === null) {
          result += child.textContent
          continue
        }

        const childMarks = sortMarks(resolveInlineNodeMarks(child))
        let commonLen = 0
        while (
          commonLen < activeMarks.length &&
          commonLen < childMarks.length &&
          activeMarks[commonLen].eq(childMarks[commonLen])
        ) {
          commonLen++
        }
        for (let i = activeMarks.length - 1; i >= commonLen; i--) {
          result += closeDelim(activeMarks[i])
        }
        for (let i = commonLen; i < childMarks.length; i++) {
          result += openDelim(childMarks[i])
        }
        activeMarks = childMarks
        result += encoded
        continue
      }

      const childMarks = sortMarks([...child.marks])

      // Find common prefix length between active and child marks
      let commonLen = 0
      while (
        commonLen < activeMarks.length &&
        commonLen < childMarks.length &&
        activeMarks[commonLen].eq(childMarks[commonLen])
      ) {
        commonLen++
      }

      // Close marks no longer active (innermost first)
      for (let i = activeMarks.length - 1; i >= commonLen; i--) {
        result += closeDelim(activeMarks[i])
      }

      // Open new marks
      for (let i = commonLen; i < childMarks.length; i++) {
        result += openDelim(childMarks[i])
      }

      activeMarks = childMarks
      const rawText = this.normalizeInlineText(child.text ?? '')
      result += hasLinkMark(childMarks) ? escapeMarkdownBracketText(rawText) : rawText
    }

    // Close remaining marks
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      result += closeDelim(activeMarks[i])
    }

    return result
  }
}
