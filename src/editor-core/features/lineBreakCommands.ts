/**
 * 通常本文の Shift+Enter を、key handler と局所 IME slot handoff の両方から
 * 同じ意味論で実行する小さな command helper。
 *
 * 改行ポリシーの対象判定は `lineBreakGuards.ts` を正本とする。ここは transaction
 * の組み立てだけを担い、Paragraph Plain / list / blockquote へは適用しない。
 */

import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { LineBreakPolicy } from '../types'
import {
  shouldBlockShiftEnterInRegularBody,
  shouldInsertHardBreakOnShiftEnterInRegularBody,
} from './lineBreakGuards'

export type RegularBodyShiftEnterResult =
  | 'inserted-hard-break'
  | 'blocked'
  | 'not-applicable'

export function runRegularBodyShiftEnter(input: {
  state: EditorState
  lineBreakPolicy: LineBreakPolicy
  dispatch?: (tr: Transaction) => void
}): RegularBodyShiftEnterResult {
  const { state, lineBreakPolicy, dispatch } = input
  if (shouldInsertHardBreakOnShiftEnterInRegularBody(state, lineBreakPolicy)) {
    const hardBreakType = state.schema.nodes.hardBreak
    if (!hardBreakType) return 'not-applicable'
    dispatch?.(state.tr.replaceSelectionWith(hardBreakType.create()).scrollIntoView())
    return 'inserted-hard-break'
  }
  if (shouldBlockShiftEnterInRegularBody(state, lineBreakPolicy)) {
    return 'blocked'
  }
  return 'not-applicable'
}
