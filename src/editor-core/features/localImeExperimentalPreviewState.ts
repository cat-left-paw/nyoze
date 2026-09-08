/**
 * LOCAL-WINDOW-PUBLIC-ENTRY1: Local Window Experimentalのimport-0 pure policy。
 *
 * 責務は「capability × platform × preference から実効有効化を決める」ことと、
 * 「製品UIへ出してよい状態・停止導線・OFF切替の可否」を固定 enum で決めることだけ。
 * DOM / PM / React / Electron / settings I-O は知らない。
 *
 * 分離している 4 つの層（混ぜない）:
 *
 * 1. **author pilot capability** — 非 packaged + `NYOZE_LOCAL_IME_PILOT=1`
 *    （`electron/localImePilotGate.ts`）。development HUD と perf diagnostics を持つ。
 * 2. **product Preview capability** — available platform の通常dev / packaged
 *    （`electron/localImeExperimentalPreviewGate.ts`）。mainからfixed read-only
 *    boolean だけが renderer へ渡る。Linux でも capable になり得るが公式サポートではない。
 * 3. **user preference** — settings.json `experimentalLocalImeEnabled`
 *    （既定 false、不正値も false）。
 * 4. **effective runtime enablement** — この module の `resolve...Decision()`。
 *
 * 1 と 2 は pure policy 上で排他である（`authorPilotAvailable === true` なら Preview は
 * 常に実効false）。Previewが要求するstrategyは`local-window`だけで、legacy strategyへfallbackしない。
 */

/** Previewが要求する唯一のstrategy。 */
export const LOCAL_IME_EXPERIMENTAL_PREVIEW_REQUESTED_STRATEGY =
  'local-window' as const

export type LocalImeExperimentalPreviewReason =
  /** main capabilityが拒否したplatform。 */
  | 'platform-unsupported'
  /** 作者限定 pilot が available。製品 Preview と同時に成立させない。 */
  | 'author-pilot-active'
  /** main capabilityが利用不可。 */
  | 'capability-unavailable'
  /** capability はあるが preference が OFF（既定）。 */
  | 'preference-off'
  /** capability + 明示ON。Local Windowを要求してよい。 */
  | 'preview-enabled'

export type LocalImeExperimentalPreviewDecision = {
  /** 設定 UI にこの項目を出してよいか。 */
  settingVisible: boolean
  /** 設定 UI で操作してよいか。 */
  settingInteractive: boolean
  /** Local Windowをruntimeへ要求してよいか。 */
  effectiveEnabled: boolean
  /** 要求するstrategy。実効OFFではnull。 */
  requestedStrategy: typeof LOCAL_IME_EXPERIMENTAL_PREVIEW_REQUESTED_STRATEGY | null
  reason: LocalImeExperimentalPreviewReason
}

function decision(
  visible: boolean,
  effective: boolean,
  reason: LocalImeExperimentalPreviewReason,
): LocalImeExperimentalPreviewDecision {
  return {
    settingVisible: visible,
    settingInteractive: visible,
    effectiveEnabled: effective,
    requestedStrategy: effective
      ? LOCAL_IME_EXPERIMENTAL_PREVIEW_REQUESTED_STRATEGY
      : null,
    reason,
  }
}

/**
 * capability / platform / 作者 pilot / preference から実効有効化を決める唯一の正本。
 *
 * `capabilityGranted`はmainが available platform について与えたfixed booleanである。
 * capability だけでは絶対に有効化しない（preference が既定 false のため）。
 */
export function resolveLocalImeExperimentalPreviewDecision(input: {
  /** legacy call-site compatibility only; platform authority is main-process capability. */
  platform?: string
  capabilityGranted: boolean
  authorPilotAvailable: boolean
  preferenceEnabled: boolean
}): LocalImeExperimentalPreviewDecision {
  if (input.authorPilotAvailable) {
    return decision(false, false, 'author-pilot-active')
  }
  if (!input.capabilityGranted) {
    return decision(false, false, 'capability-unavailable')
  }
  return input.preferenceEnabled
    ? decision(true, true, 'preview-enabled')
    : decision(true, false, 'preference-off')
}

// --- 製品UIへ出す状態 -------------------------------------------------------

/**
 * runtime session の状態（既存 HUD status と同じ集合）。
 *
 * import-0 を保つため型を再宣言している。値は `LocalImePilotHudStatus` と 1:1 で、
 * 対応を崩さないことは wiring test が固定する。
 */
export type LocalImeExperimentalPreviewSessionStatus =
  | 'unavailable'
  | 'off'
  | 'armed'
  | 'composing'
  | 'processing'
  | 'suspended'
  | 'recovery'
  | 'disabled'

/**
 * 製品UIへ出してよい状態だけの粗い enum。
 *
 * 固定 enum の生値・内部 counter・retained payload 長は製品UIへ出さないため、
 * この 4 値だけを表示語彙にする。
 */
export type LocalImeExperimentalPreviewProductStatus =
  /** 実効 OFF、または session を持っていない。 */
  | 'inactive'
  /** 局所入力中（arm / composing / 確定処理中）。 */
  | 'active'
  /** 未確定入力を保持して止まっている（retry / Force reset が必要）。 */
  | 'attention'
  /** この起動では Preview を停止した（circuit breaker / Kill）。 */
  | 'halted'

export function resolveLocalImeExperimentalPreviewProductStatus(input: {
  effectiveEnabled: boolean
  sessionStatus: LocalImeExperimentalPreviewSessionStatus | null
}): LocalImeExperimentalPreviewProductStatus {
  if (!input.effectiveEnabled) return 'inactive'
  switch (input.sessionStatus) {
    case 'recovery':
      return 'attention'
    case 'disabled':
      return 'halted'
    case 'armed':
    case 'composing':
    case 'processing':
      return 'active'
    // legacy `suspended` は現行Local Window製品runtimeでは使わない（clean / dirty Stopは
    // `off` へ収束する）。到達した場合も局所入力は握っていないので inactive 扱いにする。
    default:
      return 'inactive'
  }
}

/** 製品UIに出す操作の可否（判定は既存 runtime gate、ここは表示可否だけ）。 */
export type LocalImeExperimentalPreviewControls = {
  /** 「安全に停止」を出すか。 */
  showStop: boolean
  /** 「やり直す」（recovery retry）を出すか。 */
  showRetry: boolean
  /** 「強制リセット」を出すか（確認必須）。 */
  showForceReset: boolean
  /** 異常状態の説明を出すか。 */
  showAttentionNotice: boolean
  /** recoveryがForce resetで破棄し得るretained payloadを持つか。 */
  recoveryHasRetainedPayload: boolean
  /** この起動で Preview が止まったことを出すか。 */
  showHaltedNotice: boolean
}

export function resolveLocalImeExperimentalPreviewControls(input: {
  effectiveEnabled: boolean
  productStatus: LocalImeExperimentalPreviewProductStatus
  /** 既存 runtime の `canStop`。 */
  canStop: boolean
  /** 既存runtimeがstateから証明したlive-session Retry可否。 */
  canRetryRecovery: boolean
  /** runtimeのretained lengthをUIへ直接出さずpresenceだけ渡す。 */
  hasRetainedPayload: boolean
}): LocalImeExperimentalPreviewControls {
  if (!input.effectiveEnabled) {
    return {
      showStop: false,
      showRetry: false,
      showForceReset: false,
      showAttentionNotice: false,
      recoveryHasRetainedPayload: false,
      showHaltedNotice: false,
    }
  }
  return {
    showStop: input.canStop,
    showRetry:
      input.productStatus === 'attention' && input.canRetryRecovery,
    // Force reset は保持中の未確定入力を捨て得るので、行き止まりを作らないよう常に出す。
    showForceReset: true,
    showAttentionNotice: input.productStatus === 'attention',
    recoveryHasRetainedPayload:
      input.productStatus === 'attention' && input.hasRetainedPayload,
    showHaltedNotice: input.productStatus === 'halted',
  }
}

// --- OFF 切替 ---------------------------------------------------------------

/** 既存 document-action barrier の結果（型を再宣言して import-0 を保つ）。 */
export type LocalImeExperimentalPreviewBarrierStatus =
  | 'ready'
  | 'wait-for-composition'
  | 'busy-flushing'
  | 'recovery-required'

export type LocalImeExperimentalPreviewDisableNotice =
  | 'none'
  /** composition / awaiting-end。確定後に continuation が OFF を適用する。 */
  | 'awaiting-composition'
  /** 確定処理中。少し待ってから再操作。 */
  | 'busy'
  /** 未確定入力を保持中。黙って discard せず、retry / Force reset を促す。 */
  | 'attention'

export type LocalImeExperimentalPreviewDisableOutcome = {
  /** preference を false へ保存してよいか。 */
  applyPreferenceOff: boolean
  notice: LocalImeExperimentalPreviewDisableNotice
}

/**
 * ON → OFF 切替の可否。
 *
 * 既存の document-action barrier（`ready` = clean Stop 済み / dirty exact 1 commit 済み）
 * だけを入力にする。第二の barrier / polling / timeout は作らない。
 * `ready` 以外では preference を**先行保存しない**。
 */
export function resolveLocalImeExperimentalPreviewDisableOutcome(input: {
  barrierStatus: LocalImeExperimentalPreviewBarrierStatus
}): LocalImeExperimentalPreviewDisableOutcome {
  switch (input.barrierStatus) {
    case 'ready':
      return { applyPreferenceOff: true, notice: 'none' }
    case 'wait-for-composition':
      return { applyPreferenceOff: false, notice: 'awaiting-composition' }
    case 'busy-flushing':
      return { applyPreferenceOff: false, notice: 'busy' }
    case 'recovery-required':
      return { applyPreferenceOff: false, notice: 'attention' }
  }
}
