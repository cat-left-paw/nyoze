import { Fragment, Mark, type Node as PMNode } from '@tiptap/pm/model'
import type { LineBreakPolicy, MarkdownDocumentOptions } from '../types'
import { supportsPreservedEmptyParagraphBoundary } from './emptyParagraphPreservation'
import {
  chooseCodeFence,
  escapeMarkdownBracketText,
  escapeMarkdownTitle,
  escapeMarkdownUrlDestination,
} from './markdownEscaping'
import { hasUnspelledBackslash } from './markdownBackslashEligibility'
import { MarkdownSaveInlineWriter, SAVE_BRACKET_ESCAPES, markdownSaveAlt, markdownSaveDestination, markdownSaveTitle } from './markdownSaveEscaping'
import { encodeAozoraInlineNode } from './clipboardSlicePlainText'
import {
  analyzeInlineMarks,
  formatCodeSpan,
  hasInlineMarks,
  planInlineMarks,
  type InlineMarkItem,
  type InlineMarkLayoutStyle,
  type InlineMarkPlan,
  type InlineMarkStripMode,
  type InlineMarkTraits,
  type PlannedSegment,
} from './inlineMarkLayout'
import { isReferenceDefinitionLineText, isSelfContainedObsidianLine, parseMarkdown } from './parseMarkdown'
import {
  classifyObsidianSeparator,
  resolveObsidianSeparator,
  serializeWithSource,
  type SegmentKind,
  type SourcePreservationInput,
} from './sourcePreservation'
import { decodeSourceSpelling, SOURCE_SPELLING_MARK_NAME, writeSourceSpelling } from './sourceSpelling'
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
 * - MD-ESCAPE-EXPLICIT1: 記号にエスケープを足さない。見える `\` は必要なときだけ `\\` と書く（MD-ESCAPE-BACKSLASH1）。ファイルにあった
 *   `\*` や `&amp;` は `sourceSpelling` mark が覚えていて、その文字を元の綴りで書く（`formatInlineSegment`）。
 * - INLINE-MARK1: 段落・見出しの装飾の入れ子と端の空白は `inlineMarkLayout.ts` が決める。
 *   端の空白から太字・斜体・取り消し線を外した block（N1 の後）と、各候補を読み直した block を比べる。
 */

function openDelim(name: string): string {
  switch (name) {
    case 'bold': return '**'
    case 'italic': return '*'
    case 'strike': return '~~'
    case 'highlight': return '=='
    case 'underline': return '||'
    case 'link': return '['
    default: return ''
  }
}

function closeDelim(name: string, link: Mark | null, protectBackslashes: boolean): string {
  switch (name) {
    case 'bold': return '**'
    case 'italic': return '*'
    case 'strike': return '~~'
    case 'highlight': return '=='
    case 'underline': return '||'
    case 'link': {
      if (link === null) return ']'
      const href = (link.attrs.href as string) ?? ''
      const title = link.attrs.title as string | undefined
      const safeHref = protectBackslashes ? markdownSaveDestination(href, Boolean(title)) : escapeMarkdownUrlDestination(href)
      if (title) return `](${safeHref} ${protectBackslashes ? markdownSaveTitle(title) : `"${escapeMarkdownTitle(title)}"`})`
      return `](${safeHref})`
    }
    default: return ''
  }
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
  const commonChildMarks = commonTextChildMarks(node)

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

/** Marks common to ALL text children of an inline node (none if any child is not text). */
function commonTextChildMarks(node: PMNode): Mark[] {
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
  return childCommon ?? []
}

/**
 * INLINE-MARK1: 読み直した block で期待する、ルビ・縦中横の mark の置き場。
 * ルビ・縦中横を読み込むと、mark は node に付き、中の text には付かない。ツールバーで付けた mark は
 * 中の text に付く（書き出しは node の mark と、中の text すべてに共通の mark を同じに扱う。
 * `resolveInlineNodeMarks`）ので、中の text に共通の mark を node へ移した node を返す。
 * 共通の mark が無ければ、同じ node をそのまま返す。N1 と同じ、開き直した形への正規化で、出力の文字列は変えない。
 */
function moveCommonChildMarksToNode(node: PMNode): PMNode {
  const common = commonTextChildMarks(node)
  if (common.length === 0) return node
  const children: PMNode[] = []
  node.forEach((child) => {
    let marks = child.marks
    for (const mark of common) marks = mark.removeFromSet(marks)
    children.push(child.mark(marks))
  })
  return node.type.create(
    node.attrs,
    Fragment.fromArray(children),
    common.reduce<readonly Mark[]>((set, mark) => mark.addToSet(set), node.marks),
  )
}

export function serializeMarkdown(
  doc: PMNode,
  lineBreakPolicy: LineBreakPolicy = 'commonmark-strict',
  options?: MarkdownDocumentOptions,
  sourcePreservation?: SourcePreservationInput,
): string {
  // MD-SOURCE-PRESERVE1: 編集していないブロックは、読み込んだときの元の文字列のまま書く。入口を渡さない呼び出し
  // （段落プレーン編集の入力欄・Local Window の recovery の書き出し・HTML の書き出しなど）は、今と同じ。
  // 対応がとれない・設定が違う・境目の確かめが合わない・例外のときは null で、下の今どおりの書き出しへ倒す。
  if (sourcePreservation && lineBreakPolicy === 'obsidian-paragraph') {
    const preserved = serializePreservingSource(doc, options, sourcePreservation)
    if (preserved !== null) return preserved
  }
  const serializer = new MarkdownWriter(lineBreakPolicy, options)
  serializer.serializeDoc(doc)
  return serializer.getOutput()
}

/** 文書直下の子の、装飾の segment 上の種類（`splitDirectiveSegments` の結果と並べて比べる）。 */
function classifyChildSegmentKind(child: PMNode): SegmentKind {
  switch (child.type.name) {
    case NYOZE_DIRECTIVE_NODE_NAME:
      return {
        type: 'directive',
        token: formatDirectiveToken({
          kind: child.attrs.kind,
          name: child.attrs.name,
          level: child.attrs.level,
        } as DirectiveAttrs),
      }
    case NYOZE_PAGE_BREAK_NODE_NAME:
      return { type: 'page-break' }
    case NYOZE_BLANK_PAGE_NODE_NAME:
      return { type: 'blank-page', count: (child.attrs.count as number) ?? 1 }
    default:
      return { type: 'plain' }
  }
}

function serializePreservingSource(
  doc: PMNode,
  options: MarkdownDocumentOptions | undefined,
  input: SourcePreservationInput,
): string | null {
  const children: PMNode[] = []
  doc.forEach((child) => {
    children.push(child)
  })
  return serializeWithSource({
    children,
    input,
    settings: { enableRuby: input.enableRuby, preserveEmptyParagraphs: options?.preserveEmptyParagraphs === true },
    ports: {
      renderChild: (child) => new MarkdownWriter('obsidian-paragraph', options).renderTopLevelBlockText(child),
      parseChildren: (text, settings) => {
        try {
          const parsed = parseMarkdown(doc.type.schema, text, 'obsidian-paragraph', {
            enableRuby: settings.enableRuby,
            preserveEmptyParagraphs: settings.preserveEmptyParagraphs,
          })
          const parsedChildren: PMNode[] = []
          parsed.forEach((child) => {
            parsedChildren.push(child)
          })
          return parsedChildren
        } catch {
          return null
        }
      },
      classifyChild: classifyChildSegmentKind,
      isSelfContainedLine: isSelfContainedObsidianLine,
    },
  })
}

/**
 * 段落の直列化形が付箋アンカー comment で始まるとき true。
 * その行は再parse時に type-2 HTML block として開くため、前段落の lazy 継続を
 * 割り込む。引用内の強制空行の要否判定に使う。
 */
function startsWithNoteAnchor(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.firstChild?.type.name === 'noteAnchor'
}

/**
 * ルビ・縦中横の符号化した文字。text と、装飾を閉じて区切る inline node（画像・付箋・inline HTML・
 * hardBreak）は符号化しないので null。1つの inline に1回だけ呼ぶ。
 */
function encodeInlineChild(child: PMNode): string | null {
  if (child.isText || INLINE_SEPARATOR_TYPE_NAMES.has(child.type.name)) return null
  return encodeAozoraInlineNode(child)
}

const INLINE_SEPARATOR_TYPE_NAMES: ReadonlySet<string> = new Set(['nyoze_image', 'noteAnchor', 'html_inline_atom', 'hardBreak'])

/** INLINE-MARK1: 1回の書き出し（確かめ用の書き出しを含む）の、N1 の記録。入れ子の writer と共有する。 */
interface InlineLayoutContext {
  /** 読み直した形（N1 で端の空白から mark を外す・ルビ / 縦中横の mark を node へ移す）にした textblock → その textblock。 */
  adjusted: Map<PMNode, PMNode>
  /** N1 で端の空白から mark を外した textblock があったか（ルビ / 縦中横の mark を移しただけでは立てない）。 */
  stripped: boolean
}

/** block の書き方（直下の block の確かめで決まる）。 */
interface BlockMode {
  stripMode: InlineMarkStripMode
  layoutStyle: InlineMarkLayoutStyle
}

/** `chooseBlockMode` の結果。`exact` は、読み直して（N1 の後の）block と一致することを確かめた書き方。 */
interface BlockChoice {
  mode: BlockMode
  exact: boolean
}

interface Candidate {
  mode: BlockMode
  block: RenderedBlock
}

/**
 * 見える文字（空白を除く）と inline node（種類・属性）の並び。読み直して装飾が違っても、文字や node が
 * 増えたり減ったりしていないかを比べる。block の種類も並べる。空白を除くのは、行末の空白のように、
 * 装飾に関わらず Markdown が読み直しで落とす空白を、文字が壊れたことにしないため。
 */
function contentSignature(node: PMNode): string {
  let signature = ''
  node.descendants((child) => {
    if (child.isText) signature += (child.text ?? '').replace(/[\t\n\f\r\p{Zs}]/gu, '')
    else if (child.isInline) signature += `\u0001${child.type.name}${JSON.stringify(child.attrs)}\u0001`
    else signature += `\u0002${child.type.name}\u0002`
    return true
  })
  return signature
}

/**
 * 確かめ用に書いた block。`node` は、読み直すとなる形（N1 で端の空白から mark を外し、ルビ・縦中横の
 * 中の text の mark を node へ移した）の block。`stripped` は、N1 で mark を外したか。
 */
interface RenderedBlock {
  text: string
  node: PMNode
  stripped: boolean
}

/** 記録された textblock の置き換えを、block の木へ当てる。置き換えが無ければ同じ node を返す。 */
function applyInlineAdjustments(node: PMNode, adjusted: ReadonlyMap<PMNode, PMNode>): PMNode {
  if (adjusted.size === 0) return node
  const direct = adjusted.get(node)
  if (direct !== undefined) return direct
  if (node.isLeaf || node.isTextblock) return node
  const children: PMNode[] = []
  let changed = false
  node.forEach((child) => {
    const next = applyInlineAdjustments(child, adjusted)
    if (next !== child) changed = true
    children.push(next)
  })
  return changed ? node.copy(Fragment.fromArray(children)) : node
}

/**
 * block を書いて読み直したときに期待する block の列（の候補）。ふつうは block 1つ。
 * `obsidian-paragraph` の段落は、中の hardBreak が保存で改行になり、開き直すとその位置で段落が
 * 分かれる（既存の正規化）ので、hardBreak の位置で分けた段落の列も候補にする。分けた段落が空に
 * なる（hardBreak が続く・段落の先頭や末尾にある）ときは、分けた列は作れない（候補にしない）。
 * 分けない block 1つも候補に残すのは、`|` で始まる行が続く段落が、開き直しても分かれずに
 * hardBreak のまま戻るため（`MD-ROUNDTRIP-CHUNK1`）。
 * `commonmark-strict`、見出し・引用・リストなどは、block 1つだけ。
 */
function expectedBlockCandidates(node: PMNode, policy: LineBreakPolicy): PMNode[][] {
  if (policy !== 'obsidian-paragraph' || node.type.name !== 'paragraph') return [[node]]
  let hasHardBreak = false
  node.forEach((child) => {
    if (child.type.name === 'hardBreak') hasHardBreak = true
  })
  if (!hasHardBreak) return [[node]]
  const pieces: PMNode[] = []
  let line: PMNode[] = []
  let empty = false
  const flushLine = (): void => {
    if (line.length === 0) empty = true
    else pieces.push(node.copy(Fragment.fromArray(line)))
    line = []
  }
  node.forEach((child) => {
    if (child.type.name === 'hardBreak') flushLine()
    else line.push(child)
  })
  flushLine()
  return empty ? [[node]] : [[node], pieces]
}

/** 新しい綴り `\\` を読むと付く表示に出ない印を、eq の前だけ外す。本文・保存するrawは変えない。 */
function normalizeReadBackslashSpelling(node: PMNode): PMNode {
  if (node.isText) {
    const marks = node.marks.filter((mark) => mark.type.name !== SOURCE_SPELLING_MARK_NAME || decodeSourceSpelling(mark.attrs.raw) !== '\\')
    return marks.length === node.marks.length ? node : node.mark(marks)
  }
  let changed = false
  const children: PMNode[] = []
  node.forEach((child) => {
    const normalized = normalizeReadBackslashSpelling(child)
    changed ||= normalized !== child
    children.push(normalized)
  })
  return changed ? node.copy(Fragment.fromArray(children)) : node
}

/** 読み直した文書の block の列が、期待する列のどれかと1つずつ `eq` で一致するか。 */
function docMatchesBlocks(doc: PMNode | null, candidates: readonly (readonly PMNode[])[]): boolean {
  if (doc === null) return false
  return candidates.some((expected) => {
    if (doc.childCount !== expected.length) return false
    for (let i = 0; i < expected.length; i += 1) {
      if (!normalizeReadBackslashSpelling(doc.child(i)).eq(normalizeReadBackslashSpelling(expected[i]))) return false
    }
    return true
  })
}

/** 読み直した文書の block の列が、期待する列のどれかと同じ数で、1つずつ `contentSignature` が一致するか。 */
function docMatchesSignatures(doc: PMNode | null, candidates: readonly (readonly string[])[]): boolean {
  if (doc === null) return false
  return candidates.some((signatures) => {
    if (doc.childCount !== signatures.length) return false
    for (let i = 0; i < signatures.length; i += 1) {
      if (contentSignature(doc.child(i)) !== signatures[i]) return false
    }
    return true
  })
}

class MarkdownWriter {
  private output = ''
  private blockSeparatorNeeded = false
  private lastDocBlockType: string | null = null
  /** INLINE-MARK1: 端の空白から太字・斜体・取り消し線を外す範囲。直下の block の確かめで決まる。 */
  private stripMode: InlineMarkStripMode = 'all'
  /** INLINE-MARK1: 装飾の配置の style。直下の block の確かめで決まる。 */
  private layoutStyle: InlineMarkLayoutStyle = 'keep-open'
  /** INLINE-MARK1: 入れ子の writer と共有する、N1 の記録。 */
  private layoutContext: InlineLayoutContext = { adjusted: new Map(), stripped: false }
  private protectBackslashes = true
  private decideBackslashes = true
  /** 実際に出した綴りが旧方式と異なるか。入れ子のwriterと共有し、試行用writerとは共有しない。 */
  private backslashContext = { changed: false }

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
   * MD-SOURCE-PRESERVE1: 文書直下の block を1つ、空の出力・区切りなしで今の書き方で書いた文字列。
   * `obsidian-paragraph` の block の書き方は前の出力に依らないので、列の中で書いた文字列と同じ。
   */
  renderTopLevelBlockText(child: PMNode): string {
    this.serializeTopLevelBlock(child)
    return this.output
  }

  /**
   * INLINE-MARK1 / MD-ESCAPE-EXPLICIT1: 文書の直下（と directive の内側）の block を1つ書く。
   *
   * 記号には `\` を足さない。見える `\` は後続の出力で保護する（綴りのある文字は `sourceSpelling` mark が元の綴りで書く）。装飾（太字など）が
   * 重なる block だけ、書き方の候補（端の全角スペースなどを外さずに書くか、続いている装飾を閉じない配置か
   * 変更前の配置か）を読み直して選ぶ。候補の文字列が1つだけなら確かめずにそれを使い、2つ以上なら、保つものが
   * 多い順（`chooseBlockMode`）に読み直して、最初に一致したものを使う。
   *
   * 候補は block だけを書く使い捨ての writer で作り、確かめの後に本番の出力へ
   * 選んだ形で書く（長い出力の文字列を切り出さない）。
   */
  private serializeTopLevelBlock(child: PMNode): void {
    if (!this.decideBackslashes || !hasUnspelledBackslash(child)) {
      const normalized = this.serializeTopLevelBlockLayout(child)
      if (normalized !== child) this.layoutContext.adjusted.set(child, normalized)
      return
    }
    const protectedBlock = this.renderBackslashCandidate(child, true)
    let text = protectedBlock.text
    // 旧方式と変わる綴りを実際に出したblockだけを読み直す。英字の前の本文の \ 等はここに入らない。
    if (protectedBlock.changed) {
      const original = this.renderBackslashCandidate(child, false)
      if (text !== original.text) {
        const expected = expectedBlockCandidates(protectedBlock.node, this.lineBreakPolicy)
        if (!docMatchesBlocks(this.parseSerialized(text, child), expected) &&
          docMatchesBlocks(this.parseSerialized(original.text, child), expected)) {
          text = original.text
        }
      }
    }
    this.ensureBlockSeparator()
    this.output += text
    if (protectedBlock.node !== child) this.layoutContext.adjusted.set(child, protectedBlock.node)
    this.layoutContext.stripped ||= protectedBlock.stripped
  }

  /** 直下のblockの、N1と配置の選択を含む1つの候補。内部では綴りの選択を再帰させない。 */
  private renderBackslashCandidate(node: PMNode, protect: boolean): RenderedBlock & { changed: boolean } {
    const writer = new MarkdownWriter(this.lineBreakPolicy, this.options)
    writer.protectBackslashes = protect
    writer.decideBackslashes = false
    const normalized = writer.serializeTopLevelBlockLayout(node)
    return {
      text: writer.output,
      node: applyInlineAdjustments(normalized, writer.layoutContext.adjusted),
      stripped: writer.layoutContext.stripped,
      changed: writer.backslashContext.changed,
    }
  }

  private serializeTopLevelBlockLayout(child: PMNode): PMNode {
    if (child.type.name === NYOZE_DIRECTIVE_NODE_NAME) {
      this.serializeBlock(child, '')
      return applyInlineAdjustments(child, this.layoutContext.adjusted)
    }
    const traits = analyzeInlineMarks(child)
    if (!traits.layeredMarks) {
      this.serializeBlock(child, '')
      return applyInlineAdjustments(child, this.layoutContext.adjusted)
    }
    let block = child
    let choice = this.chooseBlockMode(block, traits)
    // 端の空白から mark を外す書き方で一致を確かめたときは、外した後の block（読み直すとその形に戻る）を
    // 改めて同じ手順で選び直して書く。2回目の保存（読み直した block）が同じ文字列になる。
    for (let pass = 0; pass < 4 && choice.exact; pass += 1) {
      const rendered = this.renderStandalone(block, choice.mode)
      if (rendered.node === block) break
      block = rendered.node
      choice = this.chooseBlockMode(block, analyzeInlineMarks(block))
    }
    const mode = choice.mode
    const previous = { strip: this.stripMode, style: this.layoutStyle }
    this.stripMode = mode.stripMode
    this.layoutStyle = mode.layoutStyle
    try {
      this.serializeBlock(block, '')
    } finally {
      this.stripMode = previous.strip
      this.layoutStyle = previous.style
    }
    return applyInlineAdjustments(block, this.layoutContext.adjusted)
  }

  /**
   * block の書き方を確かめて決める。候補は、次の組み合わせ（同じ文字列は先のものだけ）。
   * - 端の空白から mark を外す範囲: 全角スペースなどは外さない → 外す（端に全角スペースなどがあるときだけ）
   * - 装飾の配置: 続いている装飾を閉じない → 変更前の配置（装飾が重なるときだけ）
   * 候補が1つで mark を外していなければ、確かめずにそれを使う。そうでなければ読み直して、
   * 1. 元の block と一致する候補（mark を外さない候補 → 外した候補の順）、
   * 2. 見える文字と inline node が保たれる候補（最後に変更前と同じ書き方も試す）、
   * 3. どれもなければ、変更前と同じ書き方
   * の順に使う。変更前に往復できた場面は、変更前と同じ文字列が 1. の候補に入るので壊れない。
   */
  private chooseBlockMode(child: PMNode, traits: InlineMarkTraits): BlockChoice {
    const strips: InlineMarkStripMode[] = traits.softWhitespaceInMarkedText ? ['hard', 'all'] : ['all']
    const styles: InlineMarkLayoutStyle[] = traits.styleMayDiffer ? ['keep-open', 'legacy'] : ['keep-open']
    const candidates: Candidate[] = []
    const seen = new Set<string>()
    const addCandidate = (mode: BlockMode): void => {
      const block = this.renderStandalone(child, mode)
      if (seen.has(block.text)) return
      seen.add(block.text)
      candidates.push({ mode, block })
    }
    for (const stripMode of strips) {
      for (const layoutStyle of styles) addCandidate({ stripMode, layoutStyle })
    }
    // N1 で mark を外していない候補を先にする（ルビ・縦中横の mark を node へ移しただけの候補は、外していない側）。
    candidates.sort((a, b) => Number(!b.block.stripped) - Number(!a.block.stripped))
    if (candidates.length === 1 && !candidates[0].block.stripped) return { mode: candidates[0].mode, exact: false }

    const parsed = new Map<Candidate, PMNode | null>()
    for (const candidate of candidates) {
      const doc = this.parseSerialized(candidate.block.text, child)
      parsed.set(candidate, doc)
      if (docMatchesBlocks(doc, expectedBlockCandidates(candidate.block.node, this.lineBreakPolicy))) return { mode: candidate.mode, exact: true }
    }

    // 変更前と同じ書き方（配置は変更前、mark は外さない）。
    const legacyMode: BlockMode = { stripMode: 'none', layoutStyle: 'legacy' }
    const legacyBlock = this.renderStandalone(child, legacyMode)
    const legacy: Candidate = { mode: legacyMode, block: legacyBlock }
    if (!seen.has(legacyBlock.text)) {
      seen.add(legacyBlock.text)
      parsed.set(legacy, this.parseSerialized(legacyBlock.text, child))
      candidates.push(legacy)
    }
    const signatures = expectedBlockCandidates(child, this.lineBreakPolicy).map((list) => list.map(contentSignature))
    for (const candidate of candidates) {
      if (docMatchesSignatures(parsed.get(candidate) ?? null, signatures)) return { mode: candidate.mode, exact: false }
    }
    return { mode: legacyMode, exact: false }
  }

  /**
   * block 1つだけを、空の出力・separator なしの writer で書く（確かめ用）。
   * 端の空白から mark を外した（N1 の後の）block も返す。
   */
  private renderStandalone(node: PMNode, mode: BlockMode): RenderedBlock {
    const writer = new MarkdownWriter(this.lineBreakPolicy, this.options)
    writer.stripMode = mode.stripMode
    writer.layoutStyle = mode.layoutStyle
    writer.protectBackslashes = this.protectBackslashes
    writer.decideBackslashes = false
    writer.serializeBlock(node, '')
    return {
      text: writer.output,
      node: applyInlineAdjustments(node, writer.layoutContext.adjusted),
      stripped: writer.layoutContext.stripped,
    }
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

  /** 入れ子の writer（引用・リスト・directive）へ、いまの N1 の指定を引き継ぐ。 */
  private nestedWriter(withOptions: boolean): MarkdownWriter {
    const writer = withOptions
      ? new MarkdownWriter(this.lineBreakPolicy, this.options)
      : new MarkdownWriter(this.lineBreakPolicy)
    writer.stripMode = this.stripMode
    writer.layoutStyle = this.layoutStyle
    writer.layoutContext = this.layoutContext
    writer.protectBackslashes = this.protectBackslashes
    writer.decideBackslashes = this.decideBackslashes
    writer.backslashContext = this.backslashContext
    return writer
  }

  private appendObsidianSeparator(nextBlock: PMNode): void {
    if (this.lastDocBlockType === null) return
    // blockquote directly followed by a non-blockquote block with real
    // content is ambiguous CommonMark (lazy continuation would re-absorb
    // the next block on reparse), so force a blank line at that boundary.
    // An empty paragraph (the per-line blank-line marker, e.g. a trailing
    // newline) needs no extra separator — it already reads as a blank line.
    // A9: 直前が html block で出力が改行済み (raw の末尾改行) のときは、
    // 区切りの改行を足さない。足すと空行が1つ挿入されてしまう。
    // 区切りの種類の判定は `sourcePreservation.ts` と共有する（元の文字列で書く連続の境目も同じ規則）。
    const isEmptyParagraph = nextBlock.type.name === 'paragraph' && nextBlock.childCount === 0
    this.output += resolveObsidianSeparator(
      classifyObsidianSeparator(this.lastDocBlockType, nextBlock.type.name, isEmptyParagraph),
      (suffix) => this.output.endsWith(suffix),
    )
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
        this.output += prefix + this.serializeParagraphInline(node)
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
   * 段落・見出しの inline を書く。装飾の入れ子・順・端の空白は `planInlineMarks` が決める。
   * 画像・付箋・inline HTML・hardBreak の前ではすべて閉じ、後で開き直す。
   */
  private serializeParagraphInline(node: PMNode): string {
    const previousChange = this.backslashContext.changed
    const protectedText = this.serializeInlineContent(node)
    // 変わり得る段落だけ従来の綴りでも書く。定義行は ref_def が元のソースを文字として持つため、
    // その綴りへの保護の追加は定義の形を壊す。判定は読み込み・装飾と同じ唯一の関数に委ねる。
    if (!this.protectBackslashes || !protectedText.includes('\\') || !protectedText.trimStart().startsWith('[')) return protectedText
    const originalSpelling = this.serializeInlineContent(node, false)
    if (isReferenceDefinitionLineText(originalSpelling)) {
      this.backslashContext.changed = previousChange
      return originalSpelling
    }
    return protectedText
  }

  private serializeInlineContent(node: PMNode, protectBackslashes = this.protectBackslashes): string {
    // 装飾（mark）が1つもない段落・見出しは、配置の計算を通さず、変更前と同じ書き方で書く。
    if (!hasInlineMarks(node)) return this.serializeUnmarkedInline(node, protectBackslashes)
    const schema = node.type.schema
    const result = new MarkdownSaveInlineWriter(protectBackslashes)
    let groupItems: InlineMarkItem[] = []
    let groupChildren: PMNode[] = []
    // N1 の後の子の列（mark を外したものがあるときだけ、確かめ用の block に使う）。
    const adjustedChildren: PMNode[] = []
    let adjusted = false

    const flushGroup = (): void => {
      if (groupItems.length === 0) return
      const plan = planInlineMarks(groupItems, this.stripMode, this.layoutStyle)
      this.emitInlinePlan(result, plan)
      if (plan.stripped) {
        adjusted = true
        this.layoutContext.stripped = true
        for (const segment of plan.segments) {
          adjustedChildren.push(segment.node === null ? schema.text(segment.text, segment.marks) : moveCommonChildMarksToNode(segment.node))
        }
      } else {
        for (const groupChild of groupChildren) {
          const normalized = groupChild.isText ? groupChild : moveCommonChildMarksToNode(groupChild)
          if (normalized !== groupChild) adjusted = true
          adjustedChildren.push(normalized)
        }
      }
      groupItems = []
      groupChildren = []
    }

    node.forEach((child) => {
      const encoded = encodeInlineChild(child)
      const separator = this.inlineSeparatorText(child, encoded, protectBackslashes)
      if (separator !== null) {
        flushGroup()
        result.raw(separator, protectBackslashes && child.type.name === 'nyoze_image' ? this.inlineSeparatorText(child, encoded, false)! : separator)
        adjustedChildren.push(child)
        return
      }
      if (child.isText) {
        groupItems.push({ text: child.text ?? '', node: null, size: child.nodeSize, marks: child.marks })
      } else {
        // ルビ・縦中横: 中身は青空文庫の符号化した文字で、mark は node とその子に共通のもの。
        groupItems.push({
          text: encoded ?? '',
          node: child,
          size: child.nodeSize,
          marks: resolveInlineNodeMarks(child),
        })
      }
      groupChildren.push(child)
    })
    flushGroup()

    if (adjusted) this.layoutContext.adjusted.set(node, node.copy(Fragment.fromArray(adjustedChildren)))
    const text = result.finish()
    this.backslashContext.changed ||= result.changedBackslashes
    return text
  }

  /**
   * 装飾を閉じて区切る inline node（画像・付箋・inline HTML・hardBreak、符号化できない node）が
   * 書く文字。装飾の対象（text・ルビ・縦中横）なら null。
   */
  private inlineSeparatorText(child: PMNode, encoded: string | null, protectBackslashes: boolean): string | null {
    switch (child.type.name) {
      case 'nyoze_image': {
        // SEC-5: serialize image node back to Markdown image syntax
        const alt = (child.attrs.alt as string) ?? ''
        const src = (child.attrs.src as string) ?? ''
        const title = child.attrs.title as string | null
        const safeAlt = protectBackslashes ? markdownSaveAlt(alt) : `![${escapeMarkdownBracketText(alt)}]`
        const safeSrc = protectBackslashes ? markdownSaveDestination(src, Boolean(title)) : escapeMarkdownUrlDestination(src)
        return title
          ? `${safeAlt}(${safeSrc} ${protectBackslashes ? markdownSaveTitle(title) : `"${escapeMarkdownTitle(title)}"`})`
          : `${safeAlt}(${safeSrc})`
      }
      case 'noteAnchor':
        // 付箋アンカーは必ず正規 comment 形式へ戻す (Markdown 保存で位置を保持)
        return formatNoteAnchorComment((child.attrs.id as string) ?? '')
      case 'html_inline_atom':
        return (child.attrs.raw as string) ?? ''
      case 'hardBreak':
        return this.inlineLineBreakToken()
      default:
        if (child.isText) return null
        return encoded === null ? child.textContent : null
    }
  }

  /** 装飾（mark）が1つもない段落・見出しの inline。配置の計算を通さず、変更前と同じ書き方で書く。 */
  private serializeUnmarkedInline(node: PMNode, protectBackslashes: boolean): string {
    const result = new MarkdownSaveInlineWriter(protectBackslashes)
    node.forEach((child) => {
      const encoded = encodeInlineChild(child)
      const separator = this.inlineSeparatorText(child, encoded, protectBackslashes)
      if (separator !== null) {
        result.raw(separator, protectBackslashes && child.type.name === 'nyoze_image' ? this.inlineSeparatorText(child, encoded, false)! : separator)
      } else if (child.isText) {
        result.text(this.normalizeInlineText(child.text ?? ''))
      } else {
        // ルビ・縦中横にも、見える backslash の同じ規則を当てる。
        result.text(encoded ?? '')
      }
    })
    const text = result.finish()
    this.backslashContext.changed ||= result.changedBackslashes
    return text
  }

  /** 配置した装飾の区切りと文字を、順に書く。 */
  private emitInlinePlan(result: MarkdownSaveInlineWriter, plan: InlineMarkPlan): void {
    for (const event of plan.events) {
      if (event.type === 'open') result.raw(openDelim(event.name))
      else if (event.type === 'close') result.raw(closeDelim(event.name, event.link, result.protectBackslashes), closeDelim(event.name, event.link, false))
      else this.formatInlineSegment(result, event.segment)
    }
  }

  /** code と元の綴りは raw、見えている文字は text として区別して書く。 */
  private formatInlineSegment(result: MarkdownSaveInlineWriter, segment: PlannedSegment): void {
    if (segment.node !== null) {
      if (segment.code) result.raw(formatCodeSpan(segment.text))
      else result.text(segment.text)
      return
    }
    if (segment.code) {
      result.raw(formatCodeSpan(this.normalizeInlineText(segment.text)))
      return
    }
    const writePlain = (chunk: string): string => {
      const text = this.normalizeInlineText(chunk)
      if (segment.link !== null && !result.protectBackslashes) result.raw(escapeMarkdownBracketText(text))
      else result.text(text, segment.link !== null ? SAVE_BRACKET_ESCAPES : undefined, segment.link !== null)
      return ''
    }
    const spelling = segment.marks.find((mark) => mark.type.name === SOURCE_SPELLING_MARK_NAME)
    if (spelling === undefined) writePlain(segment.text)
    else writeSourceSpelling(segment.text, spelling.attrs.raw, writePlain, (raw) => {
      result.raw(raw)
      return ''
    })
  }
}
