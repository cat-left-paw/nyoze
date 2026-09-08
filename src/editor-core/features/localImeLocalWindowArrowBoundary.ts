/** LOCAL-WINDOW-AUTOARM1: fixed Local Window の安全な bare Arrow 外端退出。 */
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  commitWritingModeArrowNavigationPlan,
  resolveWritingModeArrowNavigationPlan,
} from './writingModeArrowNavigationAdapter'
import {
  syncWritingModeArrowDomSelectionFromPm,
} from './writingModeArrowNavigationDomSelection'
import {
  classifyWritingModeArrowKey,
  resolveSupportedEditorWritingMode,
  resolveWritingModeArrowMapping,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'
import {
  proveLocalImeLocalWindowSelectionDispatch,
  restoreLocalImeLocalWindowMappedHostCaretFromCloseProof,
  type LocalImeLocalWindowCloseHandoffProof,
  type LocalImeLocalWindowHostTransactionSlice,
} from './localImeLocalWindowKeyboardHandoff'

export const LOCAL_IME_LOCAL_WINDOW_ARROW_BOUNDARY_REASON = 'local-window-arrow-boundary'

export type LocalImeLocalWindowArrowBoundaryDecision =
  | { readonly exit: true; readonly operation: WritingModeArrowOperation }
  | {
      readonly exit: false
      readonly reason:
        | 'not-bare-arrow'
        | 'not-trusted'
        | 'not-cancelable'
        | 'composing'
        | 'mode-not-active'
        | 'writing-mode'
        | 'selection-not-collapsed-text'
        | 'selection-depth'
        | 'pending-boundary'
        | 'local-view-detached'
        | 'local-root-not-focused'
        | 'identity-invalid'
        | 'base-proof-invalid'
        | 'host-document-outer-boundary'
        | 'not-outer-boundary'
    }

/**
 * current local PM selection と共有 physical Arrow mapping だけで証明できる範囲。
 * character 軸の document absolute start/end は一意だが、line 軸の外端は soft-wrap
 * geometry なしには証明できないため fail-closed にする。
 */
export function resolveLocalImeLocalWindowArrowBoundaryExit(input: {
  readonly event: {
    key: string
    isTrusted: boolean
    cancelable: boolean
    isComposing: boolean
    keyCode: number
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
  }
  readonly mode: string
  readonly writingMode: string
  readonly state: EditorState | null
  readonly pendingBoundary: boolean
  readonly localViewConnected: boolean
  readonly localRootFocused: boolean
  readonly identityValid: boolean
  readonly baseProof: boolean
  readonly mappedHostCaret: number | null
  readonly hostDocContentSize: number
}): LocalImeLocalWindowArrowBoundaryDecision {
  const { event } = input
  const operation = classifyWritingModeArrowKey(event.key)
  if (!operation || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return { exit: false, reason: 'not-bare-arrow' }
  }
  if (!event.isTrusted) return { exit: false, reason: 'not-trusted' }
  if (!event.cancelable) return { exit: false, reason: 'not-cancelable' }
  if (event.isComposing || event.keyCode === 229) return { exit: false, reason: 'composing' }
  if (input.mode !== 'active-clean' && input.mode !== 'active-dirty') {
    return { exit: false, reason: 'mode-not-active' }
  }
  const writingMode = resolveSupportedEditorWritingMode(input.writingMode)
  if (!writingMode) return { exit: false, reason: 'writing-mode' }
  const state = input.state
  if (!state) return { exit: false, reason: 'selection-not-collapsed-text' }
  const selection = state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return { exit: false, reason: 'selection-not-collapsed-text' }
  }
  if (selection.$anchor.depth !== 1 || selection.$head.depth !== 1) {
    return { exit: false, reason: 'selection-depth' }
  }
  if (input.pendingBoundary) return { exit: false, reason: 'pending-boundary' }
  if (!input.localViewConnected) return { exit: false, reason: 'local-view-detached' }
  if (!input.localRootFocused) return { exit: false, reason: 'local-root-not-focused' }
  if (!input.identityValid) return { exit: false, reason: 'identity-invalid' }
  if (!input.baseProof) return { exit: false, reason: 'base-proof-invalid' }
  const mapping = resolveWritingModeArrowMapping(writingMode, operation)
  if (mapping.axis === 'line') {
    // LINEAXIS-NAV1 host-navigation-session: eligibleなline-axis Arrowは位置や
    // geometryを問わず、最初の1打からhost PM ownerへ移す。
    return { exit: true, operation }
  }
  const absoluteStart = 1
  const absoluteEnd = state.doc.content.size - 1
  const atOuterBoundary = mapping.direction === 'backward'
    ? selection.head === absoluteStart
    : selection.head === absoluteEnd
  if (!atOuterBoundary) return { exit: false, reason: 'not-outer-boundary' }
  const atHostDocumentOuterBoundary = mapping.direction === 'backward'
    ? input.mappedHostCaret === 1
    : input.mappedHostCaret === input.hostDocContentSize - 1
  return atHostDocumentOuterBoundary
    ? { exit: false, reason: 'host-document-outer-boundary' }
    : { exit: true, operation }
}

export type LocalImeLocalWindowArrowAdapterApplicationProof =
  | { readonly ok: true; readonly transactionCount: 1 }
  | {
      readonly ok: false
      readonly reason:
        | 'adapter-dispatch-dropped'
        | 'adapter-exactness-mismatch'
        | 'adapter-doc-mismatch'
        | 'adapter-selection-mismatch'
    }

/** adapterの自己申告ではなく、実counter差と最終host stateを同期再証明する。 */
export function proveLocalImeLocalWindowArrowAdapterApplication(input: {
  readonly before: LocalImeLocalWindowHostTransactionSlice
  readonly after: LocalImeLocalWindowHostTransactionSlice
  readonly expectedDoc: ProseMirrorNode
  readonly currentDoc: ProseMirrorNode
  readonly expectedSelection: Selection
  readonly currentSelection: Selection
}): LocalImeLocalWindowArrowAdapterApplicationProof {
  const dispatchProof = proveLocalImeLocalWindowSelectionDispatch({
    before: input.before,
    after: input.after,
    threw: false,
    expect: 'selection-only-exact-1',
  })
  if (!dispatchProof.ok) {
    return {
      ok: false,
      reason: dispatchProof.reason === 'dispatch-dropped'
        ? 'adapter-dispatch-dropped'
        : 'adapter-exactness-mismatch',
    }
  }
  if (!input.currentDoc.eq(input.expectedDoc)) {
    return { ok: false, reason: 'adapter-doc-mismatch' }
  }
  if (!input.currentSelection.eq(input.expectedSelection)) {
    return { ok: false, reason: 'adapter-selection-mismatch' }
  }
  return { ok: true, transactionCount: 1 }
}

/** display handoff例外をadapter未適用のtyped failureへ畳み、DOM selectionをPMへ戻す。 */
export function runLocalImeLocalWindowArrowDisplayHandoff(input: {
  readonly handoff?: () => void
  readonly restoreDomSelection: () => void
}): { readonly ok: true } | { readonly ok: false; readonly reason: 'display-handoff-failed' } {
  try {
    input.handoff?.()
    return { ok: true }
  } catch {
    try {
      input.restoreDomSelection()
    } catch {
      // typed failureをcontrollerのpending candidate破棄へ必ず戻す。
    }
    return { ok: false, reason: 'display-handoff-failed' }
  }
}

export type LocalImeLocalWindowArrowBoundaryAfterCloseResult =
  | {
      readonly ok: true
      readonly caretRestoreTransactionCount: 0 | 1
      readonly adapterCalls: 1
      readonly adapterTransactionCount: 0 | 1
      readonly moved: boolean
      readonly domSelectionRestored: true
    }
  | {
      readonly ok: false
      readonly reason: string
      readonly caretRestoreTransactionCount: 0 | 1
      readonly adapterCalls: 0 | 1
    }

/** typed close proofを正本にcaretを復元し、既存bare Arrow adapterをexact 1回使う。 */
export function runLocalImeLocalWindowArrowBoundaryAfterClose(input: {
  readonly hostView: EditorView
  readonly closeProof: LocalImeLocalWindowCloseHandoffProof | null
  readonly operation: WritingModeArrowOperation
  readonly writingMode: string
  readonly getHostTransactionCounts: () => LocalImeLocalWindowHostTransactionSlice
  readonly beforeAdapterDispatch?: () => void
  /** E2E failure oracle専用。productionは既存host dispatchをそのまま使う。 */
  readonly dispatchAdapterTransaction?: (transaction: Transaction) => void
}): LocalImeLocalWindowArrowBoundaryAfterCloseResult {
  const restored = restoreLocalImeLocalWindowMappedHostCaretFromCloseProof({
    hostView: input.hostView,
    closeProof: input.closeProof,
    getHostTransactionCounts: input.getHostTransactionCounts,
  })
  if (!restored.ok) {
    return { ok: false, reason: restored.reason, caretRestoreTransactionCount: 0, adapterCalls: 0 }
  }
  const adapterBaseDoc = input.hostView.state.doc
  const adapterBaseSelection = input.hostView.state.selection
  const beforeAdapterCounts = input.getHostTransactionCounts()
  const plan = resolveWritingModeArrowNavigationPlan({
    view: input.hostView,
    state: input.hostView.state,
    operation: input.operation,
    writingMode: input.writingMode,
  })
  if (!plan.ok) {
    return {
      ok: false,
      reason: plan.reason,
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 1,
    }
  }
  if (!plan.moved || !plan.transaction) {
    const afterAdapterCounts = input.getHostTransactionCounts()
    if (
      afterAdapterCounts.total !== beforeAdapterCounts.total ||
      afterAdapterCounts.selectionOnly !== beforeAdapterCounts.selectionOnly ||
      afterAdapterCounts.docChanged !== beforeAdapterCounts.docChanged ||
      !input.hostView.state.doc.eq(adapterBaseDoc) ||
      !input.hostView.state.selection.eq(adapterBaseSelection)
    ) {
      return {
        ok: false,
        reason: 'adapter-noop-state-mismatch',
        caretRestoreTransactionCount: restored.transactionCount,
        adapterCalls: 1,
      }
    }
    const domSelectionRestored = proveLocalImeLocalWindowHostDomSelectionMatchesPm(input.hostView)
    if (!domSelectionRestored) {
      return {
        ok: false,
        reason: 'adapter-dom-selection-mismatch',
        caretRestoreTransactionCount: restored.transactionCount,
        adapterCalls: 1,
      }
    }
    return {
      ok: true,
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 1,
      adapterTransactionCount: 0,
      moved: false,
      domSelectionRestored: true,
    }
  }
  const planBaseDoc = adapterBaseDoc
  const planBaseSelection = adapterBaseSelection
  const displayHandoff = runLocalImeLocalWindowArrowDisplayHandoff({
    handoff: input.beforeAdapterDispatch,
    restoreDomSelection: () => { syncWritingModeArrowDomSelectionFromPm(input.hostView) },
  })
  if (!displayHandoff.ok) {
    return {
      ok: false,
      reason: displayHandoff.reason,
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 0,
    }
  }
  if (
    !input.hostView.state.doc.eq(planBaseDoc) ||
    !input.hostView.state.selection.eq(planBaseSelection)
  ) {
    return {
      ok: false,
      reason: 'display-handoff-state-changed',
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 0,
    }
  }
  // display handoff完了後をadapterの直前値とし、別transactionをadapter実績へ混ぜない。
  const committed = commitWritingModeArrowNavigationPlan({
    view: input.hostView,
    plan,
    dispatch: input.dispatchAdapterTransaction ?? ((transaction) => input.hostView.dispatch(transaction)),
  })
  if (!committed.ok) {
    return {
      ok: false,
      reason: committed.reason,
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 1,
    }
  }
  const applicationProof = proveLocalImeLocalWindowArrowAdapterApplication({
    before: beforeAdapterCounts,
    after: input.getHostTransactionCounts(),
    expectedDoc: plan.transaction.doc,
    currentDoc: input.hostView.state.doc,
    expectedSelection: plan.transaction.selection,
    currentSelection: input.hostView.state.selection,
  })
  if (!applicationProof.ok) {
    return {
      ok: false,
      reason: applicationProof.reason,
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 1,
    }
  }
  if (!proveLocalImeLocalWindowHostDomSelectionMatchesPm(input.hostView)) {
    return {
      ok: false,
      reason: 'adapter-dom-selection-mismatch',
      caretRestoreTransactionCount: restored.transactionCount,
      adapterCalls: 1,
    }
  }
  return {
    ok: true,
    caretRestoreTransactionCount: restored.transactionCount,
    adapterCalls: 1,
    adapterTransactionCount: applicationProof.transactionCount,
    moved: true,
    domSelectionRestored: true,
  }
}

/** Selection.modify後のDOM caretが最終PM caretへ戻ったことをread-onlyで証明する。 */
export function proveLocalImeLocalWindowHostDomSelectionMatchesPm(view: EditorView): boolean {
  const pmSelection = view.state.selection
  if (!(pmSelection instanceof TextSelection) || !pmSelection.empty) return false
  const domSelection = view.dom.ownerDocument.defaultView?.getSelection()
  if (!domSelection || !domSelection.isCollapsed || !domSelection.focusNode) return false
  if (!view.dom.contains(domSelection.focusNode)) return false
  try {
    return view.posAtDOM(domSelection.focusNode, domSelection.focusOffset, 1) === pmSelection.head
  } catch {
    return false
  }
}
