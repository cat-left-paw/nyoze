/** supported writing-mode bare Arrow の strategy-neutral DOM Selection adapter。 */
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  isSafeWritingModeArrowGraphemeCaret,
  resolveSupportedEditorWritingMode,
  resolveWritingModeArrowMapping,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'
import {
  syncWritingModeArrowDomSelectionAtPmPosition,
  syncWritingModeArrowDomSelectionFromPm,
} from './writingModeArrowNavigationDomSelection'

export type WritingModeArrowNavigationRejectReason =
  | 'command-rejected'
  | 'unsafe-grapheme-boundary'
  | 'dom-selection-unavailable'
  | 'modify-failed'
  | 'pos-unresolved'

export type WritingModeArrowNavigationPlan =
  | { ok: true; moved: false; transaction: null }
  | { ok: true; moved: true; transaction: Transaction }
  | { ok: false; reason: WritingModeArrowNavigationRejectReason }

export type WritingModeArrowNavigationCommitResult =
  | { ok: true; transactionCount: number; moved: boolean }
  | { ok: false; reason: WritingModeArrowNavigationRejectReason }

export function resolveWritingModeArrowNavigationPlan(input: {
  view: EditorView
  state: EditorState
  operation: WritingModeArrowOperation
  writingMode: string
}): WritingModeArrowNavigationPlan {
  const writingMode = resolveSupportedEditorWritingMode(input.writingMode)
  if (!writingMode) return { ok: false, reason: 'command-rejected' }
  const { view, state, operation } = input
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return { ok: false, reason: 'command-rejected' }
  }
  if (!syncWritingModeArrowDomSelectionFromPm(view)) {
    return { ok: false, reason: 'dom-selection-unavailable' }
  }
  const domSelection = view.dom.ownerDocument.defaultView?.getSelection()
  if (!domSelection || typeof domSelection.modify !== 'function') {
    return { ok: false, reason: 'dom-selection-unavailable' }
  }
  const mapping = resolveWritingModeArrowMapping(writingMode, operation)
  const beforePos = selection.from
  const rejectAfterModify = (reason: WritingModeArrowNavigationRejectReason) => {
    if (!syncWritingModeArrowDomSelectionAtPmPosition(view, beforePos)) {
      return { ok: false as const, reason: 'dom-selection-unavailable' as const }
    }
    return { ok: false as const, reason }
  }
  try {
    domSelection.modify('move', mapping.direction, mapping.granularity)
  } catch {
    return rejectAfterModify('modify-failed')
  }
  if (!domSelection.focusNode) return rejectAfterModify('pos-unresolved')
  let nextPos: number
  try { nextPos = view.posAtDOM(domSelection.focusNode, domSelection.focusOffset, 1) }
  catch { return rejectAfterModify('pos-unresolved') }
  if (!Number.isFinite(nextPos) || nextPos < 0 || nextPos > state.doc.content.size) {
    return rejectAfterModify('pos-unresolved')
  }
  if (!isSafeWritingModeArrowGraphemeCaret(state, nextPos)) {
    return rejectAfterModify('unsafe-grapheme-boundary')
  }
  if (nextPos === beforePos) {
    return syncWritingModeArrowDomSelectionAtPmPosition(view, beforePos)
      ? { ok: true, moved: false, transaction: null }
      : { ok: false, reason: 'dom-selection-unavailable' }
  }
  try {
    return {
      ok: true,
      moved: true,
      transaction: state.tr.setSelection(TextSelection.create(state.doc, nextPos)).scrollIntoView(),
    }
  } catch {
    return rejectAfterModify('command-rejected')
  }
}

function wasTransactionApplied(input: {
  beforeState: EditorState
  currentState: EditorState
  transaction: Transaction
}): boolean {
  return input.currentState !== input.beforeState &&
    input.currentState.doc.eq(input.transaction.doc) &&
    input.currentState.selection.eq(input.transaction.selection)
}

export function commitWritingModeArrowNavigationPlan(input: {
  view: EditorView
  plan: Extract<WritingModeArrowNavigationPlan, { ok: true }>
  dispatch: (transaction: Transaction) => void
}): WritingModeArrowNavigationCommitResult {
  const { view, plan, dispatch } = input
  if (!plan.moved || !plan.transaction) return { ok: true, transactionCount: 0, moved: false }
  const beforeState = view.state
  try {
    dispatch(plan.transaction)
    return { ok: true, transactionCount: 1, moved: true }
  } catch {
    const domSynced = syncWritingModeArrowDomSelectionFromPm(view)
    return domSynced && wasTransactionApplied({
      beforeState,
      currentState: view.state,
      transaction: plan.transaction,
    })
      ? { ok: true, transactionCount: 1, moved: true }
      : { ok: false, reason: 'command-rejected' }
  }
}
