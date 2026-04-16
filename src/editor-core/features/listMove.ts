import { Fragment } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'

type Dispatch = (tr: Transaction) => void

const LIST_NODE_NAMES = new Set(['bulletList', 'orderedList'])

/**
 * Resolve the innermost listItem depth and its parent list depth
 * from the current selection anchor.
 */
function resolveListContext(
  state: EditorState,
): { listItemDepth: number; listDepth: number; indexInList: number } | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== 'listItem') continue
    const parentDepth = d - 1
    if (parentDepth < 0) continue
    const parent = $from.node(parentDepth)
    if (!LIST_NODE_NAMES.has(parent.type.name)) continue
    return {
      listItemDepth: d,
      listDepth: parentDepth,
      indexInList: $from.index(parentDepth),
    }
  }
  return null
}

/**
 * Move the list item under the cursor one position toward the document start
 * (swap with the previous sibling). Only operates within the same hierarchy level.
 *
 * Returns `true` if the command is applicable (call without dispatch to probe).
 */
export function moveListItemUp(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const ctx = resolveListContext(state)
  if (!ctx) return false
  if (ctx.indexInList <= 0) return false
  if (!dispatch) return true

  const { $from } = state.selection
  const parentList = $from.node(ctx.listDepth)
  const currentItem = parentList.child(ctx.indexInList)
  const prevItem = parentList.child(ctx.indexInList - 1)

  const listContentStart = $from.start(ctx.listDepth)
  let offset = 0
  for (let i = 0; i < ctx.indexInList - 1; i++) {
    offset += parentList.child(i).nodeSize
  }
  const prevItemStart = listContentStart + offset
  const currentItemEnd = prevItemStart + prevItem.nodeSize + currentItem.nodeSize

  const cursorOffsetInItem = $from.pos - (prevItemStart + prevItem.nodeSize)

  const tr = state.tr.replaceWith(
    prevItemStart,
    currentItemEnd,
    Fragment.from([currentItem, prevItem]),
  )

  const newCursorPos = Math.min(
    prevItemStart + cursorOffsetInItem,
    tr.doc.content.size,
  )
  try {
    tr.setSelection(TextSelection.create(tr.doc, Math.max(1, newCursorPos)))
  } catch {
    // fall through — default mapping is acceptable
  }

  dispatch(tr.scrollIntoView())
  return true
}

/**
 * Move the list item under the cursor one position toward the document end
 * (swap with the next sibling). Only operates within the same hierarchy level.
 *
 * Returns `true` if the command is applicable (call without dispatch to probe).
 */
export function moveListItemDown(
  state: EditorState,
  dispatch?: Dispatch,
): boolean {
  const ctx = resolveListContext(state)
  if (!ctx) return false
  const { $from } = state.selection
  const parentList = $from.node(ctx.listDepth)
  if (ctx.indexInList >= parentList.childCount - 1) return false
  if (!dispatch) return true

  const currentItem = parentList.child(ctx.indexInList)
  const nextItem = parentList.child(ctx.indexInList + 1)

  const listContentStart = $from.start(ctx.listDepth)
  let offset = 0
  for (let i = 0; i < ctx.indexInList; i++) {
    offset += parentList.child(i).nodeSize
  }
  const currentItemStart = listContentStart + offset
  const nextItemEnd = currentItemStart + currentItem.nodeSize + nextItem.nodeSize

  const cursorOffsetInItem = $from.pos - currentItemStart

  const tr = state.tr.replaceWith(
    currentItemStart,
    nextItemEnd,
    Fragment.from([nextItem, currentItem]),
  )

  const newCursorPos = Math.min(
    currentItemStart + nextItem.nodeSize + cursorOffsetInItem,
    tr.doc.content.size,
  )
  try {
    tr.setSelection(TextSelection.create(tr.doc, Math.max(1, newCursorPos)))
  } catch {
    // fall through
  }

  dispatch(tr.scrollIntoView())
  return true
}
