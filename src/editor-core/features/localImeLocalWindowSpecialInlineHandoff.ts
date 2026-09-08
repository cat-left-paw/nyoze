/**
 * LOCAL-WINDOW-SPECIALINLINE1 — bare Arrow が Ruby / TCY 内部へ入ろうとしたときの
 * host fallback 判定（pure）。
 *
 * 方針は設計の優先順位1（host fallback）である。caret が special-inline の
 * **exactな直前 / 直後**にいる状態は、`nodeBefore` / `nodeAfter` を読むだけで
 * 現在stateから決まる。移動先の座標推測（endpoint追跡）も synthetic replay も
 * しない。判定が真なら元eventだけを consume し、既存 document-action barrier で
 * close（clean は content 0、dirty は window 全体 exact 1 + mapped caret）してから
 * host owner へ返す。close 後の Arrow 再実行はしない（host の次の打鍵が
 * host 自身の Ruby 境界 navigation で動く）。
 *
 * granularity が `line`（vertical-rl の ArrowLeft / ArrowRight）の場合、着地位置は
 * 現在stateから決まらないため handoff しない。その経路は controller の
 * `filterTransaction` が優先順位2（fail-closed 拒否）で受け止める。
 */
import { TextSelection, type Selection } from '@tiptap/pm/state'
import type { SpecialInlineNodeTypeName } from './specialInlineBoundaryDiagnostics'
import {
  classifyWritingModeArrowKey,
  resolveSupportedEditorWritingMode,
  resolveWritingModeArrowMapping,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'
import {
  isLocalImeLocalWindowSelectionInsideSpecialInline,
  readLocalImeLocalWindowAdjacentSpecialInline,
} from './localImeLocalWindowCaretCapability'

/** 既存 document-action barrier へ渡す reason。新しい barrier は作らない。 */
export const LOCAL_IME_LOCAL_WINDOW_SPECIAL_INLINE_HANDOFF_REASON =
  'local-window-special-inline'

export type LocalImeLocalWindowSpecialInlineRejectReason =
  | 'not-bare-arrow'
  | 'modifier'
  | 'untrusted'
  | 'not-cancelable'
  | 'composing'
  | 'mode-not-active'
  | 'writing-mode-unsupported'
  | 'line-granularity'
  | 'selection-not-collapsed-text'
  | 'not-adjacent-to-special-inline'
  | 'pending-boundary'
  | 'local-view-detached'
  | 'local-root-not-focused'
  | 'identity-invalid'
  | 'base-proof-invalid'

export type LocalImeLocalWindowSpecialInlineDecision =
  | { readonly handoff: true; readonly operation: WritingModeArrowOperation }
  | { readonly handoff: false; readonly reason: LocalImeLocalWindowSpecialInlineRejectReason }

export type LocalImeLocalWindowSpecialInlineArrowProbe = {
  readonly key: string
  readonly isTrusted: boolean
  readonly cancelable: boolean
  readonly isComposing: boolean
  readonly keyCode: number
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

export function isLocalImeLocalWindowBareArrowCandidate(
  probe: LocalImeLocalWindowSpecialInlineArrowProbe,
): boolean {
  if (classifyWritingModeArrowKey(probe.key) === null) return false
  return !probe.metaKey && !probe.ctrlKey && !probe.altKey && !probe.shiftKey
}

/**
 * 現在の local selection から、その Arrow が special-inline へ入る打鍵かを分類する。
 * `character` granularity のときだけ決定でき、方向は共有の vertical-rl mapping を使う。
 */
export function isLocalImeLocalWindowArrowEnteringSpecialInline(
  selection: Selection,
  operation: WritingModeArrowOperation,
  writingMode: 'vertical-rl' | 'horizontal-tb' = 'vertical-rl',
): boolean {
  if (!(selection instanceof TextSelection) || !selection.empty) return false
  const mapping = resolveWritingModeArrowMapping(writingMode, operation)
  if (mapping.axis !== 'character') return false
  const side = mapping.direction === 'forward' ? 'after' : 'before'
  return readLocalImeLocalWindowAdjacentSpecialInline(selection, side) !== null
}

export function resolveLocalImeLocalWindowSpecialInlineArrowHandoff(input: {
  readonly probe: LocalImeLocalWindowSpecialInlineArrowProbe
  readonly mode: string
  readonly writingMode: string
  readonly selection: Selection | null
  readonly pendingBoundary: boolean
  readonly localViewConnected: boolean
  readonly localRootFocused: boolean
  readonly identityValid: boolean
  readonly baseProof: boolean
}): LocalImeLocalWindowSpecialInlineDecision {
  const { probe } = input
  const operation = classifyWritingModeArrowKey(probe.key)
  if (operation === null) return { handoff: false, reason: 'not-bare-arrow' }
  if (probe.metaKey || probe.ctrlKey || probe.altKey || probe.shiftKey) {
    return { handoff: false, reason: 'modifier' }
  }
  if (!probe.isTrusted) return { handoff: false, reason: 'untrusted' }
  if (!probe.cancelable) return { handoff: false, reason: 'not-cancelable' }
  if (probe.isComposing || probe.keyCode === 229) return { handoff: false, reason: 'composing' }
  if (input.mode !== 'active-clean' && input.mode !== 'active-dirty') {
    return { handoff: false, reason: 'mode-not-active' }
  }
  const writingMode = resolveSupportedEditorWritingMode(input.writingMode)
  if (!writingMode) return { handoff: false, reason: 'writing-mode-unsupported' }
  if (resolveWritingModeArrowMapping(writingMode, operation).axis !== 'character') {
    return { handoff: false, reason: 'line-granularity' }
  }
  const selection = input.selection
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return { handoff: false, reason: 'selection-not-collapsed-text' }
  }
  if (!isLocalImeLocalWindowArrowEnteringSpecialInline(selection, operation, writingMode)) {
    return { handoff: false, reason: 'not-adjacent-to-special-inline' }
  }
  if (input.pendingBoundary) return { handoff: false, reason: 'pending-boundary' }
  if (!input.localViewConnected) return { handoff: false, reason: 'local-view-detached' }
  if (!input.localRootFocused) return { handoff: false, reason: 'local-root-not-focused' }
  if (!input.identityValid) return { handoff: false, reason: 'identity-invalid' }
  if (!input.baseProof) return { handoff: false, reason: 'base-proof-invalid' }
  return { handoff: true, operation }
}

/**
 * LOCAL-WINDOW-SPECIALINLINE1-BOUNDARYEXIT1
 *
 * **適用後**のlocal PM Selectionが Ruby / TCY の exact な直前・直後へ着地したかを分類する。
 * 移動先の推測・DOM caret・座標・geometryは一切使わず、確定した PM Doc + Selection だけを
 * 正本にする。pre-keydown handoff（「今まさに境界にいて次のArrowで入る」）が捕捉できない
 * 「Arrow transactionの結果として境界へ着地した」経路をここで受ける。
 */
export type LocalImeLocalWindowSpecialInlineBoundaryRejectReason =
  | 'mode-not-active'
  | 'closing-or-busy'
  | 'local-view-detached'
  | 'identity-invalid'
  | 'selection-not-collapsed-text'
  | 'selection-depth'
  | 'special-inline-ancestor'
  | 'not-at-special-inline-boundary'

export type LocalImeLocalWindowSpecialInlineBoundaryLanding =
  | {
      readonly landed: true
      readonly side: 'before' | 'after'
      readonly nodeName: SpecialInlineNodeTypeName
    }
  | {
      readonly landed: false
      readonly reason: LocalImeLocalWindowSpecialInlineBoundaryRejectReason
    }

export function resolveLocalImeLocalWindowSpecialInlineBoundaryLanding(input: {
  readonly selection: Selection | null
  readonly mode: string
  readonly closingPhase: string
  readonly localViewConnected: boolean
  readonly identityValid: boolean
}): LocalImeLocalWindowSpecialInlineBoundaryLanding {
  if (input.mode !== 'active-clean' && input.mode !== 'active-dirty' && input.mode !== 'composing') {
    return { landed: false, reason: 'mode-not-active' }
  }
  if (input.closingPhase !== 'idle') return { landed: false, reason: 'closing-or-busy' }
  if (!input.localViewConnected) return { landed: false, reason: 'local-view-detached' }
  if (!input.identityValid) return { landed: false, reason: 'identity-invalid' }
  const selection = input.selection
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return { landed: false, reason: 'selection-not-collapsed-text' }
  }
  if (isLocalImeLocalWindowSelectionInsideSpecialInline(selection)) {
    return { landed: false, reason: 'special-inline-ancestor' }
  }
  if (selection.$anchor.depth !== 1 || selection.$head.depth !== 1) {
    return { landed: false, reason: 'selection-depth' }
  }
  // `nodeBefore`を先に見る。直前・直後の両方がspecial-inlineの場合も1件へ確定する。
  const before = readLocalImeLocalWindowAdjacentSpecialInline(selection, 'before')
  if (before) return { landed: true, side: 'after', nodeName: before }
  const after = readLocalImeLocalWindowAdjacentSpecialInline(selection, 'after')
  if (after) return { landed: true, side: 'before', nodeName: after }
  return { landed: false, reason: 'not-at-special-inline-boundary' }
}
