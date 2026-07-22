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
export function findRubyPunctuationRuns(
  doc: ProseMirrorNode,
): RubyPunctuationRun[] {
  const runs: RubyPunctuationRun[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'aozoraRuby') return true

    const baseGraphemeCount = countGraphemes(node.textContent)
    // ruby の子は走査しない（親文字内に検出対象はない）。
    if (baseGraphemeCount < 1 || baseGraphemeCount > MAX_RUBY_BASE_GRAPHEMES) {
      return false
    }

    const rubyFrom = pos
    const rubyTo = pos + node.nodeSize

    const $after = doc.resolve(rubyTo)
    const nodeAfter = $after.nodeAfter
    if (!nodeAfter || !nodeAfter.isText) return false

    // link / code mark 内の約物は、mark 境界が不自然になりやすいので吸着しない。
    if (nodeAfter.marks.some((mark) => ABSORB_BLOCKING_MARKS.has(mark.type.name))) {
      return false
    }

    const head = firstGrapheme(nodeAfter.text ?? '')
    if (!RUBY_ADSORB_PUNCTUATION_CHARS.has(head)) return false

    runs.push({
      rubyFrom,
      rubyTo,
      punctuationFrom: rubyTo,
      punctuationTo: rubyTo + head.length,
      baseGraphemeCount,
      punctuationChar: head,
    })
    return false
  })

  return runs
}
