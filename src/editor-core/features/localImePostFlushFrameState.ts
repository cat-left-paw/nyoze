/**
 * PERF2b-2c1 — 局所 IME 正常確定後の 1 frame 調停の **pure state**。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md` §15.5、
 * `beta-stability-and-performance-spec.md` §10.5。
 *
 * 目的は「確定後に Typewriter follow と re-arm がそれぞれ dirty な巨大 PM DOM へ
 * full layout を要求する」構造を、**read all → write all** の 1 frame へまとめること。
 * ここには DOM も `requestAnimationFrame` も無い。scheduler / DOM 境界は
 * `localImePostFlushFrameCoordinator.ts` にある。
 *
 * 設計上の制約:
 * - 汎用 layout framework にしない。局所 IME 正常確定後の 2 consumer だけを調停する。
 * - 通常 PM 入力・direct insert・structural / navigation / shortcut / paste は
 *   この境界へ載せない（既存の単独 rAF のまま）。
 * - token（document / session / flush generation）が一致しない要求は捨てる。
 * - 座標・本文・DOM node をここへ持ち込まない。
 */

/**
 * read も write も**この固定順**で回す。
 *
 * 現行の実効順序（Typewriter の rAF が dispatch 中に、re-arm の rAF が
 * `onFlushResult` で予約されるため Typewriter が先）をそのまま保存する。
 * 根拠なく逆転しないこと。
 */
export const LOCAL_IME_POST_FLUSH_FRAME_PARTICIPANTS = [
  'typewriter-follow',
  'local-ime-rearm',
  // CARET1: 既存二者の read / write 順を変えず、最後に表示だけを反映する。
  'pseudo-caret',
] as const

export type LocalImePostFlushFrameParticipant =
  (typeof LOCAL_IME_POST_FLUSH_FRAME_PARTICIPANTS)[number]

/** frame の因果元。3 つすべて一致しなければ stale として捨てる。 */
export type LocalImePostFlushFrameToken = {
  documentIdentity: string
  sessionGeneration: number
  flushGeneration: number
}

export type LocalImePostFlushFrameOutcome = 'ran' | 'cancelled'

export type LocalImePostFlushFrameConsumer = {
  participant: LocalImePostFlushFrameParticipant
  /**
   * read phase。geometry read と pure plan 生成だけを行い、
   * write を行う closure を返す（不要なら `null`）。
   *
   * 返した closure は write phase でだけ呼ばれる。closure 内から
   * `coordsAtPos()` / `getBoundingClientRect()` へ戻ってはならない。
   */
  prepare: () => (() => void) | null
  /** frame 実行 / cancel / destroy で必ず 1 回だけ呼ばれる（後始末用）。 */
  settle?: (outcome: LocalImePostFlushFrameOutcome) => void
}

export type LocalImePostFlushFramePhase = 'idle' | 'scheduled' | 'reading' | 'writing'

export function isSameLocalImePostFlushFrameToken(
  left: LocalImePostFlushFrameToken | null | undefined,
  right: LocalImePostFlushFrameToken | null | undefined,
): boolean {
  if (!left || !right) return false
  return (
    left.documentIdentity === right.documentIdentity &&
    left.sessionGeneration === right.sessionGeneration &&
    left.flushGeneration === right.flushGeneration
  )
}

export type LocalImePostFlushFrameJoinDecision =
  | { ok: true; kind: 'new-frame' | 'existing-frame' }
  | {
      ok: false
      reason: 'destroyed' | 'no-token' | 'token-mismatch' | 'frame-running'
    }

/**
 * join してよいか（pure）。
 *
 * - `no-token`: 局所 IME 正常確定の窓の外。共有 frame へ載せない。
 * - `token-mismatch`: 別 flush / 別 session / 別文書。**既存 frame を壊さず**拒否し、
 *   呼び出し側は従来の単独 rAF へ fallback する（要求を取りこぼさない）。
 * - `frame-running`: read / write 実行中の再入。
 */
export function evaluateLocalImePostFlushFrameJoin(input: {
  destroyed: boolean
  phase: LocalImePostFlushFramePhase
  currentToken: LocalImePostFlushFrameToken | null
  scheduledToken: LocalImePostFlushFrameToken | null
}): LocalImePostFlushFrameJoinDecision {
  if (input.destroyed) return { ok: false, reason: 'destroyed' }
  if (input.phase === 'reading' || input.phase === 'writing') {
    return { ok: false, reason: 'frame-running' }
  }
  if (!input.currentToken) return { ok: false, reason: 'no-token' }
  if (input.phase === 'idle' || !input.scheduledToken) {
    return { ok: true, kind: 'new-frame' }
  }
  return isSameLocalImePostFlushFrameToken(input.scheduledToken, input.currentToken)
    ? { ok: true, kind: 'existing-frame' }
    : { ok: false, reason: 'token-mismatch' }
}

export type LocalImePostFlushFrameRunDecision =
  | { ok: true }
  | {
      ok: false
      reason: 'destroyed' | 'not-scheduled' | 'stale-token' | 'no-consumer'
    }

/** frame 発火時に read / write を実行してよいか（pure）。 */
export function evaluateLocalImePostFlushFrameRun(input: {
  destroyed: boolean
  scheduledToken: LocalImePostFlushFrameToken | null
  currentToken: LocalImePostFlushFrameToken | null
  consumerCount: number
}): LocalImePostFlushFrameRunDecision {
  if (input.destroyed) return { ok: false, reason: 'destroyed' }
  if (!input.scheduledToken) return { ok: false, reason: 'not-scheduled' }
  if (input.consumerCount === 0) return { ok: false, reason: 'no-consumer' }
  if (!isSameLocalImePostFlushFrameToken(input.scheduledToken, input.currentToken)) {
    return { ok: false, reason: 'stale-token' }
  }
  return { ok: true }
}

/** 固定順（read / write 共通）。未知 participant は載せない。 */
export function orderLocalImePostFlushFrameConsumers(
  consumers: readonly LocalImePostFlushFrameConsumer[],
): LocalImePostFlushFrameConsumer[] {
  const ordered: LocalImePostFlushFrameConsumer[] = []
  for (const participant of LOCAL_IME_POST_FLUSH_FRAME_PARTICIPANTS) {
    const found = consumers.find((consumer) => consumer.participant === participant)
    if (found) ordered.push(found)
  }
  return ordered
}
