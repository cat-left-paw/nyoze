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
import { matchNoteAnchorComment, splitLeadingNoteAnchorComment, NOTE_ANCHOR_NODE_NAME } from './noteAnchor'
import { rescueOrphanDelimiters } from './rescueOrphanDelimiters'
import { REFERENCE_DEFINITION_TOKEN_TYPE, registerVisibleReferenceDefinition } from './referenceDefinitionLine'
import type { SourceRecorder } from './sourcePreservation'
import {
  SOURCE_SPELLING_MARK_NAME,
  hasSourceSpellings,
  registerSourceSpellingMask,
  splitSourceSpelledText,
  unmaskSourceSpellings,
  type SourceSpellingEnv,
} from './sourceSpelling'
import {
  NYOZE_BLANK_PAGE_NODE_NAME,
  NYOZE_DIRECTIVE_NODE_NAME,
  NYOZE_PAGE_BREAK_NODE_NAME,
  PAGE_BREAK_TOKEN,
  formatBlankPageToken,
  matchFencedCodeOpen,
  splitDirectiveSegments,
  type DirectiveSegment,
} from './customBlockDirective'

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
// MD-ROUNDTRIP-PATH1: 既定の normalizeLink はリンク先・画像 src の非ASCIIを
// percent-encodeする。Nyozeは書かれたとおりの文字を持ち、保存でもそのまま書く
// ため、恒等関数にする。危険schemeの拒否（validateLink）は残す。
// Nyoze自身の検査（validateDocumentLinkHref / classifyImageSrc）は、
// 最終的にnodeへ入る値に効く（下の link_open / image）。
// 付箋・資料のpreviewは別のinstance（noteMarkdownPreview.ts）で変えない。
md.normalizeLink = (url: string): string => url

/**
 * リンク先・画像の src が、Markdown の読み込みで受け付けられるか（この instance の
 * `validateLink(normalizeLink(url))`。危険な scheme を拒む）。CLIPBOARD-INTERNAL-PASTE3: clipboard の
 * 経路で画像を作るときも、同じ検査を使う（scheme の一覧を別に書かない）。
 */
export function isMarkdownLinkDestinationAllowed(url: string): boolean {
  return md.validateLink(md.normalizeLink(url))
}
// MD-ESCAPE-EXPLICIT1: ファイルの `\*` `\#` `&amp;` などの綴りを、文字＋元の綴り（`sourceSpelling` mark）として
// 読む。Nyoze の救済の正規表現にも、綴りのある文字を区切りとして見せない（`io/sourceSpelling.ts`）。
registerSourceSpellingMask(md)
// MD-ESCAPE-EXPLICIT1: リンクの定義の行（`[注]: 説明`）を文書から消さず、元の文字のまま持つ段落にする。
registerVisibleReferenceDefinition(md)

/**
 * `text`（1行）が、markdown-it がリンクの定義として読む行か（定義の行の表示用。`[注]:` を薄くする判定）。
 * parse と同じ instance の rule で決める。
 */
export function isReferenceDefinitionLineText(text: string): boolean {
  const tokens = md.parse(text, {})
  return tokens.length === 1 && tokens[0].type === REFERENCE_DEFINITION_TOKEN_TYPE
}

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
  /**
   * MD-SOURCE-PRESERVE1: 文書直下の子を足す単位（まとまり）ごとの、元の文字列の範囲と子の数を渡す記録先。
   * `obsidian-paragraph` の文書直下だけが記録する（装飾・引用・リストの中の再帰 parse には渡さない）。
   * 渡さない呼び出しは、今と同じ動き・同じ費用。
   */
  sourceRecorder?: SourceRecorder
}

export function parseMarkdown(
  schema: Schema,
  markdown: string,
  lineBreakPolicy: LineBreakPolicy = 'commonmark-strict',
  options?: ParseMarkdownOptions,
): PMNode {
  const normalized = normalizeLineEndings(markdown)
  // MD-SOURCE-PRESERVE1: 記録するのは obsidian-paragraph の文書直下だけ。下の再帰 parse・fallback には渡さない。
  const recorder = lineBreakPolicy === 'obsidian-paragraph' ? options?.sourceRecorder : undefined
  if (options?.sourceRecorder !== undefined) options = { ...options, sourceRecorder: undefined }
  recorder?.begin(normalized)

  // Nyoze 独自ブロック装飾 (`:::align-center` 等 / `:::page-break`) が含まれる場合だけ
  // directive 分割を行う。directive も page-break も無い文書は従来の per-policy parser
  // へそのまま委譲し、挙動を変えない。
  if (schema.nodes[NYOZE_DIRECTIVE_NODE_NAME]) {
    const segments = splitDirectiveSegments(normalized.split('\n'))
    if (
      segments.some(
        (segment) =>
          segment.type === 'directive' ||
          segment.type === 'page-break' ||
          segment.type === 'blank-page',
      )
    ) {
      return buildDocFromDirectiveSegments(schema, segments, lineBreakPolicy, options, recorder)
    }
  }

  if (lineBreakPolicy === 'obsidian-paragraph') {
    return parseObsidianParagraphMarkdown(schema, normalized, options, recorder)
  }
  return parseCommonmarkMarkdown(schema, normalized, options)
}

/**
 * directive segment 列から doc を組み立てる。
 * - plain segment は既存 per-policy parser で解析し、その block 子を取り込む。
 * - directive segment は inner を再帰 parse し、専用 node で包む (ネスト対応)。
 */
function buildDocFromDirectiveSegments(
  schema: Schema,
  segments: DirectiveSegment[],
  lineBreakPolicy: LineBreakPolicy,
  options?: ParseMarkdownOptions,
  recorder?: SourceRecorder,
): PMNode {
  const children: PMNode[] = []

  for (const segment of segments) {
    if (segment.type === 'plain') {
      const chunk = segment.lines.join('\n')
      if (lineBreakPolicy === 'obsidian-paragraph') {
        const mark = recorder?.mark()
        const parsed = readObsidianParagraphChildren(schema, chunk, options, recorder, segment.startLine)
        if (parsed.length === 0) {
          // 子を1つも作らない plain segment（参照の定義の行だけなど）は、従来どおり空段落を1つ足す。
          // その子は元の行から作ったものではないので、segment 全体を1つの synthetic chunk として記録する。
          if (recorder) {
            recorder.rewind(mark ?? 0)
            recorder.addChunk(segment.startLine, segment.endLine, 1, true)
          }
          children.push(createParagraphNode(schema, ''))
        } else {
          parsed.forEach((child) => children.push(child))
        }
      } else {
        const parsed = parseCommonmarkMarkdown(schema, chunk, options)
        parsed.forEach((child) => children.push(child))
      }
      continue
    }

    const before = children.length
    if (segment.type === 'page-break') {
      for (const node of buildPageBreakNode(schema, lineBreakPolicy, options)) {
        children.push(node)
      }
    } else if (segment.type === 'blank-page') {
      for (const node of buildBlankPageNode(schema, segment.count, lineBreakPolicy, options)) {
        children.push(node)
      }
    } else {
      for (const node of buildDirectiveNodes(schema, segment, lineBreakPolicy, options)) {
        children.push(node)
      }
    }
    // 装飾・改ページ・白紙のページは、開きの行から閉じの行までを1つのまとまりにする。
    recorder?.addChunk(segment.startLine, segment.endLine, children.length - before)
  }

  return createDocNode(schema, children)
}

/**
 * canonical 空 page-break directive (`:::page-break` / `:::`) から node を組み立てる。
 * schema に専用 node が無い場合は、安全側で元の fenced directive を通常
 * markdown として温存する (テキストが消えないようにする)。
 */
function buildPageBreakNode(
  schema: Schema,
  lineBreakPolicy: LineBreakPolicy,
  options?: ParseMarkdownOptions,
): PMNode[] {
  const nodeType = schema.nodes[NYOZE_PAGE_BREAK_NODE_NAME]
  if (nodeType) {
    try {
      return [nodeType.create()]
    } catch {
      // fall through to the safe fallback below
    }
  }

  const rawLines = [`:::${PAGE_BREAK_TOKEN}`, ':::']
  const parsed = lineBreakPolicy === 'obsidian-paragraph'
    ? parseObsidianParagraphMarkdown(schema, rawLines.join('\n'), options)
    : parseCommonmarkMarkdown(schema, rawLines.join('\n'), options)
  const result: PMNode[] = []
  parsed.forEach((child) => result.push(child))
  return result
}

/**
 * canonical 空 blank-page directive (`:::blank-page` / `:::blank-page-N`) から
 * node を組み立てる。schema に専用 node が無い場合は、安全側で元の fenced
 * directive を通常 markdown として温存する (テキストが消えないようにする)。
 */
function buildBlankPageNode(
  schema: Schema,
  count: number,
  lineBreakPolicy: LineBreakPolicy,
  options?: ParseMarkdownOptions,
): PMNode[] {
  const nodeType = schema.nodes[NYOZE_BLANK_PAGE_NODE_NAME]
  if (nodeType) {
    try {
      return [nodeType.create({ count })]
    } catch {
      // fall through to the safe fallback below
    }
  }

  const rawLines = [`:::${formatBlankPageToken(count)}`, ':::']
  const parsed = lineBreakPolicy === 'obsidian-paragraph'
    ? parseObsidianParagraphMarkdown(schema, rawLines.join('\n'), options)
    : parseCommonmarkMarkdown(schema, rawLines.join('\n'), options)
  const result: PMNode[] = []
  parsed.forEach((child) => result.push(child))
  return result
}

function buildDirectiveNodes(
  schema: Schema,
  segment: Extract<DirectiveSegment, { type: 'directive' }>,
  lineBreakPolicy: LineBreakPolicy,
  options?: ParseMarkdownOptions,
): PMNode[] {
  const nodeType = schema.nodes[NYOZE_DIRECTIVE_NODE_NAME]
  const innerSource = segment.inner.join('\n')
  // 再帰 parse でネストした directive も解決する。
  const innerDoc = parseMarkdown(schema, innerSource, lineBreakPolicy, options)

  const content: PMNode[] = []
  innerDoc.forEach((child) => content.push(child))
  if (content.length === 0) {
    content.push(createParagraphNode(schema, ''))
  }

  const { kind, name, level } = segment.descriptor
  try {
    return [nodeType.create({ kind, name, level }, content)]
  } catch {
    // schema 制約で生成に失敗した場合は内容を温存して通常 block 列として返す。
    return content
  }
}

function parseCommonmarkMarkdown(schema: Schema, markdown: string, options?: ParseMarkdownOptions): PMNode {
  const env: SourceSpellingEnv = { source: markdown }
  const tokens = md.parse(markdown, env)
  const builder = new DocBuilder(schema, markdown, options, env)
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

/**
 * MD-ROUNDTRIP-INDENT1: 行頭の字下げ幅を CommonMark と同じ数え方で求める。
 * 行頭の半角スペースとタブだけを数え、タブは次の4の倍数の桁まで進む。
 * U+3000 の全角スペースを含むそれ以外の文字が来たら数えるのをやめる。
 */
function measureLeadingIndentWidth(line: string): number {
  let column = 0
  for (const char of line) {
    if (char === ' ') column += 1
    else if (char === '\t') column += 4 - (column % 4)
    else break
  }
  return column
}

/**
 * MD-ROUNDTRIP-CHUNK1: 引用でない構造の行から始まる chunk の読み方を決める。
 * R1（`<` で始まる行・`|` で始まる行の後ろの行も行ごとに読む）。
 *
 * - 先頭の1行だけを parse して最初の block の種類を決める。
 * - `html_block`・`bullet_list`・`ordered_list` のときだけ、その block の範囲
 *  （token の `map`）までを chunk にし、`appendCommonmarkChunk` で読む。
 *   範囲が要る場合だけ窓（parse する行数）を倍にしながら parse し、最初の
 *   block の `map[1]` が窓の終わりより前に来たら（次の行まで見て終わりが
 *   決まったら）その値を使う。窓が chunk の終わりに達したらそこまでとする。
 *   各 head が1行以上消費し、窓の cost は消費行数の定数倍に償却されるので、
 *   空行のない原稿でも2乗に増えない。
 * - `map` がない・範囲がおかしい（先頭の行より前・chunk の外）ときは、
 *   従来どおり chunk 全体へ倒す（fail-closed）。
 * - 先頭が `hr`（`- - -` など）のときはその1行だけを chunk にする。後ろの行を
 *   含めると setext の見出しに読まれ得る（`map` の範囲と同じ）。
 * - 表の各行: `|` で始まる行が続けば1つの chunk に保つ（書き出しで表として
 *   扱うため）。単独の `|` 行＋非 `|` 行は1行に切る。
 * - 段落・setext の見出しなど（表の連続を除く）の先頭の1行は、
 *   `parseObsidianPlainLine` で読む（行頭・行末の空白を保つ。R1）。
 *   後ろの行を CommonMark の段落の続き・setext の見出し・indented code
 *   として読まない。
 * - `<div>` などの次の空行まで続く HTML block（X1）は chunk 全体のまま。
 */
function resolveNonQuoteStructuralChunk(
  lines: string[],
  index: number,
): { next: number; plain: boolean } {
  let end = index + 1
  while (end < lines.length && lines[end] !== '') {
    end++
  }
  const total = end - index
  let window = 1
  for (;;) {
    const tokens = md.parse(lines.slice(index, index + window).join('\n'), {})
    const first = tokens[0]
    const map = first?.map
    if (!Array.isArray(map) || map[0] !== 0 || map[1] <= 0 || map[1] > window) {
      return { next: end, plain: false }
    }
    if (
      first.type === 'html_block' ||
      first.type === 'bullet_list_open' ||
      first.type === 'ordered_list_open'
    ) {
      if (map[1] < window) return { next: index + map[1], plain: false }
      if (window >= total) return { next: end, plain: false }
      window = Math.min(window * 2, total)
      continue
    }
    if (first.type === 'hr') return { next: index + 1, plain: false }
    // 表の各行: `|` で始まる行が続けば1つの chunk に保つ。1行ずつに切ると
    // 段落が割れて表が壊れる（単独の `|` 行＋非 `|` 行は1行に切る）。
    if (isTableLikeLine(lines[index] ?? '') && isTableLikeLine(lines[index + 1] ?? '')) {
      let run = index + 1
      while (run < end && isTableLikeLine(lines[run] ?? '')) {
        run++
      }
      return { next: run, plain: false }
    }
    return { next: index + 1, plain: true }
  }
}

/** `isStructuralLine` の `|` 行の判定と同じ（GFM の表の行・区切り行）。 */
function isTableLikeLine(line: string): boolean {
  return /^\|.*\|$/.test(line.trimStart())
}

function parseObsidianParagraphMarkdown(
  schema: Schema,
  markdown: string,
  options?: ParseMarkdownOptions,
  recorder?: SourceRecorder,
): PMNode {
  return createDocNode(schema, readObsidianParagraphChildren(schema, markdown, options, recorder, 0))
}

/**
 * 行の loop。1回で読んだ行の範囲（まとまり）と、足した子の数を `recorder` へ渡す（MD-SOURCE-PRESERVE1）。
 * `baseLine` は、装飾の segment の中の plain segment が元の文書の何行目から始まるか。
 */
function readObsidianParagraphChildren(
  schema: Schema,
  markdown: string,
  options: ParseMarkdownOptions | undefined,
  recorder: SourceRecorder | undefined,
  baseLine: number,
): PMNode[] {
  const lines = markdown.split('\n')
  const children: PMNode[] = []
  for (let index = 0; index < lines.length;) {
    const before = children.length
    const next = readObsidianChunk(schema, lines, index, children, options)
    recorder?.addChunk(baseLine + index, baseLine + next, children.length - before)
    index = next
  }
  return children
}

/**
 * MD-SOURCE-PRESERVE1: 行の loop が、この行を「後ろの行を見ずに、その1行だけで1つのまとまりにする」行か。
 * `readObsidianChunk` の分岐のうち、空行・幅4以上の字下げの行・段落系の通常の行（fence の開き・水平線・構造の行でない）。
 * このような行だけが並ぶ文字列は、各行が前後の行に左右されず、行ごとに読んだ結果を並べたものになる
 * （装飾の `:::` の対応は行の loop の外なので、この判定は `:::` を含む行を扱わない。呼び出し側が先に除く）。
 */
export function isSelfContainedObsidianLine(line: string): boolean {
  if (line.length === 0 || measureLeadingIndentWidth(line) >= 4) return true
  return !(isFencedCodeStart(line) || isThematicBreakLine(line) || isStructuralLine(line))
}

/** 行の loop の1回分。子を `children` へ足し、次に読む行の添字を返す。 */
function readObsidianChunk(
  schema: Schema,
  lines: string[],
  index: number,
  children: PMNode[],
  options?: ParseMarkdownOptions,
): number {
  const line = lines[index] ?? ''

  if (line.length === 0) {
    children.push(createParagraphNode(schema, ''))
    return index + 1
  }

  // MD-ROUNDTRIP-INDENT1: 幅4以上の字下げの行は chunk の先頭で通常段落として読む。
  // R1（行頭空白は保持する）に従い、indented code block として読まない。
  // `  ## 見出し` と同じく parseObsidianPlainLine へ1行ずつ渡す。
  if (measureLeadingIndentWidth(line) >= 4) {
    children.push(parseObsidianPlainLine(schema, line, options))
    return index + 1
  }

  const fencedChunk = readFencedCodeChunk(lines, index)
  if (fencedChunk) {
    appendCommonmarkChunk(schema, fencedChunk.chunk, children, options)
    return fencedChunk.nextLine
  }

  if (isThematicBreakLine(line)) {
    appendCommonmarkChunk(schema, line, children, options)
    return index + 1
  }

  if (isStructuralLine(line)) {
    let next = index + 1
    if (isBlockquoteLine(line)) {
      // CommonMark's lazy continuation would otherwise absorb any
      // following non-blank line into the blockquote's last paragraph.
      // Nyoze's per-line obsidian-paragraph editing model treats a line
      // without a `>` marker as always outside the quote, so only keep
      // consuming lines that themselves carry the marker.
      while (next < lines.length && lines[next] !== '' && isBlockquoteLine(lines[next])) {
        next++
      }
    } else {
      // MD-ROUNDTRIP-CHUNK1: html_block・リスト・hr・表の連続は block の範囲
      // だけを chunk にして CommonMark で読み、段落系の先頭の1行は
      // parseObsidianPlainLine で読む（行頭・行末の空白を保つ）。
      // 後ろの行は行の loop へ戻す。
      const resolved = resolveNonQuoteStructuralChunk(lines, index)
      if (resolved.plain) {
        children.push(parseObsidianPlainLine(schema, lines[index] ?? '', options))
      } else {
        appendCommonmarkChunk(schema, lines.slice(index, resolved.next).join('\n'), children, options)
      }
      return resolved.next
    }
    appendCommonmarkChunk(schema, lines.slice(index, next).join('\n'), children, options)
    return next
  }

  children.push(parseObsidianPlainLine(schema, line, options))
  return index + 1
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

      // markdown-it が見出し構文の delimiter (ASCII space / tab) を消費し、
      // U+3000 は inline text としてすでに保持する。ここで U+3000 まで
      // marker padding として復元すると、本文の先頭へ二重に追加してしまう。
      const markerMatch = body.match(/^(#{1,6})([ \t]+)([\s\S]*)$/)
      const markerPadding = markerMatch && markerMatch[2].length > 1
        ? markerMatch[2].slice(1)
        : ''

      const content: PMNode[] = []
      if (markerPadding.length > 0) {
        content.push(schema.text(markerPadding))
      }
      heading.forEach((child) => content.push(child))
      // A5: 空の見出し (marker padding も本文も無い) に trailing 空白を足さない。
      // 足すと heading[hardBreak] になり、直後の本文との間に空行が挿入される。
      if (trailing.length > 0 && content.length > 0) {
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
  if (isTableLikeLine(line)) return true
  if (/^<[^>]+>/.test(trimmed)) return true
  // MD-ROUNDTRIP-INDENT1: 行頭の字下げ（半角4スペース・タブ）は構造の印にしない。
  // 幅4以上の字下げの行は loop の先頭で通常段落として処理済みのため、
  // ここに `/^(?: {4}|\t)/` の判定を残さない（意味が二重になる）。
  return false
}

function isBlockquoteLine(line: string): boolean {
  return /^>/.test(line.trimStart())
}

function isThematicBreakLine(line: string): boolean {
  return /^(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())
}

function isFencedCodeStart(line: string): boolean {
  return matchFencedCodeOpen(line) !== null
}

function readFencedCodeChunk(
  lines: string[],
  start: number,
): { chunk: string; nextLine: number } | null {
  const firstLine = lines[start] ?? ''
  const open = matchFencedCodeOpen(firstLine)
  if (!open) return null

  const fenceChar = open.fenceChar
  const minFenceLength = open.fenceLength
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
  /** MD-ESCAPE-EXPLICIT1: 綴りのある文字の目印と元の綴り（parse 1回分。text を作るところで戻す）。 */
  private escapedCharEnv: SourceSpellingEnv

  constructor(schema: Schema, source: string, options?: ParseMarkdownOptions, env?: SourceSpellingEnv) {
    this.escapedCharEnv = env ?? { source }
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
        this.openBlock('paragraph', null, leadingWs, tok.map ?? null)
        break
      }
      case 'paragraph_close':
        this.closeBlock()
        break

      case 'heading_open':
        this.openBlock('heading', { level: parseInt(tok.tag.slice(1), 10) }, undefined, tok.map ?? null)
        break
      case 'heading_close':
        this.closeBlock()
        break

      case 'blockquote_open':
        this.openBlock('blockquote', null, undefined, tok.map ?? null)
        break
      case 'blockquote_close':
        this.closeBlock()
        break

      case 'bullet_list_open':
        this.openBlock('bulletList', null, undefined, tok.map ?? null)
        break
      case 'bullet_list_close':
        this.closeBlock()
        break

      case 'ordered_list_open':
        this.openBlock('orderedList', { start: tok.attrGet('start') ? Number(tok.attrGet('start')) : 1 }, undefined, tok.map ?? null)
        break
      case 'ordered_list_close':
        this.closeBlock()
        break

      case 'list_item_open':
        this.openBlock('listItem', { checked: null }, undefined, tok.map ?? null)
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
        this.excludePreservedParagraphLeadingWs(tok.content)
        if (tok.children) {
          this.processInlineTokens(tok.children)
        }
        break

      // --- Raw HTML block ---
      case 'html_block':
        this.addHtmlBlockAtom(tok)
        break

      // --- Link reference definition line (MD-ESCAPE-EXPLICIT1) ---
      case REFERENCE_DEFINITION_TOKEN_TYPE:
        this.addReferenceDefinitionParagraph(tok)
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
          const alt = unmaskSourceSpellings(this.escapedCharEnv, extractImageAltFromToken(tok))
          const src = tok.attrGet('src') ?? ''
          const titleRaw = tok.attrGet('title')
          const title = titleRaw === null ? null : unmaskSourceSpellings(this.escapedCharEnv, titleRaw)
          this.addImageNode(src, alt, title)
          break
        }

        case 'html_inline': {
          // 付箋アンカー comment に厳密一致する場合のみ専用 noteAnchor node にする。
          // それ以外の inline HTML は従来どおり html_inline_atom として保持する。
          const noteAnchorId = matchNoteAnchorComment(tok.content)
          if (noteAnchorId !== null) {
            this.addNoteAnchorNode(noteAnchorId, tok.content)
          } else {
            this.addHtmlInlineAtom(tok.content)
          }
          break
        }

        default:
          // Unknown inline token -> treat as text if it has content
          if (tok.content) {
            this.addText(tok.content, frame.marks)
          }
          break
      }
    }
  }

  private openBlock(
    typeName: string,
    attrs?: Record<string, unknown> | null,
    leadingWs?: string,
    map?: readonly [number, number] | null,
  ): void {
    this.blockStack.push({
      type: typeName,
      attrs: attrs ?? null,
      children: [],
      marks: [],
      leadingWs,
      map: map ?? null,
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

  /**
   * markdown-it が inline token に残した段落先頭空白は、source からの復元対象から除く。
   *
   * markdown-it 14.3 では全角スペースを inline content に保持する一方、CommonMark の
   * 0〜3個の半角スペースは従来どおり block indentation として除去する。このため、
   * source 側 leading whitespace のうち inline content に既に残った suffix を差し引き、
   * 実際に失われた prefix だけを closeBlock() で復元する。
   */
  private excludePreservedParagraphLeadingWs(inlineContent: string): void {
    const frame = this.currentFrame()
    const leadingWs = frame.type === 'paragraph' ? frame.leadingWs : undefined
    if (!leadingWs || !inlineContent) return

    for (let length = leadingWs.length; length > 0; length -= 1) {
      if (!inlineContent.startsWith(leadingWs.slice(-length))) continue
      frame.leadingWs = leadingWs.slice(0, leadingWs.length - length)
      return
    }
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
    // Ensure blocks that require content have at least one child.
    // 空を許す content (paragraph / heading の inline*) は補完しない (A5)。
    // 空段落・空見出しは空のまま作り、hardBreak を混入させない。
    if (children.length === 0 && nodeType.spec.content && frame.type !== 'paragraph' && frame.type !== 'heading') {
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
      // A7: 検証に失敗した block は捨てず、3段階で保全する。
      // (1) リスト項目は先頭が段落でなければ空段落を補って作り直す。
      if (frame.type === 'listItem' && this.tryCloseListItemWithEmptyParagraph(frame, children)) return
      // (2) リスト自体が作れないときは子を親へ展開する。
      if ((frame.type === 'bulletList' || frame.type === 'orderedList') && this.expandFailedList(frame, children)) return
      // (3) それでも作れないリスト項目は元の行の文字を段落として残す (fail-closed)。
      if (frame.type === 'listItem' && this.tryCloseAsSourceParagraph(frame)) return
      // If node creation fails (invalid content), wrap as paragraph
      if (frame.type !== 'paragraph') {
        const p = this.schema.node('paragraph', null, children.filter(
          (c) => c.isInline
        ))
        this.currentFrame().children.push(p)
      }
    }
  }

  /**
   * A7-(1): 先頭が段落でないリスト項目の先頭に空段落を補い、項目として保全する。
   * content `paragraph block*` への適合が目的で、子の順序・内容は変えない。
   */
  private tryCloseListItemWithEmptyParagraph(frame: BlockFrame, children: PMNode[]): boolean {
    const paragraphType = this.schema.nodes['paragraph']
    if (!paragraphType) return false
    try {
      const node = this.schema.node(
        frame.type,
        frame.attrs ?? null,
        [paragraphType.create(null), ...children],
      )
      this.currentFrame().children.push(node)
      return true
    } catch {
      return false
    }
  }

  /**
   * A7-(2): リスト自体の検証に失敗したとき、子 (項目由来の段落など) を親へ展開する。
   * push 自体は検証を伴わないため失敗しない。戻り値は将来の拡張のための予約で、
   * 常に true を返す。
   */
  private expandFailedList(_frame: BlockFrame, children: PMNode[]): boolean {
    for (const child of children) {
      this.currentFrame().children.push(child)
    }
    return true
  }

  /**
   * A7-(3): 最後の手段として、開き token の行範囲の原文を段落として残す。
   * map が無い (合成 frame) ときは false を返し、呼び出し側の従来処理へ委ねる。
   */
  private tryCloseAsSourceParagraph(frame: BlockFrame): boolean {
    if (frame.map == null) return false
    const [fromLine, toLine] = frame.map
    const start = lineToOffset(this.lineStartOffsets, fromLine, this.source.length)
    const end = lineToOffset(this.lineStartOffsets, toLine, this.source.length)
    let textContent = this.source.slice(start, end)
    if (textContent.endsWith('\n')) textContent = textContent.slice(0, -1)
    try {
      const paragraphType = this.schema.nodes['paragraph']
      if (!paragraphType) return false
      const content = textContent.length > 0 ? [this.schema.text(textContent)] : []
      this.currentFrame().children.push(paragraphType.create(null, content))
      return true
    } catch {
      return false
    }
  }

  private addText(text: string, marks: MarkEntry[]): void {
    const pmMarks = this.toPmMarks(marks)
    const env = this.escapedCharEnv
    if (!hasSourceSpellings(env)) {
      this.currentFrame().children.push(this.schema.text(text, pmMarks))
      return
    }
    // MD-ESCAPE-EXPLICIT1: 綴りのある文字（`\*` `&amp;` など）は、文字に戻して `sourceSpelling` mark を付ける
    // （mark の type が schema に無ければ、文字だけ）。
    const spellingType = this.schema.marks[SOURCE_SPELLING_MARK_NAME]
    for (const run of splitSourceSpelledText(env, text)) {
      if (run.text.length === 0) continue
      const runMarks = run.raw !== null && spellingType ? [...pmMarks, spellingType.create({ raw: run.raw })] : pmMarks
      this.currentFrame().children.push(this.schema.text(run.text, runMarks))
    }
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
    const hasUnderline = this.schema.marks['underline']
    if (!hasRuby && !hasTcy && !hasHighlight && !hasBold && !hasItalic && !hasStrike && !hasUnderline) {
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
      } else if (match[10] !== undefined && hasUnderline) {
        // Underline match: group [10] (||text||) — recurse for ruby/tcy/etc. inside
        this.addTextWithAozora(match[10], [...marks, { name: 'underline', attrs: {} }])
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
    // base・ruby の目印を元の文字へ戻す（綴りの mark は付けない。失敗時の addText は mark を付ける）。
    const textNode = this.schema.text(unmaskSourceSpellings(this.escapedCharEnv, base))
    const pmMarks = this.toPmMarks(marks)
    try {
      this.currentFrame().children.push(
        nodeType.create({ ruby: unmaskSourceSpellings(this.escapedCharEnv, ruby), hasDelimiter }, [textNode], pmMarks),
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
    const textNode = this.schema.text(unmaskSourceSpellings(this.escapedCharEnv, body))
    const pmMarks = this.toPmMarks(marks)
    try {
      this.currentFrame().children.push(
        nodeType.create(null, [textNode], pmMarks),
      )
    } catch {
      this.addText(`｟${body}｠`, marks)
    }
  }

  /**
   * MD-ROUNDTRIP-INLINE-MARK1: 同じ種類の mark が2つ以上あれば、最初の1つだけを残す。
   * `**a **b** c**` のような入れ子（と、変更前の保存が書いた `*a ****b**** c*`）は、同じ
   * 太字が重なって積まれるが、PM の mark の組としては不正なので1つにする。`addToSet()` は
   * code の `excludes: '_'` で太字などが消えるため使わない。
   */
  private toPmMarks(marks: MarkEntry[]) {
    const seen = new Set<string>()
    const pmMarks = []
    for (const m of marks) {
      const markType = this.schema.marks[m.name]
      if (!markType || seen.has(m.name)) continue
      seen.add(m.name)
      pmMarks.push(markType.create(m.attrs))
    }
    return pmMarks
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

  private addNoteAnchorNode(id: string, raw: string): void {
    const nodeType = this.schema.nodes[NOTE_ANCHOR_NODE_NAME]
    if (!nodeType) {
      // Schema に noteAnchor がない場合は元の comment をそのまま保持する
      this.addHtmlInlineAtom(raw)
      return
    }
    this.currentFrame().children.push(nodeType.create({ id }))
  }

  private addHtmlInlineAtom(raw: string): void {
    const nodeType = this.schema.nodes['html_inline_atom']
    if (!nodeType) return
    this.currentFrame().children.push(
      nodeType.create({ raw })
    )
  }

  /** MD-ESCAPE-EXPLICIT1: リンクの定義の行を、元の文字のまま持つ段落にする（改行は hardBreak）。 */
  private addReferenceDefinitionParagraph(tok: Token): void {
    const paragraphType = this.schema.nodes['paragraph']
    if (!paragraphType) return
    const hardBreakType = this.schema.nodes['hardBreak']
    const children: PMNode[] = []
    tok.content.split('\n').forEach((line, index) => {
      if (index > 0 && hardBreakType) children.push(hardBreakType.create())
      if (line.length > 0) children.push(this.schema.text(line))
    })
    this.currentFrame().children.push(paragraphType.create(null, children))
  }

  private addHtmlBlockAtom(tok: Token): void {
    // A1: 行頭が付箋アンカーの html_block は段落として読む。
    // markdown-it の type-2 ブロックは `-->` のある行で終わるため、対象は常に1行。
    if (this.tryAddNoteAnchorParagraph(tok)) return
    const nodeType = this.schema.nodes['html_block_atom']
    if (!nodeType) return
    const raw = this.extractRawByLineMap(tok)
    this.currentFrame().children.push(
      nodeType.create({ raw })
    )
  }

  private tryAddNoteAnchorParagraph(tok: Token): boolean {
    if (!tok.map || tok.map[1] - tok.map[0] !== 1) return false
    const lineText = tok.content.endsWith('\n') ? tok.content.slice(0, -1) : tok.content
    if (splitLeadingNoteAnchorComment(lineText) === null) return false
    this.openBlock('paragraph')
    // 行全体を inline として読み直す。行頭のアンカーは既存 html_inline 経路で
    // noteAnchor になり、行途中の扱いと一致する。
    const inlineTokens = md.parseInline(lineText, this.escapedCharEnv)
    const inline = inlineTokens[0]
    if (inline?.children) {
      this.processInlineTokens(inline.children)
    }
    this.closeBlock()
    return true
  }

  private extractRawByLineMap(tok: Token): string {
    // A6: 容器の中 (blockquote / list item 等) では markdown-it が接頭辞を除いた
    // tok.content を使う。行 map の slice は `> ` 等を含むため二重化する。
    // content の末尾改行は除く (容器内の結合で空行が挿入されてしまうため)。
    // top-level は従来どおり行 map の slice (原文の verbatim 保持)。
    if (tok.level > 0) {
      const content = tok.content
      return content.endsWith('\n') ? content.slice(0, -1) : content
    }
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
  /** Source line range of the block open token (fail-closed source fallback only) */
  map?: readonly [number, number] | null
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
