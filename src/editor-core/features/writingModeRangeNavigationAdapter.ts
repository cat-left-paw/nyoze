/** supported writing-mode Shift+Arrow range extension の中立adapter。 */
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  isSafeWritingModeArrowGraphemeCaret,
  resolveSupportedEditorWritingMode,
  resolveWritingModeArrowMapping,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'

export type WritingModeRangeNavigationRejectReason =
  | 'command-rejected'
  | 'unsafe-grapheme-boundary'
  | 'dom-selection-unavailable'
  | 'modify-failed'
  | 'pos-unresolved'
  | 'anchor-drifted'

export type WritingModeRangeNavigationPlan =
  | { ok: true; moved: false; transaction: null }
  | { ok: true; moved: true; transaction: Transaction }
  | { ok: false; reason: WritingModeRangeNavigationRejectReason }

export type WritingModeRangeNavigationCommitResult =
  | { ok: true; moved: boolean; transactionCount: number }
  | { ok: false; reason: WritingModeRangeNavigationRejectReason }

type DomPoint = { node: Node; offset: number }

function deepestTextBoundaryPoint(point: DomPoint, edge: 'start' | 'end'): DomPoint | null {
  if (point.node.nodeType === Node.TEXT_NODE) return point
  const child = edge === 'start'
    ? point.node.childNodes.item(point.offset)
    : point.offset > 0 ? point.node.childNodes.item(point.offset - 1) : null
  if (!child) return null
  let current = child
  while (current.nodeType !== Node.TEXT_NODE) {
    const next = edge === 'start' ? current.firstChild : current.lastChild
    if (!next) return null
    current = next
  }
  const text = current as Text
  return { node: text, offset: edge === 'start' ? 0 : text.data.length }
}

function isExactDomPoint(view: EditorView, position: number, point: DomPoint): boolean {
  try { return view.posAtDOM(point.node, point.offset, 1) === position }
  catch { return false }
}

function domPointAtPmPosition(view: EditorView, position: number): DomPoint | null {
  try {
    const $position = view.state.doc.resolve(position)
    const side = $position.parent.isTextblock && $position.parentOffset === 0
      ? 1
      : $position.parent.isTextblock && $position.parentOffset === $position.parent.content.size
        ? -1
        : 0
    const point = view.domAtPos(position, side) as DomPoint
    if (!(point.node instanceof Node)) return null
    const maxOffset = point.node.nodeType === Node.TEXT_NODE
      ? (point.node as Text).data.length
      : point.node.childNodes.length
    if (point.offset < 0 || point.offset > maxOffset) return null
    const edge = $position.parent.isTextblock && $position.parentOffset === 0
      ? 'start'
      : $position.parent.isTextblock && $position.parentOffset === $position.parent.content.size
        ? 'end'
        : null
    if (edge) {
      const textPoint = deepestTextBoundaryPoint(point, edge)
      if (textPoint && isExactDomPoint(view, position, textPoint)) return textPoint
    }
    return point
  } catch {
    return null
  }
}

function resolveDomPosition(view: EditorView, node: Node | null, offset: number): number | null {
  if (!node || (!view.dom.contains(node) && node !== view.dom)) return null
  try {
    const position = view.posAtDOM(node, offset, 1)
    return Number.isFinite(position) && position >= 0 && position <= view.state.doc.content.size
      ? position
      : null
  } catch {
    return null
  }
}

export function syncWritingModeRangeDomSelectionFromPm(view: EditorView): boolean {
  const selection = view.state.selection
  if (!(selection instanceof TextSelection)) return false
  const anchor = domPointAtPmPosition(view, selection.anchor)
  const head = domPointAtPmPosition(view, selection.head)
  const domSelection = view.dom.ownerDocument.defaultView?.getSelection()
  if (!anchor || !head || !domSelection || typeof domSelection.setBaseAndExtent !== 'function') {
    return false
  }
  try {
    view.focus()
    domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
  } catch {
    return false
  }
  return resolveDomPosition(view, domSelection.anchorNode, domSelection.anchorOffset) === selection.anchor &&
    resolveDomPosition(view, domSelection.focusNode, domSelection.focusOffset) === selection.head
}

export function resolveWritingModeRangeNavigationPlan(input: {
  view: EditorView
  state: EditorState
  operation: WritingModeArrowOperation
  writingMode: string
}): WritingModeRangeNavigationPlan {
  const writingMode = resolveSupportedEditorWritingMode(input.writingMode)
  if (!writingMode || !(input.state.selection instanceof TextSelection)) {
    return { ok: false, reason: 'command-rejected' }
  }
  const { view, state, operation } = input
  if (!syncWritingModeRangeDomSelectionFromPm(view)) {
    return { ok: false, reason: 'dom-selection-unavailable' }
  }
  const domSelection = view.dom.ownerDocument.defaultView?.getSelection()
  if (!domSelection || typeof domSelection.modify !== 'function') {
    return { ok: false, reason: 'dom-selection-unavailable' }
  }
  const beforeAnchor = state.selection.anchor
  const beforeHead = state.selection.head
  const rejectAfterModify = (reason: WritingModeRangeNavigationRejectReason) => {
    if (!syncWritingModeRangeDomSelectionFromPm(view)) {
      return { ok: false as const, reason: 'dom-selection-unavailable' as const }
    }
    return { ok: false as const, reason }
  }
  const mapping = resolveWritingModeArrowMapping(writingMode, operation)
  try { domSelection.modify('extend', mapping.direction, mapping.granularity) }
  catch { return rejectAfterModify('modify-failed') }
  const anchor = resolveDomPosition(view, domSelection.anchorNode, domSelection.anchorOffset)
  if (anchor === null) return rejectAfterModify('pos-unresolved')
  if (anchor !== beforeAnchor) return rejectAfterModify('anchor-drifted')
  const head = resolveDomPosition(view, domSelection.focusNode, domSelection.focusOffset)
  if (head === null) return rejectAfterModify('pos-unresolved')
  if (head === beforeHead) {
    return syncWritingModeRangeDomSelectionFromPm(view)
      ? { ok: true, moved: false, transaction: null }
      : { ok: false, reason: 'dom-selection-unavailable' }
  }
  if (!isSafeWritingModeArrowGraphemeCaret(state, head)) {
    return rejectAfterModify('unsafe-grapheme-boundary')
  }
  try {
    return {
      ok: true,
      moved: true,
      transaction: state.tr
        .setSelection(TextSelection.create(state.doc, beforeAnchor, head))
        .setMeta('addToHistory', false)
        .scrollIntoView(),
    }
  } catch {
    return rejectAfterModify('command-rejected')
  }
}

function wasRangeTransactionApplied(input: {
  beforeState: EditorState
  currentState: EditorState
  transaction: Transaction
}): boolean {
  return input.currentState !== input.beforeState &&
    input.currentState.doc.eq(input.transaction.doc) &&
    input.currentState.selection.eq(input.transaction.selection)
}

export function commitWritingModeRangeNavigationPlan(input: {
  view: EditorView
  plan: Extract<WritingModeRangeNavigationPlan, { ok: true }>
  dispatch: (transaction: Transaction) => void
}): WritingModeRangeNavigationCommitResult {
  const { view, plan, dispatch } = input
  if (!plan.moved || !plan.transaction) return { ok: true, moved: false, transactionCount: 0 }
  const beforeState = view.state
  try { dispatch(plan.transaction) } catch {
    const applied = wasRangeTransactionApplied({ beforeState, currentState: view.state, transaction: plan.transaction })
    const synced = syncWritingModeRangeDomSelectionFromPm(view)
    return applied && synced
      ? { ok: true, moved: true, transactionCount: 1 }
      : { ok: false, reason: 'command-rejected' }
  }
  const applied = wasRangeTransactionApplied({ beforeState, currentState: view.state, transaction: plan.transaction })
  const synced = syncWritingModeRangeDomSelectionFromPm(view)
  return applied && synced
    ? { ok: true, moved: true, transactionCount: 1 }
    : { ok: false, reason: 'command-rejected' }
}
