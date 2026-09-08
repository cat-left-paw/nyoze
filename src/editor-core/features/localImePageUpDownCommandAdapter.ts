/**
 * 局所 IME slot P2-C3 — bare PageUp / PageDown を通常 PM の `handlePageUpDownKey` へ委譲する adapter。
 *
 * scroll・caret 追従・境界 no-op・失敗時 scroll rollback は `pageUpDownNavigation.ts` が正本。
 * geometry / Selection.near / coords 計算をここへ複製しない。
 * DOM Selection 復元（`syncDomSelectionFromPm`）は不要（Page 正本は PM coords API）。
 *
 * overlay は段落全体を覆うため、`posAtCoords` ヒットテスト前に一時的に
 * pointer-events を止めないと通常 PM と selection がずれ得る。
 *
 * 表示系副作用（Typewriter jump suppress）は handled 成功後に controller が発行する。
 */

import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  runPageUpDownNavigationCommand,
  type PageUpDownNavigationCommandPlan,
} from './pageUpDownNavigation'
import type { LocalImePageUpDownNavigationOperation } from './localImeNavigationOperation'
import type { LocalImeNavigationCommandRejectReason } from './localImeNavigationCommandAdapter'
import { resolveSupportedEditorWritingMode } from './writingModeArrowNavigationState'

export type LocalImePageUpDownCommandResult =
  | {
      ok: true
      plan: PageUpDownNavigationCommandPlan
      transactionCount: 0 | 1
      moved: boolean
      scrollMoved: boolean
    }
  | { ok: false; reason: LocalImeNavigationCommandRejectReason }

/**
 * Page handoff 前の eligibility。DOM Range 復元は行わず `view.focus()` のみ。
 */
export function prepareLocalImePageUpDownHandoff(input: {
  view: EditorView
  state: EditorState
  writingMode: string
}): { ok: true } | { ok: false; reason: LocalImeNavigationCommandRejectReason } {
  const { view, state, writingMode } = input
  if (!resolveSupportedEditorWritingMode(writingMode)) {
    return { ok: false, reason: 'command-rejected' }
  }
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return { ok: false, reason: 'command-rejected' }
  }
  try {
    view.focus()
  } catch {
    return { ok: false, reason: 'command-rejected' }
  }
  return { ok: true }
}

/**
 * 通常 PM と同じ `handlePageUpDownKey` を実行する。
 *
 * `getIsComposing` は常に false（classify で composition を除外済み）。
 * Local Windowのactive判定を混ぜない。
 * `transactionCount` は selection.from 推測ではなく `getTransactionCount` 差分を正本とする。
 */
export function runLocalImePageUpDownCommand(input: {
  view: EditorView
  event: KeyboardEvent
  operation: LocalImePageUpDownNavigationOperation
  getTransactionCount: () => number
  pushLog?: (event: string, detail: string) => void
  dispatchTransaction?: (transaction: Transaction) => void
}): LocalImePageUpDownCommandResult {
  const { view, event, pushLog } = input
  const result = runPageUpDownNavigationCommand(view, event, {
    getIsComposing: () => false,
    pushLog: pushLog ?? (() => {}),
    dispatchTransaction: input.dispatchTransaction,
  })
  if (!result.handled) {
    return { ok: false, reason: 'command-rejected' }
  }
  return {
    ok: true,
    plan: result,
    transactionCount: result.expectedTransactionCount,
    moved: result.moved,
    scrollMoved: !result.boundaryNoop,
  }
}
