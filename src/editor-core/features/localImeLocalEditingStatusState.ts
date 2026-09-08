/**
 * OVERLAY-STATUS1: 局所入力の製品向け状態表示を、固定 3 値へ射影する import-0 の
 * pure decision。
 *
 * 責務境界:
 * - 表示語彙は `hidden` / `ready` / `editing` だけ。HUD の細かい session mode や
 *   recovery / breaker の詳細は既存 notice を正本とし、ここへ持ち込まない。
 * - 入力は固定 boolean だけ。PM 本文、Markdown serialize、selection、geometry、
 *   DOM、key / inputType / composition taxonomy、paragraph 数 / identity は知らない。
 * - 将来の Local Editing Window でも同じ 3 値を使えるよう、single paragraph 固有の
 *   表示モデルにはしない。未使用の multi-block state は先行導入しない。
 */

export type LocalImeLocalEditingStatus = 'hidden' | 'ready' | 'editing'

/** 射影に必要な、runtime が既に持っている固定 boolean だけ。 */
export type LocalImeLocalEditingStatusInput = {
  /** Experimental Preview の lifecycle が実効 ON か。unavailable / 実効 OFF は false。 */
  previewActive: boolean
  /** この起動中の Kill。 */
  killed: boolean
  /** circuit breaker が trip したか。 */
  breakerTripped: boolean
  /** 未確定入力を保持して止まっているか（既存 attention notice の正本）。 */
  recoveryRequired: boolean
  /** session が破棄済みか。 */
  sessionDestroyed: boolean
  /**
   * local ownership を持っているか。
   * armed / composing / flushing / handoff / awaiting-end を畳み込む。
   * 短い遷移を独立表示にせず、ちらつきを作らない。
   */
  locallyOwned: boolean
}

/**
 * 製品 UI へ出す粗い状態。
 *
 * - hidden: Preview unavailable / 実効 OFF、Kill / breaker、recovery、destroyed
 * - editing: Preview 実効 ON かつ local ownership（active / composing / closing 等）
 * - ready: Preview 実効 ON かつ host ownership（次の eligible stable point 待ち）
 */
export function resolveLocalImeLocalEditingStatus(
  input: LocalImeLocalEditingStatusInput,
): LocalImeLocalEditingStatus {
  if (
    !input.previewActive ||
    input.killed ||
    input.breakerTripped ||
    input.recoveryRequired ||
    input.sessionDestroyed
  ) {
    return 'hidden'
  }
  return input.locallyOwned ? 'editing' : 'ready'
}
