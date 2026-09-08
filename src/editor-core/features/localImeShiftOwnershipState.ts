/**
 * P2-G5a Shift-first gesture ownership の pure state。
 *
 * DOM / React / Electron / ProseMirror に依存しない。modifier の観測と arm gate を
 * eligibility 判定から分離し、Shift が絡む gesture を個別 command として増やさない。
 */

import type { LocalImeInputSessionMode } from './localImeInputSessionState'

export type LocalImeShiftModifierState = 'released' | 'held' | 'unknown'

export type LocalImeShiftArmRejectReason =
  | 'shift-held'
  | 'shift-state-unknown'

export type LocalImeShiftOwnershipRejectReason = 'missed-shift-boundary'

export type LocalImeShiftKeyboardProbe = {
  key: string
  keyCode: number
  isComposing: boolean
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  code: string
  repeat: boolean
  cancelable: boolean
}

export type LocalImeShiftOwnershipDecision =
  | { kind: 'transfer' }
  | { kind: 'missed-boundary'; reason: LocalImeShiftOwnershipRejectReason }
  | { kind: 'ignore' }

/** armed pointer が Shift-first keydown を経ずに届いた場合の fail-closed 判定。 */
export function classifyLocalImeShiftPointerOwnership(input: {
  mode: LocalImeInputSessionMode
  shiftKey: boolean
  modifierState: LocalImeShiftModifierState
}): LocalImeShiftOwnershipDecision {
  if (input.mode !== 'armed') return { kind: 'ignore' }
  // window capture はこの pointer より先に unknown を再同期するが、初期 released
  // からの Shift-held pointer も event.shiftKey で必ず検出する。
  if (input.shiftKey || input.modifierState === 'held') {
    return { kind: 'missed-boundary', reason: 'missed-shift-boundary' }
  }
  return { kind: 'ignore' }
}

/** Shift は左右・repeat・他 modifier の順序に関わらず ownership 境界にする。 */
export function classifyLocalImeShiftOwnership(
  mode: LocalImeInputSessionMode,
  event: LocalImeShiftKeyboardProbe,
): LocalImeShiftOwnershipDecision {
  if (mode !== 'armed') return { kind: 'ignore' }
  if (event.isComposing || event.keyCode === 229) return { kind: 'ignore' }
  if (event.key === 'Shift') return { kind: 'transfer' }
  if (event.shiftKey) return { kind: 'missed-boundary', reason: 'missed-shift-boundary' }
  return { kind: 'ignore' }
}

export function evaluateLocalImeShiftArmGate(
  state: LocalImeShiftModifierState,
): { ok: true } | { ok: false; reason: LocalImeShiftArmRejectReason } {
  if (state === 'held') return { ok: false, reason: 'shift-held' }
  if (state === 'unknown') return { ok: false, reason: 'shift-state-unknown' }
  return { ok: true }
}

export type LocalImeShiftModifierTrackerEvent =
  | { kind: 'keyboard'; trusted: boolean; key: string; shiftKey: boolean }
  | { kind: 'pointer'; trusted: boolean; shiftKey: boolean }
  | { kind: 'blur' }
  | { kind: 'visibility-loss' }

/** window capture tracker が使う pure reducer。synthetic keyboard/pointer は正当化しない。 */
export function reduceLocalImeShiftModifierState(
  previous: LocalImeShiftModifierState,
  event: LocalImeShiftModifierTrackerEvent,
): LocalImeShiftModifierState {
  if (event.kind === 'blur' || event.kind === 'visibility-loss') return 'unknown'
  if (!event.trusted) return previous
  if (event.kind === 'keyboard') {
    if (event.key === 'Shift') return event.shiftKey ? 'held' : 'released'
    return previous === 'unknown' ? (event.shiftKey ? 'held' : 'released') : previous
  }
  return previous === 'unknown' ? (event.shiftKey ? 'held' : 'released') : previous
}
