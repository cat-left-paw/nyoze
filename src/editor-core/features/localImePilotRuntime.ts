/**
 * P3-A1a — 作者限定 internal pilot の runtime port（Start / Resume / Stop / Kill /
 * Force reset / subscribe と、safe-stop 用 listener の bind / unbind だけ）。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md`
 *       Product Slice P3-A1a。
 *
 * 位置づけ（**公開品質の Go ではない**）:
 * - 一般利用可能な P3-A、初回自動 arm（P3-A1b）、一般設定 UI、packaged production
 *   有効化はいずれも No-Go のまま。ここは作者が複製・使い捨て文書で実機
 *   フィードバックを取るための safety shell だけを提供する。
 *
 * 責務境界:
 * - eligibility の正本は既存 `controller.arm()`。この層でも UI 層でも再実装しない。
 * - PM command / selection / geometry / 入力本文を推測しない。synthetic
 *   KeyboardEvent / PointerEvent を PM へ再 dispatch しない。
 * - controller へ Alt delete / spellcheck / touch の command 実装を積まない。
 *   coordinator へ渡すのは generic な `notifyExternalOwnershipLoss()` だけ。
 * - **E2E bridgeは製品authorityにしない。** pilot 専用の
 *   registry と API をここに分離し、E2E gate を一般 development 入口へ広げない。
 *
 * 診断の不変条件:
 * - 固定 enum の reason / 回数 / retained payload の長さ / session mode だけ。
 * - 本文・composition 文字列・key の実文字・clipboard 本文 / HTML・DOM node・座標・
 *   path / file 名は state にも log にも残さない。
 */

import {
  isLocalImeInputSessionRunningMode,
  type LocalImeInputSessionExternalOwnershipLoss,
  type LocalImeInputSessionExternalOwnershipOutcome,
  type LocalImeInputSessionMode,
  type LocalImeInputSessionStartResult,
} from './localImeInputSessionState'
import {
  resolveLocalImeLocalEditingStatus,
  type LocalImeLocalEditingStatus,
} from './localImeLocalEditingStatusState'
import {
  canForceResetLocalImePilot,
  canKillLocalImePilot,
  createIdleLocalImePilotBreakerState,
  canResumeLocalImePilot,
  canStartLocalImePilot,
  canStopLocalImePilot,
  createIdleLocalImePilotRuntimeState,
  recordLocalImePilotStop,
  toLocalImePilotHudState,
  type LocalImePilotArmRejectReason,
  type LocalImePilotHudState,
  type LocalImePilotRuntimeState,
  type LocalImePilotStopReason,
} from './localImePilotState'
import {
  resolveLocalImeProductStrategy,
  type LocalImeProductStrategyDecision,
} from './localImeProductStrategyState'
import { isLocalImeLocalWindowRuntimeToggleOn } from './localImeLocalWindowRuntimeState'
import {
  getLocalImeLocalWindowRecoveryPort,
  type LocalImeLocalWindowRecoveryDiscardOutcome,
  type LocalImeLocalWindowRecoveryRetryOutcome,
  type LocalImeLocalWindowRestartOutcome,
} from './localImeLocalWindowRecoveryRuntime'
import type {
  LocalImeLocalWindowRecoveryClipboardWriter,
  LocalImeLocalWindowRecoveryCopyResult,
  LocalImeLocalWindowRecoveryExportResult,
} from './localImeLocalWindowRecoveryExport'

/**
 * pilot が触ってよい最小 port。`localImeIntegration` が実 instance を束ねて渡す。
 * pilot からは coordinator / controller の内部 state を直接書き換えない。
 */
export type LocalImePilotTarget = {
  /** listener を張る対象。overlay はこの子孫なので capture / bubble 順を制御できる。 */
  getEditorSurface: () => HTMLElement | null
  getSessionMode: () => LocalImeInputSessionMode | null
  /** 保持中 payload の**長さだけ**（本文は取得しない）。 */
  getRetainedPayloadLength: () => number | null
  /** eligibility は controller が正本。ここは結果を受け取るだけ。 */
  startSession: () => LocalImeInputSessionStartResult
  stopSession: () => LocalImeInputSessionMode
  notifyExternalOwnershipLoss: (
    disposition: LocalImeInputSessionExternalOwnershipLoss,
  ) => LocalImeInputSessionExternalOwnershipOutcome
  /** 既存の明示 discard 契約（`resolveRecovery('discard')`）。 */
  resolveRecoveryDiscard: () => LocalImeInputSessionMode
  /** overlay / listener / timer の最終掃除。retained payload の破棄には使わない。 */
  forceResetController: (reason: string) => void
  /** stale callback 無効化と実行時snapshot。 */
  cancelAutoArm?: () => void
  getAutoArmSnapshot?: () => {
    documentIdentity: string
    controllerGeneration: number
    sessionMode: LocalImeInputSessionMode | null
    hostFocused: boolean
    sourceModeActive: boolean
    paragraphPlainActive: boolean
    documentActionPending: boolean
    /** LOCAL-WINDOW-AUTOARM1 fresh-acquisition revalidation fields. */
    hostSelectionCollapsed?: boolean
    hostCompositionActive?: boolean
    hostViewReady?: boolean
    otherStrategyActive?: boolean
  } | null
}

export type LocalImePilotActionResult =
  | { ok: true }
  | { ok: false; reason: LocalImePilotArmRejectReason }

/**
 * 「実在する window / menu route か」を返す injected matcher。
 *
 * 実体は `src/ui/utils/localImePilotWindowRoutes.ts`（既存の共有 classifier /
 * matcher をそのまま呼ぶ）。依存方向を `ui → editor-core` に保つため注入にする。
 *
 * **未注入時は常に false**（fail-closed）。見送りを既定にすると、実在しない
 * Mod chord が armed のまま silent no-op になるためである。
 */
export type LocalImePilotHudSnapshot = LocalImePilotHudState

type Listener = (hud: LocalImePilotHudSnapshot) => void

/**
 * P3-EXP1: この runtime を有効化した capability の出所。
 *
 * - `author-pilot`: 非 packaged + `NYOZE_LOCAL_IME_PILOT=1`。development HUD /
 *   perf diagnostics / 手動 Start を持つ既存の作者 pilot。
 * - `experimental-preview`: 対応platform + persisted preferenceの製品Preview。
 *   HUD / perf diagnostics / E2E bridgeをcapabilityにせず、Local Windowだけを要求する。
 *
 * 2 つは pure policy 上で排他（`localImeExperimentalPreviewState.ts`）であり、
 * runtime 側でも owner entry 以外の configure を無視して同時成立を作らない。
 */
export type LocalImePilotEntry = 'author-pilot' | 'experimental-preview'

let state: LocalImePilotRuntimeState = createIdleLocalImePilotRuntimeState()
let activeEntry: LocalImePilotEntry | null = null
let target: LocalImePilotTarget | null = null
let localWindowTarget: LocalImePilotTarget | null = null
/** author Pilotまたは製品entryからのLocal Window要求。 */
let localWindowRequested = false
const listeners = new Set<Listener>()

/**
 * safe-stop / precursor hold が触る event の最小 interface。
 *
 * `Event` 全体を要求しないことで、pure な判定と DOM の間を薄く保ち、
 * unit test から実 coordinator 経路を通せるようにする。
 */
export type PilotStoppableEvent = {
  readonly cancelable: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

/** 同じ event へ safe-stop を二重適用しないための guard。 */
let handledEvents = new WeakSet<object>()
/**
 * 「この mode 遷移は自分が起こしたもので、最終診断 reason は typed outcome を正本にする」
 * 区間の深さ。この間は `onModeChange` 由来の breaker 記録を行わない。
 *
 * 2 つの理由で必要:
 *
 * 1. Kill と Force reset は composition 中の payload を **意図的に** `recovery-required`
 *    へ保全する。数えると作者の明示操作で critical trip してしまう。
 * 2. safe-stop 中の `notifyExternalOwnershipLoss()` も `recovery-required` を通知し得る。
 *    これを数えると `recovery-required` が先に trip し、そのあとの
 *    `teardown-failed` / `non-cancelable-critical` が「trip 済み」として無視され、
 *    HUD の reason が実際の失敗原因を指さなくなる。
 */
let modeBreakerSuppressDepth = 0

function withModeBreakerSuppressed<T>(run: () => T): T {
  modeBreakerSuppressDepth += 1
  try {
    return run()
  } finally {
    modeBreakerSuppressDepth -= 1
  }
}

/** 現在 listener を張っている surface（張っていなければ null）。 */

// --- subscribe / publish ---------------------------------------------------

function publish(): void {
  // OVERLAY-STATUS1: HUD listener の有無に依存せず、既存 lifecycle 通知から
  // coarse status だけを専用 channel へ射影する。perf tick では同値なので publish しない。
  syncLocalEditingStatus()
  if (listeners.size === 0) return
  const hud = toLocalImePilotHudState(state, false)
  for (const listener of [...listeners]) {
    try {
      listener(hud)
    } catch {
      // 表示側の例外を入力処理へ波及させない。
    }
  }
}

export function subscribeLocalImePilot(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * OVERLAY-DIRTY1: 未commit local draft の dirty contribution。
 *
 * HUD snapshot とは**別channel**にして、tab未保存表示だけを購読する側が HUD の
 * perf / counter 変化で再renderしないようにする。載せるのは固定 boolean と
 * document identity だけで、本文・selection・geometry は持たない。
 */
export type LocalImeDraftDirtyNotice = {
  dirty: boolean
  documentIdentity: string | null
}

type DraftDirtyListener = (notice: LocalImeDraftDirtyNotice) => void

const draftDirtyListeners = new Set<DraftDirtyListener>()
let draftDirtyNotice: LocalImeDraftDirtyNotice = {
  dirty: false,
  documentIdentity: null,
}

function publishDraftDirty(): void {
  for (const listener of [...draftDirtyListeners]) {
    try {
      listener(draftDirtyNotice)
    } catch {
      // 表示側の例外を入力処理へ波及させない。
    }
  }
}

export function subscribeLocalImeDraftDirty(
  listener: DraftDirtyListener,
): () => void {
  draftDirtyListeners.add(listener)
  return () => {
    draftDirtyListeners.delete(listener)
  }
}

export function getLocalImeDraftDirtyNotice(): LocalImeDraftDirtyNotice {
  return draftDirtyNotice
}

/** controller / integration からの変化通知だけがここを通る。 */
export function notifyLocalImeDraftDirty(
  notice: LocalImeDraftDirtyNotice,
): void {
  const next: LocalImeDraftDirtyNotice = notice.dirty
    ? notice
    : { dirty: false, documentIdentity: notice.documentIdentity }
  if (
    next.dirty === draftDirtyNotice.dirty &&
    next.documentIdentity === draftDirtyNotice.documentIdentity
  ) {
    return
  }
  draftDirtyNotice = next
  publishDraftDirty()
}

/** gate OFF / reset で contribution を残さない。 */
function clearLocalImeDraftDirty(): void {
  if (!draftDirtyNotice.dirty && draftDirtyNotice.documentIdentity === null) return
  draftDirtyNotice = { dirty: false, documentIdentity: null }
  publishDraftDirty()
}

/**
 * OVERLAY-STATUS1: 製品向け局所入力状態。HUD snapshot とは**別channel**。
 *
 * FileExplorerPane は HUD / perf を直接購読せず、この coarse 3 値だけを購読する。
 * 本文・selection・geometry・path・座標は載せない。同じ値の連続通知は抑止する。
 */
type LocalEditingStatusListener = (status: LocalImeLocalEditingStatus) => void

const localEditingStatusListeners = new Set<LocalEditingStatusListener>()
let publishedLocalEditingStatus: LocalImeLocalEditingStatus = 'hidden'
let localEditingStatusPublishCount = 0

function resolveCurrentLocalEditingStatus(): LocalImeLocalEditingStatus {
  if (
    state.available &&
    activeEntry === 'experimental-preview' &&
    localWindowRequested
  ) {
    const productState = getLocalImeLocalWindowRecoveryPort()?.getRuntimeState() ?? 'disabled'
    if (productState === 'enabled-active') return 'editing'
    if (productState === 'enabled-waiting') return 'ready'
    return 'hidden'
  }
  return resolveLocalImeLocalEditingStatus({
    previewActive: state.available && activeEntry === 'experimental-preview',
    killed: state.killed,
    breakerTripped: state.breaker.tripped,
    recoveryRequired: state.sessionMode === 'recovery-required',
    sessionDestroyed: state.sessionMode === 'destroyed',
    locallyOwned:
      state.sessionMode !== null && isLocalImeInputSessionRunningMode(state.sessionMode),
  })
}

function syncLocalEditingStatus(): void {
  const next = resolveCurrentLocalEditingStatus()
  if (next === publishedLocalEditingStatus) return
  publishedLocalEditingStatus = next
  localEditingStatusPublishCount += 1
  for (const listener of [...localEditingStatusListeners]) {
    try {
      listener(next)
    } catch {
      // 表示側の例外を入力処理へ波及させない。
    }
  }
}

export function subscribeLocalImeLocalEditingStatus(
  listener: LocalEditingStatusListener,
): () => void {
  localEditingStatusListeners.add(listener)
  return () => {
    localEditingStatusListeners.delete(listener)
  }
}

export function getLocalImeLocalEditingStatus(): LocalImeLocalEditingStatus {
  return publishedLocalEditingStatus
}

/** E2E read-only diagnostics。本文・selection・座標は載せない。 */
export function getLocalImeLocalEditingStatusDiagnostics(): {
  localEditingStatus: LocalImeLocalEditingStatus
  localEditingStatusPublishCount: number
} {
  return {
    localEditingStatus: publishedLocalEditingStatus,
    localEditingStatusPublishCount,
  }
}

function resetLocalEditingStatus(): void {
  publishedLocalEditingStatus = 'hidden'
  localEditingStatusPublishCount = 0
  localEditingStatusListeners.clear()
}

export function getLocalImePilotHudState(): LocalImePilotHudSnapshot {
  return toLocalImePilotHudState(state, false)
}

/** test only: module singleton を初期状態へ戻す。 */
export function resetLocalImePilotForTest(): void {
  unbindListeners()
  state = createIdleLocalImePilotRuntimeState()
  activeEntry = null
  target = null
  localWindowTarget = null
  localWindowRequested = false
  clearLocalImeDraftDirty()
  resetLocalEditingStatus()
  listeners.clear()
  handledEvents = new WeakSet<object>()
}

// --- registry --------------------------------------------------------------

function refreshLocalImePilotTarget(): void {
  const decision = resolveCurrentLocalImeProductStrategy()
  const next = decision.activeManualTarget === 'local-window'
    ? localWindowTarget
    : null
  if (target === next) return
  try {
    target?.cancelAutoArm?.()
  } catch {
    // registryの切替は常にfail-closedで続行する。
  }
  unbindListeners()
  target = next
  state = {
    ...state,
    sessionMode: state.available ? readSessionMode() : null,
    retainedPayloadLength: state.available ? readRetainedPayloadLength() : null,
  }
}

function resolveCurrentLocalImeProductStrategy(): LocalImeProductStrategyDecision {
  return resolveLocalImeProductStrategy({
    pilotAvailable: state.available,
    localWindowRequested,
    localWindowTargetRegistered: localWindowTarget !== null,
  })
}

/** test / author diagnostics: strategy採用とactive targetだけを固定enumで返す。 */
export function getLocalImeProductStrategyDecision(): LocalImeProductStrategyDecision {
  return resolveCurrentLocalImeProductStrategy()
}

/** @internal LOCAL-WINDOW-P0 integrationからのみ呼ぶ。 */
export function registerLocalImeLocalWindowPilotTarget(next: LocalImePilotTarget): void {
  localWindowTarget = next
  refreshLocalImePilotTarget()
}

export function unregisterLocalImeLocalWindowPilotTarget(next: LocalImePilotTarget): void {
  if (localWindowTarget !== next) return
  localWindowTarget = null
  refreshLocalImePilotTarget()
  publish()
}

/**
 * hidden gate の結果（main → preload → renderer の read-only boolean）と、
 * 実在 window route の matcher を反映する。
 *
 * false のときは listener も subscriber も持たず、DOM / timer / render を作らない。
 */
export function configureLocalImePilot(options: {
  available: boolean
  /**
   * P3-EXP1: capability の出所。未指定は既存の作者 pilot として扱う。
   * owner 以外の entry からの configure は無視され、2 entry が同時に available に
   * なることはない（pure policy 側でも排他）。
   */
  entry?: LocalImePilotEntry
}): void {
  const entry: LocalImePilotEntry = options.entry ?? 'author-pilot'
  // owner 以外の entry は state を触れない（作者 pilot と製品 Preview の相互干渉を防ぐ）。
  if (activeEntry !== null && activeEntry !== entry) return
  activeEntry = options.available ? entry : null
  localWindowRequested = options.available
  const availabilityChanged = state.available !== options.available
  if (!options.available) clearLocalImeDraftDirty()
  if (!options.available) unbindListeners()
  if (availabilityChanged) {
    state = options.available
      ? { ...state, available: true }
      : {
          ...createIdleLocalImePilotRuntimeState(),
          // P3-EXP1: 設定 OFF → ON の往復で Kill / circuit breaker を無言解除しない。
          // 同一 process 中は trip した事実を保持し、勝手な再 enable を作らない。
          killed: state.killed,
          breaker: state.breaker,
        }
  }
  refreshLocalImePilotTarget()
  publish()
}

/**
 * PARA-SESSION-P0a: 段落末尾 persistent insertion-run PoC が有効か。
 *
 * **pilot gate（非 packaged + `NYOZE_LOCAL_IME_PILOT=1`）の内側でだけ true になる。**
 * gate OFF では controller が従来どおり「1 確定 = 1 PM transaction」で動く。
 */
/** author Pilot / product entryがLocal Windowを要求しているか。 */
export function isLocalImeLocalWindowRequested(): boolean {
  return state.available && localWindowRequested
}

/** PUBLIC-ENTRY1: author Pilotと区別した製品Local Window request。 */
export function isLocalImeLocalWindowProductEntryRequested(): boolean {
  return isLocalImeLocalWindowRequested() && activeEntry === 'experimental-preview'
}

/**
 * LOCAL-WINDOW-EXPLICIT-ENABLE-ARM1: 明示的なユーザー ON の **exact-one pending intent**。
 *
 * React 側の製品設定と EditorView の attach はどちらが先でも成立する。明示 ON の時点で
 * Recovery Port がまだ未登録だと `requestEnabled` を送れないため、intent をここで保持し、
 * **実際に Port が受理したときに 1 回だけ**消費する。これが無いと late attach 側が
 * `configuration-sync` として再適用してしまい、「本文を click するまで arm されない」
 * 状態へ戻ってしまう。
 *
 * timer / polling は使わない。OFF・取消・runtime epoch 変更では破棄する。
 */
let explicitEnableActivationPending = false

/** 明示 ON を pending intent として記録する（重複しても exact-one）。 */
export function requestLocalImeLocalWindowExplicitEnableActivation(): void {
  explicitEnableActivationPending = true
}

/**
 * pending intent を 1 回だけ消費する。
 * 消費した場合だけ `true`（＝ `explicit-user-toggle` として適用してよい）。
 */
export function consumeLocalImeLocalWindowExplicitEnableActivation(): boolean {
  if (!explicitEnableActivationPending) return false
  explicitEnableActivationPending = false
  return true
}

/** OFF / 取消 / epoch 変更で pending intent を破棄する。 */
export function clearLocalImeLocalWindowExplicitEnableActivation(): void {
  explicitEnableActivationPending = false
}

/** @internal 診断・test 用の read-only probe。 */
export function hasPendingLocalImeLocalWindowExplicitEnableActivation(): boolean {
  return explicitEnableActivationPending
}

/**
 * @internal coordinator の `onModeChange` から呼ぶ generic な mode 通知。
 *
 * `recovery-required` へ入ったことは、既存 route 由来でも pilot 由来でも
 * circuit breaker の critical 条件として 1 回で trip させる。
 */
export function notifyLocalImePilotSessionMode(
  mode: LocalImeInputSessionMode,
): void {
  if (!state.available) return
  const enteredRecovery =
    mode === 'recovery-required' && state.sessionMode !== 'recovery-required'
  state = {
    ...state,
    sessionMode: mode,
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  // 自分が起こした遷移（明示操作 / safe-stop の coordinator 呼び出し）は数えない。
  // その区間の最終 reason は typed outcome を正本にする。
  if (enteredRecovery && state.enabled && modeBreakerSuppressDepth === 0) {
    recordStop('recovery-required')
    return
  }
  publish()
}

/** OWNCLOSE1: host適用済み異常ではdraft recoveryへ戻さず、process内Previewだけを停止する。 */
export function disableLocalImePilotAfterPostApplyFailure(): void {
  if (!state.available) return
  recordStop('recovery-required')
}

/**
 * @internal paragraph overlay controller が「boundary で session を終えたが、元の操作は
 * 適用しなかった」ことだけを通知する入口（P3-EXP1）。
 *
 * 受け取るのは**発生した事実だけ**で、key の実文字・inputType の生値・座標・本文・
 * clipboard は一切渡さない。無言 no-op を作らないため、製品 Preview はこの増分を見て
 * 「通常エディタで同じ操作を再実行してください」の 1 文を出す。
 */
export function noteLocalImePilotUnappliedBoundaryOperation(): void {
  if (!state.available) return
  state = {
    ...state,
    unappliedOperationCount: state.unappliedOperationCount + 1,
  }
  publish()
}

function readRetainedPayloadLength(): number | null {
  try {
    return target?.getRetainedPayloadLength() ?? null
  } catch {
    return null
  }
}

function readSessionMode(): LocalImeInputSessionMode | null {
  try {
    return target?.getSessionMode() ?? null
  } catch {
    return null
  }
}

// --- circuit breaker -------------------------------------------------------

/**
 * safe-stop を 1 件記録する。閾値に達したら pilot を disabled にし、
 * 新規 arm / re-arm を止めて listener も外す（明示再有効化まで arm しない）。
 */
function recordStop(reason: LocalImePilotStopReason): void {
  const breaker = recordLocalImePilotStop(state.breaker, reason)
  const tripped = breaker.tripped && !state.breaker.tripped
  state = {
    ...state,
    breaker,
    enabled: tripped ? false : state.enabled,
  }
  if (tripped) unbindListeners()
  publish()
}

// --- listeners -------------------------------------------------------------

/**
 * 未対応入力の safe-stop 本体。
 *
 * 同じ event 内で
 * `preventDefault → stopPropagation → pending callback 失効 → overlay 同期 teardown
 *  → PM focus 復帰 → suspended → 固定 reason 表示` の順を守る。
 * この操作自体を PM へ再 dispatch はしない。
 */
/**
 * pilot が同じ event 内で介入するときの共通実行部。
 *
 * `disposition`:
 * - `suspend`: 通常の safe-stop（default を止めてから teardown し `suspended`）
 * - `quarantine`: default を止められなかった。**teardown せず** `recovery-required` で凍結する
 *
 * 順序は `preventDefault → stopPropagation → pending callback 失効 → (teardown) →
 * PM focus 復帰 → mode 確定 → 固定 reason 表示`。この操作自体を PM へ再 dispatch はしない。
 *
 * **最終診断 reason の正本は coordinator の typed outcome**。coordinator が
 * `recovery-required` を通知しても、その間は `onModeChange` 由来の breaker 記録を
 * 抑止しているので、`teardown-failed` が `recovery-required` に上書きされない。
 */
function runSafeStop(
  event: PilotStoppableEvent,
  reason: LocalImePilotStopReason,
  preventDefault: boolean,
  disposition: LocalImeInputSessionExternalOwnershipLoss,
): void {
  if (handledEvents.has(event)) return
  handledEvents.add(event)
  if (preventDefault && event.cancelable) event.preventDefault()
  // quarantine でも伝播は必ず止める。止めないと P2-G5c1 の overlay capture escape が
  // 走って overlay が外れ、live PM が同じ gesture に露出する。
  event.stopPropagation()
  // 先に記録しておく。teardown が例外を投げても「止めた事実」を失わない。
  recordStop(reason)
  let outcome: LocalImeInputSessionExternalOwnershipOutcome | null = null
  try {
    outcome = withModeBreakerSuppressed(
      () => target?.notifyExternalOwnershipLoss(disposition) ?? null,
    )
  } catch {
    outcome = null
  }
  // **coordinator は teardown 失敗を握り潰さない。** typed failure か例外を受けたら、
  // 正常停止として表示せず critical として即 trip させる。critical reason は
  // trip 済みでも最終 reason を上書きできる（`recordLocalImePilotStop` の escalation）。
  if (outcome === null || outcome.outcome === 'teardown-failed') {
    recordStop('teardown-failed')
    try {
      target?.forceResetController('pilot-teardown-failed')
    } catch {
      // best effort（掃除に失敗しても trip 済みで新規 arm は止まっている）。
    }
  }
  state = {
    ...state,
    sessionMode: readSessionMode(),
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  publish()
}

// Legacy strategy の surface listener は廃止済み。Local Window は専用の
// controller / pointer ownership / keyboard ownershipで入力を扱う。
function bindListeners(): void {}
function unbindListeners(): void {}

/** test only: legacy listener は常に存在しない。 */
export function isLocalImePilotListenerBound(): boolean {
  return false
}

// --- 手動 arm --------------------------------------------------------------

function armViaCoordinator(options: { suppressRejectPublish?: boolean } = {}): LocalImePilotActionResult {
  if (!target) {
    if (!options.suppressRejectPublish) {
      state = { ...state, lastArmRejectReason: 'no-editor' }
      publish()
    }
    return { ok: false, reason: 'no-editor' }
  }
  // **`startSession()` より先に bind する。** controller は `arm()` の中で
  // `.editor-surface` の capture `pointerdown` を張り直すため、後から bind すると
  // pilot の touch / pen safe-stop が既存 pointer route より後ろに回ってしまう。
  // 先に張れば、以後の re-arm で controller が張り直しても pilot が常に先に走る。
  bindListeners()
  let result: LocalImeInputSessionStartResult
  try {
    result = target.startSession()
  } catch {
    unbindListeners()
    recordStop('runtime-exception')
    return { ok: false, reason: 'not-eligible' }
  }
  if (!result.ok) {
    unbindListeners()
    // eligibility 詳細は controller が正本。HUD へは固定 reason だけを出す。
    const reason: LocalImePilotArmRejectReason =
      result.reason === 'already-active' ? 'session-busy' : 'not-eligible'
    if (!options.suppressRejectPublish) {
      state = { ...state, lastArmRejectReason: reason }
      publish()
    }
    return { ok: false, reason }
  }
  state = {
    ...state,
    enabled: true,
    lastArmRejectReason: null,
    sessionMode: readSessionMode(),
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  publish()
  return { ok: true }
}

/**
 * LOCAL-WINDOW-AUTOARM1 の唯一の fresh Start port。schedulerが証明した
 * continuity / stable pointのexpected tokenを
 * 再検証した後、manual Startと同じ `armViaCoordinator()` へ収束する。
 */
export function attemptLocalImeLocalWindowFreshAcquisition(input: {
  target: LocalImePilotTarget
  expected: { documentIdentity: string; controllerGeneration: number }
}): boolean {
  const decision = resolveCurrentLocalImeProductStrategy()
  const snapshot = (() => {
    try {
      return input.target.getAutoArmSnapshot?.() ?? null
    } catch {
      return null
    }
  })()
  if (
    !snapshot ||
    snapshot.documentIdentity !== input.expected.documentIdentity ||
    snapshot.controllerGeneration !== input.expected.controllerGeneration ||
    !state.available ||
    !isLocalImeLocalWindowRequested() ||
    decision.activeManualTarget !== 'local-window' ||
    target !== input.target ||
    localWindowTarget !== input.target ||
    !snapshot.hostFocused ||
    !snapshot.hostSelectionCollapsed ||
    snapshot.hostCompositionActive ||
    snapshot.sessionMode !== 'off' ||
    state.killed ||
    state.breaker.tripped ||
    snapshot.documentActionPending ||
    snapshot.sourceModeActive ||
    snapshot.paragraphPlainActive ||
    !snapshot.hostViewReady ||
    snapshot.otherStrategyActive
  ) return false
  return armViaCoordinator({ suppressRejectPublish: true }).ok
}

/** DOM / PM snapshotを読む前のLocal Window fresh-acquisition cheap gate。 */
export function canScheduleLocalImeLocalWindowFreshAcquisition(
  candidate: LocalImePilotTarget,
): boolean {
  const decision = resolveCurrentLocalImeProductStrategy()
  return (
    state.available &&
    isLocalImeLocalWindowRequested() &&
    decision.activeManualTarget === 'local-window' &&
    target === candidate &&
    localWindowTarget === candidate &&
    !state.killed &&
    !state.breaker.tripped
  )
}

/**
 * 作者が HUD の Start を押したときに arm する。Local Windowのfresh acquisitionは
 * AUTOARM1の証明済みcontinuityだけで、initial document loadからは呼ばれない。
 * eligible な PM caret かどうかは既存 controller が判定する。
 */
export function startLocalImePilot(): LocalImePilotActionResult {
  // gate が閉じているときは coordinator も state も一切触らない。
  if (!state.available) return { ok: false, reason: 'unavailable' }
  const current = { ...state, sessionMode: readSessionMode() }
  if (!canStartLocalImePilot(current)) {
    const reason: LocalImePilotArmRejectReason = !current.available
      ? 'unavailable'
      : current.killed || current.breaker.tripped
        ? 'pilot-disabled'
        : current.sessionMode === 'recovery-required'
          ? 'recovery-required'
          : 'session-busy'
    state = { ...state, lastArmRejectReason: reason, sessionMode: current.sessionMode }
    publish()
    return { ok: false, reason }
  }
  return armViaCoordinator()
}

/**
 * `suspended` からの明示再開。**safe-stop や document action の後に勝手な
 * 再 arm は起きない**（この経路だけが再開の入口）。
 */
export function resumeLocalImePilot(): LocalImePilotActionResult {
  if (!state.available) return { ok: false, reason: 'unavailable' }
  const current = { ...state, sessionMode: readSessionMode() }
  if (!canResumeLocalImePilot(current)) {
    const reason: LocalImePilotArmRejectReason = !current.available
      ? 'unavailable'
      : current.killed || current.breaker.tripped
        ? 'pilot-disabled'
        : current.sessionMode === 'recovery-required'
          ? 'recovery-required'
          : 'session-busy'
    state = { ...state, lastArmRejectReason: reason, sessionMode: current.sessionMode }
    publish()
    return { ok: false, reason }
  }
  return armViaCoordinator()
}

/** 明示停止。payload 保持中は coordinator が `recovery-required` を返す。 */
export function stopLocalImePilot(): void {
  if (!state.available) return
  try { target?.cancelAutoArm?.() } catch { /* explicit Stop continues */ }
  let mode: LocalImeInputSessionMode | null = null
  let failed = false
  withModeBreakerSuppressed(() => {
    try {
      mode = target?.stopSession() ?? null
    } catch {
      failed = true
    }
  })
  if (failed) {
    recordStop('runtime-exception')
    return
  }
  if (mode === 'recovery-required') {
    unbindListeners()
    // 明示Stop自体の通常mode遷移は二重計上しないが、Stop中に判明した
    // genuine apply failureはcritical契約どおり1回でtripさせる。
    state = {
      ...state,
      enabled: false,
      sessionMode: mode,
      retainedPayloadLength: readRetainedPayloadLength(),
    }
    recordStop('recovery-required')
    return
  }
  if (mode === 'armed') {
    // atomic close前のcurrent local transactionでcheckpointが失効した場合、Stop
    // request自体が取り消されてLOCAL ownershipへ戻る。ここでPreviewをOFFに
    // するとlive overlayだけを残すため、enabled/listenersを維持して後続Stopを
    // 可能にする。
    state = {
      ...state,
      enabled: true,
      sessionMode: mode,
      retainedPayloadLength: readRetainedPayloadLength(),
    }
    publish()
    return
  }
  unbindListeners()
  state = {
    ...state,
    enabled: false,
    sessionMode: mode ?? readSessionMode(),
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  publish()
}

// --- LOCAL-WINDOW-RECOVERY-RESTART1 typed port bridge ----------------------

/**
 * 明示restart操作にだけ紐づくcircuit breaker解除。
 *
 * timer / polling / 自動再開からは呼ばない。kill switchは解除しない（その起動中は
 * 引き続き再armしない）ので、killed中のrestartは`breaker-not-released`で落ちる。
 */
export function releaseLocalImePilotBreakerForExplicitRestart(): boolean {
  if (!state.available || state.killed) return false
  state = {
    ...state,
    breaker: createIdleLocalImePilotBreakerState(),
    lastArmRejectReason: null,
  }
  publish()
  return true
}

/** typed portが解決した後のpilot state同期（HUD表示だけを合わせる）。 */
function syncLocalImePilotStateAfterRecoveryPort(enabled: boolean): void {
  state = {
    ...state,
    enabled,
    sessionMode: readSessionMode(),
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  publish()
}

/**
 * RECOVERY-RESTART1: 明示Retry（同じdraftをexact 1回commitしてOFFへ収束）。
 *
 * Local Windowのtyped portだけをここから呼ぶ。
 */
export function retryLocalImeLocalWindowRecoveryToOff():
  LocalImeLocalWindowRecoveryRetryOutcome {
  const port = getLocalImeLocalWindowRecoveryPort()
  if (!port) {
    return {
      ok: false, reason: 'unavailable', sessionMode: readSessionMode(),
      hostTransactionDelta: null, hostContentDelta: null,
      documentActionReplayCount: 0, freshAcquisitionCount: 0,
    }
  }
  const outcome = withModeBreakerSuppressed(() => port.retry())
  syncLocalImePilotStateAfterRecoveryPort(false)
  // Retryが commit まで到達しなかった場合だけ、genuine failureを1回記録する。
  if (!outcome.ok && readSessionMode() === 'recovery-required') {
    recordStop('recovery-required')
  }
  return outcome
}

/** RECOVERY-RESTART1: read-only recovery export（draft / stateへ触れない）。 */
export function exportLocalImeLocalWindowRecoveryMarkdown():
  LocalImeLocalWindowRecoveryExportResult {
  return getLocalImeLocalWindowRecoveryPort()?.exportDraftMarkdown()
    ?? { ok: false, reason: 'no-draft' }
}

/** RECOVERY-RESTART1: 注入writerでのcopy。成功してもdraftは破棄しない。 */
export async function copyLocalImeLocalWindowRecoveryMarkdown(
  write?: LocalImeLocalWindowRecoveryClipboardWriter,
): Promise<LocalImeLocalWindowRecoveryCopyResult> {
  const port = getLocalImeLocalWindowRecoveryPort()
  if (!port) return { ok: false, reason: 'no-draft', markdownLength: null }
  const result = await port.copyDraftMarkdown({ write })
  // copy結果はrecovery / draft / breakerのいずれも変更しない。
  publish()
  return result
}

/** RECOVERY-RESTART1: 「下書きを破棄して停止」の確認済みdiscardだけを通す。 */
export function discardLocalImeLocalWindowRecoveryDraft(
  confirmed: boolean,
): LocalImeLocalWindowRecoveryDiscardOutcome {
  const port = getLocalImeLocalWindowRecoveryPort()
  if (!port) {
    return {
      ok: false, reason: 'unavailable', stopAttempted: false,
      discardAttempted: false, cleanupAttempted: false, sessionMode: readSessionMode(),
    }
  }
  const outcome = withModeBreakerSuppressed(() => port.discard({ confirmed }))
  if (outcome.stopAttempted) unbindListeners()
  syncLocalImePilotStateAfterRecoveryPort(false)
  return outcome
}

/**
 * RECOVERY-RESTART1: 明示OFF→ON相当のrestart。新epochだけがStartを起こせる。
 *
 * `epoch`は「この要求が旧runtime epoch由来のcallbackでないか」の判定にだけ使う
 * 省略可能な引数で、breaker解除とpilot state同期を含む唯一のrestart入口である。
 */
export function restartLocalImeLocalWindowRuntime(epoch?: number):
  LocalImeLocalWindowRestartOutcome {
  const port = getLocalImeLocalWindowRecoveryPort()
  if (!port) {
    return {
      ok: false, outcome: 'rejected', reason: 'unavailable',
      epoch: 0, startAttempts: 0, runtimeState: 'disabled',
    }
  }
  const outcome = withModeBreakerSuppressed(() =>
    port.restart({ epoch, releaseBreaker: releaseLocalImePilotBreakerForExplicitRestart }))
  if (outcome.outcome === 'started') bindListeners()
  // Pilot表示はportの`runtimeState`のtoggle投影に従う。preflight拒否
  // （`controller-active`等）はsessionが生きているので`enabled-active`のままON、
  // epoch更新後の失敗（`identity-changed` / `start-failed`）はportが`disabled`
  // または`recovery-suspended`へ落ちるのでOFFへ揃う。`state.enabled`を無条件に
  // 保持すると、後者でPilotだけ古いONを持ち続けてしまう。
  syncLocalImePilotStateAfterRecoveryPort(
    isLocalImeLocalWindowRuntimeToggleOn(outcome.runtimeState),
  )
  return outcome
}

/**
 * Kill switch。新規 arm / re-arm を即時停止し、pending callback を無効化する。
 *
 * **retained payload を破棄しない。** payload を保持している場合、`stopSession()`
 * が `recovery-required` を返して保持したままになる（明示 discard は Force reset
 * だけが行う）。payload が無ければ overlay を畳んで PM へ戻る。
 * kill 後はこの起動中 pilot を disabled にする。
 */
export function killLocalImePilot(): void {
  const current = { ...state, sessionMode: readSessionMode() }
  if (!canKillLocalImePilot(current)) return
  try { target?.cancelAutoArm?.() } catch { /* Kill still disables acquisition */ }
  let mode: LocalImeInputSessionMode | null = null
  withModeBreakerSuppressed(() => {
    try {
      mode = target?.stopSession() ?? null
    } catch {
      // stop に失敗しても kill 自体は成立させる（新規 arm を止めることが目的）。
    }
  })
  unbindListeners()
  state = {
    ...state,
    killed: true,
    enabled: false,
    forceResetPending: false,
    sessionMode: mode ?? readSessionMode(),
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  publish()
}

// --- Force reset（二段階確認） ---------------------------------------------

/** 1 段階目。まだ何も破棄しない。 */
export function requestLocalImePilotForceReset(): void {
  if (!canForceResetLocalImePilot(state)) return
  if (state.forceResetPending) return
  state = { ...state, forceResetPending: true }
  publish()
}

export function cancelLocalImePilotForceReset(): void {
  if (!state.forceResetPending) return
  state = { ...state, forceResetPending: false }
  publish()
}

/**
 * 2 段階目（明示確認後）。**retained payload / operation を捨てる唯一の経路。**
 *
 * 順序が重要:
 *
 * 1. `stopSession()` — `composing` / `awaiting-end` の未確定 payload を
 *    `recovery-required` へ**保全**する。これを先に通さないと、次の
 *    `resolveRecovery('discard')` は `recovery-required` でないため no-op になり、
 *    そのあと保持された payload が残ってしまう（COMPOSING から直接 Force reset した場合）。
 * 2. `resolveRecovery('discard')` — 既存の**明示 discard 契約**。
 * 3. `forceResetController()` — overlay / listener / timer の掃除。
 *
 * `controller.forceReset()` だけを先に呼んで retained payload を暗黙破棄しない。
 * 3 つは**独立に必ず試行**する（先行処理の失敗で後続 cleanup を飛ばさない）。
 * 失敗は固定 enum で保持・表示する。
 */
export function confirmLocalImePilotForceReset(): void {
  if (!state.forceResetPending) return
  if (!canForceResetLocalImePilot(state)) return
  let failed = false
  try { target?.cancelAutoArm?.() } catch { /* explicit reset continues */ }
  withModeBreakerSuppressed(() => {
    // 1. payload を recovery へ保全してから
    try {
      target?.stopSession()
    } catch {
      failed = true
    }
    // 2. 明示 discard
    try {
      target?.resolveRecoveryDiscard()
    } catch {
      failed = true
    }
    // 3. 掃除（1 / 2 が失敗しても必ず試す）
    try {
      target?.forceResetController('pilot-force-reset')
    } catch {
      failed = true
    }
  })
  if (failed) recordStop('runtime-exception')
  unbindListeners()
  state = {
    ...state,
    // reset 後は pilot OFF。kill / trip による disabled はそのまま残す
    // （その起動中は再 arm しない）。
    enabled: false,
    forceResetPending: false,
    lastArmRejectReason: null,
    sessionMode: readSessionMode(),
    retainedPayloadLength: readRetainedPayloadLength(),
  }
  publish()
}

/**
 * test only: DOM event なしで safe-stop 経路を通す。
 *
 * classifier は別 test で固定済みなので、ここで通したいのは
 * 「`recordStop` → 実 coordinator の `notifyExternalOwnershipLoss()` →
 * `onModeChange` → 最終診断 reason」の順序と正本関係だけである。
 * production 経路（listener）からは呼ばない。
 */
export function simulateLocalImePilotSafeStopForTest(
  event: PilotStoppableEvent,
  reason: LocalImePilotStopReason,
  preventDefault: boolean,
  disposition: LocalImeInputSessionExternalOwnershipLoss,
): void {
  runSafeStop(event, reason, preventDefault, disposition)
}

/** test only: 現在の runtime state（HUD 変換前）。 */
export function peekLocalImePilotRuntimeStateForTest(): LocalImePilotRuntimeState {
  return { ...state }
}

/** test only: canStop の判定へ使う pure gate をそのまま公開する。 */
export const localImePilotGates = {
  canStart: canStartLocalImePilot,
  canResume: canResumeLocalImePilot,
  canStop: canStopLocalImePilot,
  canKill: canKillLocalImePilot,
  canForceReset: canForceResetLocalImePilot,
}
