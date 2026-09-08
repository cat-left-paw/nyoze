/**
 * LOCAL-WINDOW-SELECTIONOWN1-KBD1 — Local Window の keyboard selection ownership
 * を host PM へ渡す。
 *
 * 責務:
 * - Local Window 固有の eligibility（pending boundary / live view / base proof /
 *   Select All の local root focus owner）
 * - close 後の mapped caret 再証明と clean 時の selection-only restore
 *   （caret / dirty は pending DOM flush 後の typed close proof が正本）
 * - writing-mode 共通 range adapter の exact 1 呼び出し
 * - host 全 document Select All の exact 1 実行（`getHostTransactionCounts` で再証明）
 *
 * commit / DOM proof / close / recovery 分類は既存 controller 経路が所有する。
 * 1-block overlay の Mode 型へ偽装せず、独自 range adapter も作らない。
 * synthetic KeyboardEvent、event 再配送、timer / polling / quiet period / rAF
 * による ownership 推測は持たない。
 */
import { AllSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  resolveBareShiftArrowHostHandoff,
  type BareShiftArrowHostHandoffRejectReason,
} from './localImeBareShiftArrowHandoff'
import {
  commitWritingModeRangeNavigationPlan,
  resolveWritingModeRangeNavigationPlan,
} from './writingModeRangeNavigationAdapter'
import {
  classifyWritingModeArrowKey,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'

export type { WritingModeArrowOperation }

/** 既存 document-action barrier へ渡す reason。新しい barrier は作らない。 */
export const LOCAL_IME_LOCAL_WINDOW_SHIFT_ARROW_HANDOFF_REASON = 'local-window-shift-arrow'
export const LOCAL_IME_LOCAL_WINDOW_SELECT_ALL_HANDOFF_REASON = 'local-window-select-all'

export type LocalImeLocalWindowShiftArrowRejectReason =
  | BareShiftArrowHostHandoffRejectReason
  | 'pending-boundary'
  | 'local-view-detached'
  | 'base-proof-invalid'

export type LocalImeLocalWindowShiftArrowDecision =
  | { readonly handoff: true; readonly operation: WritingModeArrowOperation }
  | { readonly handoff: false; readonly reason: LocalImeLocalWindowShiftArrowRejectReason }

export type LocalImeLocalWindowSelectAllRejectReason =
  | 'not-select-all'
  | 'mode-not-active'
  | 'composing'
  | 'pending-boundary'
  | 'closing-or-busy'
  | 'recovery-required'
  | 'local-root-not-focused'
  | 'local-view-detached'
  | 'identity-invalid'
  | 'base-proof-invalid'

export type LocalImeLocalWindowSelectAllDecision =
  | { readonly handoff: true }
  | { readonly handoff: false; readonly reason: LocalImeLocalWindowSelectAllRejectReason }

export type LocalImeLocalWindowMappedCaretRestoreRejectReason =
  | 'caret-out-of-range'
  | 'mapped-caret-mismatch'
  | 'dirty-mapped-caret-mismatch'

export type LocalImeLocalWindowMappedCaretRestorePlan =
  | { readonly ok: true; readonly transactionCount: 0 | 1 }
  | {
      readonly ok: false
      readonly reason: LocalImeLocalWindowMappedCaretRestoreRejectReason
    }

export type LocalImeLocalWindowShiftArrowAfterCloseResult =
  | {
      readonly ok: true
      readonly caretRestoreTransactionCount: 0 | 1
      readonly rangeAdapterCalls: 1
      readonly rangeTransactionCount: 0 | 1
      readonly rangeTransactionDelta: LocalImeLocalWindowHostTransactionDelta
      readonly moved: boolean
      readonly expectedAnchor: number
      readonly expectedHead: number
      readonly observedAnchor: number
      readonly observedHead: number
    }
  | {
      readonly ok: false
      readonly reason:
        | LocalImeLocalWindowMappedCaretRestoreRejectReason
        | 'focus-failed'
        | 'caret-restore-failed'
        | 'dispatch-dropped'
        | 'exactness-mismatch'
        | 'dispatch-failed'
        | 'range-adapter-rejected'
        | 'range-adapter-dispatch-dropped'
        | 'range-adapter-exactness-mismatch'
        | 'range-adapter-doc-mismatch'
        | 'range-adapter-selection-mismatch'
      readonly caretRestoreTransactionCount: 0 | 1
      readonly rangeAdapterCalls: 0 | 1
      /** clean close 後の selection 失敗は本文を recovery 扱いにしない。 */
      readonly treatAsRecovery: false
    }

export type LocalImeLocalWindowHostTransactionSlice = {
  readonly total: number
  readonly docChanged: number
  readonly selectionOnly: number
}

export type LocalImeLocalWindowHostTransactionDelta = {
  readonly total: number
  readonly docChanged: number
  readonly selectionOnly: number
}

export type LocalImeLocalWindowSelectionDispatchProofReason =
  | 'dispatch-dropped'
  | 'exactness-mismatch'
  | 'dispatch-failed'

export type LocalImeLocalWindowHostSelectAllResult =
  | {
      readonly ok: true
      readonly transactionCount: 1
      readonly totalDelta: 1
      readonly selectionOnlyDelta: 1
      readonly docChangedDelta: 0
    }
  | {
      readonly ok: false
      readonly reason:
        | 'focus-failed'
        | 'already-all-selection'
        | 'dispatch-failed'
        | 'dispatch-dropped'
        | 'exactness-mismatch'
        | 'not-all-selection'
    }

export function isLocalImeLocalWindowShiftArrowCandidate(event: {
  key: string
  shiftKey: boolean
}): boolean {
  return event.shiftKey && classifyWritingModeArrowKey(event.key) !== null
}

/**
 * Local Window の collapsed caret で受けた bare Shift+Arrow を、最初の 1 打から
 * host へ渡してよいか。共有判定のあと、window 固有の live view / pending / base
 * proof だけを足す。
 */
export function resolveLocalImeLocalWindowShiftArrowHandoff(input: {
  key: string
  isTrusted: boolean
  cancelable: boolean
  isComposing: boolean
  keyCode: number
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  mode: string
  localRootFocused: boolean
  identityValid: boolean
  writingMode: string
  selectionIsText: boolean
  selectionCollapsed: boolean
  pendingBoundary: boolean
  localViewConnected: boolean
  baseProof: boolean
}): LocalImeLocalWindowShiftArrowDecision {
  const shared = resolveBareShiftArrowHostHandoff(input)
  if (!shared.handoff) return shared
  if (input.pendingBoundary) return { handoff: false, reason: 'pending-boundary' }
  if (!input.localViewConnected) return { handoff: false, reason: 'local-view-detached' }
  if (!input.baseProof) return { handoff: false, reason: 'base-proof-invalid' }
  return shared
}

export function resolveLocalImeLocalWindowSelectAllHandoff(input: {
  operation: 'undo' | 'redo' | 'select-all'
  mode: string
  compositionActive: boolean
  pendingBoundary: boolean
  localViewConnected: boolean
  localRootFocused: boolean
  identityValid: boolean
  baseProof: boolean
}): LocalImeLocalWindowSelectAllDecision {
  if (input.operation !== 'select-all') return { handoff: false, reason: 'not-select-all' }
  if (input.mode === 'off') return { handoff: false, reason: 'mode-not-active' }
  if (input.mode === 'recovery-required') {
    return { handoff: false, reason: 'recovery-required' }
  }
  if (input.mode === 'closing') return { handoff: false, reason: 'closing-or-busy' }
  if (input.mode === 'composing' || input.compositionActive) {
    return { handoff: false, reason: 'composing' }
  }
  if (input.mode !== 'active-clean' && input.mode !== 'active-dirty') {
    return { handoff: false, reason: 'mode-not-active' }
  }
  if (!input.localRootFocused) return { handoff: false, reason: 'local-root-not-focused' }
  if (input.pendingBoundary) return { handoff: false, reason: 'pending-boundary' }
  if (!input.localViewConnected) return { handoff: false, reason: 'local-view-detached' }
  if (!input.identityValid) return { handoff: false, reason: 'identity-invalid' }
  if (!input.baseProof) return { handoff: false, reason: 'base-proof-invalid' }
  return { handoff: true }
}

export type LocalImeLocalWindowCloseHandoffProof =
  | {
      readonly ok: true
      readonly mappedAnchor: number
      readonly mappedHead: number
      readonly dirtyCommitApplied: boolean
    }
  | { readonly ok: false }

export type LocalImeLocalWindowShiftArrowCloseCheckpoint =
  | {
      readonly ok: true
      readonly expectedCaret: number
      readonly mappedAnchor: number
      readonly mappedHead: number
      readonly dirtyCommitApplied: boolean
    }
  | { readonly ok: false; readonly reason: 'close-proof-missing' | 'mapped-caret-not-collapsed' }

/**
 * close 成功後の mapped caret と、keydown 時点の期待値・最新 host selection を照合する。
 * dirty では追加 mapping transaction を許さない。clean では host caret が異なるときだけ
 * selection-only 1 回を計画する。
 *
 * expectedCaret は pending DOM flush 前の local selection ではなく、close が残した
 * 最新 mapped caret を使う。
 */
export function planLocalImeLocalWindowMappedCaretRestore(input: {
  expectedCaret: number
  mappedAnchor: number | null
  mappedHead: number | null
  hostAnchor: number
  hostHead: number
  hostDocSize: number
  dirtyCommitApplied: boolean
}): LocalImeLocalWindowMappedCaretRestorePlan {
  const { expectedCaret } = input
  if (expectedCaret < 0 || expectedCaret > input.hostDocSize) {
    return { ok: false, reason: 'caret-out-of-range' }
  }
  if (input.mappedAnchor !== expectedCaret || input.mappedHead !== expectedCaret) {
    return { ok: false, reason: 'mapped-caret-mismatch' }
  }
  const hostAtCaret = input.hostAnchor === expectedCaret && input.hostHead === expectedCaret
  if (input.dirtyCommitApplied) {
    if (!hostAtCaret) return { ok: false, reason: 'dirty-mapped-caret-mismatch' }
    return { ok: true, transactionCount: 0 }
  }
  return { ok: true, transactionCount: hostAtCaret ? 0 : 1 }
}

/**
 * pending DOM flush と dirty commit の実績を含む close 結果だけを、Shift+Arrow の
 * caret / dirty 正本にする。flush 前の local selection や `draftDirty()` は使わない。
 */
export function resolveLocalImeLocalWindowShiftArrowCloseCheckpoint(
  proof: LocalImeLocalWindowCloseHandoffProof | null,
): LocalImeLocalWindowShiftArrowCloseCheckpoint {
  if (!proof || !proof.ok) return { ok: false, reason: 'close-proof-missing' }
  if (proof.mappedAnchor !== proof.mappedHead) {
    return { ok: false, reason: 'mapped-caret-not-collapsed' }
  }
  return {
    ok: true,
    expectedCaret: proof.mappedAnchor,
    mappedAnchor: proof.mappedAnchor,
    mappedHead: proof.mappedHead,
    dirtyCommitApplied: proof.dirtyCommitApplied,
  }
}

export function createLocalImeLocalWindowHostSelectAllTransaction(
  state: EditorState,
): Transaction {
  return state.tr.setSelection(new AllSelection(state.doc))
}

export function isHostFullDocumentAllSelection(state: EditorState): boolean {
  const selection = state.selection
  return (
    selection instanceof AllSelection &&
    selection.from === 0 &&
    selection.to === state.doc.content.size
  )
}

export function diffLocalImeLocalWindowHostTransactionSlice(
  before: LocalImeLocalWindowHostTransactionSlice,
  after: LocalImeLocalWindowHostTransactionSlice,
): LocalImeLocalWindowHostTransactionDelta {
  return {
    total: after.total - before.total,
    docChanged: after.docChanged - before.docChanged,
    selectionOnly: after.selectionOnly - before.selectionOnly,
  }
}

export function isLocalImeLocalWindowSelectionOnlyExactOne(
  delta: LocalImeLocalWindowHostTransactionDelta,
): boolean {
  return delta.total === 1 && delta.selectionOnly === 1 && delta.docChanged === 0
}

export function isLocalImeLocalWindowSelectionTransactionUnchanged(
  delta: LocalImeLocalWindowHostTransactionDelta,
): boolean {
  return delta.total === 0 && delta.selectionOnly === 0 && delta.docChanged === 0
}

/** Local Window の root が現在の focus owner か。子孫へ focus がある場合も含む。 */
export function isLocalImeLocalWindowRootDomFocused(
  localRoot: Element | null | undefined,
): boolean {
  if (!localRoot || typeof document === 'undefined') return false
  const active = document.activeElement
  return active === localRoot || localRoot.contains(active)
}

/**
 * host selection dispatch の前後差を typed に再証明する。固定値の transactionCount は使わない。
 * throw かつ本文未適用は dispatch-failed、適用済み throw や余分な delta は exactness-mismatch。
 */
export function proveLocalImeLocalWindowSelectionDispatch(input: {
  before: LocalImeLocalWindowHostTransactionSlice
  after: LocalImeLocalWindowHostTransactionSlice
  threw: boolean
  expect: 'selection-only-exact-1' | 'unchanged'
}):
  | { ok: true; delta: LocalImeLocalWindowHostTransactionDelta }
  | {
      ok: false
      reason: LocalImeLocalWindowSelectionDispatchProofReason
      delta: LocalImeLocalWindowHostTransactionDelta
    } {
  const delta = diffLocalImeLocalWindowHostTransactionSlice(input.before, input.after)
  if (input.threw) {
    return {
      ok: false,
      reason: delta.total === 0 && delta.docChanged === 0
        ? 'dispatch-failed'
        : 'exactness-mismatch',
      delta,
    }
  }
  if (input.expect === 'unchanged') {
    return isLocalImeLocalWindowSelectionTransactionUnchanged(delta)
      ? { ok: true, delta }
      : { ok: false, reason: 'exactness-mismatch', delta }
  }
  if (isLocalImeLocalWindowSelectionOnlyExactOne(delta)) return { ok: true, delta }
  return {
    ok: false,
    reason: delta.total === 0 ? 'dispatch-dropped' : 'exactness-mismatch',
    delta,
  }
}

function restoreHostFocus(view: EditorView): boolean {
  try {
    if (typeof document !== 'undefined' && document.activeElement === view.dom) {
      return true
    }
    view.focus()
    return typeof document === 'undefined' || document.activeElement === view.dom
  } catch {
    return false
  }
}

/**
 * close 成功後の mapped caret 復元。clean で host と異なる場合だけ
 * `addToHistory: false` の selection-only transaction を最大 1 回使う。
 */
export function restoreLocalImeLocalWindowMappedHostCaret(input: {
  hostView: EditorView
  caret: number
  getHostTransactionCounts: () => LocalImeLocalWindowHostTransactionSlice
}):
  | { ok: true; transactionCount: 0 | 1 }
  | {
      ok: false
      reason:
        | 'focus-failed'
        | 'caret-restore-failed'
        | 'dispatch-dropped'
        | 'exactness-mismatch'
        | 'dispatch-failed'
    } {
  const { hostView, caret } = input
  if (!restoreHostFocus(hostView)) return { ok: false, reason: 'focus-failed' }
  const state = hostView.state
  if (caret < 0 || caret > state.doc.content.size) {
    return { ok: false, reason: 'caret-restore-failed' }
  }
  const alreadyAtCaret =
    state.selection.anchor === caret && state.selection.head === caret
  const before = input.getHostTransactionCounts()
  let threw = false
  if (!alreadyAtCaret) {
    try {
      hostView.dispatch(
        state.tr
          .setSelection(TextSelection.create(state.doc, caret))
          .setMeta('addToHistory', false),
      )
    } catch {
      threw = true
    }
  }
  const proof = proveLocalImeLocalWindowSelectionDispatch({
    before,
    after: input.getHostTransactionCounts(),
    threw,
    expect: alreadyAtCaret ? 'unchanged' : 'selection-only-exact-1',
  })
  if (!proof.ok) return { ok: false, reason: proof.reason }
  if (
    hostView.state.selection.anchor !== caret ||
    hostView.state.selection.head !== caret
  ) {
    return { ok: false, reason: 'caret-restore-failed' }
  }
  return {
    ok: true,
    transactionCount: alreadyAtCaret ? 0 : 1,
  }
}

export type LocalImeLocalWindowCloseCaretRestoreOutcome =
  | {
      readonly ok: true
      readonly transactionCount: 0 | 1
      readonly dirtyCommitApplied: boolean
      readonly caret: number
    }
  | { readonly ok: false; readonly reason: string }

/**
 * LOCAL-WINDOW-HOSTNAV-KEYS1: typed close proof → mapped caret plan → 実復元 →
 * 計画一致の再証明までを 1 箇所へ集約する。bare Arrow と bare Home / End / Page が
 * 共有する薄い境界で、host command 意味論はここに置かない。
 */
export function restoreLocalImeLocalWindowMappedHostCaretFromCloseProof(input: {
  readonly hostView: EditorView
  readonly closeProof: LocalImeLocalWindowCloseHandoffProof | null
  readonly getHostTransactionCounts: () => LocalImeLocalWindowHostTransactionSlice
}): LocalImeLocalWindowCloseCaretRestoreOutcome {
  const checkpoint = resolveLocalImeLocalWindowShiftArrowCloseCheckpoint(input.closeProof)
  if (!checkpoint.ok) return { ok: false, reason: checkpoint.reason }
  const plan = planLocalImeLocalWindowMappedCaretRestore({
    expectedCaret: checkpoint.expectedCaret,
    mappedAnchor: checkpoint.mappedAnchor,
    mappedHead: checkpoint.mappedHead,
    hostAnchor: input.hostView.state.selection.anchor,
    hostHead: input.hostView.state.selection.head,
    hostDocSize: input.hostView.state.doc.content.size,
    dirtyCommitApplied: checkpoint.dirtyCommitApplied,
  })
  if (!plan.ok) return { ok: false, reason: plan.reason }
  const restored = restoreLocalImeLocalWindowMappedHostCaret({
    hostView: input.hostView,
    caret: checkpoint.expectedCaret,
    getHostTransactionCounts: input.getHostTransactionCounts,
  })
  if (!restored.ok) return { ok: false, reason: restored.reason }
  if (restored.transactionCount !== plan.transactionCount) {
    return { ok: false, reason: 'exactness-mismatch' }
  }
  return {
    ok: true,
    transactionCount: restored.transactionCount,
    dirtyCommitApplied: checkpoint.dirtyCommitApplied,
    caret: checkpoint.expectedCaret,
  }
}

/**
 * close 成功後にだけ呼ぶ。mapped caret を再証明し、neutral adapter を exact 1 回使う。
 * failure 後に adapter を再実行しない。
 */
export function runLocalImeLocalWindowShiftArrowAfterClose(input: {
  hostView: EditorView
  expectedCaret: number
  mappedAnchor: number | null
  mappedHead: number | null
  dirtyCommitApplied: boolean
  operation: WritingModeArrowOperation
  writingMode: string
  getHostTransactionCounts: () => LocalImeLocalWindowHostTransactionSlice
}): LocalImeLocalWindowShiftArrowAfterCloseResult {
  const plan = planLocalImeLocalWindowMappedCaretRestore({
    expectedCaret: input.expectedCaret,
    mappedAnchor: input.mappedAnchor,
    mappedHead: input.mappedHead,
    hostAnchor: input.hostView.state.selection.anchor,
    hostHead: input.hostView.state.selection.head,
    hostDocSize: input.hostView.state.doc.content.size,
    dirtyCommitApplied: input.dirtyCommitApplied,
  })
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason,
      caretRestoreTransactionCount: 0,
      rangeAdapterCalls: 0,
      treatAsRecovery: false,
    }
  }
  const restored = restoreLocalImeLocalWindowMappedHostCaret({
    hostView: input.hostView,
    caret: input.expectedCaret,
    getHostTransactionCounts: input.getHostTransactionCounts,
  })
  if (!restored.ok) {
    return {
      ok: false,
      reason: restored.reason,
      caretRestoreTransactionCount: 0,
      rangeAdapterCalls: 0,
      treatAsRecovery: false,
    }
  }
  if (restored.transactionCount !== plan.transactionCount) {
    return {
      ok: false,
      reason: 'exactness-mismatch',
      caretRestoreTransactionCount: restored.transactionCount,
      rangeAdapterCalls: 0,
      treatAsRecovery: false,
    }
  }
  const beforeRangeCounts = input.getHostTransactionCounts()
  const rangeBaseDoc = input.hostView.state.doc
  const rangeBaseSelection = input.hostView.state.selection
  const rangePlan = resolveWritingModeRangeNavigationPlan({
    view: input.hostView,
    state: input.hostView.state,
    operation: input.operation,
    writingMode: input.writingMode,
  })
  if (!rangePlan.ok) {
    return {
      ok: false,
      reason: 'range-adapter-rejected',
      caretRestoreTransactionCount: plan.transactionCount,
      rangeAdapterCalls: 1,
      treatAsRecovery: false,
    }
  }
  const committed = commitWritingModeRangeNavigationPlan({
    view: input.hostView,
    plan: rangePlan,
    dispatch: (transaction) => {
      input.hostView.dispatch(transaction)
    },
  })
  if (!committed.ok) {
    return {
      ok: false,
      reason: 'range-adapter-rejected',
      caretRestoreTransactionCount: plan.transactionCount,
      rangeAdapterCalls: 1,
      treatAsRecovery: false,
    }
  }
  const dispatchProof = proveLocalImeLocalWindowSelectionDispatch({
    before: beforeRangeCounts,
    after: input.getHostTransactionCounts(),
    threw: false,
    expect: rangePlan.moved ? 'selection-only-exact-1' : 'unchanged',
  })
  if (!dispatchProof.ok) {
    return {
      ok: false,
      reason: dispatchProof.reason === 'dispatch-dropped'
        ? 'range-adapter-dispatch-dropped'
        : 'range-adapter-exactness-mismatch',
      caretRestoreTransactionCount: plan.transactionCount,
      rangeAdapterCalls: 1,
      treatAsRecovery: false,
    }
  }
  const expectedDoc = rangePlan.transaction?.doc ?? rangeBaseDoc
  const expectedSelection = rangePlan.transaction?.selection ?? rangeBaseSelection
  if (!input.hostView.state.doc.eq(expectedDoc)) {
    return {
      ok: false,
      reason: 'range-adapter-doc-mismatch',
      caretRestoreTransactionCount: plan.transactionCount,
      rangeAdapterCalls: 1,
      treatAsRecovery: false,
    }
  }
  if (!input.hostView.state.selection.eq(expectedSelection)) {
    return {
      ok: false,
      reason: 'range-adapter-selection-mismatch',
      caretRestoreTransactionCount: plan.transactionCount,
      rangeAdapterCalls: 1,
      treatAsRecovery: false,
    }
  }
  restoreHostFocus(input.hostView)
  return {
    ok: true,
    caretRestoreTransactionCount: restored.transactionCount,
    rangeAdapterCalls: 1,
    rangeTransactionCount: committed.transactionCount === 1 ? 1 : 0,
    rangeTransactionDelta: dispatchProof.delta,
    moved: committed.moved,
    expectedAnchor: expectedSelection.anchor,
    expectedHead: expectedSelection.head,
    observedAnchor: input.hostView.state.selection.anchor,
    observedHead: input.hostView.state.selection.head,
  }
}

/**
 * close 成功後にだけ呼ぶ。host 全 document の `AllSelection` を exact 1 回作る。
 * local bounded window の AllSelection は作らない。
 */
export function applyLocalImeLocalWindowHostSelectAll(input: {
  hostView: EditorView
  getHostTransactionCounts: () => LocalImeLocalWindowHostTransactionSlice
}): LocalImeLocalWindowHostSelectAllResult {
  const { hostView } = input
  if (!restoreHostFocus(hostView)) return { ok: false, reason: 'focus-failed' }
  if (isHostFullDocumentAllSelection(hostView.state)) {
    return { ok: false, reason: 'already-all-selection' }
  }
  const before = input.getHostTransactionCounts()
  let threw = false
  try {
    hostView.dispatch(createLocalImeLocalWindowHostSelectAllTransaction(hostView.state))
  } catch {
    threw = true
  }
  const proof = proveLocalImeLocalWindowSelectionDispatch({
    before,
    after: input.getHostTransactionCounts(),
    threw,
    expect: 'selection-only-exact-1',
  })
  if (!proof.ok) return { ok: false, reason: proof.reason }
  if (!isHostFullDocumentAllSelection(hostView.state)) {
    return { ok: false, reason: 'not-all-selection' }
  }
  return {
    ok: true,
    transactionCount: 1,
    totalDelta: 1,
    selectionOnlyDelta: 1,
    docChangedDelta: 0,
  }
}
