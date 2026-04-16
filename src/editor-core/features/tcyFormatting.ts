import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'

type Dispatch = (tr: Transaction) => void

export type TcyTextRange = {
  from: number
  to: number
  text: string
}

function isSelectionWithinSingleTcyRange(
  state: EditorState,
  ranges: readonly TcyTextRange[],
): boolean {
  if (ranges.length !== 1) return false
  const range = ranges[0]
  if (!range) return false
  const { from, to } = state.selection
  return from >= range.from && to <= range.to
}

function appendTcyRange(
  ranges: TcyTextRange[],
  seen: Set<number>,
  node: PMNode,
  pos: number,
): void {
  if (node.type.name !== 'aozoraTcy') return
  if (seen.has(pos)) return
  seen.add(pos)
  ranges.push({
    from: pos,
    to: pos + node.nodeSize,
    text: node.textContent,
  })
}

function collectAncestorTcyRanges(
  state: EditorState,
  pos: number,
  ranges: TcyTextRange[],
  seen: Set<number>,
): void {
  const $pos = state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.name !== 'aozoraTcy') continue
    appendTcyRange(ranges, seen, node, $pos.before(depth))
  }
}

export function resolveSelectedTcyRanges(state: EditorState): TcyTextRange[] {
  const ranges: TcyTextRange[] = []
  const seen = new Set<number>()
  const { selection, doc } = state

  if (selection instanceof NodeSelection && selection.node.type.name === 'aozoraTcy') {
    appendTcyRange(ranges, seen, selection.node, selection.from)
  }

  collectAncestorTcyRanges(state, selection.from, ranges, seen)
  if (selection.to !== selection.from) {
    collectAncestorTcyRanges(state, selection.to, ranges, seen)
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name !== 'aozoraTcy') return true
      appendTcyRange(ranges, seen, node, pos)
      return false
    })
  }

  ranges.sort((a, b) => a.from - b.from)
  return ranges
}

export function unwrapSelectedTcy(
  state: EditorState,
  dispatch?: Dispatch,
): number {
  const ranges = resolveSelectedTcyRanges(state)
  if (ranges.length === 0) return 0

  let tr = state.tr
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index]
    if (!range) continue
    tr = tr.replaceWith(range.from, range.to, state.schema.text(range.text))
  }

  if (dispatch) dispatch(tr)
  return ranges.length
}

export function isProtectedTcySelection(state: EditorState): boolean {
  const { selection } = state
  if (selection instanceof NodeSelection) {
    return selection.node.type.name === 'aozoraTcy'
  }

  const ranges = resolveSelectedTcyRanges(state)
  return isSelectionWithinSingleTcyRange(state, ranges)
}

export function shouldBlockTcyTextInput(
  state: EditorState,
  inputType: string | null | undefined,
): boolean {
  if (!inputType?.startsWith('insert')) return false
  return isProtectedTcySelection(state)
}
