/** LOCAL-WINDOW-SHRINK1: geometry readから独立したpure boundary classifier。 */

export type LocalImeLocalWindowShrinkBoundaryRejectReason =
  | 'inactive'
  | 'local-view-detached'
  | 'identity-invalid'
  | 'base-proof-invalid'
  | 'not-docchanged'
  | 'stale-revision'
  | 'invalid-extent'
  | 'not-shrunk'
  | 'composition-owned'
  | 'closing-or-recovery'
  | 'pending-boundary'
  | 'latch-held'

export type LocalImeLocalWindowShrinkBoundaryDecision =
  | {
      readonly boundary: true
      readonly beforeExtentPx: number
      readonly afterExtentPx: number
      readonly tolerancePx: number
      readonly revision: number
    }
  | { readonly boundary: false; readonly reason: LocalImeLocalWindowShrinkBoundaryRejectReason }

export type LocalImeLocalWindowShrinkBoundaryProbe = {
  readonly active: boolean
  readonly localViewConnected: boolean
  readonly identityValid: boolean
  readonly baseProofValid: boolean
  readonly docChangedRevision: number | null
  readonly currentRevision: number
  readonly beforeExtentPx: number
  readonly afterExtentPx: number
  readonly tolerancePx: number
  readonly compositionActive: boolean
  readonly closing: boolean
  readonly recovery: boolean
  readonly pendingBoundary: boolean
  readonly latchHeld: boolean
}

/**
 * `before - after > tolerance`だけをshrinkとする。toleranceはcallerが現在DPRから
 * 算出したhalf physical pixel相当で、rAF回数や過去最大overflowは入力にしない。
 */
export function resolveLocalImeLocalWindowShrinkBoundary(
  probe: LocalImeLocalWindowShrinkBoundaryProbe,
): LocalImeLocalWindowShrinkBoundaryDecision {
  if (!probe.active) return { boundary: false, reason: 'inactive' }
  if (!probe.localViewConnected) return { boundary: false, reason: 'local-view-detached' }
  if (!probe.identityValid) return { boundary: false, reason: 'identity-invalid' }
  if (!probe.baseProofValid) return { boundary: false, reason: 'base-proof-invalid' }
  if (probe.docChangedRevision === null) return { boundary: false, reason: 'not-docchanged' }
  if (probe.docChangedRevision !== probe.currentRevision) {
    return { boundary: false, reason: 'stale-revision' }
  }
  if (
    !Number.isFinite(probe.beforeExtentPx) || probe.beforeExtentPx < 0 ||
    !Number.isFinite(probe.afterExtentPx) || probe.afterExtentPx < 0 ||
    !Number.isFinite(probe.tolerancePx) || probe.tolerancePx < 0
  ) return { boundary: false, reason: 'invalid-extent' }
  if (probe.beforeExtentPx - probe.afterExtentPx <= probe.tolerancePx) {
    return { boundary: false, reason: 'not-shrunk' }
  }
  if (probe.closing || probe.recovery) return { boundary: false, reason: 'closing-or-recovery' }
  if (probe.pendingBoundary) return { boundary: false, reason: 'pending-boundary' }
  if (probe.latchHeld) return { boundary: false, reason: 'latch-held' }
  // compositionはpartial commitを拒否するownerであり、signal自体はlatch可能。
  // runtimeはこのdecision後に既存document-action barrierへ渡し、compositionendまで保留する。
  return {
    boundary: true,
    beforeExtentPx: probe.beforeExtentPx,
    afterExtentPx: probe.afterExtentPx,
    tolerancePx: probe.tolerancePx,
    revision: probe.currentRevision,
  }
}

/** CSS pxへ換算したhalf physical pixel。DPR不明時も0.5pxを超えない。 */
export function localImeLocalWindowShrinkTolerancePx(devicePixelRatio: number): number {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? 0.5 / devicePixelRatio
    : 0.5
}
