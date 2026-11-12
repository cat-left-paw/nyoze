import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * PIS-RANGE-DISPLAY1: 範囲に入った「改行」の位置の並び。DOM・viewに触れない純粋なmodule。
 *
 * 改行の位置 `n` は次の3種類（どれも、その改行の直前の位置）:
 *   - textblock（段落・見出し・コードブロック。引用・リストの中も、空のものも含む）の中身の終わり: `pos + nodeSize - 1`（空なら `pos + 1`）。
 *   - textblockの中のhardBreakの位置。
 *   - コードブロックのtextの中の `\n` の位置。
 * 範囲 `[from, to)` に改行が入っている ⇔ `from ≤ n < to`。
 *
 * 例外: 文書の最後の中身（textblockまたはblockのatom）の後ろには改行がない。textblockの終わりの改行は、
 * 「そのtextblockより後ろに、文書の中身（textblock・blockのatom）がある」ときだけ数える。
 * 全選択（`to = doc.content.size`）の最後のtextblockの末尾に帯を出さないための規則で、`TextSelection`では
 * `to`が後ろのtextblockの中にしかないので自然に満たされる。引用・リストの中の最後のtextblockも同じ。
 * hardBreak・コード内の`\n`は、どれもtextblockの内側にあるので、この例外の対象外。
 *
 * 並びは**Docのobjectごとに1回だけ**作り（`WeakMap<Node, number[]>`）、範囲ごとには二分探索で `[from, to)` の部分だけを取る。
 */

export type NewlinePositions = readonly number[]

const cache = new WeakMap<PMNode, NewlinePositions>()
const stats = { builds: 0 }
/** 試験用: 並びを作った回数（同じDocで1回だけであることを数える）。 */
export const newlineBuildCount = () => stats.builds

/** 文書の最後の中身（textblockまたはblockのatom）の開始位置。なければ-1。 */
function lastContentStart(node: PMNode, contentStart: number): number {
  let end = contentStart + node.content.size
  for (let index = node.childCount - 1; index >= 0; index--) {
    const child = node.child(index)
    end -= child.nodeSize
    if (child.isTextblock || (child.isBlock && child.isLeaf)) return end
    if (!child.isLeaf && child.childCount) {
      const found = lastContentStart(child, end + 1)
      if (found >= 0) return found
    }
  }
  return -1
}

function collect(node: PMNode, contentStart: number, lastStart: number, out: number[]) {
  node.forEach((child, offset) => {
    const pos = contentStart + offset
    if (child.isTextblock) {
      const code = !!child.type.spec.code
      child.forEach((inline, inlineOffset) => {
        if (inline.type.name === 'hardBreak') out.push(pos + 1 + inlineOffset)
        else if (code && inline.isText) {
          const text = inline.text ?? ''
          for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) out.push(pos + 1 + inlineOffset + index)
        }
      })
      // 後ろに文書の中身があるときだけ、textblockの終わりの改行を数える（最後の中身の後ろには改行がない）。
      if (lastStart > pos) out.push(pos + child.nodeSize - 1)
    } else if (!child.isLeaf && child.childCount) collect(child, pos + 1, lastStart, out)
  })
}

/** 文書の改行の位置の昇順の並び。同じDocのobjectでは、作り直さずに同じ配列を返す。 */
export function newlinePositionsOf(doc: PMNode): NewlinePositions {
  const cached = cache.get(doc)
  if (cached) return cached
  stats.builds++
  const out: number[] = []
  collect(doc, 0, lastContentStart(doc, 0), out)
  cache.set(doc, out)
  return out
}

/** 昇順の配列で、`value`以上の最初の添字。 */
function lowerBound(values: NewlinePositions, value: number): number {
  let low = 0, high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (values[middle] < value) low = middle + 1
    else high = middle
  }
  return low
}

/** `from ≤ n < to` の改行の数（二分探索2回。配列は作らない）。 */
export function countNewlinesBetween(positions: NewlinePositions, from: number, to: number): number {
  if (!(from < to)) return 0
  return lowerBound(positions, to) - lowerBound(positions, from)
}

/** `from ≤ n < to` の改行の位置。数が`limit`を超えるときは、配列を作らずに`null`（帯を描かない）。 */
export function newlinesBetween(positions: NewlinePositions, from: number, to: number, limit: number): number[] | null {
  if (!(from < to)) return []
  const start = lowerBound(positions, from), end = lowerBound(positions, to)
  if (end - start > limit) return null
  return positions.slice(start, end) as number[]
}
