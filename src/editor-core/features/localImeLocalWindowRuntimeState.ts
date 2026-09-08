/**
 * LOCAL-WINDOW-RECOVERY-RESTART1 — 製品runtime state / runtime epoch / Retry・restart
 * 判定の **pure** 層。
 *
 * 正本:
 * - `docs/local-ime-experimental-preview-roadmap-2026-08.md` §3.7
 * - `docs/local-ime-local-editing-window-future-design-2026-08.md`（recovery runtime / public entry）
 * - `docs/local-ime-selection-ownership-design-2026-08.md`（`recovery-suspended`）
 *
 * 責務境界:
 * - DOM / ProseMirror / React / Electron / clipboardへ依存しない。
 * - 「UI表示上のON/OFF」と「draftを持つrecovery runtimeの生存」を**同じbooleanにしない**。
 *   前者は`isLocalImeLocalWindowRuntimeToggleOn()`、後者は
 *   `isLocalImeLocalWindowRecoveryRuntimeAlive()`が正本である。
 * - eligibility / base proof / commit exactnessの正本はcontrollerであり、ここでは
 *   controllerが同期的に返したbooleanを組み合わせるだけ。再実装しない。
 * - timer / polling / quiet period / synthetic replayをここへ持ち込まない。
 *
 * このスライスでは一般向け設定トグルを描かないが、`LOCAL-WINDOW-PUBLIC-ENTRY1`が
 * 同じstateとtyped decisionを再利用できる形に閉じてある。
 */

// --- product runtime state -------------------------------------------------

export type LocalImeLocalWindowProductRuntimeState =
  | 'disabled'
  | 'enabled-waiting'
  | 'enabled-active'
  | 'recovery-suspended'

export type LocalImeLocalWindowRuntimeStateProbe = {
  /** 製品トグル相当の「入力ownership取得許可」。作者PilotのStartもこれに写す。 */
  readonly enabledIntent: boolean
  /** recovery draftを保持したruntimeが生存しているか（UI表示とは独立）。 */
  readonly recoveryRetained: boolean
  /** controllerがlocal ownerとして活動中か（recovery中はfalse）。 */
  readonly sessionActive: boolean
}

/**
 * 4状態のpure分類。
 *
 * `recovery-suspended`が最優先。recovery中はUI上OFFへ投影しつつ、controllerと
 * subscriptionは生存させるためである（通常の実効OFF cleanupへ合流させない）。
 */
export function resolveLocalImeLocalWindowProductRuntimeState(
  probe: LocalImeLocalWindowRuntimeStateProbe,
): LocalImeLocalWindowProductRuntimeState {
  if (probe.recoveryRetained) return 'recovery-suspended'
  if (!probe.enabledIntent) return 'disabled'
  return probe.sessionActive ? 'enabled-active' : 'enabled-waiting'
}

/** 単一トグルへ投影する表示上のON/OFF。`recovery-suspended`は必ずOFF。 */
export function isLocalImeLocalWindowRuntimeToggleOn(
  state: LocalImeLocalWindowProductRuntimeState,
): boolean {
  return state === 'enabled-waiting' || state === 'enabled-active'
}

/** draftを持つcontroller / subscriptionを保持し続けるべき状態か。 */
export function isLocalImeLocalWindowRecoveryRuntimeAlive(
  state: LocalImeLocalWindowProductRuntimeState,
): boolean {
  return state === 'recovery-suspended'
}

/** 未解決recovery中のON（新規acquisition許可）は禁止する。 */
export function canEnableLocalImeLocalWindowRuntime(
  state: LocalImeLocalWindowProductRuntimeState,
): boolean {
  return state !== 'recovery-suspended'
}

// --- runtime epoch ---------------------------------------------------------

export const LOCAL_IME_LOCAL_WINDOW_INITIAL_RUNTIME_EPOCH = 1

/** 明示restartだけが呼ぶ。timer / pollingからは進めない。 */
export function nextLocalImeLocalWindowRuntimeEpoch(current: number): number {
  return current + 1
}

/**
 * 旧epoch由来のStart / commit / discard / copy完了通知を無効化する。
 *
 * `observed`未指定は「epoch非依存の同期read」だけに許す。runtime内部の
 * callbackは必ず捕捉済みepochを渡す。
 */
export function isLocalImeLocalWindowRuntimeEpochCurrent(
  current: number,
  observed?: number | null,
): boolean {
  if (observed === undefined || observed === null) return true
  return observed === current
}

// --- recovery classification ----------------------------------------------

/** controllerの`RecoveryIntent`をpure層へ写した固定enum（本文は含まない）。 */
export type LocalImeLocalWindowRecoveryIntentProbe =
  | 'dispatch-before-apply'
  | 'dispatch-after-apply'
  | 'stale-base'
  | 'host-content-change'
  | 'pending-dom-flush'
  | 'document-change'
  | 'destroy'
  | 'invalid-local-state'

export type LocalImeLocalWindowRecoveryRetryRejectReason =
  | 'stale-epoch'
  | 'not-recovery'
  | 'dispatch-after-apply'
  | 'not-retryable-intent'
  | 'host-applied'
  | 'composition-pending'
  | 'no-draft'
  | 'stale-base'

export type LocalImeLocalWindowRecoveryRetryProbe = {
  readonly epochCurrent: boolean
  readonly recoveryIntent: LocalImeLocalWindowRecoveryIntentProbe | null
  /** controllerが観測したdispatch disposition。`after-apply`はRetry不可。 */
  readonly dispatchDisposition: 'none' | 'before-apply' | 'after-apply'
  readonly compositionActive: boolean
  readonly compositionFinalizationPending: boolean
  readonly draftRetained: boolean
  /** base / identity / generation / Fragment / DOM proofが現在もexactか。 */
  readonly baseProofExact: boolean
}

export type LocalImeLocalWindowRecoveryRetryDecision =
  | { readonly retryable: true }
  | {
      readonly retryable: false
      readonly reason: LocalImeLocalWindowRecoveryRetryRejectReason
    }

/**
 * Retry可能条件は既存契約だけ。dropだけをbefore-applyとして扱う既存分類は緩めない。
 */
export function resolveLocalImeLocalWindowRecoveryRetry(
  probe: LocalImeLocalWindowRecoveryRetryProbe,
): LocalImeLocalWindowRecoveryRetryDecision {
  if (!probe.epochCurrent) return { retryable: false, reason: 'stale-epoch' }
  if (probe.recoveryIntent === null) return { retryable: false, reason: 'not-recovery' }
  if (probe.recoveryIntent === 'dispatch-after-apply') {
    return { retryable: false, reason: 'dispatch-after-apply' }
  }
  if (probe.recoveryIntent !== 'dispatch-before-apply') {
    return { retryable: false, reason: 'not-retryable-intent' }
  }
  if (probe.dispatchDisposition === 'after-apply') {
    return { retryable: false, reason: 'host-applied' }
  }
  if (probe.compositionActive || probe.compositionFinalizationPending) {
    return { retryable: false, reason: 'composition-pending' }
  }
  if (!probe.draftRetained) return { retryable: false, reason: 'no-draft' }
  if (!probe.baseProofExact) return { retryable: false, reason: 'stale-base' }
  return { retryable: true }
}

// --- explicit discard ------------------------------------------------------

export type LocalImeLocalWindowRecoveryDiscardRejectReason =
  | 'stale-epoch'
  | 'not-confirmed'
  | 'not-recovery'

export type LocalImeLocalWindowRecoveryDiscardProbe = {
  readonly epochCurrent: boolean
  /** 「下書きを破棄して停止」の明示確認が済んでいるか。UI文言は製品側の責務。 */
  readonly confirmed: boolean
  readonly recoveryRetained: boolean
}

export type LocalImeLocalWindowRecoveryDiscardDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false
      readonly reason: LocalImeLocalWindowRecoveryDiscardRejectReason
    }

/** 自動discard / timeout discard / document actionに伴う暗黙discardは作らない。 */
export function resolveLocalImeLocalWindowRecoveryDiscard(
  probe: LocalImeLocalWindowRecoveryDiscardProbe,
): LocalImeLocalWindowRecoveryDiscardDecision {
  if (!probe.epochCurrent) return { allowed: false, reason: 'stale-epoch' }
  if (!probe.confirmed) return { allowed: false, reason: 'not-confirmed' }
  if (!probe.recoveryRetained) return { allowed: false, reason: 'not-recovery' }
  return { allowed: true }
}

// --- runtime restart -------------------------------------------------------

export type LocalImeLocalWindowRestartRejectReason =
  | 'stale-epoch'
  | 'recovery-unresolved'
  | 'controller-active'
  | 'document-action-pending'
  | 'pointer-active'
  | 'navigation-active'
  | 'composition-active'
  | 'identity-changed'
  | 'host-view-unavailable'
  | 'breaker-not-released'

export type LocalImeLocalWindowRestartProbe = {
  readonly epochCurrent: boolean
  /** recovery draftが解決済み（Retry commit / 確認済みdiscard）か。 */
  readonly recoveryResolved: boolean
  readonly controllerOff: boolean
  readonly documentActionPending: boolean
  readonly pointerGestureActive: boolean
  readonly navigationSessionActive: boolean
  readonly compositionActive: boolean
  /** restart要求時点で観測したidentityと、現在のhost document identity。 */
  readonly requestedDocumentIdentity: string
  readonly hostDocumentIdentity: string
  readonly hostViewLive: boolean
  readonly hostViewEditable: boolean
  /** circuit breaker解除が明示操作に紐づいて成功したか。 */
  readonly breakerReleased: boolean
  /** 現在のhost Selectionがcollapsedか（range / 非collapsedはStart根拠にしない）。 */
  readonly hostSelectionCollapsed: boolean
  /** 現在のhost Doc / Selection / capabilityの再証明結果。 */
  readonly hostSelectionEligible: boolean
}

/**
 * `breakerReleased`以外のrestart probe。
 *
 * `requestedDocumentIdentity`は**restart開始時に1回だけcaptureした値**、
 * `hostDocumentIdentity`は毎回読み直した最新値である。両者を同じ呼び出しで
 * 現在値から取ると、cleanup / breaker解除の途中でidentityが変わっても
 * `identity-changed`を検出できない。
 */
export type LocalImeLocalWindowRestartProbeBase =
  Omit<LocalImeLocalWindowRestartProbe, 'breakerReleased'>

export type LocalImeLocalWindowRestartDecision =
  | {
      readonly ok: false
      readonly reason: LocalImeLocalWindowRestartRejectReason
    }
  | {
      readonly ok: true
      /** `start`はexact 1回のStart試行、`enabled-waiting`はhost ownerのまま。 */
      readonly outcome: 'start' | 'enabled-waiting'
    }

/**
 * restart前提の再証明。すべて同期probeで、timer / quiet periodによる推測は使わない。
 *
 * ineligible / range / stale / unavailableはいずれも`enabled-waiting`で、
 * host ownerのまま新epochを開始する（Startは0回）。
 */
export function resolveLocalImeLocalWindowRestart(
  probe: LocalImeLocalWindowRestartProbe,
): LocalImeLocalWindowRestartDecision {
  if (!probe.epochCurrent) return { ok: false, reason: 'stale-epoch' }
  if (!probe.recoveryResolved) return { ok: false, reason: 'recovery-unresolved' }
  if (!probe.controllerOff) return { ok: false, reason: 'controller-active' }
  if (probe.documentActionPending) return { ok: false, reason: 'document-action-pending' }
  if (probe.pointerGestureActive) return { ok: false, reason: 'pointer-active' }
  if (probe.navigationSessionActive) return { ok: false, reason: 'navigation-active' }
  if (probe.compositionActive) return { ok: false, reason: 'composition-active' }
  if (probe.requestedDocumentIdentity !== probe.hostDocumentIdentity) {
    return { ok: false, reason: 'identity-changed' }
  }
  if (!probe.hostViewLive || !probe.hostViewEditable) {
    return { ok: false, reason: 'host-view-unavailable' }
  }
  if (!probe.breakerReleased) return { ok: false, reason: 'breaker-not-released' }
  if (!probe.hostSelectionCollapsed || !probe.hostSelectionEligible) {
    return { ok: true, outcome: 'enabled-waiting' }
  }
  return { ok: true, outcome: 'start' }
}

/**
 * restartの固定順序を1箇所に閉じ込めたorchestrator。
 *
 * `preflight`（breaker解除以外の全前提）
 * → `invalidateEpochAndCleanup`（旧epoch無効化 + listener / callback / lease /
 *   AUTOARM candidateの破棄）
 * → `releaseBreaker`（明示解除）
 * → `reprove`（新epochでの再証明。identityはcapture値と最新値の比較）
 * → `start`（eligibleのときだけ**最大1回**）
 *
 * `reprove`はbreaker解除後に改めて読むので、解除中にdocument identityが
 * 変わった場合は`identity-changed`でStart 0のまま終わる。
 */
/**
 * sequence固有の追加reason。
 *
 * `start-failed`は`resolveLocalImeLocalWindowRestart()`が返すものではなく、
 * 「再証明まで通ったがStart自体が例外で落ちた」ことだけを表す。旧epochは既に
 * 無効化され、cleanupとbreaker解除も済んでいるので、fail-closedで新規Startを
 * 諦める（再試行はしない）。
 */
export type LocalImeLocalWindowRestartSequenceRejectReason =
  | LocalImeLocalWindowRestartRejectReason
  | 'start-failed'

export type LocalImeLocalWindowRestartSequenceResult =
  | {
      readonly ok: false
      readonly outcome: 'rejected'
      readonly reason: LocalImeLocalWindowRestartSequenceRejectReason
      /** Start例外だけは「1回試行して失敗」なので1になる。再試行は0のまま。 */
      readonly startAttempts: 0 | 1
      readonly epochAdvanced: boolean
    }
  | {
      readonly ok: true
      readonly outcome: 'started' | 'enabled-waiting'
      readonly reason: null
      readonly startAttempts: 0 | 1
      readonly epochAdvanced: true
    }

export function runLocalImeLocalWindowRestartSequence(steps: {
  readonly preflight: () => LocalImeLocalWindowRestartProbeBase
  readonly invalidateEpochAndCleanup: () => void
  readonly releaseBreaker: () => boolean
  readonly reprove: () => LocalImeLocalWindowRestartProbeBase
  readonly start: () => boolean
}): LocalImeLocalWindowRestartSequenceResult {
  const preflight = resolveLocalImeLocalWindowRestart({
    ...steps.preflight(),
    // breaker解除は最後の段階。ここでは解除以外の前提だけを見る。
    breakerReleased: true,
  })
  if (!preflight.ok) {
    return {
      ok: false, outcome: 'rejected', reason: preflight.reason,
      startAttempts: 0, epochAdvanced: false,
    }
  }
  steps.invalidateEpochAndCleanup()
  let breakerReleased = false
  try {
    breakerReleased = steps.releaseBreaker() === true
  } catch {
    breakerReleased = false
  }
  const decision = resolveLocalImeLocalWindowRestart({
    ...steps.reprove(),
    breakerReleased,
  })
  if (!decision.ok) {
    return {
      ok: false, outcome: 'rejected', reason: decision.reason,
      startAttempts: 0, epochAdvanced: true,
    }
  }
  if (decision.outcome !== 'start') {
    return {
      ok: true, outcome: 'enabled-waiting', reason: null,
      startAttempts: 0, epochAdvanced: true,
    }
  }
  // Startは**最大1回**。例外はtyped rejectedへ収束させ、再試行しない。
  let started = false
  try {
    started = steps.start() === true
  } catch {
    return {
      ok: false, outcome: 'rejected', reason: 'start-failed',
      startAttempts: 1, epochAdvanced: true,
    }
  }
  return {
    ok: true,
    outcome: started ? 'started' : 'enabled-waiting',
    reason: null,
    startAttempts: 1,
    epochAdvanced: true,
  }
}
