/**
 * LOCAL-WINDOW-HOSTNAV-KEYS1 — Local Window active 中の bare Home / End / PageUp / PageDown を
 * host PM owner へ移す薄い共通境界。
 *
 * 意味論の正本は既存 host module だけ:
 * - Home / End の visual → logical 2 段階、Ruby-aware visual edge、End の DOM caret affinity 補正、
 *   `scrollIntoView`、`runWithHomeEndSelectionMutation()` は `homeEndNavigation.ts`
 * - PageUp / PageDown の writing-mode 別 scroll axis、scroll target、caret 追従、
 *   scroll boundary no-op、failure 時 scroll rollback は `pageUpDownNavigation.ts`
 *
 * ここは既存 slot adapter（`localImeHomeEndCommandAdapter` / `localImePageUpDownCommandAdapter`）を
 * typed close 後の host view へ exact 1 回適用し、**実 transaction counter** と最終 host
 * Doc / Selection / scroll で再証明するだけを担当する。geometry / synthetic event / replay /
 * queue / timer / 独自 scroll は持たない。
 */

import { TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import {
  applyHomeEndNavigationDomAffinity,
  resetHomeEndState,
  type HomeEndNavigationDomAffinity,
  type HomeEndNavigationPhase,
} from './homeEndNavigation'
import {
  prepareLocalImeHomeEndHandoff,
  runLocalImeHomeEndCommand,
} from './localImeHomeEndCommandAdapter'
import {
  prepareLocalImePageUpDownHandoff,
  runLocalImePageUpDownCommand,
} from './localImePageUpDownCommandAdapter'
import { resolvePageUpDownScrollHost } from './pageUpDownNavigation'
import type {
  LocalImeHomeEndNavigationOperation,
  LocalImePageUpDownNavigationOperation,
} from './localImeNavigationOperation'
import {
  proveLocalImeLocalWindowSelectionDispatch,
  restoreLocalImeLocalWindowMappedHostCaretFromCloseProof,
  type LocalImeLocalWindowCloseHandoffProof,
  type LocalImeLocalWindowHostTransactionSlice,
} from './localImeLocalWindowKeyboardHandoff'
import { resolveSupportedEditorWritingMode } from './writingModeArrowNavigationState'

export const LOCAL_IME_LOCAL_WINDOW_HOST_NAV_KEY_REASON = 'local-window-host-nav-key'

export type LocalImeLocalWindowHostNavKey = 'Home' | 'End' | 'PageUp' | 'PageDown'

export type LocalImeLocalWindowHostNavKeyOperation =
  | LocalImeHomeEndNavigationOperation
  | LocalImePageUpDownNavigationOperation

const KEY_TO_OPERATION: Readonly<
  Record<LocalImeLocalWindowHostNavKey, LocalImeLocalWindowHostNavKeyOperation>
> = {
  Home: 'home',
  End: 'end',
  PageUp: 'page-up',
  PageDown: 'page-down',
}

export function classifyLocalImeLocalWindowHostNavKey(
  key: string,
): LocalImeLocalWindowHostNavKeyOperation | null {
  return KEY_TO_OPERATION[key as LocalImeLocalWindowHostNavKey] ?? null
}

export function isLocalImeLocalWindowHostNavKeyOperation(
  operation: LocalImeLocalWindowHostNavKeyOperation,
): operation is LocalImeHomeEndNavigationOperation {
  return operation === 'home' || operation === 'end'
}

export type LocalImeLocalWindowHostNavKeyProbe = {
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

/** probe / proof より前に、対象外 key と修飾付きを既存 local hot path へ返す。 */
export function isLocalImeLocalWindowHostNavKeyCandidate(
  probe: LocalImeLocalWindowHostNavKeyProbe,
): boolean {
  if (classifyLocalImeLocalWindowHostNavKey(probe.key) === null) return false
  return !probe.metaKey && !probe.ctrlKey && !probe.altKey && !probe.shiftKey
}

export type LocalImeLocalWindowHostNavKeyDecision =
  | { readonly exit: true; readonly operation: LocalImeLocalWindowHostNavKeyOperation }
  | {
      readonly exit: false
      readonly reason:
        | 'not-bare-host-nav-key'
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
    }

/**
 * bare Arrow の line 軸と同じ eligibility を Home / End / Page へ広げる。
 * geometry / 位置条件は持たない（host command 自身が端と no-op を決める）。
 */
export function resolveLocalImeLocalWindowHostNavKeyExit(input: {
  readonly event: LocalImeLocalWindowHostNavKeyProbe
  readonly mode: string
  readonly writingMode: string
  readonly state: EditorState | null
  readonly pendingBoundary: boolean
  readonly localViewConnected: boolean
  readonly localRootFocused: boolean
  readonly identityValid: boolean
  readonly baseProof: boolean
}): LocalImeLocalWindowHostNavKeyDecision {
  const { event } = input
  const operation = classifyLocalImeLocalWindowHostNavKey(event.key)
  if (!operation || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return { exit: false, reason: 'not-bare-host-nav-key' }
  }
  if (!event.isTrusted) return { exit: false, reason: 'not-trusted' }
  if (!event.cancelable) return { exit: false, reason: 'not-cancelable' }
  if (event.isComposing || event.keyCode === 229) return { exit: false, reason: 'composing' }
  if (input.mode !== 'active-clean' && input.mode !== 'active-dirty') {
    return { exit: false, reason: 'mode-not-active' }
  }
  if (!resolveSupportedEditorWritingMode(input.writingMode)) {
    return { exit: false, reason: 'writing-mode' }
  }
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
  return { exit: true, operation }
}

export type LocalImeLocalWindowHostNavKeyScrollOffset = {
  readonly scrollTop: number
  readonly scrollLeft: number
}

/**
 * host authorityがcommand実行時に確定した期待値。
 * Doc / Selection / transactionはdispatch前plan、Page scrollはcommand自身による最後の
 * scroll書き込み直後の実offsetであり、proof側のpost-stateから逆算しない。
 */
export type HostNavigationCommandPlanOrResult = {
  readonly expectedDoc: ProseMirrorNode
  readonly expectedSelection: Selection
  readonly expectedTransactionCount: 0 | 1
  readonly expectedScrollOffset: LocalImeLocalWindowHostNavKeyScrollOffset | null
  readonly moved: boolean
  readonly boundaryNoop: boolean
  readonly homeEndPhaseResult: HomeEndNavigationPhase | null
  readonly endAffinity: HomeEndNavigationDomAffinity
}

export type LocalImeLocalWindowHostNavKeyApplicationProof =
  | {
      readonly ok: true
      readonly transactionCount: 0 | 1
      readonly boundaryNoop: boolean
    }
  | {
      readonly ok: false
      readonly reason:
        | 'command-dispatch-dropped'
        | 'command-exactness-mismatch'
        | 'command-doc-mismatch'
        | 'command-selection-mismatch'
        | 'command-scroll-mismatch'
    }

/**
 * adapter の自己申告ではなく、実 counter 差・最終 host Doc / Selection・scroll delta を
 * 同期再証明する。
 *
 * - Home / End: moved なら selection-only exact 1、論理端 no-op なら transaction 0
 * - Page: selection-only 0/1。transaction 0 は scroll delta 0 の正当な boundary no-op だけ
 */
export function proveLocalImeLocalWindowHostNavKeyApplication(input: {
  readonly operation: LocalImeLocalWindowHostNavKeyOperation
  readonly plan: HostNavigationCommandPlanOrResult
  readonly before: LocalImeLocalWindowHostTransactionSlice
  readonly after: LocalImeLocalWindowHostTransactionSlice
  readonly finalDoc: ProseMirrorNode
  readonly finalSelection: Selection
  readonly finalScrollOffset: LocalImeLocalWindowHostNavKeyScrollOffset
}): LocalImeLocalWindowHostNavKeyApplicationProof {
  const homeEnd = isLocalImeLocalWindowHostNavKeyOperation(input.operation)
  const expect: 'selection-only-exact-1' | 'unchanged' =
    input.plan.expectedTransactionCount === 1 ? 'selection-only-exact-1' : 'unchanged'
  if (!input.finalDoc.eq(input.plan.expectedDoc)) {
    return { ok: false, reason: 'command-doc-mismatch' }
  }
  const dispatchProof = proveLocalImeLocalWindowSelectionDispatch({
    before: input.before,
    after: input.after,
    threw: false,
    expect,
  })
  if (!dispatchProof.ok) {
    return {
      ok: false,
      reason: dispatchProof.reason === 'dispatch-dropped'
        ? 'command-dispatch-dropped'
        : 'command-exactness-mismatch',
    }
  }
  if (!input.finalSelection.eq(input.plan.expectedSelection)) {
    return { ok: false, reason: 'command-selection-mismatch' }
  }
  if (!homeEnd) {
    const expectedScroll = input.plan.expectedScrollOffset
    if (
      !expectedScroll ||
      input.finalScrollOffset.scrollTop !== expectedScroll.scrollTop ||
      input.finalScrollOffset.scrollLeft !== expectedScroll.scrollLeft
    ) {
      return { ok: false, reason: 'command-scroll-mismatch' }
    }
  }
  return {
    ok: true,
    transactionCount: input.plan.expectedTransactionCount,
    boundaryNoop: input.plan.boundaryNoop,
  }
}

export type LocalImeLocalWindowHostNavKeyAfterCloseResult =
  | {
      readonly ok: true
      readonly caretRestoreTransactionCount: 0 | 1
      readonly adapterCalls: 1
      readonly adapterTransactionCount: 0 | 1
      readonly moved: boolean
      readonly scrollMoved: boolean
      readonly boundaryNoop: boolean
      readonly homeEndPhaseResult: HomeEndNavigationPhase | null
      readonly endAffinity: HomeEndNavigationDomAffinity
    }
  | {
      readonly ok: false
      readonly reason: string
      readonly caretRestoreTransactionCount: 0 | 1
      readonly adapterCalls: 0 | 1
    }

function readScrollOffset(host: HTMLElement | null): LocalImeLocalWindowHostNavKeyScrollOffset {
  return { scrollTop: host?.scrollTop ?? 0, scrollLeft: host?.scrollLeft ?? 0 }
}

function rollbackScrollOffset(
  host: HTMLElement | null,
  offset: LocalImeLocalWindowHostNavKeyScrollOffset,
): void {
  if (!host) return
  try {
    if (host.scrollTop !== offset.scrollTop) host.scrollTop = offset.scrollTop
    if (host.scrollLeft !== offset.scrollLeft) host.scrollLeft = offset.scrollLeft
  } catch {
    // rollback 失敗は typed failure のまま controller の cancel へ返す。
  }
}

/**
 * typed close proof を正本に mapped caret を復元し、既存 host command を exact 1 回使う。
 *
 * 呼び出し側は Home / End のとき全体を `runWithHomeEndSelectionMutation()` で囲むこと
 * （close / teardown 由来の selection echo で 2 段階 state を失わないため）。
 */
export function runLocalImeLocalWindowHostNavKeyAfterClose(input: {
  readonly hostView: EditorView
  readonly closeProof: LocalImeLocalWindowCloseHandoffProof | null
  readonly operation: LocalImeLocalWindowHostNavKeyOperation
  readonly event: KeyboardEvent
  readonly writingMode: string
  readonly getHostTransactionCounts: () => LocalImeLocalWindowHostTransactionSlice
  /** handled かつ post-proof 成功後だけ exact 1 回呼ぶ既存表示通知。 */
  readonly onHandled?: () => void
  readonly pushLog?: (event: string, detail: string) => void
  /** E2E failure oracle 専用。production は既存 host command をそのまま使う。 */
  readonly forceCommandRejectForTest?: boolean
  /** commandを実行したまま実dispatchをdrop/置換するtest-only injection。 */
  readonly dispatchCommandTransactionForTest?: (transaction: Transaction) => void
  readonly injectAfterCommandForTest?: () => void
  /** controllerがsession confirm後の最終同期点でauthority primitiveを適用する場合。 */
  readonly deferHomeEndDomAffinity?: boolean
}): LocalImeLocalWindowHostNavKeyAfterCloseResult {
  const { hostView, operation } = input
  const restored = restoreLocalImeLocalWindowMappedHostCaretFromCloseProof({
    hostView,
    closeProof: input.closeProof,
    getHostTransactionCounts: input.getHostTransactionCounts,
  })
  if (!restored.ok) {
    if (isLocalImeLocalWindowHostNavKeyOperation(operation)) resetHomeEndState()
    return { ok: false, reason: restored.reason, caretRestoreTransactionCount: 0, adapterCalls: 0 }
  }
  const caretRestoreTransactionCount = restored.transactionCount
  const homeEnd = isLocalImeLocalWindowHostNavKeyOperation(operation)
  const prepared = homeEnd
    ? prepareLocalImeHomeEndHandoff({
        view: hostView,
        state: hostView.state,
        writingMode: input.writingMode,
      })
    : prepareLocalImePageUpDownHandoff({
        view: hostView,
        state: hostView.state,
        writingMode: input.writingMode,
      })
  if (!prepared.ok) {
    if (homeEnd) resetHomeEndState()
    return { ok: false, reason: prepared.reason, caretRestoreTransactionCount, adapterCalls: 0 }
  }

  const scrollHost = resolvePageUpDownScrollHost(hostView)
  const beforeScroll = readScrollOffset(scrollHost)
  const before = input.getHostTransactionCounts()

  let commandOk = false
  let commandReason = 'command-rejected'
  let commandPlan: HostNavigationCommandPlanOrResult | null = null
  if (input.forceCommandRejectForTest) {
    // adapter drop injection: command を実行せず、呼び出し 1 回の失敗として扱う。
    commandReason = 'command-rejected'
  } else if (homeEnd) {
    const command = runLocalImeHomeEndCommand({
      view: hostView,
      event: input.event,
      operation,
      beforeFrom: hostView.state.selection.from,
      pushLog: input.pushLog,
      dispatchTransaction: input.dispatchCommandTransactionForTest,
    })
    commandOk = command.ok
    if (command.ok) {
      commandPlan = {
        ...command.plan,
        expectedScrollOffset: null,
      }
    }
    else commandReason = command.reason
  } else {
    const command = runLocalImePageUpDownCommand({
      view: hostView,
      event: input.event,
      operation,
      getTransactionCount: () => input.getHostTransactionCounts().total,
      pushLog: input.pushLog,
      dispatchTransaction: input.dispatchCommandTransactionForTest,
    })
    commandOk = command.ok
    if (command.ok) {
      commandPlan = {
        ...command.plan,
        homeEndPhaseResult: null,
        endAffinity: null,
      }
    }
    else commandReason = command.reason
  }
  input.injectAfterCommandForTest?.()
  if (!commandOk || !commandPlan) {
    // Page の command failure では開始 scroll 値へ戻す（host module 自身の rollback と同値）。
    if (!homeEnd) rollbackScrollOffset(scrollHost, beforeScroll)
    if (homeEnd) resetHomeEndState()
    return { ok: false, reason: commandReason, caretRestoreTransactionCount, adapterCalls: 1 }
  }

  const after = input.getHostTransactionCounts()
  const afterScroll = readScrollOffset(scrollHost)
  const scrollMoved =
    afterScroll.scrollTop !== beforeScroll.scrollTop ||
    afterScroll.scrollLeft !== beforeScroll.scrollLeft
  const finalSelection = hostView.state.selection
  const proof = proveLocalImeLocalWindowHostNavKeyApplication({
    operation,
    plan: commandPlan,
    before,
    after,
    finalDoc: hostView.state.doc,
    finalSelection,
    finalScrollOffset: afterScroll,
  })
  if (!proof.ok) {
    if (homeEnd) resetHomeEndState()
    return { ok: false, reason: proof.reason, caretRestoreTransactionCount, adapterCalls: 1 }
  }
  if (homeEnd && !input.deferHomeEndDomAffinity) {
    applyHomeEndNavigationDomAffinity(hostView, commandPlan.endAffinity)
  }
  input.onHandled?.()
  return {
    ok: true,
    caretRestoreTransactionCount,
    adapterCalls: 1,
    adapterTransactionCount: proof.transactionCount,
    moved: commandPlan.moved,
    scrollMoved,
    boundaryNoop: commandPlan.boundaryNoop,
    homeEndPhaseResult: commandPlan.homeEndPhaseResult,
    endAffinity: commandPlan.endAffinity,
  }
}
