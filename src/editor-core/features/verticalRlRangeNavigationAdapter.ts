/** vertical-rl Shift+Arrow compatibility adapter。 */
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { VerticalRlArrowOperation } from './verticalRlArrowNavigationState'
import {
  commitWritingModeRangeNavigationPlan,
  resolveWritingModeRangeNavigationPlan,
  syncWritingModeRangeDomSelectionFromPm,
  type WritingModeRangeNavigationCommitResult,
  type WritingModeRangeNavigationPlan,
  type WritingModeRangeNavigationRejectReason,
} from './writingModeRangeNavigationAdapter'

export type VerticalRlRangeNavigationRejectReason = WritingModeRangeNavigationRejectReason
export type VerticalRlRangeNavigationPlan = WritingModeRangeNavigationPlan
export type VerticalRlRangeNavigationCommitResult = WritingModeRangeNavigationCommitResult

export function syncVerticalRlRangeDomSelectionFromPm(view: EditorView): boolean {
  return syncWritingModeRangeDomSelectionFromPm(view)
}

export function resolveVerticalRlRangeNavigationPlan(input: {
  view: EditorView
  state: EditorState
  operation: VerticalRlArrowOperation
  writingMode: string
}): VerticalRlRangeNavigationPlan {
  if (input.writingMode !== 'vertical-rl') return { ok: false, reason: 'command-rejected' }
  return resolveWritingModeRangeNavigationPlan(input)
}

export function commitVerticalRlRangeNavigationPlan(input: {
  view: EditorView
  plan: Extract<VerticalRlRangeNavigationPlan, { ok: true }>
  dispatch: (transaction: Transaction) => void
}): VerticalRlRangeNavigationCommitResult {
  return commitWritingModeRangeNavigationPlan(input)
}
