/**
 * LOCAL-IME-LEGACY-STRATEGY-RETIRE1 — Local Windowだけを選ぶimport-0 policy。
 *
 * 製品トグルOFFまたはtarget未登録時のfallbackはhost PMであり、retiredな
 * paragraph overlay / tiny-slotへは絶対にfallbackしない。
 */

export const LOCAL_IME_ADOPTED_PRODUCT_STRATEGY = 'local-window' as const
export const LOCAL_IME_CONVENTIONAL_FALLBACK_STRATEGY = 'host' as const

export type LocalImeAdoptedProductStrategy =
  typeof LOCAL_IME_ADOPTED_PRODUCT_STRATEGY
export type LocalImeConventionalFallbackStrategy =
  typeof LOCAL_IME_CONVENTIONAL_FALLBACK_STRATEGY

export type LocalImeProductStrategyTarget = 'local-window' | 'none'
export type LocalImeProductStrategyDecisionStatus = 'ready' | 'unavailable'
export type LocalImeProductStrategyReason =
  | 'pilot-unavailable'
  | 'local-window-not-requested'
  | 'local-window-selected'
  | 'local-window-target-missing'

export type LocalImeProductStrategyDecision = {
  adoptedProductStrategy: LocalImeAdoptedProductStrategy
  conventionalFallbackStrategy: LocalImeConventionalFallbackStrategy
  activeManualTarget: LocalImeProductStrategyTarget
  status: LocalImeProductStrategyDecisionStatus
  reason: LocalImeProductStrategyReason
}

export type LocalImeProductStrategyPolicyInput = {
  pilotAvailable: boolean
  localWindowRequested: boolean
  localWindowTargetRegistered: boolean
}

function decision(
  activeManualTarget: LocalImeProductStrategyTarget,
  status: LocalImeProductStrategyDecisionStatus,
  reason: LocalImeProductStrategyReason,
): LocalImeProductStrategyDecision {
  return {
    adoptedProductStrategy: LOCAL_IME_ADOPTED_PRODUCT_STRATEGY,
    conventionalFallbackStrategy: LOCAL_IME_CONVENTIONAL_FALLBACK_STRATEGY,
    activeManualTarget,
    status,
    reason,
  }
}

export function resolveLocalImeProductStrategy(
  input: LocalImeProductStrategyPolicyInput,
): LocalImeProductStrategyDecision {
  if (!input.pilotAvailable) {
    return decision('none', 'unavailable', 'pilot-unavailable')
  }
  if (!input.localWindowRequested) {
    return decision('none', 'unavailable', 'local-window-not-requested')
  }
  return input.localWindowTargetRegistered
    ? decision('local-window', 'ready', 'local-window-selected')
    : decision('none', 'unavailable', 'local-window-target-missing')
}
