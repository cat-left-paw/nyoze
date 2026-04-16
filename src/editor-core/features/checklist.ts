import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { ResolvedPos } from '@tiptap/pm/model'

type Dispatch = (tr: Transaction) => void

function resolveChecklistItemAtResolvedPos(
  $pos: ResolvedPos,
): { pos: number; checked: boolean; attrs: Record<string, unknown> } | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.name !== 'listItem') continue
    const checked = node.attrs.checked
    if (checked !== true && checked !== false) continue
    return { pos: $pos.before(depth), checked, attrs: node.attrs as Record<string, unknown> }
  }
  return null
}

export function toggleChecklistItemAtSelection(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const target = resolveChecklistItemAtResolvedPos(state.selection.$from)
  if (!target) return false

  const nextChecked = !target.checked
  const tr = state.tr.setNodeMarkup(target.pos, undefined, {
    ...target.attrs,
    checked: nextChecked,
  })
  if (dispatch) dispatch(tr)
  return true
}

export function toggleChecklistItemAtDocPos(
  state: EditorState,
  pos: number,
  dispatch?: Dispatch,
): boolean {
  const safePos = Math.max(0, Math.min(pos, state.doc.content.size))
  const resolved = state.doc.resolve(safePos)
  const target = resolveChecklistItemAtResolvedPos(resolved)
  if (!target) return false

  const nextChecked = !target.checked
  const tr = state.tr.setNodeMarkup(target.pos, undefined, {
    ...target.attrs,
    checked: nextChecked,
  })
  if (dispatch) dispatch(tr)
  return true
}

export function clearCheckedChecklistItemsInRange(
  state: EditorState,
  from: number,
  to: number,
  dispatch?: Dispatch,
): number {
  const start = Math.min(from, to)
  const end = Math.max(from, to)

  let changedCount = 0
  let tr = state.tr

  state.doc.nodesBetween(start, end, (node, pos) => {
    if (node.type.name !== 'listItem') return
    if (node.attrs.checked !== true) return
    tr = tr.setNodeMarkup(pos, undefined, {
      ...(node.attrs as Record<string, unknown>),
      checked: false,
    })
    changedCount += 1
  })

  if (changedCount > 0 && dispatch) {
    dispatch(tr)
  }

  return changedCount
}

export function toggleChecklistInSelection(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const { from, to } = state.selection
  const start = Math.min(from, to)
  const end = Math.max(from, to)

  const targets: Array<{ pos: number; attrs: Record<string, unknown> }> = []
  state.doc.nodesBetween(start, end, (node, pos) => {
    if (node.type.name !== 'listItem') return
    targets.push({ pos, attrs: node.attrs as Record<string, unknown> })
  })

  if (targets.length === 0) return false

  const shouldEnableChecklist = targets.some(
    (target) => target.attrs.checked !== true && target.attrs.checked !== false,
  )
  const nextChecked: boolean | null = shouldEnableChecklist ? false : null

  let tr = state.tr
  let changed = false
  for (const target of targets) {
    if ((target.attrs.checked ?? null) === nextChecked) continue
    tr = tr.setNodeMarkup(target.pos, undefined, {
      ...target.attrs,
      checked: nextChecked,
    })
    changed = true
  }

  if (changed && dispatch) dispatch(tr)
  return changed
}
