/**
 * PIS-S10-PREEDIT-FOLLOW1: 入力面を作れなかった理由（typed）。
 * 入力面の親は、`revealCaret`がscrollするのと同じ要素（`resolvePageUpDownScrollHost`）で、
 * 見つからないときに`document.body`などへ戻す分岐は作らない。入力面の生成の失敗として扱い、
 * 方式を従来の入力のままにする（ENTRY1bの`create-failed`の経路）。
 */
export type InputSurfaceCreateFailureReason = 'scroll-host-unavailable' | 'unexpected'

export class InputSurfaceCreationError extends Error {
  readonly reason: InputSurfaceCreateFailureReason
  constructor(reason: InputSurfaceCreateFailureReason) {
    super(`input surface creation failed: ${reason}`)
    this.name = 'InputSurfaceCreationError'
    this.reason = reason
  }
}

export function describeInputSurfaceCreateFailure(error: unknown): InputSurfaceCreateFailureReason {
  return error instanceof InputSurfaceCreationError ? error.reason : 'unexpected'
}
