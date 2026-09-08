/**
 * 局所 IME slot P2-C1 の ProseMirror navigation adapter。
 *
 * slot の既存公開 API を保つ互換 wrapper。vertical-rl の方向 map、grapheme 境界、
 * PM→DOM selection 復元、`Selection.modify → posAtDOM → transaction plan` は
 * slot / paragraph overlay 非所属の `verticalRlArrowNavigation*` を唯一の正本とする。
 *
 * slot 固有の handoff / recovery / 表示通知はこの module の呼び出し側に残す。
 */
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type {
  LocalImeArrowNavigationOperation,
  LocalImeNavigationOperation,
} from './localImeNavigationOperation'
import { isLocalImeArrowNavigationOperation } from './localImeNavigationOperation'
import {
  commitVerticalRlArrowNavigationPlan,
  resolveVerticalRlArrowNavigationPlan,
  type VerticalRlArrowNavigationPlan,
  type VerticalRlArrowNavigationRejectReason,
} from './verticalRlArrowNavigationAdapter'
import {
  isSafeVerticalRlArrowGraphemeCaret,
  resolveVerticalRlArrowModifyMapping,
  type VerticalRlArrowModifyMapping,
} from './verticalRlArrowNavigationState'

export type LocalImeNavigationCommandRejectReason = VerticalRlArrowNavigationRejectReason

export type LocalImeNavigationCommandResult =
  | { ok: true; transactionCount: number; moved: boolean }
  | { ok: false; reason: LocalImeNavigationCommandRejectReason }

/** 検証済みの移動 plan。dispatch 前に表示系副作用を挟める。 */
export type LocalImeNavigationPlan = VerticalRlArrowNavigationPlan

export type LocalImeNavigationModifyMapping = VerticalRlArrowModifyMapping

/** 既存slot APIの互換 export。中立正本へ委譲する。 */
export function resolveVerticalRlNavigationModifyMapping(
  operation: LocalImeArrowNavigationOperation,
): LocalImeNavigationModifyMapping {
  return resolveVerticalRlArrowModifyMapping(operation)
}

/** 既存slot APIの互換 export。中立正本へ委譲する。 */
export function isSafeGraphemeCaretInTextNode(state: EditorState, pos: number): boolean {
  return isSafeVerticalRlArrowGraphemeCaret(state, pos)
}

/**
 * 移動先を解決し、検証済み plan を返す。dispatch はしない。
 * 既存slotの operation union は維持し、Arrow以外は従来どおり fail-closed に reject する。
 */
export function resolveLocalImeNavigationPlan(input: {
  view: EditorView
  state: EditorState
  operation: LocalImeNavigationOperation
  writingMode: string
}): LocalImeNavigationPlan {
  if (!isLocalImeArrowNavigationOperation(input.operation)) {
    return { ok: false, reason: 'command-rejected' }
  }
  return resolveVerticalRlArrowNavigationPlan({
    view: input.view,
    state: input.state,
    operation: input.operation,
    writingMode: input.writingMode,
  })
}

/** 検証済み plan を dispatch する。reject plan は渡さないこと。 */
export function commitLocalImeNavigationPlan(input: {
  plan: Extract<LocalImeNavigationPlan, { ok: true }>
  view: EditorView
  dispatch: (tr: Transaction) => void
}): LocalImeNavigationCommandResult {
  const { plan } = input
  if (!plan.moved || !plan.transaction) {
    return { ok: true, transactionCount: 0, moved: false }
  }
  return commitVerticalRlArrowNavigationPlan(input)
}

/** resolve → commit を一括実行する既存互換 helper。 */
export function runLocalImeNavigationCommand(input: {
  view: EditorView
  state: EditorState
  operation: LocalImeNavigationOperation
  writingMode: string
  dispatch: (tr: Transaction) => void
}): LocalImeNavigationCommandResult {
  const plan = resolveLocalImeNavigationPlan(input)
  if (!plan.ok) return plan
  return commitLocalImeNavigationPlan({ plan, view: input.view, dispatch: input.dispatch })
}
