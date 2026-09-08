/**
 * 局所 IME slot P2-C2 — bare Home / End を通常 PM の `handleHomeEndKey` へ委譲する adapter。
 *
 * 2 段階 visual → logical・ruby-aware edge・End nudge・scrollIntoView は
 * `homeEndNavigation.ts` が正本。ここは DOM 復元・eligibility だけ。
 *
 * teardown / re-arm での 2 段階 state 保護は呼び出し側が
 * `runWithHomeEndSelectionMutation` で囲む。
 *
 * 表示系副作用（Typewriter jump / pseudo caret）は handled 成功後に controller が発行する。
 */

import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  resetHomeEndState,
  runHomeEndNavigationCommand,
  type HomeEndNavigationCommandPlan,
} from './homeEndNavigation'
import { syncDomSelectionFromPm } from './localImeNavigationDomSelection'
import type { LocalImeHomeEndNavigationOperation } from './localImeNavigationOperation'
import type { LocalImeNavigationCommandRejectReason } from './localImeNavigationCommandAdapter'
import { resolveSupportedEditorWritingMode } from './writingModeArrowNavigationState'

export type LocalImeHomeEndCommandResult =
  | {
      ok: true
      plan: HomeEndNavigationCommandPlan
      transactionCount: 0 | 1
      moved: boolean
    }
  | { ok: false; reason: LocalImeNavigationCommandRejectReason }

/**
 * DOM 復元までを事前検証する。失敗時は handleHomeEndKey / 副作用を呼ばない。
 */
export function prepareLocalImeHomeEndHandoff(input: {
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
  if (!syncDomSelectionFromPm(view)) {
    return { ok: false, reason: 'dom-selection-unavailable' }
  }
  return { ok: true }
}

/**
 * 通常 PM と同じ `handleHomeEndKey` を実行する。
 *
 * `getIsComposing` は常に false（classify で composition を除外済み）。
 * Local Windowのactive判定を混ぜない。
 *
 * 呼び出し側は teardown まで `runWithHomeEndSelectionMutation` で囲むこと。
 */
export function runLocalImeHomeEndCommand(input: {
  view: EditorView
  event: KeyboardEvent
  operation: LocalImeHomeEndNavigationOperation
  beforeFrom: number
  pushLog?: (event: string, detail: string) => void
  dispatchTransaction?: (transaction: Transaction) => void
}): LocalImeHomeEndCommandResult {
  const { view, event, pushLog } = input
  const result = runHomeEndNavigationCommand(view, event, {
    getIsComposing: () => false,
    pushLog: pushLog ?? (() => {}),
    dispatchTransaction: input.dispatchTransaction,
    deferDomAffinity: true,
  })
  if (!result.handled) {
    resetHomeEndState()
    return { ok: false, reason: 'command-rejected' }
  }
  return {
    ok: true,
    plan: result,
    transactionCount: result.expectedTransactionCount,
    moved: result.moved,
  }
}
