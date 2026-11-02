import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import { resolveRubyAncestorRangeAtPos } from '../rubyBoundarySelection'
import { wouldDeleteNoteAnchorWithKey } from '../noteAnchorDeleteKey'

export type DeleteKey = 'Backspace' | 'Delete'
type DeleteRange = { from: number; to: number }
export type OwnerDeletionPlan =
  | ({ kind: 'delete'; caret: number; reason: 'ruby' | 'inline' | 'range' | 'grapheme' } & DeleteRange)
  | ({ kind: 'delegate'; caret: number } & DeleteRange)
  | { kind: 'boundary' | 'collapse'; from: number; to: number; caret: number }
  | { kind: 'blocked'; reason: string; from: number; to: number }

/** Rubyの位置の正本はHostと共用。DOM selectionは読まない。 */
export function expandDeletionForEmptyRuby(state: EditorState, from: number, to: number): DeleteRange {
  let expandedFrom = from, expandedTo = to
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'aozoraRuby') return true
    if (from <= pos + 1 && to >= pos + node.nodeSize - 1) {
      const range = resolveRubyAncestorRangeAtPos(state, pos + 1)!
      expandedFrom = Math.min(expandedFrom, range.from)
      expandedTo = Math.max(expandedTo, range.to)
    }
    return false
  })
  return { from: expandedFrom, to: expandedTo }
}

export function resolveGraphemeDeleteRange(state: EditorState, pos: number, key: DeleteKey): DeleteRange | null {
  const $pos = state.doc.resolve(pos)
  if (!$pos.parent.isTextblock) return null
  let text = ''
  $pos.parent.forEach(node => { text += node.isText ? node.text ?? '' : '\ufffc'.repeat(node.nodeSize) })
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => {
      segment(text: string): Iterable<{ index: number; segment: string }>
    }
  }).Segmenter
  if (!Segmenter) return null
  const offset = $pos.parentOffset
  const segments = Array.from(new Segmenter('ja', { granularity: 'grapheme' }).segment(text))
  const segment = key === 'Backspace'
    ? segments.find(s => s.index < offset && s.index + s.segment.length === offset)
    : segments.find(s => s.index === offset)
  if (!segment || segment.segment.includes('\ufffc')) return null
  return { from: $pos.start() + segment.index, to: $pos.start() + segment.index + segment.segment.length }
}

export function resolveOwnerDeletion(state: EditorState, key: DeleteKey): OwnerDeletionPlan {
  const { selection } = state
  // 付箋の削除authorityはHostの同じpure判定。metaを付けて保護を迂回しない。
  if (wouldDeleteNoteAnchorWithKey(state, key)) return { kind: 'blocked', reason: 'note-anchor-protected', from: selection.from, to: selection.to }
  if (!selection.empty) {
    const range = expandDeletionForEmptyRuby(state, selection.from, selection.to)
    return { kind: 'delete', ...range, caret: range.from, reason: 'range' }
  }
  if (!(selection instanceof TextSelection)) return { kind: 'blocked', reason: 'non-text-selection', from: selection.from, to: selection.to }
  let pos = selection.head
  const ruby = resolveRubyAncestorRangeAtPos(state, pos)
  if (ruby) {
    const node = state.doc.nodeAt(ruby.from)!
    // Hostでは親文字先頭のBackspaceはRuby外。空Rubyは外の本文を触らず丸ごと除く。
    if (node.content.size === 0 || key === 'Delete' || pos > ruby.from + 1) return { kind: 'delete', ...ruby, caret: ruby.from, reason: 'ruby' }
    pos = ruby.from
  }
  let $pos = state.doc.resolve(pos)
  if (!$pos.parent.isTextblock) {
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth)
      if (!node.isInline) continue
      return { kind: 'delete', from: $pos.before(depth), to: $pos.after(depth), caret: $pos.before(depth), reason: 'inline' }
    }
    return { kind: 'blocked', reason: 'non-textblock-parent', from: pos, to: pos }
  }
  const adjacent = key === 'Backspace' ? $pos.nodeBefore : $pos.nodeAfter
  if (adjacent?.isInline && !adjacent.isText) {
    const range = adjacent.type.name === 'aozoraRuby'
      ? resolveRubyAncestorRangeAtPos(state, key === 'Backspace' ? pos - 1 : pos + 1)!
      : { from: key === 'Backspace' ? pos - adjacent.nodeSize : pos, to: key === 'Backspace' ? pos : pos + adjacent.nodeSize }
    if (adjacent.type.name === 'noteAnchor') return { kind: 'blocked', reason: 'note-anchor-protected', ...range }
    return { kind: 'delete', ...range, caret: range.from, reason: adjacent.type.name === 'aozoraRuby' ? 'ruby' : 'inline' }
  }
  const grapheme = resolveGraphemeDeleteRange(state, pos, key)
  if (ruby) {
    if (grapheme) return { kind: 'delete', ...grapheme, caret: grapheme.from, reason: 'grapheme' }
    $pos = state.doc.resolve(pos)
    return { kind: pos === 1 ? 'collapse' : 'boundary', from: pos, to: pos, caret: pos }
  }
  return { kind: 'delegate', from: grapheme?.from ?? pos, to: grapheme?.to ?? pos, caret: pos }
}

/** Hostのselection削除の意味を保つ。Ruby拡張時だけ一時selectionを同じtrへ載せる。 */
export function buildOwnerRangeDeletionTransaction(state: EditorState, range: DeleteRange): Transaction {
  const tr = state.tr
  if (range.from !== state.selection.from || range.to !== state.selection.to) {
    tr.setSelection(TextSelection.create(state.doc, range.from, range.to))
  }
  return tr.deleteSelection()
}

type ContentUnit = { value: string; from: number; to: number }
/** stepが触れた範囲だけを読む。inline attrs（読み・画像・付箋id）も消失検査へ含める。 */
function contentUnits(doc: PMNode, from: number, to: number): ContentUnit[] {
  const units: ContentUnit[] = []
  if (from === to) return units
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      const begin = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize)
      for (let p = begin; p < end; p++) units.push({ value: node.text![p - pos], from: p, to: p + 1 })
    } else if (node.isInline) {
      units.push({ value: JSON.stringify(node.toJSON()), from: pos, to: pos + node.nodeSize })
      return false
    }
    return true
  })
  return units
}

/** appendedはmarks / attrsを正規化できる。最終Docに全ての既存文字が残ることを検査。 */
export function auditTextPreservingTransaction(tr: Transaction): string | null {
  // leafTextとblock区切りは含めず、PM text nodeの文字だけを比較する。
  const before = tr.before.textBetween(0, tr.before.content.size, '', '')
  const after = tr.doc.textBetween(0, tr.doc.content.size, '', '')
  if (before === after) return null
  let cursor = 0
  for (let i = 0; i < before.length; i++) {
    while (cursor < after.length && after[cursor] !== before[i]) cursor++
    if (cursor === after.length) return 'appended-text-loss'
    cursor++
  }
  return null
}

export function auditOwnerDeletionTransaction(state: EditorState, plan: OwnerDeletionPlan, tr: Transaction): string | null {
  if (tr.before !== state.doc) return 'stale-delete-base'
  if (plan.kind === 'blocked') return plan.reason
  if (plan.kind === 'delete') {
    const expected = plan.reason === 'range'
      ? buildOwnerRangeDeletionTransaction(state, plan) : state.tr.delete(plan.from, plan.to)
    return tr.doc.eq(expected.doc) ? null : 'outside-planned-delete'
  }
  if (plan.kind === 'collapse') return tr.doc.eq(state.doc) ? null : 'collapse-changed-content'
  for (let i = 0; i < tr.steps.length; i++) {
    const before = tr.docs[i], after = i + 1 < tr.docs.length ? tr.docs[i + 1] : tr.doc
    let rejected = false
    const step = tr.steps[i].toJSON() as { stepType: string; pos?: number }
    if (step.stepType === 'attr' && step.pos !== undefined) {
      const oldNode = before.nodeAt(step.pos), newNode = after.nodeAt(step.pos)
      if (oldNode?.isInline && (!newNode || !oldNode.eq(newNode))) return 'inline-attrs-changed-during-delete'
    }
    tr.steps[i].getMap().forEach((from, to, newFrom, newTo) => {
      if (rejected) return
      // Mapping.invert()はsliceのfrom/toを使わないので、先行stepだけを明示コピー。
      const inverse = new Mapping(tr.mapping.maps.slice(0, i)).invert()
      const required = contentUnits(before, from, to).filter(unit => {
        const start = inverse.mapResult(unit.from, 1), end = inverse.mapResult(unit.to, -1)
        return start.deleted || end.deleted || start.pos < plan.from || end.pos > plan.to
      })
      const output = contentUnits(after, newFrom, newTo)
      let cursor = 0
      for (const unit of required) {
        while (cursor < output.length && output[cursor].value !== unit.value) cursor++
        if (cursor === output.length) { rejected = true; return }
        cursor++
      }
    })
    if (rejected) return 'text-loss-exceeds-delete-budget'
  }
  return null
}
