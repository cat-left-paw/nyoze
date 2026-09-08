/** vertical-rl bare Arrow compatibility adapter。中立primitiveへ委譲する。 */
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  commitWritingModeArrowNavigationPlan,
  resolveWritingModeArrowNavigationPlan,
  type WritingModeArrowNavigationCommitResult,
  type WritingModeArrowNavigationPlan,
  type WritingModeArrowNavigationRejectReason,
} from './writingModeArrowNavigationAdapter'
import { syncWritingModeArrowDomSelectionFromPm } from './writingModeArrowNavigationDomSelection'
import { classifyVerticalRlArrowKey, type VerticalRlArrowOperation } from './verticalRlArrowNavigationState'

export type VerticalRlArrowNavigationRejectReason = WritingModeArrowNavigationRejectReason
export type VerticalRlArrowNavigationPlan = WritingModeArrowNavigationPlan
export type VerticalRlArrowNavigationCommitResult = WritingModeArrowNavigationCommitResult
export type VerticalRlArrowNavigationCommandResult = { handled: boolean; moved: boolean }

export function resolveVerticalRlArrowNavigationPlan(input: {
  view: EditorView
  state: EditorState
  operation: VerticalRlArrowOperation
  writingMode: string
}): VerticalRlArrowNavigationPlan {
  if (input.writingMode !== 'vertical-rl') return { ok: false, reason: 'command-rejected' }
  return resolveWritingModeArrowNavigationPlan(input)
}

export function commitVerticalRlArrowNavigationPlan(input: {
  view: EditorView
  plan: Extract<VerticalRlArrowNavigationPlan, { ok: true }>
  dispatch: (transaction: Transaction) => void
}): VerticalRlArrowNavigationCommitResult {
  return commitWritingModeArrowNavigationPlan(input)
}

export function runVerticalRlArrowNavigationCommand(input: {
  view: EditorView
  event: KeyboardEvent
  writingMode: string
  dispatch: (transaction: Transaction) => void
  beforeDispatch?: () => void
}): VerticalRlArrowNavigationCommandResult {
  const { view, event, writingMode, dispatch, beforeDispatch } = input
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return { handled: false, moved: false }
  }
  if (event.isComposing || event.keyCode === 229 || !event.cancelable) {
    return { handled: false, moved: false }
  }
  const operation = classifyVerticalRlArrowKey(event.key)
  if (!operation || writingMode !== 'vertical-rl') return { handled: false, moved: false }
  // VERTICAL-RL-ARROW-RANGE-COLLAPSE1: rangeはhost/browser nativeへ委譲する。
  if (!(view.state.selection instanceof TextSelection) || !view.state.selection.empty) {
    return { handled: false, moved: false }
  }
  const plan = resolveVerticalRlArrowNavigationPlan({ view, state: view.state, operation, writingMode })
  if (!plan.ok) return { handled: true, moved: false }
  if (plan.moved && plan.transaction) {
    try { beforeDispatch?.() } catch (error) {
      syncWritingModeArrowDomSelectionFromPm(view)
      throw error
    }
  }
  const committed = commitVerticalRlArrowNavigationPlan({ view, plan, dispatch })
  return { handled: true, moved: committed.ok && committed.moved }
}
