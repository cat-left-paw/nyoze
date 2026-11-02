import {
  cancelPendingLocalImeDocumentAction,
  continuePendingLocalImeDocumentAction,
  getPendingLocalImeDocumentActionReason,
  registerInputSurfaceDocumentActionParticipant,
  unregisterInputSurfaceDocumentActionParticipant,
  requestLocalImeDocumentAction,
  type LocalImeDocumentActionParticipant,
} from '../localImeDocumentActionBarrier'
import type { LocalImeDocumentActionPreparation } from '../localImeInputSessionState'
import type { InputSurface, SurfaceRecord } from './inputSurface'

export type InputSurfaceNoticeSnapshot = {
  kind: 'awaiting-composition' | 'retained' | null
  reason: string | null
  confirmDiscard: boolean
  pendingSaveContinuation: boolean
}

const emptyNotice: InputSurfaceNoticeSnapshot = { kind: null, reason: null, confirmDiscard: false, pendingSaveContinuation: false }
let current: ReturnType<typeof createInputSurfaceDocumentAction> | null = null
let currentSnapshot = emptyNotice
const listeners = new Set<() => void>()

export function getInputSurfaceNoticeSnapshot(): InputSurfaceNoticeSnapshot { return currentSnapshot }
export function subscribeInputSurfaceNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const emit = (owner: ReturnType<typeof createInputSurfaceDocumentAction>, snapshot: InputSurfaceNoticeSnapshot) => {
  if (current !== owner) return
  currentSnapshot = snapshot
  for (const listener of listeners) listener()
}

/** 保存・離脱の判定はpayloadだけを読み、入力面へ確定／focusしない。 */
export function classifyInputSurfaceDocumentAction(input: { committing: boolean; composing: boolean; text: string }): LocalImeDocumentActionPreparation['status'] {
  if (input.committing) return 'busy-flushing'
  if (input.composing) return 'wait-for-composition'
  if (input.text) return 'recovery-required'
  return 'ready'
}

export function createInputSurfaceDocumentAction(surface: InputSurface, record: SurfaceRecord) {
  let kind: InputSurfaceNoticeSnapshot['kind'] = null
  let reason: string | null = null
  let confirmDiscard = false
  let destroyed = false
  const payloadBearing = () => surface.isCommitting() || surface.isComposing() || !!surface.text()
  const publish = () => emit(controller, {
    kind, reason, confirmDiscard,
    pendingSaveContinuation: getPendingLocalImeDocumentActionReason(participant) === 'save-document',
  })
  const prepare = (nextReason?: string): LocalImeDocumentActionPreparation => {
    const status = classifyInputSurfaceDocumentAction({ committing: surface.isCommitting(), composing: surface.isComposing(), text: surface.text() })
    if (status === 'wait-for-composition') { kind = 'awaiting-composition'; reason = getPendingLocalImeDocumentActionReason(participant) ?? nextReason ?? null }
    if (status === 'recovery-required') { kind = 'retained'; reason = nextReason ?? null }
    if (status !== 'ready') record('document-action-blocked', { reason: nextReason, status })
    publish()
    return { status }
  }
  const participant: LocalImeDocumentActionParticipant & { readonly id: 'input-surface' } = {
    id: 'input-surface', prepareForDocumentAction: prepare, hasPayloadBearingState: payloadBearing,
    onContinuationRegistered: publish,
  }
  const controller = {
    participant,
    hasPayloadBearingState: payloadBearing,
    isComposing: () => surface.isComposing(),
    prepare,
    onSurfaceStateChange() {
      if (destroyed) return
      if (!surface.isComposing() && surface.text()) {
        if (!surface.failure()) record('unclassified-retained-text')
        kind = 'retained'; confirmDiscard = false
      } else if (!surface.isComposing() && !surface.text()) {
        kind = null; reason = null; confirmDiscard = false
      }
      publish()
    },
    onCompositionFinished() {
      if (destroyed) return
      if (surface.text()) {
        kind = 'retained'; confirmDiscard = false
        cancelPendingLocalImeDocumentAction(participant)
        publish()
        return
      }
      kind = null; reason = null; confirmDiscard = false
      publish()
      const pendingReason = getPendingLocalImeDocumentActionReason(participant)
      if (pendingReason !== null) {
        const continued = continuePendingLocalImeDocumentAction(participant, pendingReason)
        record('document-action-continuation', { reason: pendingReason, continued })
      }
    },
    async copyRetained(writeText: (text: string) => Promise<boolean>): Promise<boolean> {
      const value = surface.text()
      if (destroyed || !value || surface.isComposing()) return false
      try {
        const copied = await writeText(value)
        record(copied ? 'retained-copied' : 'retained-copy-failed')
        return copied
      } catch {
        record('retained-copy-failed')
        return false
      }
    },
    requestDiscard() {
      if (destroyed || !surface.text() || surface.isComposing()) return false
      confirmDiscard = true; publish(); return true
    },
    cancelDiscard() { confirmDiscard = false; publish() },
    confirmDiscard() {
      if (destroyed || !confirmDiscard || !surface.discardRetained()) return false
      confirmDiscard = false; kind = null; reason = null
      publish()
      return true
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (payloadBearing()) record('document-action-destroy-with-payload', { composing: surface.isComposing(), retained: !!surface.text() })
      cancelPendingLocalImeDocumentAction(participant)
      unregisterInputSurfaceDocumentActionParticipant(participant)
      if (current === controller) { current = null; currentSnapshot = emptyNotice; for (const listener of listeners) listener() }
    },
  }
  current = controller
  registerInputSurfaceDocumentActionParticipant(participant)
  publish()
  return controller
}

export async function copyInputSurfaceRetainedText(writeText: (text: string) => Promise<boolean>): Promise<boolean> {
  return current?.copyRetained(writeText) ?? false
}
export function requestInputSurfaceRetainedDiscard(): boolean { return current?.requestDiscard() ?? false }
export function cancelInputSurfaceRetainedDiscard(): void { current?.cancelDiscard() }
export function confirmInputSurfaceRetainedDiscard(): boolean { return current?.confirmDiscard() ?? false }
/** dirty-dialogの破棄だけで使用。Local Windowの既存discard方針には触れない。 */
export function isInputSurfacePayloadBearing(): boolean { return current?.hasPayloadBearingState() ?? false }
export function isInputSurfaceComposing(): boolean { return current?.isComposing() ?? false }
/** 既存Local Window経路を変えず、PIS payloadがある場合だけ共通barrierへ合流する。 */
export function allowInputSurfaceDocumentMutation(reason: string): boolean {
  return !isInputSurfacePayloadBearing() || requestLocalImeDocumentAction(reason).status === 'ready'
}
