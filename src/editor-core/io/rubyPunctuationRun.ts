import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * 青空ルビ (`aozoraRuby`) node の直後に続く対象約物 1 grapheme を、
 * 表示上だけ不可分単位として扱うための pure 検出ヘルパー。
 *
 * 背景:
 *   `.tategaki-aozora-ruby` は rt 配置のため `display: inline-block`(atomic inline) で
 *   描画される。Chromium 系の縦書きでは、その atomic inline 直後の句読点・閉じ括弧が
 *   行頭/次列頭に落ちることがある（行頭禁則が inline-block 境界をまたいで効きにくい）。
 *   検出だけをこのヘルパーで行い、表示側 (extension) で nowrap 化する。
 *
 * 設計上の制約:
 *   - PM doc / Markdown / clipboard / 保存内容には一切手を入れない（検出のみ）。
 *   - 検出根拠は「`aozoraRuby` node」と「その直後に隣接する text node の先頭 1 grapheme」。
 *   - DOM 上の special inline boundary sentinel widget は検出根拠にしない（PM doc を見る）。
 */

/** 初期スコープの吸着対象約物（句読点・閉じ括弧）。 */
export const RUBY_ADSORB_PUNCTUATION_CHARS: ReadonlySet<string> = new Set([
  '、',
  '。',
  '」',
  '』',
  '）',
])

/** ルビ親文字がこれより長い場合は吸着対象外（Tategaki 参考実装に合わせて 4）。 */
export const MAX_RUBY_BASE_GRAPHEMES = 4

const ABSORB_BLOCKING_MARKS: ReadonlySet<string> = new Set(['link', 'code'])

export type RubyPunctuationRun = {
  /** ruby node 開始位置（ruby 自身の pos）。 */
  rubyFrom: number
  /** ruby node 終了位置（pos + nodeSize）。直後約物の開始位置と一致する。 */
  rubyTo: number
  /** 吸着対象約物 1 grapheme の開始位置。 */
  punctuationFrom: number
  /** 吸着対象約物 1 grapheme の終了位置（UTF-16 code unit ベース）。 */
  punctuationTo: number
  /** ルビ親文字の grapheme 数。 */
  baseGraphemeCount: number
  /** 吸着対象約物 1 grapheme。 */
  punctuationChar: string
}

export type RubyPunctuationTextblockRange = {
  from: number
  to: number
  nodeType: string
}

function firstGrapheme(text: string): string {
  // 対象約物はすべて BMP の単一 code point。code point 単位で先頭 1 文字を取り出す。
  const iterator = text[Symbol.iterator]()
  const next = iterator.next()
  return next.done ? '' : next.value
}

function countGraphemes(text: string): number {
  // 親文字は漢字・かな主体で、code point 数で十分（Tategaki 参考実装と同じ粒度）。
  return Array.from(text).length
}

/**
 * `aozoraRuby` node の直後に隣接する対象約物 1 grapheme を検出して run の一覧を返す。
 *
 * 吸着条件（すべて満たすときのみ）:
 *   - ルビ親文字 grapheme 数が 1〜{@link MAX_RUBY_BASE_GRAPHEMES}。
 *   - ruby 直後の sibling が text node（= 別 ruby / TCY / html inline atom などをまたがない）。
 *   - その text node の先頭 1 grapheme が {@link RUBY_ADSORB_PUNCTUATION_CHARS} のいずれか。
 *   - その text node が link / code mark を持たない。
 *
 * text node が複数文字でも、吸着対象は先頭 1 grapheme のみ。残りは通常 text のまま。
 */
function rubyPunctuationRunAt(
  doc: ProseMirrorNode,
  node: ProseMirrorNode,
  pos: number,
): RubyPunctuationRun | null {
  if (node.type.name !== 'aozoraRuby') return null

  const baseGraphemeCount = countGraphemes(node.textContent)
  if (baseGraphemeCount < 1 || baseGraphemeCount > MAX_RUBY_BASE_GRAPHEMES) {
    return null
  }

  const rubyFrom = pos
  const rubyTo = pos + node.nodeSize

  const $after = doc.resolve(rubyTo)
  const nodeAfter = $after.nodeAfter
  if (!nodeAfter || !nodeAfter.isText) return null

  // link / code mark 内の約物は、mark 境界が不自然になりやすいので吸着しない。
  if (nodeAfter.marks.some((mark) => ABSORB_BLOCKING_MARKS.has(mark.type.name))) {
    return null
  }

  const head = firstGrapheme(nodeAfter.text ?? '')
  if (!RUBY_ADSORB_PUNCTUATION_CHARS.has(head)) return null

  return {
    rubyFrom,
    rubyTo,
    punctuationFrom: rubyTo,
    punctuationTo: rubyTo + head.length,
    baseGraphemeCount,
    punctuationChar: head,
  }
}

export function rubyPunctuationRunKey(run: RubyPunctuationRun): string {
  return `${run.rubyFrom}:${run.rubyTo}:${run.punctuationTo}:${run.punctuationChar}`
}

export function sortAndDedupeRubyPunctuationRuns(
  runs: readonly RubyPunctuationRun[],
): RubyPunctuationRun[] {
  const sorted = [...runs].sort(
    (left, right) =>
      left.rubyFrom - right.rubyFrom ||
      left.punctuationTo - right.punctuationTo ||
      left.punctuationChar.localeCompare(right.punctuationChar),
  )
  const result: RubyPunctuationRun[] = []
  let previousKey: string | null = null
  for (const run of sorted) {
    const key = rubyPunctuationRunKey(run)
    if (key === previousKey) continue
    result.push(run)
    previousKey = key
  }
  return result
}

/**
 * `onTextblockVisited` は PERF2b-2b0 の診断専用 hook。
 * **診断のためだけに doc を再走査しない**ため、既存の full scan traversal 中に
 * textblock 訪問数を数えるだけの callback を受け取る。未指定時は追加の
 * property 参照すら行わない（capture OFF の通常経路を変えない）。
 */
export function findRubyPunctuationRuns(
  doc: ProseMirrorNode,
  onTextblockVisited?: () => void,
): RubyPunctuationRun[] {
  const runs: RubyPunctuationRun[] = []

  doc.descendants((node, pos) => {
    if (onTextblockVisited && node.isTextblock) onTextblockVisited()
    if (node.type.name !== 'aozoraRuby') return true
    const run = rubyPunctuationRunAt(doc, node, pos)
    if (run) runs.push(run)
    // ruby の子は走査しない（親文字内に検出対象はない）。
    return false
  })

  return runs
}

/**
 * 指定textblockだけを再探索する。初期load以外の通常編集ではこちらを使い、
 * 文書内の無関係なruby nodeを走査しない。
 */
export function findRubyPunctuationRunsInTextblocks(
  doc: ProseMirrorNode,
  ranges: readonly RubyPunctuationTextblockRange[],
  onTextblockScanned?: (range: RubyPunctuationTextblockRange) => void,
): RubyPunctuationRun[] {
  const runs: RubyPunctuationRun[] = []
  for (const range of ranges) {
    const textblock = doc.nodeAt(range.from)
    if (!textblock?.isTextblock || textblock.type.name !== range.nodeType) continue
    onTextblockScanned?.(range)
    textblock.descendants((node, relativePos) => {
      if (node.type.name !== 'aozoraRuby') return true
      const run = rubyPunctuationRunAt(doc, node, range.from + 1 + relativePos)
      if (run) runs.push(run)
      return false
    })
  }
  return sortAndDedupeRubyPunctuationRuns(runs)
}
