import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { collectAutoTcyRanges, type AutoTcyDigitRange } from './autoTcy'

export type AutoTcyDecorationConfig = Readonly<AutoTcyDigitRange & {
  enabled: boolean
  numbersOnly: boolean
}>

export type AutoTcyDecorationState = {
  readonly doc: ProseMirrorNode
  readonly config: AutoTcyDecorationConfig
  readonly decorations: DecorationSet
}

export function sameAutoTcyDecorationConfig(a: AutoTcyDecorationConfig, b: AutoTcyDecorationConfig): boolean {
  return a.enabled === b.enabled && a.minDigits === b.minDigits &&
    a.maxDigits === b.maxDigits && a.numbersOnly === b.numbersOnly
}

/** 範囲はtop-level block全体。除外する祖先では降りず、textごとのresolveは不要。 */
function collectDecorations(doc: ProseMirrorNode, from: number, to: number, digitRange: AutoTcyDigitRange, numbersOnly: boolean): Decoration[] {
  const decorations: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    const name = node.type.name
    if (name === 'aozoraTcy' || name === 'aozoraRuby' || name === 'codeBlock') return false
    if (!node.isText || !node.text) return true
    if (node.marks.some(mark => mark.type.name === 'link' || mark.type.name === 'code')) return true
    for (const range of collectAutoTcyRanges(node.text, { ...digitRange, numbersOnly })) {
      if (range.from >= range.to) continue
      decorations.push(Decoration.inline(pos + range.from, pos + range.to, {
        class: 'tategaki-md-tcy',
        'data-tategaki-auto-tcy': '1',
      }))
    }
    return true
  })
  return decorations
}

export function buildAutoTcyDecorations(doc: ProseMirrorNode, digitRange: AutoTcyDigitRange, numbersOnly = false): DecorationSet {
  return DecorationSet.create(doc, collectDecorations(doc, 0, doc.content.size, digitRange, numbersOnly))
}

export function buildAutoTcyDecorationState(doc: ProseMirrorNode, config: AutoTcyDecorationConfig): AutoTcyDecorationState {
  return {
    doc, config: { ...config },
    decorations: config.enabled ? buildAutoTcyDecorations(doc, config, config.numbersOnly) : DecorationSet.empty,
  }
}

/** sentinelと同じStepMap→最終Doc→top-level範囲。空mapのmark/attrs変更も拾う。 */
export function changedBlockRanges(tr: Transaction): Array<[number, number]> {
  const doc = tr.doc, size = doc.content.size, ranges: Array<[number, number]> = []
  if (tr.steps.length !== tr.mapping.maps.length) throw new Error('Auto TCY step/map mismatch')
  for (let index = 0; index < tr.mapping.maps.length; index++) {
    const rest = tr.mapping.slice(index + 1)
    const add = (newStart: number, newEnd: number) => {
      const from = Math.max(0, Math.min(size, rest.map(newStart, -1)))
      const to = Math.max(from, Math.min(size, rest.map(newEnd, 1)))
      const $from = doc.resolve(from), $to = doc.resolve(to)
      let start = $from.depth > 0 ? $from.before(1) : from
      let end = $to.depth > 0 ? $to.after(1) : to
      if ($from.depth === 0 && $from.nodeBefore) start = from - $from.nodeBefore.nodeSize
      if ($to.depth === 0 && $to.nodeAfter) end = to + $to.nodeAfter.nodeSize
      ranges.push([start, end])
    }
    let mapped = false
    tr.mapping.maps[index].forEach((_oldStart, _oldEnd, newStart, newEnd) => { mapped = true; add(newStart, newEnd) })
    if (!mapped) {
      // Add/RemoveMarkStepやAttrStepは本文が変わっていてもStepMapが空。
      const step = tr.steps[index].toJSON() as { from?: unknown; to?: unknown; pos?: unknown }
      if (typeof step.from === 'number' && Number.isFinite(step.from) && typeof step.to === 'number' && Number.isFinite(step.to) && step.from <= step.to) add(step.from, step.to)
      else if (typeof step.pos === 'number' && Number.isFinite(step.pos)) add(step.pos, step.pos)
      else throw new Error('Auto TCY changed range unavailable')
    }
  }
  if (!ranges.length) throw new Error('Auto TCY changed range unavailable')
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }
  return merged
}

export function applyAutoTcyDecorationTransaction(previous: AutoTcyDecorationState, tr: Transaction, config: AutoTcyDecorationConfig): AutoTcyDecorationState {
  if (previous.doc !== tr.before || !sameAutoTcyDecorationConfig(previous.config, config)) return buildAutoTcyDecorationState(tr.doc, config)
  if (!tr.docChanged) return previous
  if (!config.enabled) return { doc: tr.doc, config: { ...config }, decorations: DecorationSet.empty }
  try {
    let decorations = previous.decorations.map(tr.mapping, tr.doc)
    for (const [from, to] of changedBlockRanges(tr)) {
      const stale = decorations.find(from, to)
      if (stale.length) decorations = decorations.remove(stale)
      const fresh = collectDecorations(tr.doc, from, to, config, config.numbersOnly)
      if (fresh.length) decorations = decorations.add(tr.doc, fresh)
    }
    return { doc: tr.doc, config: { ...config }, decorations }
  } catch {
    return buildAutoTcyDecorationState(tr.doc, config)
  }
}
