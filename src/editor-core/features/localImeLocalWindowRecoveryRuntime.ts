/**
 * LOCAL-WINDOW-RECOVERY-RESTART1 — 製品非依存のrecovery / restart typed port と、
 * その module registry。
 *
 * 位置づけ:
 * - このスライスでは一般向け設定トグル・製品noticeを**描かない**。ここにあるのは
 *   後続`LOCAL-WINDOW-PUBLIC-ENTRY1`が単一トグルと異常時noticeから再利用できる
 *   port定義だけである。作者HUDとE2E bridgeは同じportの診断入口を共有する。
 * - **test-only capabilityをこのport型へ混ぜない。** failure injection等は既存の
 *   `...ForE2e`経路（packaging gateの対象）へ置き、`PUBLIC-ENTRY1`が再利用する
 *   製品port型はproduction操作だけで構成する。
 * - E2E bridgeはproduction capabilityではない。portの実体は
 *   `localImeLocalWindowIntegration.ts`が1つだけ登録し、第二controller /
 *   第二runtimeは作らない。
 * - circuit breakerはpilot runtime側の正本なので、解除は`restart()`へ渡す
 *   `releaseBreaker`callbackとして**明示操作に紐づけて**注入する。この module は
 *   breakerを直接知らない。
 */

import type { LocalImeInputSessionMode } from './localImeInputSessionState'
import type {
  LocalImeLocalWindowRecoveryClipboardWriter,
  LocalImeLocalWindowRecoveryCopyResult,
  LocalImeLocalWindowRecoveryExportResult,
} from './localImeLocalWindowRecoveryExport'
import type {
  LocalImeLocalWindowProductRuntimeState,
  LocalImeLocalWindowRecoveryDiscardRejectReason,
  LocalImeLocalWindowRecoveryIntentProbe,
  LocalImeLocalWindowRecoveryRetryRejectReason,
  LocalImeLocalWindowRestartSequenceRejectReason,
} from './localImeLocalWindowRuntimeState'

/** 固定enum / 件数 / booleanだけ。本文・座標・path・key実文字は載せない。 */
export type LocalImeLocalWindowRecoveryDiagnostics = {
  readonly runtimeState: LocalImeLocalWindowProductRuntimeState
  readonly epoch: number
  /** UIの単一トグルへ投影するON/OFF。`recovery-suspended`は必ずfalse。 */
  readonly toggleOn: boolean
  /** draftを持つcontroller / subscriptionが生存しているか。 */
  readonly recoveryRuntimeAlive: boolean
  readonly recoveryIntent: LocalImeLocalWindowRecoveryIntentProbe | null
  readonly retryable: boolean
  readonly retryRejectReason: LocalImeLocalWindowRecoveryRetryRejectReason | null
  readonly draftRetained: boolean
  /** 保持中draftの**長さだけ**（本文は返さない）。 */
  readonly draftLength: number | null
  readonly compositionFinalizationPending: boolean
  readonly sessionMode: LocalImeInputSessionMode | null
  /** recovery突入時に同期破棄したlifecycleの実測diagnostics。 */
  readonly autoArmContinuityEnabled: boolean
  readonly autoArmPendingCandidate: boolean
  readonly autoArmPendingMicrotask: boolean
  readonly productEntryListenerCount: number
  readonly productEntryPointerAssociationCount: number
  readonly productEntrySelectionProofCount: number
  readonly productEntryDomSelectionProofCount: number
  readonly productEntryTerminalAwaitingSelectionCount: number
  readonly productEntryStartAttemptCount: number
  readonly productEntryStartSuccessCount: number
  readonly pointerListenerCount: number
  readonly pointerLeaseActive: boolean
  readonly navigationSessionActive: boolean
  readonly navigationListenerCount: number
  readonly resizeListenerCount: number
  readonly resizeObserverCount: number
  readonly resizeArmed: boolean
  /** 明示Retryで完了したexact-one commitの実績。 */
  readonly lastRetryHostTransactionDelta: number | null
  readonly lastRetryHostContentDelta: number | null
  readonly retryCallCount: number
  readonly retryCommitCount: number
  readonly copyCallCount: number
  readonly discardCallCount: number
  readonly discardCompletedCount: number
  readonly restartCallCount: number
  readonly restartStartCount: number
  readonly staleEpochRejectCount: number
  /**
   * restart中のStart例外後にcontrollerが収束した終端状態。
   * `recovery-retained`はdraftを保全したまま`recovery-suspended`へ入ったことを表す。
   */
  readonly lastRestartStartFailure:
    | 'settled-off'
    | 'recovery-retained'
    | 'still-active'
    | null
}

export type LocalImeLocalWindowRecoveryRetryOutcome = {
  readonly ok: boolean
  readonly reason: 'committed' | 'retained' | LocalImeLocalWindowRecoveryRetryRejectReason | 'unavailable'
  readonly sessionMode: LocalImeInputSessionMode | null
  readonly hostTransactionDelta: number | null
  readonly hostContentDelta: number | null
  /** Retryで再実行した元document actionの件数。契約上つねに0。 */
  readonly documentActionReplayCount: 0
  /** Retry前後で観測したAUTOARM fresh acquisition試行の増分。契約上つねに0。 */
  readonly freshAcquisitionCount: number
}

export type LocalImeLocalWindowRecoveryDiscardOutcome = {
  readonly ok: boolean
  readonly reason:
    | 'discarded'
    | 'discard-failed'
    | 'unavailable'
    | LocalImeLocalWindowRecoveryDiscardRejectReason
  /** stop / discard / terminal cleanupを独立に試行した実績（順序固定）。 */
  readonly stopAttempted: boolean
  readonly discardAttempted: boolean
  readonly cleanupAttempted: boolean
  readonly sessionMode: LocalImeInputSessionMode | null
}

export type LocalImeLocalWindowRestartOutcome = {
  readonly ok: boolean
  readonly outcome: 'started' | 'enabled-waiting' | 'rejected'
  readonly reason: LocalImeLocalWindowRestartSequenceRejectReason | 'unavailable' | null
  readonly epoch: number
  readonly startAttempts: 0 | 1
  readonly runtimeState: LocalImeLocalWindowProductRuntimeState
}

export type LocalImeLocalWindowEnableOutcome = {
  readonly ok: boolean
  readonly reason: 'applied' | 'recovery-unresolved' | 'stale-epoch' | 'unavailable'
  readonly runtimeState: LocalImeLocalWindowProductRuntimeState
}

/**
 * LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: ON の出所。
 * `saved setting restore / initial load !== explicit user enable`。
 */
export type LocalImeLocalWindowEnableActivation =
  | 'configuration-sync'
  | 'explicit-user-toggle'

/**
 * 製品UIに依存しないtyped port。`PUBLIC-ENTRY1`の単一トグルとnoticeは、この
 * portだけを呼ぶ想定である。
 */
export type LocalImeLocalWindowRecoveryPort = {
  getEpoch: () => number
  getRuntimeState: () => LocalImeLocalWindowProductRuntimeState
  diagnostics: () => LocalImeLocalWindowRecoveryDiagnostics
  /** 未解決recovery中の`true`は拒否する（表示OFFのままdraft runtimeは生存）。 */
  requestEnabled: (input: {
    readonly enabled: boolean
    readonly epoch?: number
    /**
     * LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: ON の出所を typed に区別する。
     * - `configuration-sync`（既定）: 保存済み設定の復元 / initial document load。
     *   従来どおり Start 0 で `enabled-waiting` を維持する。
     * - `explicit-user-toggle`: toolbar / 設定 UI からユーザーが明示的に ON にした。
     *   current document の AUTOARM continuity を開き、現在 caret を証明できるときだけ
     *   fresh acquisition を最大 1 回試行する。
     */
    readonly activation?: LocalImeLocalWindowEnableActivation
  }) => LocalImeLocalWindowEnableOutcome
  /** 同じretained draftをexact 1回commitしてoffへ収束する明示Retry。 */
  retry: (input?: { readonly epoch?: number }) => LocalImeLocalWindowRecoveryRetryOutcome
  /** read-only canonical Markdown export。draft / stateへは触れない。 */
  exportDraftMarkdown: (input?: {
    readonly epoch?: number
  }) => LocalImeLocalWindowRecoveryExportResult
  /** export + 注入clipboard writer。write失敗でもdraftとrecoveryを保持する。 */
  copyDraftMarkdown: (input?: {
    readonly epoch?: number
    readonly write?: LocalImeLocalWindowRecoveryClipboardWriter
  }) => Promise<LocalImeLocalWindowRecoveryCopyResult>
  /** 「下書きを破棄して停止」の確認済みdiscardだけを受け取る。 */
  discard: (input: {
    readonly confirmed: boolean
    readonly epoch?: number
  }) => LocalImeLocalWindowRecoveryDiscardOutcome
  /** 明示OFF→ON相当。旧epochを無効化し、breaker解除後に新epochを開始する。 */
  restart: (input: {
    readonly releaseBreaker: () => boolean
    readonly epoch?: number
  }) => LocalImeLocalWindowRestartOutcome
}

let activePort: LocalImeLocalWindowRecoveryPort | null = null

/** @internal `localImeLocalWindowIntegration` からのみ呼ぶ。 */
export function registerLocalImeLocalWindowRecoveryPort(
  port: LocalImeLocalWindowRecoveryPort,
): void {
  // 第二runtimeを作らない。最後にattachした単一integrationだけがownerである。
  activePort = port
}

/** @internal `localImeLocalWindowIntegration.destroy()` からのみ呼ぶ。 */
export function unregisterLocalImeLocalWindowRecoveryPort(
  port: LocalImeLocalWindowRecoveryPort,
): void {
  if (activePort === port) activePort = null
}

export function getLocalImeLocalWindowRecoveryPort(): LocalImeLocalWindowRecoveryPort | null {
  return activePort
}

/** test only: module registryを未登録へ戻す。 */
export function resetLocalImeLocalWindowRecoveryPortForTest(): void {
  activePort = null
}
