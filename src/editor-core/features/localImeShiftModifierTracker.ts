/** P2-G5a の window capture modifier tracker。通常起動では受動的に状態だけを持つ。 */

import {
  reduceLocalImeShiftModifierState,
  type LocalImeShiftModifierState,
} from './localImeShiftOwnershipState'

export type LocalImeShiftModifierTracker = {
  getState: () => LocalImeShiftModifierState
  destroy: () => void
}

type WindowTarget = Pick<Window, 'addEventListener' | 'removeEventListener' | 'document'>

export function createLocalImeShiftModifierTracker(
  target: WindowTarget = window,
): LocalImeShiftModifierTracker {
  let state: LocalImeShiftModifierState = 'released'
  let destroyed = false
  const update = (event: Parameters<typeof reduceLocalImeShiftModifierState>[1]) => {
    if (!destroyed) state = reduceLocalImeShiftModifierState(state, event)
  }
  const onKeyDown = (event: KeyboardEvent) =>
    update({ kind: 'keyboard', trusted: event.isTrusted, key: event.key, shiftKey: event.shiftKey })
  const onKeyUp = (event: KeyboardEvent) =>
    update({ kind: 'keyboard', trusted: event.isTrusted, key: event.key, shiftKey: event.shiftKey })
  const onPointer = (event: PointerEvent | MouseEvent) =>
    update({ kind: 'pointer', trusted: event.isTrusted, shiftKey: event.shiftKey })
  // capture では descendant の blur もここまで伝播する。slot から PM へ
  // focus を戻す通常 handoff を window の loss boundary と誤認しない。
  const onBlur = (event: Event) => {
    if (event.target !== (target as unknown as EventTarget)) return
    update({ kind: 'blur' })
  }
  const onVisibility = () => {
    if (target.document.visibilityState !== 'visible') update({ kind: 'visibility-loss' })
  }

  target.addEventListener('keydown', onKeyDown, true)
  target.addEventListener('keyup', onKeyUp, true)
  target.addEventListener('pointerdown', onPointer, true)
  target.addEventListener('mousedown', onPointer, true)
  target.addEventListener('blur', onBlur, true)
  target.document.addEventListener('visibilitychange', onVisibility, true)

  return {
    getState: () => state,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      target.removeEventListener('keydown', onKeyDown, true)
      target.removeEventListener('keyup', onKeyUp, true)
      target.removeEventListener('pointerdown', onPointer, true)
      target.removeEventListener('mousedown', onPointer, true)
      target.removeEventListener('blur', onBlur, true)
      target.document.removeEventListener('visibilitychange', onVisibility, true)
    },
  }
}
