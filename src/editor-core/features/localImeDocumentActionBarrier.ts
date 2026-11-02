/**
 * Local Windowのdocument-action barrier。
 * 非`ready`のparticipantがaction ownershipを持ち、fail-closedに停止する。
 */

import type { LocalImeDocumentActionPreparation } from './localImeInputSessionState'

export type LocalImeDocumentActionParticipant = {
  readonly id: 'local-window' | 'input-surface'
  prepareForDocumentAction: (reason?: string) => LocalImeDocumentActionPreparation
  /** 例外時にも本文を失う可能性をplain booleanで判定する。 */
  hasPayloadBearingState: () => boolean
  /** 保留の登録後にownerの表示を同期更新する（入力面の保存notice用）。 */
  onContinuationRegistered?: () => void
}

const participants: LocalImeDocumentActionParticipant[] = []
const participantTokens = new Map<LocalImeDocumentActionParticipant, number>()
let nextParticipantToken = 1
let nextContinuationToken = 1
let pendingContinuation: {
  readonly reason: string
  readonly owner: LocalImeDocumentActionParticipant
  readonly ownerToken: number
  readonly continuationToken: number
  readonly run: () => void | Promise<void>
} | null = null

function registerParticipant(next: LocalImeDocumentActionParticipant): void {
  const existing = participants.indexOf(next)
  if (existing >= 0) return
  participants.push(next)
  participantTokens.set(next, nextParticipantToken)
  nextParticipantToken += 1
}

function unregisterParticipant(next: LocalImeDocumentActionParticipant): void {
  const index = participants.indexOf(next)
  if (index >= 0) participants.splice(index, 1)
  participantTokens.delete(next)
  if (pendingContinuation?.owner === next) pendingContinuation = null
}

/** @internal LOCAL-WINDOW-P0 integrationからのみ呼ぶ独立participant。 */
export function registerLocalImeLocalWindowDocumentActionParticipant(
  participant: LocalImeDocumentActionParticipant & { readonly id: 'local-window' },
): void {
  registerParticipant(participant)
}

export function unregisterLocalImeLocalWindowDocumentActionParticipant(
  participant: LocalImeDocumentActionParticipant & { readonly id: 'local-window' },
): void {
  unregisterParticipant(participant)
}

/** PIS-S6: 入力面だけが使うtyped登録。flag OFFでは呼ばれない。 */
export function registerInputSurfaceDocumentActionParticipant(
  participant: LocalImeDocumentActionParticipant & { readonly id: 'input-surface' },
): void {
  registerParticipant(participant)
}

export function unregisterInputSurfaceDocumentActionParticipant(
  participant: LocalImeDocumentActionParticipant & { readonly id: 'input-surface' },
): void {
  unregisterParticipant(participant)
}

type LocalImeDocumentActionEvaluation = {
  result: LocalImeDocumentActionPreparation
  owner: LocalImeDocumentActionParticipant | null
  ownerToken: number | null
}

function evaluateLocalImeDocumentAction(
  reason?: string,
): LocalImeDocumentActionEvaluation {
  if (participants.length === 0) {
    return { result: { status: 'ready' }, owner: null, ownerToken: null }
  }

  for (const participant of [...participants]) {
    const ownerToken = participantTokens.get(participant) ?? null
    let payloadBearing = true
    try {
      payloadBearing = participant.hasPayloadBearingState()
    } catch {
      // payload probe 自体が壊れた場合は「あり得る」として止める。
      return {
        result: { status: 'recovery-required' },
        owner: participant,
        ownerToken,
      }
    }
    try {
      const result = participant.prepareForDocumentAction(reason)
      if (result.status !== 'ready') return { result, owner: participant, ownerToken }
    } catch {
      if (payloadBearing) {
        return {
          result: { status: 'recovery-required' },
          owner: participant,
          ownerToken,
        }
      }
      // inactive participant の例外だけは次の participant へ進める。
    }
  }
  return { result: { status: 'ready' }, owner: null, ownerToken: null }
}

export function prepareLocalImeForDocumentAction(
  reason?: string,
): LocalImeDocumentActionPreparation {
  return evaluateLocalImeDocumentAction(reason).result
}

/**
 * 既存 barrier を **1 回だけ**評価し、結果 status をそのまま返す入口。
 *
 * `isLocalImeDocumentActionAllowed()` はこれの boolean 版で、両者は同じ評価を共有する
 * （barrier を二重に走らせない / 第二の barrier を作らない）。status が必要なのは、
 * P3-EXP1 の Preview OFF 切替が `wait-for-composition` / `busy-flushing` /
 * `recovery-required` を製品向け表示で区別し、`ready` 以外では preference を
 * 先行保存しないためである。
 */
export function requestLocalImeDocumentActionWithOwner(
  reason?: string,
  continuation?: () => void | Promise<void>,
): { result: LocalImeDocumentActionPreparation; ownerId: LocalImeDocumentActionParticipant['id'] | null } {
  const evaluation = evaluateLocalImeDocumentAction(reason)
  if (evaluation.result.status === 'ready') return { result: evaluation.result, ownerId: null }
  if (
    evaluation.result.status === 'wait-for-composition' &&
    evaluation.owner !== null &&
    evaluation.ownerToken !== null &&
    reason !== undefined &&
    continuation !== undefined &&
    (evaluation.owner.id === 'local-window' || reason === 'save-document') &&
    pendingContinuation === null
  ) {
    // 元actionの引数を含むclosureはrenderer内だけに保持し、診断bridgeへ公開しない。
    // 後続actionで置換せず、最初にownershipを得たboundaryだけを継続する。
    pendingContinuation = {
      reason,
      owner: evaluation.owner,
      ownerToken: evaluation.ownerToken,
      continuationToken: nextContinuationToken,
      run: continuation,
    }
    nextContinuationToken += 1
    evaluation.owner.onContinuationRegistered?.()
  }
  return { result: evaluation.result, ownerId: evaluation.owner?.id ?? null }
}

export function requestLocalImeDocumentAction(
  reason?: string,
  continuation?: () => void | Promise<void>,
): LocalImeDocumentActionPreparation {
  return requestLocalImeDocumentActionWithOwner(reason, continuation).result
}

export function isLocalImeDocumentActionAllowed(
  reason?: string,
  continuation?: () => void | Promise<void>,
): boolean {
  return requestLocalImeDocumentAction(reason, continuation).status === 'ready'
}

/**
 * compositionend後のLocal Window commit成功時だけ、保留した元actionを再開する。
 * 再開直前にもregistry全体を再評価し、別participantがactiveならfail-closedで保持する。
 */
export function continuePendingLocalImeDocumentAction(
  owner: LocalImeDocumentActionParticipant,
  reason: string,
): boolean {
  const pending = pendingContinuation
  if (
    !pending ||
    pending.owner !== owner ||
    pending.reason !== reason ||
    participantTokens.get(owner) !== pending.ownerToken
  ) {
    return false
  }
  const evaluation = evaluateLocalImeDocumentAction(pending.reason)
  if (evaluation.result.status !== 'ready') return false
  pendingContinuation = null
  try {
    void pending.run()
    return true
  } catch {
    // Local Window本文は既にcommit済み。action自体の同期例外だけを失敗として閉じる。
    return false
  }
}

/** compositionend後に元の先着reasonだけを再開するための読み取り。 */
export function getPendingLocalImeDocumentActionReason(owner: LocalImeDocumentActionParticipant): string | null {
  const pending = pendingContinuation
  return pending?.owner === owner && participantTokens.get(owner) === pending.ownerToken ? pending.reason : null
}

/**
 * Local Window ownerの明示discard等で古いactionを
 * 再開しない場合だけ、exact owner一致を確認して保留ownershipを解除する。
 */
export function cancelPendingLocalImeDocumentAction(
  owner: LocalImeDocumentActionParticipant,
): boolean {
  if (pendingContinuation?.owner !== owner) return false
  pendingContinuation = null
  return true
}

/** P3-A1b1: pending continuation 中は初回 auto-arm を fail-closed にする。 */
export function isLocalImeDocumentActionPending(): boolean {
  return pendingContinuation !== null
}

/** 試験専用: 登録されている参加者のid（製品のport・bridgeへは載せない）。 */
export function listLocalImeDocumentActionParticipantIdsForE2e(): string[] {
  return participants.map((participant) => participant.id)
}

/** test only: module registry を未登録状態へ戻す。 */
export function resetLocalImeDocumentActionParticipantsForTest(): void {
  participants.splice(0, participants.length)
  pendingContinuation = null
  participantTokens.clear()
  nextParticipantToken = 1
  nextContinuationToken = 1
}
