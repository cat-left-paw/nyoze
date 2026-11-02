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
import { parseMarkdown } from './parseMarkdown'
import {
  blockMayNeedSyntaxEscape,
  escapeHeadingClosingSequence,
  escapeStarAndUnderscore,
  escapeSyntaxText,
} from './markdownSyntaxEscaping'
import { formatNoteAnchorComment } from './noteAnchor'
import {
  formatBlankPageToken,
  formatDirectiveToken,
  NYOZE_BLANK_PAGE_NODE_NAME,
  NYOZE_DIRECTIVE_NODE_NAME,
  NYOZE_PAGE_BREAK_NODE_NAME,
  PAGE_BREAK_TOKEN,
  type DirectiveAttrs,
} from './customBlockDirective'

/**
 * Serialize a ProseMirror document to Markdown.
 *
 * Strategy:
 * - Walk the doc tree and emit Markdown text.
 * - atom nodes (html_inline_atom, html_block_atom) emit attrs.raw verbatim.
 * - Known nodes/marks use standard Markdown syntax.
 * - Priority: lossless round-trip over canonical formatting.
 * - ESCAPE1: 本文の記号は、S0 を開き直して元の block と一致しないとき `\` でエスケープする
 *   （`serializeTopLevelBlock`。S1 が一致しなくても使う。見える文字の `\` が増えるときだけ S0）。
 */

// Mark nesting priority (lower = outermost in Markdown)
const MARK_PRIORITY: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  highlight: 4,
  underline: 5,
  code: 6,
}

function markPriority(mark: Mark): number {
  return MARK_PRIORITY[mark.type.name] ?? 99
}

/**
 * ESCAPE2 追記1: S0 も S1 も元の block と一致しなかったときの選び方。
 * 試験が実行中の回数を読む。製品の保存結果には影響しない。
 */
export interface SyntaxEscapeFallbackStats {
  /** 読み直した S1 の見える `\` が元より多く、S0 を選んだ block。 */
  safetyPlain: number
  /** 一致しないまま S1 を選んだ block。 */
  unmatchedEscaped: number
}

const syntaxEscapeFallbackStats: SyntaxEscapeFallbackStats = { safetyPlain: 0, unmatchedEscaped: 0 }

export function resetSyntaxEscapeFallbackStats(): void {
  syntaxEscapeFallbackStats.safetyPlain = 0
  syntaxEscapeFallbackStats.unmatchedEscaped = 0
}

export function readSyntaxEscapeFallbackStats(): SyntaxEscapeFallbackStats {
  return { safetyPlain: syntaxEscapeFallbackStats.safetyPlain, unmatchedEscaped: syntaxEscapeFallbackStats.unmatchedEscaped }
}

/** 本文として見える文字（text、Ruby の読み、画像の alt と title）に含まれる `\` の数。 */
function visibleBackslashCount(node: PMNode): number {
  let count = 0
  const add = (value: unknown): void => {
    if (typeof value !== 'string') return
    for (let i = 0; i < value.length; i += 1) {
      if (value.charCodeAt(i) === 92) count += 1
    }
  }
  const visit = (current: PMNode): void => {
    current.forEach((child) => {
      if (child.isText) add(child.text)
      if (child.type.name === 'aozoraRuby') add(child.attrs.ruby)
      if (child.type.name === 'nyoze_image') {
        add(child.attrs.alt)
        add(child.attrs.title)
      }
      if (child.childCount > 0) visit(child)
    })
  }
  visit(node)
  return count
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
    case 'underline': return '||'
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
    case 'underline': return '||'
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

/**
 * 段落の直列化形が付箋アンカー comment で始まるとき true。
 * その行は再parse時に type-2 HTML block として開くため、前段落の lazy 継続を
 * 割り込む。引用内の強制空行の要否判定に使う。
 */
function startsWithNoteAnchor(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.firstChild?.type.name === 'noteAnchor'
}

/** 書き出し済みの `result` に続けて書く文字が、行頭（行頭の空白の後）に来るか。 */
function isAtLineStart(result: string, startsAtLineStart: boolean): boolean {
  const newline = result.lastIndexOf('\n')
  if (newline === -1 && !startsAtLineStart) return false
  const tail = newline === -1 ? result : result.slice(newline + 1)
  return /^[ \t]*$/.test(tail)
}

class MarkdownWriter {
  private output = ''
  private blockSeparatorNeeded = false
  private lastDocBlockType: string | null = null
  /** ESCAPE1: 本文の記号に `\` を足す（S1）。直下の block の確かめで決まる。 */
  private escapeSyntax = false

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
    this.serializeBlockSequence(children)
  }

  /**
   * block 子の列を doc と同じ separator / empty-paragraph 規則で直列化する。
   * doc 直下と directive block の内側で共有する。
   */
  private serializeBlockSequence(children: PMNode[]): void {
    children.forEach((child, index) => {
      if (this.lastDocBlockType !== null) {
        if (this.lineBreakPolicy === 'obsidian-paragraph') {
          this.appendObsidianSeparator(child)
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

      this.serializeTopLevelBlock(child)
      this.lastDocBlockType = child.type.name
    })
  }

  /**
   * ESCAPE1（A4）/ ESCAPE2 追記1: 文書の直下（と directive の内側）の block を1つ書く。
   *
   * 1. いまと同じ形（`\` なし）の S0 を作る。記法になり得る文字が無ければ、そのまま使う。
   * 2. S0 を同じ改行モードで読み直し、block が元の node と `eq` で一致すれば S0。
   * 3. 一致しなければ S1（`\` を入れた形）。S1 が一致すれば S1。
   * 4. S1 も一致しなければ S1。ただし、S1 を読み直した文書の見える文字（text、Ruby の
   *    親文字と読み、TCY、画像の alt と title）に含まれる `\` の数が元の block より多い
   *    ときは S0（`\` が文字として残る場所では足さない）。
   *
   * S0・S1 は block だけを書く使い捨ての writer で作り、確かめの後に本番の出力へ
   * 選んだ形で書く（長い出力の文字列を切り出さない）。
   */
  private serializeTopLevelBlock(child: PMNode): void {
    if (
      this.escapeSyntax ||
      child.type.name === NYOZE_DIRECTIVE_NODE_NAME ||
      !blockMayNeedSyntaxEscape(child)
    ) {
      this.serializeBlock(child, '')
      return
    }
    const plain = this.renderStandalone(child, false)
    const escaped = this.renderStandalone(child, true)
    this.escapeSyntax = this.shouldUseEscapedSyntax(plain, escaped, child)
    try {
      this.serializeBlock(child, '')
    } finally {
      this.escapeSyntax = false
    }
  }

  /**
   * S0 が元の block と一致すれば false。一致せず S1 が一致すれば true。
   * どちらも一致しなければ true。S1 を読み直した見える文字の `\` が元より多いときだけ false。
   */
  private shouldUseEscapedSyntax(plain: string, escaped: string, node: PMNode): boolean {
    if (escaped === plain) return false
    if (this.roundTrips(plain, node)) return false
    const escapedDoc = this.parseSerialized(escaped, node)
    if (escapedDoc !== null && escapedDoc.childCount === 1 && escapedDoc.child(0).eq(node)) return true
    const escapedBackslashes = escapedDoc === null ? 0 : visibleBackslashCount(escapedDoc)
    if (escapedDoc !== null && escapedBackslashes > visibleBackslashCount(node)) {
      syntaxEscapeFallbackStats.safetyPlain += 1
      return false
    }
    syntaxEscapeFallbackStats.unmatchedEscaped += 1
    return true
  }

  /** block 1つだけを、空の出力・separator なしの writer で書く（確かめ用）。 */
  private renderStandalone(node: PMNode, escapeSyntax: boolean): string {
    const writer = new MarkdownWriter(this.lineBreakPolicy, this.options)
    writer.escapeSyntax = escapeSyntax
    writer.serializeBlock(node, '')
    return writer.output
  }

  /** 書いた文字列を読み直す。失敗したら null。 */
  private parseSerialized(serialized: string, node: PMNode): PMNode | null {
    try {
      return parseMarkdown(node.type.schema, serialized, this.lineBreakPolicy, {
        preserveEmptyParagraphs: this.options?.preserveEmptyParagraphs === true,
      })
    } catch {
      return null
    }
  }

  /** 書いた文字列を読み直すと、block が元の node と一致するか。 */
  private roundTrips(serialized: string, node: PMNode): boolean {
    const parsed = this.parseSerialized(serialized, node)
    return parsed !== null && parsed.childCount === 1 && parsed.child(0).eq(node)
  }

  /** 入れ子の writer（引用・リスト・directive）へ、いまの S0 / S1 の指定を引き継ぐ。 */
  private nestedWriter(withOptions: boolean): MarkdownWriter {
    const writer = withOptions
      ? new MarkdownWriter(this.lineBreakPolicy, this.options)
      : new MarkdownWriter(this.lineBreakPolicy)
    writer.escapeSyntax = this.escapeSyntax
    return writer
  }

  private appendObsidianSeparator(nextBlock: PMNode): void {
    if (this.lastDocBlockType === null) return
    // blockquote directly followed by a non-blockquote block with real
    // content is ambiguous CommonMark (lazy continuation would re-absorb
    // the next block on reparse), so force a blank line at that boundary.
    // An empty paragraph (the per-line blank-line marker, e.g. a trailing
    // newline) needs no extra separator — it already reads as a blank line.
    const isEmptyParagraph = nextBlock.type.name === 'paragraph' && nextBlock.childCount === 0
    if (this.lastDocBlockType === 'blockquote' && nextBlock.type.name !== 'blockquote' && !isEmptyParagraph) {
      if (this.output.endsWith('\n\n')) {
        // already separated
      } else if (this.output.endsWith('\n')) {
        this.output += '\n'
      } else {
        this.output += '\n\n'
      }
      return
    }
    // A9: 直前が html block で出力が改行済み (raw の末尾改行) のときは、
    // 区切りの改行を足さない。足すと空行が1つ挿入されてしまう。
    if (this.lastDocBlockType === 'html_block_atom' && this.output.endsWith('\n')) {
      return
    }
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
        // 見出しの文字は `# ` の後に続くので、行頭の記法の対象にならない。
        // 末尾の閉じの `#` だけ、書き終えた文字列に対して S1 のときエスケープする。
        let inline = this.serializeInlineContent(node, false)
        if (this.escapeSyntax) inline = escapeHeadingClosingSequence(inline)
        this.output += prefix + hashes + ' ' + inline
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
        // 空の codeBlock は open/close を隣接させる。間に空行を入れると、
        // リスト継続・obsidian チャンク分割で close が離れて再parseが崩れる。
        if (body.length > 0) {
          this.output += body
          if (!body.endsWith('\n')) {
            this.output += '\n'
          }
        }
        this.output += prefix + fence
        break
      }

      case 'horizontalRule':
        this.ensureBlockSeparator()
        this.output += prefix + '---'
        break

      case 'html_block_atom': {
        this.ensureBlockSeparator()
        // A6: 容器内の継続行では各行に prefix を付ける。raw の末尾改行は
        // 行分割の前に除き、最後に付け直す (top-level の verbatim を保つ)。
        const raw = (node.attrs.raw as string) ?? ''
        const stripped = raw.endsWith('\n') ? raw.slice(0, -1) : raw
        const lines = stripped.split('\n')
        lines.forEach((line, index) => {
          if (index > 0) this.output += '\n'
          this.output += line.length > 0 ? prefix + line : line
        })
        if (raw.endsWith('\n')) this.output += '\n'
        break
      }

      case NYOZE_DIRECTIVE_NODE_NAME:
        this.ensureBlockSeparator()
        this.serializeDirectiveBlock(node, prefix)
        break

      case NYOZE_PAGE_BREAK_NODE_NAME:
        this.ensureBlockSeparator()
        this.output += prefix + ':::' + PAGE_BREAK_TOKEN + '\n' + prefix + ':::'
        break

      case NYOZE_BLANK_PAGE_NODE_NAME: {
        this.ensureBlockSeparator()
        const count = (node.attrs.count as number) ?? 1
        this.output += prefix + ':::' + formatBlankPageToken(count) + '\n' + prefix + ':::'
        break
      }

      default:
        // Unknown block: try to serialize as text
        this.ensureBlockSeparator()
        this.output += prefix + node.textContent
        break
    }
  }

  private serializeDirectiveBlock(node: PMNode, prefix: string): void {
    const token = formatDirectiveToken({
      kind: node.attrs.kind,
      name: node.attrs.name,
      level: node.attrs.level,
    } as DirectiveAttrs)

    const innerWriter = this.nestedWriter(true)
    const innerChildren: PMNode[] = []
    node.forEach((child) => innerChildren.push(child))
    innerWriter.serializeBlockSequence(innerChildren)
    const innerText = innerWriter.output

    this.output += prefix + ':::' + token
    if (innerText.length > 0) {
      this.output += '\n' + innerText
    }
    this.output += '\n' + prefix + ':::'
  }

  private serializeBlockquote(node: PMNode, prefix: string): void {
    const children: PMNode[] = []
    node.forEach((child) => children.push(child))

    const innerWriter = this.nestedWriter(true)
    innerWriter.serializeBlockquoteChildren(children)
    const inner = innerWriter.output

    const lines = inner.length > 0 ? inner.split('\n') : ['']
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (i > 0) this.output += '\n'
      this.output += prefix + (line.length > 0 ? `> ${line}` : '>')
    }
  }

  /**
   * blockquote 内の block 列を直列化する。blockquote の子は常に実 CommonMark
   * block 規則で parse される (obsidian-paragraph の行単位分割の対象外) ため、
   * paragraph が連続する箇所だけ blank line で区切り (lazy continuation で
   * 再吸収されるのを防ぐ)、それ以外の隣接 block は単一改行で繋ぐ。
   */
  private serializeBlockquoteChildren(children: PMNode[]): void {
    children.forEach((child, index) => {
      if (index > 0) {
        const previous = children[index - 1]
        if (
          previous.type.name === 'paragraph' &&
          child.type.name === 'paragraph' &&
          !this.isSelfDelimitingQuoteParagraph(previous) &&
          !startsWithNoteAnchor(child)
        ) {
          if (this.output.endsWith('\n\n')) {
            // already separated
          } else if (this.output.endsWith('\n')) {
            this.output += '\n'
          } else {
            this.output += '\n\n'
          }
        } else {
          this.output += '\n'
        }
      }
      this.serializeBlock(child, '')
    })
  }

  /**
   * 引用内の段落で、直列化形が HTML block として自己区切りになるもの。
   * A1 で変換された段落 (先頭が noteAnchor の単一行) は、再parse時に
   * type-2 HTML block としてその行で終わるため、後続段落と lazy 継続で
   * 結合され得ない。引用内の強制空行を省き、原文の空行数を保つ。
   */
  private isSelfDelimitingQuoteParagraph(node: PMNode): boolean {
    if (node.type.name !== 'paragraph' || node.childCount === 0) return false
    if (node.firstChild?.type.name !== 'noteAnchor') return false
    let singleLine = true
    node.forEach((child) => {
      if (child.type.name === 'hardBreak') singleLine = false
      else if (child.isText && (child.text ?? '').includes('\n')) singleLine = false
    })
    return singleLine
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

      // A7 の空段落補完で先頭が空段落の項目は、marker 行に次の block を載せる。
      // `- ` のスタブ行を出すと再parseで行が増える。次の子が段落でない
      // 2子項目に限り、読み直しで空段落が補完されるため安全に省ける。
      const itemKids: PMNode[] = []
      listItem.forEach((child) => {
        itemKids.push(child)
      })
      // チェックリスト項目は除く：空の先頭段落が `- [x]` 行の意味を持ち、
      // 省くと次の block が `[x]` の横に付いて壊れる (phase5-checklist 回帰)。
      const skipEmptyHead =
        checked !== true &&
        checked !== false &&
        itemKids.length === 2 &&
        itemKids[0].type.name === 'paragraph' &&
        itemKids[0].childCount === 0 &&
        itemKids[1].type.name !== 'paragraph'

      let first = true
      itemKids.forEach((child, childIndex) => {
        // 空の先頭段落を省く場合も、次の子が marker 行の主役になる。
        if (skipEmptyHead && childIndex === 0) return
        if (first) {
          const writer = this.nestedWriter(false)
          writer.serializeBlock(child, '')
          const childOutput = writer.output.trimStart()
          // 先頭の子が複数行 (fence・引用等) のとき、2行目以降は contPrefix で
          // 字下げする。列頭に出すと close fence や引用行が項目から外れる (A6)。
          // 段落テキストの継続行は lazy 継続で戻るため原文どおり列頭に置く。
          const [head, ...tail] = childOutput.split('\n')
          const indentedTail = tail
            .map((line) => (line.length > 0 && child.type.name !== 'paragraph' ? contPrefix + line : line))
            .join('\n')
          const indented = indentedTail.length > 0 ? `${head}\n${indentedTail}` : head
          if (checkboxToken && indented) {
            this.output += itemPrefix + ' ' + indented
          } else {
            this.output += itemPrefix + indented
          }
          first = false
        } else {
          this.output += '\n'
          const writer = this.nestedWriter(false)
          writer.serializeBlock(child, contPrefix)
          this.output += writer.output
        }
      })
    })
  }

  /**
   * @param startsAtLineStart 内容の先頭が行頭（container の接頭辞の後）に来るか。
   *   段落は true、見出しは `# ` の後なので false（ESCAPE1 の行頭の記法の判定に使う）。
   */
  private serializeInlineContent(node: PMNode, startsAtLineStart = true): string {
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

      if (child.type.name === 'noteAnchor') {
        // 付箋アンカーは必ず正規 comment 形式へ戻す (Markdown 保存で位置を保持)
        for (let i = activeMarks.length - 1; i >= 0; i--) {
          result += closeDelim(activeMarks[i])
        }
        activeMarks = []
        result += formatNoteAnchorComment((child.attrs.id as string) ?? '')
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
      // code の mark の中は S1 でも足さない（バッククォートで包んだ文字そのもの）。
      const syntaxEscape = this.escapeSyntax && !childMarks.some((mark) => mark.type.name === 'code')
      if (hasLinkMark(childMarks)) {
        const bracketEscaped = escapeMarkdownBracketText(rawText)
        result += syntaxEscape ? escapeStarAndUnderscore(bracketEscaped) : bracketEscaped
      } else if (syntaxEscape) {
        result += escapeSyntaxText(rawText, isAtLineStart(result, startsAtLineStart))
      } else {
        result += rawText
      }
    }

    // Close remaining marks
    for (let i = activeMarks.length - 1; i >= 0; i--) {
      result += closeDelim(activeMarks[i])
    }

    return result
  }
}
