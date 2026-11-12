/**
 * MD-SOURCE-PRESERVE1: 編集していないブロックは、読み込んだときの元の文字列のまま書き出す。
 *
 * 対象は、既定の改行モード `obsidian-paragraph` の文書の「文書直下のブロック」だけ。
 * `commonmark-strict`、装飾の中の一部分、ブロックの中の一部分（inline 単位）は対象外（今どおり全体を書く）。
 *
 * 構成（この module は PM の view・DOM・timer に触れず、parse / serialize の実体は port で受け取る）:
 * 1. 記録（`createSourceRecorder`）: parse が文書直下に子を足す単位（まとまり）ごとに、元の文字列の範囲と子の数を残す。
 * 2. 対応づけ（`createSourceRegistry`）: 読み込みで作った子の node に、まとまりの記録を `WeakMap` で付ける。
 *    Undo の後のように、内容が同じ別の object になった子は、`resolveChildSlices` が隣の子から記録の通し番号をたどり、
 *    `eq` で内容の一致を証明できたときだけ元の対応へ戻す（順番だけで合わせ直さない）。
 * 3. 書き出し（`serializeWithSource`）: 元の文字列のまま書ける連続を、区切りも含めてそのまま書く。それ以外は
 *    今の書き方（port の `renderChild`）。境目は読み直して確かめ、合わなければ隣のまとまりも今の書き方へ広げる。
 *    決めた回数で合わなければ null を返し、呼び出し側が全体を今どおり書く。
 *
 * 迷う場合（対応がとれない・設定が違う・確かめが合わない・例外）は、すべて今どおり。元の文字列を使うのは、確かめられたときだけ。
 */
import type { Node as PMNode } from '@tiptap/pm/model'
import { splitDirectiveSegments } from './customBlockDirective'

/** 読み込み・書き出しで一致を求める設定（改行モードは `obsidian-paragraph` 固定）。 */
export type SourceSettings = Readonly<{ enableRuby: boolean; preserveEmptyParagraphs: boolean }>

/** 読み込みが文書直下に子を足した1回分（元の文字列の範囲）。 */
export interface SourceChunk {
  /** 元の文字列（`SourceRecord.source`）の中の範囲 [start, end)。空行の chunk は start === end。 */
  readonly start: number
  readonly end: number
  /** この chunk が作った最初の子の通し番号と、子の数（参照の定義の行のように 0 のこともある）。 */
  readonly firstChild: number
  readonly childCount: number
  /** 子が元の行から作られたものではない（plain segment が子を作らず足した空段落）。保存に使わない。 */
  readonly synthetic: boolean
}

export interface PendingSourceRecord {
  readonly source: string
  readonly settings: SourceSettings
  readonly chunks: readonly SourceChunk[]
  /** 子の通し番号 → chunk の添字。 */
  readonly chunkOfChild: readonly number[]
  readonly childCount: number
}

export interface SourceRecord extends PendingSourceRecord {
  /** 読み込みで作った子の node（通し番号の順）。Undo の後の対応づけと、読み直しの期待値に使う。 */
  readonly nodes: readonly PMNode[]
}

export interface SourceSlice {
  readonly record: SourceRecord
  readonly ordinal: number
}

// ---------------------------------------------------------------------------
// 1. 記録
// ---------------------------------------------------------------------------

/** parse が渡す記録先。記録しない呼び出しは、これを渡さない（今と同じ動き・同じ費用）。 */
export interface SourceRecorder {
  /** 正規化した（LF の）元の文字列。行の範囲はこの文字列を `\n` で分けた行の添字。 */
  begin(source: string): void
  mark(): number
  rewind(mark: number): void
  addChunk(startLine: number, endLine: number, childCount: number, synthetic?: boolean): void
}

interface ChunkSpan {
  startLine: number
  endLine: number
  childCount: number
  synthetic: boolean
}

export function createSourceRecorder(): SourceRecorder & {
  finish(settings: SourceSettings): PendingSourceRecord | null
} {
  let source: string | null = null
  let lineStarts: number[] = []
  let spans: ChunkSpan[] = []

  return {
    begin(next: string): void {
      source = next
      spans = []
      lineStarts = [0]
      let index = -1
      while ((index = next.indexOf('\n', index + 1)) !== -1) lineStarts.push(index + 1)
    },
    mark: () => spans.length,
    rewind(mark: number): void {
      spans.length = mark
    },
    addChunk(startLine: number, endLine: number, childCount: number, synthetic = false): void {
      spans.push({ startLine, endLine, childCount, synthetic })
    },
    /** chunk が行を隙間なく並べていなければ（記録が信用できない）null。 */
    finish(settings: SourceSettings): PendingSourceRecord | null {
      if (source === null || spans.length === 0) return null
      const lineCount = lineStarts.length
      let expectedStart = 0
      const chunks: SourceChunk[] = []
      const chunkOfChild: number[] = []
      let childCount = 0
      for (let index = 0; index < spans.length; index += 1) {
        const span = spans[index]
        if (span.startLine !== expectedStart || span.endLine <= span.startLine || span.endLine > lineCount) return null
        chunks.push({
          start: lineStarts[span.startLine],
          end: span.endLine < lineCount ? lineStarts[span.endLine] - 1 : source.length,
          firstChild: childCount,
          childCount: span.childCount,
          synthetic: span.synthetic,
        })
        for (let child = 0; child < span.childCount; child += 1) chunkOfChild.push(index)
        childCount += span.childCount
        expectedStart = span.endLine
      }
      if (expectedStart !== lineCount) return null
      return { source, settings, chunks, chunkOfChild, childCount }
    },
  }
}

// ---------------------------------------------------------------------------
// 2. 対応づけ
// ---------------------------------------------------------------------------

export interface SourceRegistry {
  lookup(node: PMNode): SourceSlice | undefined
  /** 読み込みで作った子に対応を付ける。子の数が記録と合わなければ何もせず false。 */
  attach(pending: PendingSourceRecord, children: readonly PMNode[]): boolean
}

/**
 * node を鍵にした 1 つの WeakMap。いまの文書だけのものにしない（タブの capsule が持つ別の文書の node からも
 * 元の文字列を引けるようにする）。鍵の node が到達できなくなれば、記録も解放される。
 */
export function createSourceRegistry(): SourceRegistry {
  const slices = new WeakMap<PMNode, SourceSlice>()
  return {
    lookup: (node) => slices.get(node),
    attach(pending, children): boolean {
      if (children.length !== pending.childCount) return false
      const record: SourceRecord = { ...pending, nodes: children.slice() }
      for (let ordinal = 0; ordinal < children.length; ordinal += 1) {
        slices.set(children[ordinal], { record, ordinal })
      }
      return true
    },
  }
}

function settingsMatch(a: SourceSettings, b: SourceSettings): boolean {
  return a.enableRuby === b.enableRuby && a.preserveEmptyParagraphs === b.preserveEmptyParagraphs
}

/**
 * 子ごとの対応を求める。まず object の同一性（作った時点の対応）で引き、設定が違う対応は無かったことにする。
 * 次に、対応のない子だけを対象に、対応のついた隣（または文書の先頭・末尾）から記録の通し番号をたどって候補を
 * 1つだけ取り、`child.eq(記録の node)` が成り立ち、その記録が別の子に使われていないときだけ対応をつける
 * （Undo / Redo で内容が同じ別の object になった子を戻す）。両側に隣があって候補が食い違えば対応なし。
 * 計算は、対応のない子の数に比例する範囲だけ（文書全体を `eq` で比べない）。
 */
export function resolveChildSlices(
  children: readonly PMNode[],
  lookup: (node: PMNode) => SourceSlice | undefined,
  settings: SourceSettings,
): { slices: Array<SourceSlice | null>; recovered: number } {
  const count = children.length
  const slices: Array<SourceSlice | null> = new Array<SourceSlice | null>(count).fill(null)
  const used = new Map<SourceRecord, Set<number>>()
  const unmapped: number[] = []
  const markUsed = (slice: SourceSlice): void => {
    let set = used.get(slice.record)
    if (!set) used.set(slice.record, (set = new Set<number>()))
    set.add(slice.ordinal)
  }
  for (let index = 0; index < count; index += 1) {
    const slice = lookup(children[index])
    if (slice && settingsMatch(slice.record.settings, settings)) {
      slices[index] = slice
      markUsed(slice)
    } else {
      unmapped.push(index)
    }
  }
  if (unmapped.length === 0 || unmapped.length === count) return { slices, recovered: 0 }

  let recovered = 0
  const tryRecover = (index: number): boolean => {
    const left = index > 0 ? slices[index - 1] : ('start' as const)
    const right = index < count - 1 ? slices[index + 1] : ('end' as const)
    let record: SourceRecord
    let ordinal: number
    if (left !== null && left !== 'start') {
      record = left.record
      ordinal = left.ordinal + 1
      if (right === 'end') {
        if (ordinal !== record.childCount - 1) return false
      } else if (right !== null && (right.record !== record || right.ordinal !== ordinal + 1)) {
        return false
      }
    } else if (right !== null && right !== 'end') {
      record = right.record
      ordinal = right.ordinal - 1
      if (left === 'start' && ordinal !== 0) return false
    } else {
      return false
    }
    if (ordinal < 0 || ordinal >= record.childCount) return false
    if (used.get(record)?.has(ordinal)) return false
    if (!children[index].eq(record.nodes[ordinal])) return false
    const slice: SourceSlice = { record, ordinal }
    slices[index] = slice
    markUsed(slice)
    recovered += 1
    return true
  }
  // 左から右へ（左の隣の対応から）、足りなければ右から左へ（右の隣の対応から）つなげる。
  for (let at = 0; at < unmapped.length; at += 1) tryRecover(unmapped[at])
  for (let at = unmapped.length - 1; at >= 0; at -= 1) {
    if (slices[unmapped[at]] === null) tryRecover(unmapped[at])
  }
  return { slices, recovered }
}

// ---------------------------------------------------------------------------
// 3. 区切り（`MarkdownWriter.appendObsidianSeparator` と共有する唯一の定義）
// ---------------------------------------------------------------------------

export type ObsidianSeparatorKind = 'newline' | 'blank-line-after-quote' | 'html-block-end'

/**
 * 直前の block と次の block の間の区切りの種類。
 * - 引用の直後に、中身のある引用でない block が来るときは、lazy continuation で吸われないよう空行を強制する
 *   （空の段落は空行の印なので足さない）。
 * - html block の直後で、出力がすでに改行で終わっていれば（raw の末尾改行）、区切りを足さない。
 */
export function classifyObsidianSeparator(
  lastType: string,
  nextType: string,
  nextIsEmptyParagraph: boolean,
): ObsidianSeparatorKind {
  if (lastType === 'blockquote' && nextType !== 'blockquote' && !nextIsEmptyParagraph) return 'blank-line-after-quote'
  if (lastType === 'html_block_atom') return 'html-block-end'
  return 'newline'
}

/** 種類と出力の末尾から、足す区切りの文字列。`endsWith` は出力の末尾に対する判定。 */
export function resolveObsidianSeparator(kind: ObsidianSeparatorKind, endsWith: (suffix: string) => boolean): string {
  if (kind === 'blank-line-after-quote') {
    if (endsWith('\n\n')) return ''
    if (endsWith('\n')) return '\n'
    return '\n\n'
  }
  if (kind === 'html-block-end' && endsWith('\n')) return ''
  return '\n'
}

// ---------------------------------------------------------------------------
// 4. 書き出し
// ---------------------------------------------------------------------------

/** 文書直下の子の、装飾の segment 上の種類。 */
export type SegmentKind =
  | { readonly type: 'plain' }
  | { readonly type: 'directive'; readonly token: string }
  | { readonly type: 'page-break' }
  | { readonly type: 'blank-page'; readonly count: number }

export interface SourcePreservationPorts {
  /** 子を今の書き方で書く（区切りなし）。 */
  readonly renderChild: (child: PMNode) => string
  /** 書いた文字列を、記録と同じ設定で `obsidian-paragraph` として読み直した文書直下の子。失敗は null。 */
  readonly parseChildren: (text: string, settings: SourceSettings) => PMNode[] | null
  readonly classifyChild: (child: PMNode) => SegmentKind
  /**
   * その1行だけで1つのまとまりになる行か（後ろの行を見ない）。境目の前後が、すべてこの行だけなら、読み直しても
   * 各行を別々に読んだ結果が並ぶだけなので、境目の読み直しを省く。
   */
  readonly isSelfContainedLine: (line: string) => boolean
}

export interface SourcePreservationInput {
  readonly registry: SourceRegistry
  /** いまの Ruby の解釈（読み込みのときの設定と同じ場合だけ元の文字列を使う）。 */
  readonly enableRuby: boolean
  /** 試験の起動だけが読む診断。製品の判断には使わない。 */
  readonly report?: (report: SourcePreservationReport) => void
  /** 試験専用: report に、元の文字列で書いた連続（run）の子の範囲と文字列を含める。 */
  readonly collectRunDetails?: boolean
  /** 試験専用: 独立に読まれる行だけの境目も読み直す（省く場合と同じ結果になることを試験で確かめる）。 */
  readonly disableBoundarySkip?: boolean
}

export type SourcePreservationFallbackReason =
  | 'no-preserved-children'
  | 'boundary-mismatch'
  | 'directive-segments-mismatch'
  | 'exception'

export interface SourcePreservationReport {
  /** 'preserved' = 元の文字列を使った / 'fallback' = 全体を今どおり書いた / 'unmapped' = 対応が 1 つもなかった。 */
  readonly outcome: 'preserved' | 'fallback' | 'unmapped'
  readonly reason: SourcePreservationFallbackReason | null
  readonly totalChildren: number
  /** 元の文字列で書いた子の数（fallback では 0）。 */
  readonly preservedChildren: number
  /** 隣の子の内容の一致で対応を戻した子の数（Undo / Redo の後）。 */
  readonly recoveredChildren: number
  readonly runs: number
  readonly gaps: number
  /** 境目の確かめで読み直した回数と行数（広げて確かめ直した分を含む）。 */
  readonly boundaryParses: number
  readonly boundaryLines: number
  /** 前後がすべて「その1行だけで1つのまとまりになる行」で、読み直さずに通した境目の数。 */
  readonly boundarySkipped: number
  readonly rounds: number
  readonly directiveCheck: 'skipped' | 'passed' | 'failed'
  readonly directiveCheckLines: number
  /** 試験専用（`collectRunDetails` のときだけ）: 元の文字列で書いた連続の、子の範囲 [start, end) と出力に入れた文字列。 */
  readonly runDetails?: ReadonlyArray<{ readonly start: number; readonly end: number; readonly text: string }>
}

/** 境目を確かめて、合わなければ隣のまとまりを今の書き方へ広げる回数の上限。 */
const MAX_ROUNDS = 4

interface Piece {
  readonly text: string
  readonly firstType: string
  readonly firstIsEmptyParagraph: boolean
  readonly lastType: string
}

interface Unit {
  readonly id: number
  /** 文書直下の子の範囲 [start, end)。 */
  readonly start: number
  readonly end: number
  readonly record: SourceRecord
  readonly chunkIndex: number
  readonly firstOrdinal: number
  readonly lastOrdinal: number
  active: boolean
}

interface Gap {
  readonly before: Unit | null
  readonly after: Unit | null
  /** 間の子（元の文字列で書かない子）の範囲 [start, end)。空のこともある（元で隣り合っていなかった2つのまとまり）。 */
  readonly start: number
  readonly end: number
}

function isEmptyParagraph(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.childCount === 0
}

function joinPieces(pieces: readonly Piece[]): string {
  const parts: string[] = []
  let tail = ''
  let lastType: string | null = null
  for (const piece of pieces) {
    if (lastType !== null) {
      const separator = resolveObsidianSeparator(
        classifyObsidianSeparator(lastType, piece.firstType, piece.firstIsEmptyParagraph),
        (suffix) => tail.endsWith(suffix),
      )
      parts.push(separator)
      tail = (tail + separator).slice(-2)
    }
    parts.push(piece.text)
    tail = piece.text.length >= 2 ? piece.text.slice(-2) : (tail + piece.text).slice(-2)
    lastType = piece.lastType
  }
  return parts.join('')
}

function countLines(text: string): number {
  let lines = 1
  let index = -1
  while ((index = text.indexOf('\n', index + 1)) !== -1) lines += 1
  return lines
}

function sameNodes(actual: readonly PMNode[], expected: readonly PMNode[]): boolean {
  if (actual.length !== expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    if (!actual[index].eq(expected[index])) return false
  }
  return true
}

function sourceAdjacent(a: Unit, b: Unit): boolean {
  return a.record === b.record && b.firstOrdinal === a.lastOrdinal + 1
}

/** 完全にそろった chunk（子が同じ順で並ぶ）の位置を、文書の順に求める。 */
function findUnits(children: readonly PMNode[], slices: ReadonlyArray<SourceSlice | null>): Unit[] {
  const units: Unit[] = []
  const count = children.length
  let index = 0
  while (index < count) {
    const slice = slices[index]
    if (slice === null) {
      index += 1
      continue
    }
    const chunkIndex = slice.record.chunkOfChild[slice.ordinal]
    const chunk = slice.record.chunks[chunkIndex]
    let complete = !chunk.synthetic && chunk.firstChild === slice.ordinal && index + chunk.childCount <= count
    for (let offset = 1; complete && offset < chunk.childCount; offset += 1) {
      const next = slices[index + offset]
      complete = next !== null && next.record === slice.record && next.ordinal === slice.ordinal + offset
    }
    if (!complete) {
      index += 1
      continue
    }
    units.push({
      id: units.length,
      start: index,
      end: index + chunk.childCount,
      record: slice.record,
      chunkIndex,
      firstOrdinal: slice.ordinal,
      lastOrdinal: slice.ordinal + chunk.childCount - 1,
      active: true,
    })
    index += chunk.childCount
  }
  return units
}

const colonChunkCache = new WeakMap<SourceRecord, readonly number[]>()

/** 記録の中で `:::` を含む chunk の添字（文書の順）。装飾の segment の確かめを省けるかの判定に使う。 */
function colonChunkIndices(record: SourceRecord): readonly number[] {
  let cached = colonChunkCache.get(record)
  if (cached === undefined) {
    const indices: number[] = []
    if (record.source.includes(':::')) {
      for (let index = 0; index < record.chunks.length; index += 1) {
        const chunk = record.chunks[index]
        if (record.source.slice(chunk.start, chunk.end).includes(':::')) indices.push(index)
      }
    }
    cached = indices
    colonChunkCache.set(record, cached)
  }
  return cached
}

/** `colonChunkIndices` は昇順なので二分探索。 */
function colonSetHas(sorted: readonly number[], value: number): boolean {
  let low = 0
  let high = sorted.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (sorted[mid] === value) return true
    if (sorted[mid] < value) low = mid + 1
    else high = mid - 1
  }
  return false
}

function directiveSegmentsMatch(
  output: string,
  children: readonly PMNode[],
  classifyChild: SourcePreservationPorts['classifyChild'],
): boolean {
  const actual = splitDirectiveSegments(output.split('\n'))
  const expected: SegmentKind[] = []
  for (const child of children) {
    const kind = classifyChild(child)
    if (kind.type === 'plain' && expected.length > 0 && expected[expected.length - 1].type === 'plain') continue
    expected.push(kind)
  }
  if (actual.length !== expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    const segment = actual[index]
    const want = expected[index]
    if (segment.type !== want.type) return false
    if (segment.type === 'directive' && want.type === 'directive' && segment.token !== want.token) return false
    if (segment.type === 'blank-page' && want.type === 'blank-page' && segment.count !== want.count) return false
  }
  return true
}

/**
 * 文書直下の子の列を、元の文字列を使える連続と、今の書き方で書く子に分けて書く。
 * 元の文字列を使わないほうが安全なとき（対応がない・境目が合わない・装飾の segment が合わない・例外）は null を返し、
 * 呼び出し側が全体を今どおり書く。
 */
export function serializeWithSource(args: {
  readonly children: readonly PMNode[]
  readonly input: SourcePreservationInput
  readonly settings: SourceSettings
  readonly ports: SourcePreservationPorts
}): string | null {
  const { children, input, settings, ports } = args
  const total = children.length
  const report = (partial: Partial<SourcePreservationReport> & Pick<SourcePreservationReport, 'outcome' | 'reason'>): void => {
    input.report?.({
      totalChildren: total,
      preservedChildren: 0,
      recoveredChildren: 0,
      runs: 0,
      gaps: 0,
      boundaryParses: 0,
      boundaryLines: 0,
      boundarySkipped: 0,
      rounds: 0,
      directiveCheck: 'skipped',
      directiveCheckLines: 0,
      ...partial,
    })
  }
  try {
    return plan()
  } catch {
    report({ outcome: 'fallback', reason: 'exception' })
    return null
  }

  function plan(): string | null {
    const { slices, recovered } = resolveChildSlices(children, input.registry.lookup, settings)
    if (!slices.some((slice) => slice !== null)) {
      report({ outcome: 'unmapped', reason: null })
      return null
    }
    const units = findUnits(children, slices)
    const rendered = new Array<string | undefined>(total)
    const renderAt = (index: number): string => (rendered[index] ??= ports.renderChild(children[index]))
    const writtenPiece = (index: number): Piece => ({
      text: renderAt(index),
      firstType: children[index].type.name,
      firstIsEmptyParagraph: isEmptyParagraph(children[index]),
      lastType: children[index].type.name,
    })
    const chunkPiece = (unit: Unit): Piece => {
      const chunk = unit.record.chunks[unit.chunkIndex]
      return {
        text: unit.record.source.slice(chunk.start, chunk.end),
        firstType: children[unit.start].type.name,
        firstIsEmptyParagraph: isEmptyParagraph(children[unit.start]),
        lastType: children[unit.end - 1].type.name,
      }
    }

    let boundaryParses = 0
    let boundaryLines = 0
    let boundarySkipped = 0
    const verdicts = new Map<string, boolean>()
    const selfContained = (text: string): boolean => {
      if (text.includes(':::')) return false
      let from = 0
      for (;;) {
        const to = text.indexOf('\n', from)
        if (!ports.isSelfContainedLine(to === -1 ? text.slice(from) : text.slice(from, to))) return false
        if (to === -1) return true
        from = to + 1
      }
    }

    const checkGap = (gap: Gap): boolean => {
      const key = `${gap.before?.id ?? -1}|${gap.start}|${gap.end}|${gap.after?.id ?? -1}`
      const cached = verdicts.get(key)
      if (cached !== undefined) return cached
      const gapPieces: Piece[] = []
      for (let index = gap.start; index < gap.end; index += 1) gapPieces.push(writtenPiece(index))
      const pieces: Piece[] = []
      if (gap.before) pieces.push(chunkPiece(gap.before))
      pieces.push(...gapPieces)
      if (gap.after) pieces.push(chunkPiece(gap.after))
      if (!input.disableBoundarySkip && pieces.every((piece) => selfContained(piece.text))) {
        boundarySkipped += 1
        verdicts.set(key, true)
        return true
      }
      const glued = joinPieces(pieces)
      boundaryParses += 1
      boundaryLines += countLines(glued)
      const parsed = ports.parseChildren(glued, settings)
      let ok = false
      if (parsed !== null) {
        const beforeNodes = gap.before ? children.slice(gap.before.start, gap.before.end) : []
        const afterNodes = gap.after ? children.slice(gap.after.start, gap.after.end) : []
        const actual = children.slice(gap.start, gap.end)
        ok = sameNodes(parsed, [...beforeNodes, ...actual, ...afterNodes])
        if (!ok && actual.length > 0) {
          // 編集した部分が単独でも今の書き方で往復しない既知の制限があっても、境目によって今の書き出しより悪い読み方に
          // ならないこと（前後の元のまとまりは実際の node、編集部分は単独で読み直した node）を確かめる。
          const gapText = joinPieces(gapPieces)
          boundaryParses += 1
          boundaryLines += countLines(gapText)
          const alone = ports.parseChildren(gapText, settings)
          ok = alone !== null && sameNodes(parsed, [...beforeNodes, ...alone, ...afterNodes])
        }
      }
      verdicts.set(key, ok)
      return ok
    }

    const buildGaps = (active: readonly Unit[]): Gap[] => {
      const gaps: Gap[] = []
      if (active[0].start > 0) gaps.push({ before: null, after: active[0], start: 0, end: active[0].start })
      for (let index = 0; index + 1 < active.length; index += 1) {
        const before = active[index]
        const after = active[index + 1]
        if (before.end === after.start && sourceAdjacent(before, after)) continue
        gaps.push({ before, after, start: before.end, end: after.start })
      }
      const last = active[active.length - 1]
      if (last.end < total) gaps.push({ before: last, after: null, start: last.end, end: total })
      return gaps
    }

    let rounds = 0
    let active: Unit[] = []
    let gaps: Gap[] = []
    for (;;) {
      rounds += 1
      active = units.filter((unit) => unit.active)
      if (active.length === 0) {
        report({ outcome: 'fallback', reason: 'no-preserved-children', recoveredChildren: recovered, rounds, boundaryParses, boundaryLines, boundarySkipped })
        return null
      }
      gaps = buildGaps(active)
      const failed = gaps.filter((gap) => !checkGap(gap))
      if (failed.length === 0) break
      if (rounds >= MAX_ROUNDS) {
        report({ outcome: 'fallback', reason: 'boundary-mismatch', recoveredChildren: recovered, gaps: gaps.length, rounds, boundaryParses, boundaryLines, boundarySkipped })
        return null
      }
      for (const gap of failed) {
        if (gap.before) gap.before.active = false
        if (gap.after) gap.after.active = false
      }
    }

    // 組み立て: 元の文字列で書く連続（run）は、その間の区切りも含めて元の文字列の範囲をそのまま書く。
    const pieces: Piece[] = []
    const unitStartingAt = new Map<number, Unit>()
    for (const unit of active) unitStartingAt.set(unit.start, unit)
    let runs = 0
    let preservedChildren = 0
    const runDetails: Array<{ start: number; end: number; text: string }> = []
    let index = 0
    while (index < total) {
      const first = unitStartingAt.get(index)
      if (first === undefined) {
        pieces.push(writtenPiece(index))
        index += 1
        continue
      }
      let last = first
      for (;;) {
        const next = unitStartingAt.get(last.end)
        if (next === undefined || !sourceAdjacent(last, next)) break
        last = next
      }
      const record = first.record
      const startOffset = first.start === 0 && first.firstOrdinal === 0 ? 0 : record.chunks[first.chunkIndex].start
      const endOffset = last.end === total && last.lastOrdinal === record.childCount - 1 ? record.source.length : record.chunks[last.chunkIndex].end
      const runText = record.source.slice(startOffset, endOffset)
      if (input.collectRunDetails) runDetails.push({ start: first.start, end: last.end, text: runText })
      pieces.push({
        text: runText,
        firstType: children[first.start].type.name,
        firstIsEmptyParagraph: isEmptyParagraph(children[first.start]),
        lastType: children[last.end - 1].type.name,
      })
      runs += 1
      preservedChildren += last.end - first.start
      index = last.end
    }
    const output = joinPieces(pieces)

    // 装飾の segment の確かめ: 書き出した全体の行の走査（`splitDirectiveSegments`）で、segment の並びが子の並びと
    // 対応するか。`:::` を含まない出力、または編集が 0 の出力（元の文字列そのまま）では要らない。`:::` を含む出力でも、
    // 書き直した部分に `:::` や code fence がなく、`:::` を含む元のまとまりが元の順のままなら、書き直しは装飾の対応に
    // 触れない（全文の markdown-it の走査を保存のたびに行わない）。
    let directiveCheck: SourcePreservationReport['directiveCheck'] = 'skipped'
    let directiveCheckLines = 0
    if (gaps.length > 0 && output.includes(':::')) {
      // 活きている chunk の記録が1つでなければ（通常は起きない）、確かめる側に倒す。
      const record = active[0].record
      let risky = active.some((unit) => unit.record !== record)
      if (!risky) {
        const colonSet = colonChunkIndices(record)
        const colonUnitChunks = active.filter((unit) => colonSetHas(colonSet, unit.chunkIndex)).map((unit) => unit.chunkIndex)
        risky = colonUnitChunks.length !== colonSet.length || colonUnitChunks.some((value, at) => value !== colonSet[at])
      }
      for (let at = 0; !risky && at < total; at += 1) {
        const text = rendered[at]
        if (text !== undefined && (text.includes(':::') || text.includes('```') || text.includes('~~~'))) risky = true
      }
      if (risky) {
        directiveCheckLines = countLines(output)
        directiveCheck = directiveSegmentsMatch(output, children, ports.classifyChild) ? 'passed' : 'failed'
        if (directiveCheck === 'failed') {
          report({
            outcome: 'fallback', reason: 'directive-segments-mismatch', recoveredChildren: recovered, gaps: gaps.length, rounds,
            boundaryParses, boundaryLines, boundarySkipped, directiveCheck, directiveCheckLines,
          })
          return null
        }
      }
    }
    report({
      outcome: 'preserved', reason: null, preservedChildren, recoveredChildren: recovered, runs, gaps: gaps.length, rounds,
      boundaryParses, boundaryLines, boundarySkipped, directiveCheck, directiveCheckLines,
      ...(input.collectRunDetails ? { runDetails } : {}),
    })
    return output
  }
}
