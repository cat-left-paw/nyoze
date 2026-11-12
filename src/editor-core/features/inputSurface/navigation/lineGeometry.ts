import { createReadBatch } from './readBatch'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import type { SupportedEditorWritingMode } from '../../writingModeNavigationMapping'
import { blockCenter, copyRect, inlineStart, readCaretRect, validRect, type CaretRect } from './caretGeometry'
import { inlineAtomRanges, isInlineAtomNode, isInsideInlineAtom } from './inlineAtomNavigation'
import type { NavigationAffinity } from './rules'

export type Textblock = { start: number; end: number }
type TextFragment = { text: Text; rect: CaretRect }
export type DisplayLine = { block: Textblock; index: number; rect: CaretRect; fragments: TextFragment[] }
export type LinePosition = { pos: number; affinity: NavigationAffinity }
const excludedText = 'rt,rp,.tategaki-aozora-ruby-rt,[data-nyoze-special-inline-boundary],.ProseMirror-widget,[contenteditable="false"]'

/** View-local inventory. Only PM block positions are cached; layout is read afresh. */
export function createLineGeometry(view: EditorView, mode: SupportedEditorWritingMode) {
  const reads = createReadBatch((key: string) => {
    const [pos, affinity] = key.split(':')
    return readCaretRect(view, Number(pos), mode, affinity as NavigationAffinity)
  })
  const read = (pos: number, affinity: NavigationAffinity) => reads.read(`${pos}:${affinity}`)
  let document: PMNode | null = null
  let blocks: Textblock[] = []
  const all = () => {
    if (document !== view.state.doc) {
      document = view.state.doc
      blocks = []
      document.descendants((node, pos) => {
        if (!node.isTextblock) return true
        blocks.push({ start: pos + 1, end: pos + node.nodeSize - 1 })
        return false
      })
    }
    return blocks
  }
  const blockAt = (pos: number) => {
    const list = all()
    let lo = 0, hi = list.length
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid].end < pos) lo = mid + 1; else hi = mid }
    return list[lo]?.start <= pos ? list[lo] : null
  }
  const visible = (block: Textblock) => {
    const element = view.nodeDOM(block.start - 1) as HTMLElement | null
    if (!element?.getClientRects().length) return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const belongs = (rect: CaretRect, line: DisplayLine) => {
    const span = (r: CaretRect) => mode === 'vertical-rl' ? r.right - r.left : r.bottom - r.top
    return Math.abs(blockCenter(rect, mode) - blockCenter(line.rect, mode)) <= Math.max(1, Math.max(span(rect), span(line.rect)) / 2 + 0.5)
  }
  const enumerate = (block: Textblock): DisplayLine[] => {
    if (!visible(block)) return []
    const root = view.nodeDOM(block.start - 1)!, doc = view.dom.ownerDocument
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT), pieces: TextFragment[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text
      if (!text.length || text.parentElement?.closest(excludedText)) continue
      const range = doc.createRange()
      range.selectNodeContents(text)
      for (const rect of Array.from(range.getClientRects()).filter(validRect)) pieces.push({ text, rect: copyRect(rect) })
    }
    // Establish the base glyph row first. Small mark / TCY fragments then join it.
    const span = (r: CaretRect) => mode === 'vertical-rl' ? r.right - r.left : r.bottom - r.top
    pieces.sort((a, b) => span(b.rect) - span(a.rect))
    const lines: DisplayLine[] = []
    for (const piece of pieces) {
      let line = lines.find(item => belongs(piece.rect, item))
      if (!line) { line = { block, index: 0, rect: copyRect(piece.rect), fragments: [] }; lines.push(line) }
      line.fragments.push(piece)
      if (mode === 'vertical-rl') { line.rect.top = Math.min(line.rect.top, piece.rect.top); line.rect.bottom = Math.max(line.rect.bottom, piece.rect.bottom) }
      else { line.rect.left = Math.min(line.rect.left, piece.rect.left); line.rect.right = Math.max(line.rect.right, piece.rect.right) }
    }
    // PIS-INLINE-ATOM-NAV1: 字を持たない行（画像・縦中横・inline HTML・付箋のマーカーだけの行。改行で分かれた行など）も、
    // atomの矩形で行にする。字の断片だけで行を作ると、その行が表示の行の一覧から落ち、行の軸の矢印がその行を飛ばす。
    const hasTextLine = lines.length > 0
    const atomNode = view.state.doc.nodeAt(block.start - 1)
    for (const range of atomNode ? inlineAtomRanges(atomNode, block.start) : []) {
      const element = view.nodeDOM(range.from) as Element | null
      const box = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (!box || !(box.width > 0 && box.height > 0)) continue
      const rect = copyRect(box)
      const line = lines.find(item => belongs(rect, item))
      if (!line) { lines.push({ block, index: 0, rect, fragments: [] }); continue }
      if (mode === 'vertical-rl') { line.rect.top = Math.min(line.rect.top, rect.top); line.rect.bottom = Math.max(line.rect.bottom, rect.bottom) }
      else { line.rect.left = Math.min(line.rect.left, rect.left); line.rect.right = Math.max(line.rect.right, rect.right) }
    }
    // 字の行がないblock（空の段落、改行・atomだけの段落）では、先頭の位置の行を足す。atomの行があるときは、その行と別の行（改行だけの
    // 先頭の行など）のときだけ足す（atomの行を二重にしない）。字の行があるblockは従来どおり足さない。
    if (!hasTextLine) {
      const rect = read(block.start, 'head')
      if (rect && !lines.some(item => belongs(rect, item))) lines.push({ block, index: 0, rect, fragments: [] })
    }
    // PIS-S10-CODEBLOCK-CARET1: textが改行の字で終わるblockの末尾の空の行には字がない（trailing breakだけ）。
    // `read(block.end)`（trailing breakの矩形）を字のない行として足す。判定はPMのDocの事実だけ。
    const last = view.state.doc.nodeAt(block.start - 1)?.lastChild
    if (lines.length && last?.isText && last.text!.endsWith('\n')) {
      const rect = read(block.end, 'head')
      if (rect && !lines.some(line => belongs(rect, line))) lines.push({ block, index: 0, rect, fragments: [] })
    }
    lines.sort((a, b) => (blockCenter(a.rect, mode) - blockCenter(b.rect, mode)) * (mode === 'vertical-rl' ? -1 : 1))
    lines.forEach((line, index) => { line.index = index })
    return lines
  }
  const locate = (pos: number, affinity: NavigationAffinity) => {
    const block = blockAt(pos), rect = read(pos, affinity)
    if (!block || !rect) return null
    const lines = enumerate(block), line = lines.find(item => belongs(rect, item))
    return line ? { block, lines, line, rect } : null
  }
  const neighborBlock = (block: Textblock, direction: number) => {
    const list = all()
    for (let i = list.indexOf(block) + direction; i >= 0 && i < list.length; i += direction) if (visible(list[i])) return list[i]
    return null
  }
  const neighbor = (current: NonNullable<ReturnType<typeof locate>>, direction: number) => {
    const line = current.lines[current.line.index + direction]
    if (line) return line
    const block = neighborBlock(current.block, direction)
    if (!block) return null
    const lines = enumerate(block)
    return direction > 0 ? lines[0] ?? null : lines[lines.length - 1] ?? null
  }
  const accept = (pos: number, line: DisplayLine, affinity: NavigationAffinity) => {
    if (pos < line.block.start || pos > line.block.end) return false
    // PIS-INLINE-ATOM-NAV1: inlineのatom（縦中横の字の間など）の中の位置へは、どの経路でも着かせない。hit testの結果も含む。
    if (isInsideInlineAtom(view.state.doc.resolve(pos).parent)) return false
    const rect = read(pos, affinity)
    return !!rect && belongs(rect, line)
  }
  /**
   * PIS-INLINE-ATOM-NAV1: 行にあるinline atomの前後の位置。atomは行の字の断片（`enumerate()`）に入らない
   * （縦中横の字は`excludedText`で除外され、画像・inline HTML・付箋のマーカーは字を持たない）ので、行頭・行末・隣り合うatomの間の位置が
   * 候補から落ちていた。矩形がその行に属すatomだけを数え、各位置が行に属すかは`accept()`が決める。幅・高さのない要素（改行）は使わない。
   */
  const atomStops = (line: DisplayLine): number[] => {
    const node = view.state.doc.nodeAt(line.block.start - 1)
    if (!node) return []
    const stops: number[] = []
    for (const range of inlineAtomRanges(node, line.block.start)) {
      const element = view.nodeDOM(range.from) as Element | null
      const rect = typeof element?.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
      if (rect && rect.width > 0 && rect.height > 0 && belongs(rect, line)) stops.push(range.from, range.to)
    }
    return stops
  }
  const touchesInlineAtom = (pos: number) => {
    const $pos = view.state.doc.resolve(pos)
    return isInlineAtomNode($pos.nodeBefore) || isInlineAtomNode($pos.nodeAfter)
  }
  const bounds = (fragment: TextFragment, line: DisplayLine) => {
    const text = fragment.text, range = view.dom.ownerDocument.createRange()
    if (text.parentElement?.closest('[data-tategaki-tcy]')) return { from: 0, to: text.length }
    const sign = mode === 'vertical-rl' ? -1 : 1, target = blockCenter(line.rect, mode) * sign
    const lower = (strict: boolean) => {
      let lo = 0, hi = text.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        range.setStart(text, mid); range.setEnd(text, mid + 1)
        const rect = range.getBoundingClientRect(), onLine = belongs(rect, line)
        if ((!onLine && blockCenter(rect, mode) * sign < target) || (strict && onLine)) lo = mid + 1
        else hi = mid
      }
      return lo
    }
    return { from: lower(false), to: lower(true) }
  }
  const position = (line: DisplayLine, goal: number, edge?: 'home' | 'end'): LinePosition | null => {
    if (!line.fragments.length) {
      const stops = [...new Set([line.block.start, line.block.end, ...atomStops(line)])].filter(pos => accept(pos, line, 'head'))
      stops.sort((a, b) => edge === 'home' ? a - b : edge === 'end' ? b - a
        : Math.abs(inlineStart(read(a, 'head')!, mode) - goal) - Math.abs(inlineStart(read(b, 'head')!, mode) - goal))
      return stops.length ? { pos: stops[0], affinity: edge === 'end' ? 'end' : 'head' } : null
    }
    // Hit testing exactly on a row's inline start can return the second caret
    // (notably after an empty paragraph). Resolve that endpoint by DOM bounds.
    if (!edge && goal <= inlineStart(line.rect, mode) + 0.5) edge = 'home'
    const affinity: NavigationAffinity = edge === 'end' ? 'end' : 'head'
    const candidates = new Map<number, CaretRect>()
    const add = (pos: number) => {
      if (!accept(pos, line, affinity)) return
      const rect = read(pos, affinity)
      if (rect) candidates.set(pos, rect)
    }
    // The hit is only a candidate: never accept a result in another column or block.
    if (!edge) {
      const cross = blockCenter(line.rect, mode)
      const hit = view.posAtCoords(mode === 'vertical-rl' ? { left: cross, top: goal } : { left: goal, top: cross })
      // PIS-INLINE-ATOM-NAV1: hit testはatomの上・隣で、atomの反対側の位置を返すことがある（縦中横の上半分が後ろ、など）。
      // atomの隣の位置のhitは採らず、atomの前後を含む候補から、goalに最も近い位置を選ぶ。
      if (hit && accept(hit.pos, line, affinity) && !touchesInlineAtom(hit.pos)) return { pos: hit.pos, affinity }
    }
    for (const fragment of line.fragments) {
      const { from, to } = bounds(fragment, line)
      if (from >= to) continue
      const start = view.posAtDOM(fragment.text, from, -1), end = view.posAtDOM(fragment.text, to, 1)
      add(start); add(end)
      if (edge) continue
      let lo = start, hi = end
      while (lo < hi) {
        const mid = (lo + hi) >>> 1, rect = read(mid, affinity)
        if (rect && belongs(rect, line) && inlineStart(rect, mode) < goal) lo = mid + 1
        else hi = mid
      }
      for (const pos of [lo - 1, lo, lo + 1]) if (pos >= start && pos <= end) add(pos)
    }
    for (const pos of atomStops(line)) add(pos)
    const sorted = [...candidates].sort(([a, ra], [b, rb]) => edge === 'home' ? a - b : edge === 'end' ? b - a : Math.abs(inlineStart(ra, mode) - goal) - Math.abs(inlineStart(rb, mode) - goal) || b - a)
    return sorted.length ? { pos: sorted[0][0], affinity } : null
  }
  return { beginReadBatch: reads.begin, endReadBatch: reads.end, read, all, blockAt, visible, enumerate, locate, neighbor, neighborBlock, accept, position, lineHasAtoms: (line: DisplayLine) => atomStops(line).length > 0 }
}
