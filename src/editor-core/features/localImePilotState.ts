/**
 * P3-A1a — 作者限定 internal pilot の pure runtime state / HUD state / circuit breaker。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md`
 *       Product Slice P3-A1a、`docs/local-ime-slot-pre-p3-reaudit-2026-07.md` §16。
 *
 * このファイルは DOM / React / Electron / ProseMirror に依存しない。
 *
 * 位置づけ:
 * - **これは公開品質の Go ではない。** 一般利用可能な P3-A、初回自動 arm（P3-A1b）、
 *   一般設定 UI、packaged production 有効化はいずれも No-Go のまま。
 * - ここが表すのは「作者が複製・使い捨て文書で実機フィードバックを取るための
 *   safety shell」だけである。
 *
 * 診断の不変条件（P1 以来と同じ）:
 * - 本文・composition 文字列・key の実文字・clipboard 本文 / HTML・DOM node・座標・
 *   path / file 名を state にも HUD にも**一切載せない**。
 * - 持てるのは固定 enum の reason、回数、retained payload の**長さだけ**、session mode。
 */

import type { LocalImeInputSessionMode } from './localImeInputSessionState'

// --- stop reason -----------------------------------------------------------

/**
 * pilot が session を止めた理由（固定 enum）。
 * key の実文字・inputType の生値・pointer 座標は含めない。
 */
export type LocalImePilotStopReason =
  /** `Alt+Backspace`（G5c2a で exact handoff No-Go）。 */
  | 'modifier-delete-backward'
  /** `Alt+Delete`（同上）。 */
  | 'modifier-delete-forward'
  /** 既存 route が引き取らなかった実 operation key（Tab / Insert 等）。 */
  | 'unclassified-operation-key'
  /**
   * 実在する window / menu route を持たない Cmd/Ctrl chord。
   * `beforeinput` も出ないので、見送ると armed のまま silent no-op になる。
   */
  | 'unclassified-modifier-chord'
  /** 既存 route が引き取らなかった `beforeinput`。 */
  | 'unsupported-beforeinput'
  /** spellcheck / autocorrect 系の未対応 inputType。 */
  | 'spellcheck-or-autocorrect'
  /** pilot 対象外の touch pointer。 */
  | 'touch-pointer'
  /** pilot 対象外の pen pointer。 */
  | 'pen-pointer'
  /**
   * mouse / touch / pen 以外の未診断 pointerType。
   * 意味論が分からないものを無言で既存 route へ渡さず、安全側で止める。
   */
  | 'unsupported-pointer'
  /** 安全に止められない non-cancelable な未対応入力。 */
  | 'non-cancelable-critical'
  /** 既存 route / pilot 経由で session が payload や操作意図を保持した。 */
  | 'recovery-required'
  /** controller / coordinator が例外を投げた。 */
  | 'runtime-exception'
  /** teardown または PM focus 復帰に失敗した。 */
  | 'teardown-failed'

/**
 * 1 回で即 trip する critical reason。
 * 「あとで直る」種類の失敗ではなく、原稿保全上その場で pilot を降ろすべきもの。
 */
export const LOCAL_IME_PILOT_CRITICAL_STOP_REASONS: readonly LocalImePilotStopReason[] =
  ['recovery-required', 'non-cancelable-critical', 'runtime-exception', 'teardown-failed']

export function isCriticalLocalImePilotStopReason(
  reason: LocalImePilotStopReason,
): boolean {
  return LOCAL_IME_PILOT_CRITICAL_STOP_REASONS.includes(reason)
}

// --- circuit breaker -------------------------------------------------------

/** 同一 reason がこの回数に達したら trip する。 */
export const LOCAL_IME_PILOT_SAME_REASON_LIMIT = 2
/** reason を問わない合計 safe-stop 回数の上限。 */
export const LOCAL_IME_PILOT_TOTAL_LIMIT = 3

export type LocalImePilotBreakerState = {
  tripped: boolean
  /** trip の決め手になった reason（本文・入力文字列は counter key にしない）。 */
  trippedReason: LocalImePilotStopReason | null
  totalStopCount: number
  reasonCounts: Readonly<Partial<Record<LocalImePilotStopReason, number>>>
  lastStopReason: LocalImePilotStopReason | null
}

export function createIdleLocalImePilotBreakerState(): LocalImePilotBreakerState {
  return {
    tripped: false,
    trippedReason: null,
    totalStopCount: 0,
    reasonCounts: {},
    lastStopReason: null,
  }
}

/**
 * safe-stop を 1 件記録する（pure）。
 *
 * - critical reason は 1 回で trip。
 * - 通常 safe-stop は「同一 reason 2 回」または「合計 3 回」で trip。
 * - 既に tripped なら通常 reason では state を進めない（二重記録に冪等）。
 * - **例外: tripped 後でも critical reason は escalation として上書きする。**
 *   safe-stop の reason を先に記録したあとで teardown 失敗が判明することがあり、
 *   ここで無視すると HUD の `trippedReason` / `lastStopReason` が実際の失敗原因
 *   （`teardown-failed` 等）を指さなくなる。
 */
export function recordLocalImePilotStop(
  state: LocalImePilotBreakerState,
  reason: LocalImePilotStopReason,
): LocalImePilotBreakerState {
  if (state.tripped) {
    if (!isCriticalLocalImePilotStopReason(reason)) return state
    const escalatedCounts: Partial<Record<LocalImePilotStopReason, number>> = {
      ...state.reasonCounts,
    }
    escalatedCounts[reason] = (escalatedCounts[reason] ?? 0) + 1
    return {
      tripped: true,
      // critical の方が診断価値が高いので、最終 reason として上書きする。
      trippedReason: reason,
      totalStopCount: state.totalStopCount + 1,
      reasonCounts: escalatedCounts,
      lastStopReason: reason,
    }
  }
  const nextCounts: Partial<Record<LocalImePilotStopReason, number>> = {
    ...state.reasonCounts,
  }
  nextCounts[reason] = (nextCounts[reason] ?? 0) + 1
  const totalStopCount = state.totalStopCount + 1
  const tripped =
    isCriticalLocalImePilotStopReason(reason) ||
    (nextCounts[reason] ?? 0) >= LOCAL_IME_PILOT_SAME_REASON_LIMIT ||
    totalStopCount >= LOCAL_IME_PILOT_TOTAL_LIMIT
  return {
    tripped,
    trippedReason: tripped ? reason : null,
    totalStopCount,
    reasonCounts: nextCounts,
    lastStopReason: reason,
  }
}

// --- runtime state ---------------------------------------------------------

/** 手動 arm が拒否された理由（固定 enum。eligibility 詳細は controller が正本）。 */
export type LocalImePilotArmRejectReason =
  | 'unavailable'
  | 'pilot-disabled'
  | 'no-editor'
  | 'not-eligible'
  | 'session-busy'
  | 'recovery-required'

export type LocalImePilotRuntimeState = {
  /** 非 packaged + hidden flag。HUD / 手動 arm 導線を出してよいか。 */
  available: boolean
  /** 作者が HUD の Start / Resume を押して session を開始したか。初期値は必ず false。 */
  enabled: boolean
  /** kill switch を押したか（その起動中は arm しない）。 */
  killed: boolean
  breaker: LocalImePilotBreakerState
  /** Force reset の二段階確認待ちか。 */
  forceResetPending: boolean
  lastArmRejectReason: LocalImePilotArmRejectReason | null
  /** coordinator の session mode。未登録 / 未 attach なら null。 */
  sessionMode: LocalImeInputSessionMode | null
  /** 保持中 payload の**長さだけ**（本文は絶対に持たない）。 */
  retainedPayloadLength: number | null
  /**
   * P3-EXP1: 「boundary で局所 session を終えたが、元の操作を適用しなかった」回数。
   *
   * 無言 no-op を作らないための表示 trigger であり、**counter そのものは製品UIへ
   * 出さない**（増分の検出だけに使い、UI は「通常エディタで再実行してください」の
   * 文だけを出す）。key の実文字・inputType の生値・座標・本文は載せない。
   */
  unappliedOperationCount: number
}

export function createIdleLocalImePilotRuntimeState(): LocalImePilotRuntimeState {
  return {
    available: false,
    // 初期 enabled は必ず false。自動 arm は P3-A1b の責務で、ここでは実装しない。
    enabled: false,
    killed: false,
    breaker: createIdleLocalImePilotBreakerState(),
    forceResetPending: false,
    lastArmRejectReason: null,
    sessionMode: null,
    retainedPayloadLength: null,
    unappliedOperationCount: 0,
  }
}

/** pilot が入力 ownership を判定してよい状態か（= armed session を持っている）。 */
export function isLocalImePilotArmed(state: LocalImePilotRuntimeState): boolean {
  return (
    state.available &&
    state.enabled &&
    !state.killed &&
    !state.breaker.tripped &&
    state.sessionMode === 'armed'
  )
}

// --- HUD -------------------------------------------------------------------

export type LocalImePilotHudStatus =
  | 'unavailable'
  | 'off'
  | 'armed'
  | 'composing'
  /** awaiting-end / flushing / handoff をまとめた表示。 */
  | 'processing'
  | 'suspended'
  | 'recovery'
  | 'disabled'

/**
 * runtime state から HUD の主 status を決める（pure）。
 *
 * 優先順位:
 * 1. `unavailable`（gate が閉じている）
 * 2. `recovery`（payload / 操作意図を保持している。kill / trip より先に見せる）
 * 3. Retryで明示復帰した同一live session（breakerはtripのままでもStopだけ許可する）
 * 4. `disabled`（kill switch または circuit breaker）
 * 5. `off`（未 start）
 * 6. session mode
 */
export function resolveLocalImePilotHudStatus(
  state: LocalImePilotRuntimeState,
): LocalImePilotHudStatus {
  if (!state.available) return 'unavailable'
  if (state.sessionMode === 'recovery-required') return 'recovery'
  if (state.killed) return 'disabled'
  // OVERLAY-RECOVERY2: Retryはbreakerを解除しないが、同じlocal sessionを安全に
  // Stopできる間だけ `enabled + armed` へ戻す。halted表示でlive overlayを覆わない。
  if (state.enabled && state.sessionMode === 'armed') return 'armed'
  if (state.breaker.tripped) return 'disabled'
  if (!state.enabled) return 'off'
  switch (state.sessionMode) {
    case 'armed':
      return 'armed'
    case 'composing':
      return 'composing'
    case 'flushing':
    case 'handoff':
    case 'awaiting-end':
      return 'processing'
    case 'suspended':
      return 'suspended'
    default:
      return 'off'
  }
}

export type LocalImePilotHudState = {
  status: LocalImePilotHudStatus
  killed: boolean
  tripped: boolean
  trippedReason: LocalImePilotStopReason | null
  lastStopReason: LocalImePilotStopReason | null
  stopCount: number
  lastArmRejectReason: LocalImePilotArmRejectReason | null
  sessionMode: LocalImeInputSessionMode | null
  retainedPayloadLength: number | null
  /** P3-EXP1: 未適用操作の累計回数（表示 trigger 用。生値は製品UIへ出さない）。 */
  unappliedOperationCount: number
  forceResetPending: boolean
  /**
   * 「直前の操作は適用されていない。通常エディタで再実行してほしい」の文言を出すか。
   *
   * **status とは独立**にする。circuit breaker が発動すると status は `disabled` が
   * 優先されるため、status だけで出し分けると trip した回の safe-stop でこの文言が
   * 消えてしまう（利用者は操作が適用されたのかどうか判断できなくなる）。
   */
  showSuspendedNote: boolean
  canStart: boolean
  canResume: boolean
  canStop: boolean
  canRetryRecovery: boolean
  canKill: boolean
  canForceReset: boolean
}

/** session が入力を握っている最中か（arm を受け付けない state）。 */
function isSessionRunningMode(mode: LocalImeInputSessionMode | null): boolean {
  return (
    mode === 'armed' ||
    mode === 'composing' ||
    mode === 'flushing' ||
    mode === 'handoff' ||
    mode === 'awaiting-end'
  )
}

function isPilotArmable(state: LocalImePilotRuntimeState): boolean {
  if (!state.available || state.killed || state.breaker.tripped) return false
  // payload / 操作意図を保持している間は新規 arm しない。
  if (state.sessionMode === 'recovery-required') return false
  return !isSessionRunningMode(state.sessionMode)
}

/**
 * 新規 arm（Start）を出してよいか。
 *
 * `enabled` では判定しない。document action barrier や composition 中の
 * 外部割り込みで session が `off` に戻ることがあり、`enabled` を条件にすると
 * Start も Resume も押せない行き止まりになるためである。
 * `suspended` からの再開だけは Resume が担当し、safe-stop 後の自動再開と
 * 明示再開を区別する。
 */
export function canStartLocalImePilot(state: LocalImePilotRuntimeState): boolean {
  return isPilotArmable(state) && state.sessionMode !== 'suspended'
}

/** `suspended` からの明示再開（Resume）を出してよいか。 */
export function canResumeLocalImePilot(state: LocalImePilotRuntimeState): boolean {
  return isPilotArmable(state) && state.sessionMode === 'suspended'
}

export function canStopLocalImePilot(state: LocalImePilotRuntimeState): boolean {
  if (!state.available) return false
  return state.enabled && state.sessionMode !== 'recovery-required'
}

export function canKillLocalImePilot(state: LocalImePilotRuntimeState): boolean {
  return state.available && !state.killed
}

/** Force reset は retained payload / operation を捨て得るので、常時押せてよい。 */
export function canForceResetLocalImePilot(
  state: LocalImePilotRuntimeState,
): boolean {
  return state.available
}

export function toLocalImePilotHudState(
  state: LocalImePilotRuntimeState,
  canRetryRecovery = false,
): LocalImePilotHudState {
  return {
    status: resolveLocalImePilotHudStatus(state),
    killed: state.killed,
    tripped: state.breaker.tripped,
    trippedReason: state.breaker.trippedReason,
    lastStopReason: state.breaker.lastStopReason,
    stopCount: state.breaker.totalStopCount,
    lastArmRejectReason: state.lastArmRejectReason,
    sessionMode: state.sessionMode,
    retainedPayloadLength: state.retainedPayloadLength,
    unappliedOperationCount: state.unappliedOperationCount,
    forceResetPending: state.forceResetPending,
    // trip / kill で status が `disabled` になっても、safe-stop 直後であることは隠さない。
    showSuspendedNote: state.sessionMode === 'suspended',
    canStart: canStartLocalImePilot(state),
    canResume: canResumeLocalImePilot(state),
    canStop: canStopLocalImePilot(state),
    canRetryRecovery:
      state.sessionMode === 'recovery-required' && canRetryRecovery,
    canKill: canKillLocalImePilot(state),
    canForceReset: canForceResetLocalImePilot(state),
  }
}
