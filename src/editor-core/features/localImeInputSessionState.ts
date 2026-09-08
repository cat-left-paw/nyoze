/**
 * 局所 contenteditable IME スロット 製品化 P1 / P2-A — 入力 session の pure state。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md` §5 / §8。
 *
 * このファイルは DOM / React / Electron / ProseMirror に依存しない。
 * Local Window controller内部のmode（1回の取得からcloseまで）とは**別物**であり、
 * session coordinator が controller の公開結果だけを読んで進める state を表す。
 *
 * 原稿保全の不変条件:
 * - composition 中 / `compositionend` 待ち中は、文書操作を `ready` にしない。
 * - payload を保持したままの状態（`recovery-required`）でも `ready` を返さない。
 * - 診断へ本文・確定文字列・file path を載せない（長さと固定 enum だけ）。
 */

/**
 * 製品 session の state（設計書 §5）。
 * `tracking`（初回自動 arm 待ち）は P3 まで使わない。
 */
export type LocalImeInputSessionMode =
  | 'off'
  | 'armed'
  | 'composing'
  | 'flushing'
  /** 非 composition の exact `insertText` を PM へ反映中（P2-A）。 */
  | 'handoff'
  | 'awaiting-end'
  | 'recovery-required'
  | 'suspended'
  | 'destroyed'

/** Local Window / author Pilot が共有する開始結果。legacy slot reasonは含めない。 */
export type LocalImeInputSessionStartRejectReason =
  | 'no-view'
  | 'already-active'
  | 'source-mode-active'
  | 'paragraph-plain-active'
  | 'writing-mode-unsupported'
  | 'not-top-level-paragraph'
  | 'navigation-session-active'

export type LocalImeInputSessionStartResult =
  | { ok: true; sessionGeneration: number }
  | { ok: false; reason: LocalImeInputSessionStartRejectReason }

export type LocalImeInputSessionExternalOwnershipLoss =
  | 'suspend'
  | 'retain-recovery'
  | 'quarantine'

export type LocalImeInputSessionExternalOwnershipOutcome =
  | { outcome: 'ignored'; mode: LocalImeInputSessionMode }
  | { outcome: 'suspended'; mode: LocalImeInputSessionMode }
  | { outcome: 'retained'; mode: LocalImeInputSessionMode }
  | { outcome: 'quarantined'; mode: LocalImeInputSessionMode }
  | { outcome: 'teardown-failed'; mode: LocalImeInputSessionMode }

/** session を止めた理由（固定 enum。本文・パスは載せない）。 */
export type LocalImeInputSessionStopReason =
  | 'explicit-stop'
  | 'document-action'
  | 'controller-cancelled'
  | 'controller-detached'
  | 're-arm-rejected'
  | 'recovery-discarded'
  /** P3-A1a: 外部 owner が armed session の入力を引き取れなかった。 */
  | 'external-ownership-loss'

/** re-arm を見送る理由（固定 enum）。 */
export type LocalImeInputSessionReArmRejectReason =
  | 'session-stopped'
  | 'session-generation-changed'
  | 'document-identity-changed'
  | 'controller-detached'
  | 'mode-not-flushing'
  | 'arm-rejected'
  | 'shift-held'
  | 'shift-state-unknown'

/** payload を保持し得る（= 無言で捨ててはならない）session mode。 */
export function isLocalImeInputSessionPayloadBearingMode(
  mode: LocalImeInputSessionMode,
): boolean {
  return (
    mode === 'composing' || mode === 'awaiting-end' || mode === 'recovery-required'
  )
}

/** 共通 composition predicate 相当（session が入力を握っている間）。 */
export function isLocalImeInputSessionRunningMode(
  mode: LocalImeInputSessionMode,
): boolean {
  return (
    mode === 'armed' ||
    mode === 'composing' ||
    mode === 'flushing' ||
    mode === 'handoff' ||
    mode === 'awaiting-end'
  )
}

/** PM への確定反映中（IME 確定 / direct insert）。再 arm 予約中も含む。 */
export function isLocalImeInputSessionCommittingMode(
  mode: LocalImeInputSessionMode,
): boolean {
  return mode === 'flushing' || mode === 'handoff'
}

// --- document-action barrier（設計書 §8） ---------------------------------

export type LocalImeDocumentActionPreparation =
  | { status: 'ready' }
  | { status: 'wait-for-composition' }
  | { status: 'busy-flushing' }
  | { status: 'recovery-required' }

export type LocalImeDocumentActionPreparationStatus =
  LocalImeDocumentActionPreparation['status']

/**
 * session mode から文書操作の可否を決める pure 関数。
 *
 * - `off` / `suspended` / `destroyed`: session が入力を握っていないので `ready`。
 * - `armed`: payload が無いので overlay を安全に終了してから `ready`
 *   （overlay 終了は呼び出し側の impure 層が行う。ここでは判定だけ返す）。
 * - `composing` / `awaiting-end`: payload を破棄せず操作を止める。
 * - `flushing` / `handoff`: 確定処理中（再 arm 予約を含む）なので完了後に再試行させる。
 *   途中 state を snapshot させないため、ここで `ready` を返してはならない。
 * - `recovery-required`: payload を保持しているので保存・離脱を止める。
 */
export function resolveLocalImeDocumentActionPreparation(
  mode: LocalImeInputSessionMode,
): LocalImeDocumentActionPreparation {
  switch (mode) {
    case 'composing':
    case 'awaiting-end':
      return { status: 'wait-for-composition' }
    case 'flushing':
    case 'handoff':
      return { status: 'busy-flushing' }
    case 'recovery-required':
      return { status: 'recovery-required' }
    case 'armed':
    case 'off':
    case 'suspended':
    case 'destroyed':
      return { status: 'ready' }
  }
}

/** barrier 呼び出し時に overlay を畳んでよい mode（payload を持たない armed だけ）。 */
export function shouldEndSessionForDocumentAction(
  mode: LocalImeInputSessionMode,
): boolean {
  return mode === 'armed'
}

export function isLocalImeDocumentActionReady(
  preparation: LocalImeDocumentActionPreparation,
): boolean {
  return preparation.status === 'ready'
}

// --- PARA-SESSION-P0a: paragraph draft の orthogonal substate ---------------
//
// session lifecycle owner は引き続き coordinator 1 つだけで、ここは「同じ armed でも
// 未 commit の本文を抱えているか」という直交する軸を足すだけである。
// **dirty draft を従来の「payload なし armed」として扱わない**ことが要点。

export type LocalImeParagraphDraftSubstate =
  /** PoC gate OFF / draft 未作成（既存挙動と完全に同じ）。 */
  | 'none'
  | 'clean'
  | 'dirty'
  | 'committing'
  | 'recovery'

/** dirty / committing / recovery の draft は本文を失い得る（barrier へ公開する）。 */
export function isLocalImeParagraphDraftSubstatePayloadBearing(
  draft: LocalImeParagraphDraftSubstate,
): boolean {
  return draft === 'dirty' || draft === 'committing' || draft === 'recovery'
}

/**
 * 文書操作の前に accumulated draft を final commit すべきか。
 *
 * composition 中（`composing` / `awaiting-end`）は従来どおり待たせるので、
 * commit するのは **`armed` の dirty draft** だけである。
 */
export function shouldCommitParagraphDraftForDocumentAction(
  mode: LocalImeInputSessionMode,
  draft: LocalImeParagraphDraftSubstate,
): boolean {
  return mode === 'armed' && draft === 'dirty'
}

/**
 * barrier 内で overlay を畳んでよい mode か（draft substate 込み）。
 *
 * dirty / committing / recovery の draft を抱えたまま `armed` を畳むと、未 commit の
 * 本文が消えるので `false` を返す。commit 成功後は `clean` / `none` になる。
 */
export function shouldEndSessionForDocumentActionWithParagraphDraft(
  mode: LocalImeInputSessionMode,
  draft: LocalImeParagraphDraftSubstate,
): boolean {
  if (isLocalImeParagraphDraftSubstatePayloadBearing(draft)) return false
  return shouldEndSessionForDocumentAction(mode)
}

/**
 * draft substate を含めた文書操作の可否。
 *
 * - `committing`: final commit 中なので `busy-flushing`。
 * - `recovery`: 本文を保持しているので `recovery-required`。
 * - `dirty`: commit 前に呼ばれた場合は `busy-flushing`（呼び出し側が commit してから
 *   再解決する）。`ready` を返して途中 state を snapshot させない。
 * - それ以外: 既存の mode 判定と完全に同じ。
 */
export function resolveLocalImeDocumentActionPreparationWithParagraphDraft(
  mode: LocalImeInputSessionMode,
  draft: LocalImeParagraphDraftSubstate,
): LocalImeDocumentActionPreparation {
  if (mode === 'composing' || mode === 'awaiting-end') {
    return { status: 'wait-for-composition' }
  }
  if (draft === 'recovery') return { status: 'recovery-required' }
  if (draft === 'committing' || draft === 'dirty') {
    return { status: 'busy-flushing' }
  }
  return resolveLocalImeDocumentActionPreparation(mode)
}

// --- re-arm 判定 -----------------------------------------------------------

export type LocalImeInputSessionReArmDecision =
  | { ok: true }
  | { ok: false; reason: LocalImeInputSessionReArmRejectReason }

export type LocalImeInputSessionReArmInput = {
  /** callback 実行時点の session mode。 */
  mode: LocalImeInputSessionMode
  /** callback 実行時点の session generation。 */
  sessionGeneration: number
  /** 予約した時点の session generation。 */
  scheduledSessionGeneration: number
  /** callback 実行時点の document identity。 */
  documentIdentity: string
  /** 予約した時点の document identity。 */
  scheduledDocumentIdentity: string
  /** controller が destroy / detach 済みか。 */
  controllerDetached: boolean
}

/**
 * 正常 flush 後の再 arm を実行してよいか（設計書 §11 P1）。
 *
 * PM state 側の eligibility（collapsed selection / `vertical-rl` / Source Mode /
 * Paragraph Plain / read-only / 特殊 inline 近傍）は `controller.arm()` の
 * `evaluateLocalImeSlotEligibility` が正本なので、ここでは二重実装しない。
 * ここは stale callback を落とす判定だけを担う。
 */
export function evaluateLocalImeInputSessionReArm(
  input: LocalImeInputSessionReArmInput,
): LocalImeInputSessionReArmDecision {
  if (input.controllerDetached) {
    return { ok: false, reason: 'controller-detached' }
  }
  if (
    input.mode === 'off' ||
    input.mode === 'destroyed' ||
    input.mode === 'suspended' ||
    input.mode === 'recovery-required'
  ) {
    return { ok: false, reason: 'session-stopped' }
  }
  if (input.sessionGeneration !== input.scheduledSessionGeneration) {
    return { ok: false, reason: 'session-generation-changed' }
  }
  if (input.documentIdentity !== input.scheduledDocumentIdentity) {
    return { ok: false, reason: 'document-identity-changed' }
  }
  // IME 確定（`flushing`）と direct insert（`handoff`）の直後だけ再 arm する。
  if (!isLocalImeInputSessionCommittingMode(input.mode)) {
    return { ok: false, reason: 'mode-not-flushing' }
  }
  return { ok: true }
}

/**
 * unexpected blur 後に `compositionend` を待つ上限。
 *
 * **timeout だけを理由に payload を破棄しない**（設計書 §7.2）。到達時は
 * `recovery-required` へ入り、payload は renderer memory 上へ保持する。
 */
export const LOCAL_IME_INPUT_SESSION_AWAITING_END_TIMEOUT_MS = 1500

/**
 * payload を保持すべきか。
 *
 * **長さ上限を設けない。** 上限で弾くと、長い変換文字列だけが無言で
 * `suspended` / `off` へ落ちて原稿が消える経路になる。保持対象は 1 回の
 * composition の確定候補 1 本だけなので、これで際限なく溜まることはない。
 * 空文字（そもそも失うものが無い）だけを対象外にする。
 */
export function canRetainLocalImeInputSessionPayload(payload: string): boolean {
  return payload.length > 0
}
