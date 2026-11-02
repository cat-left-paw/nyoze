/**
 * PIS-S10-ENTRY-UI1: 長文編集モードの切り替えを止めたときに出す文の決定（pure）。
 *
 * 文は理由ごとに4つ（`texts-proposal.md` §4）。理由の元は2つ:
 * - OFFのとき、先に評価するdocument-actionのbarrierの結果（`ownerId` / `status`）。
 * - 切り替えの境界（`inputPathController.ts`）が返した理由。
 *
 * 入力面に確定できなかった文字の通知（`InputSurfaceDocumentActionNotice`）が出ている場面では、
 * 同じ内容の文を重ねて出さない（`null`）。
 */
import type { LocalImeDocumentActionParticipant } from '../../editor-core/features/localImeDocumentActionBarrier'
import type { LocalImeDocumentActionPreparation } from '../../editor-core/features/localImeInputSessionState'
import type { InputPathChangeReason, InputSurfaceCompositionState } from '../../editor-core/features/inputSurface/inputPathRuntime'
import type { InputSurfaceNoticeSnapshot } from '../../editor-core/features/inputSurface/documentAction'

export type InputPathSwitchBlockedReason =
  /** 変換中（従来の入力・入力欄のどちらでも）。 */
  | 'composing'
  /** ルビ・縦中横の直後の入力が確定していない（従来の入力のsentinel）。 */
  | 'host-pending-input'
  /** 確定できなかった文字が入力欄に残っている。 */
  | 'surface-payload'
  /** 長文編集モードを開始できなかった（入力欄の作成・focusの失敗）。 */
  | 'start-failed'

export type InputPathSwitchBlockedDecision =
  | { kind: 'notice'; reason: InputPathSwitchBlockedReason }
  /** E4: 保持文字のない入力面の変換。止めた変換を覚え、同じ変換のまま2回目なら確認を出す。 */
  | { kind: 'offer-discard'; cycle: number }
  /** 文を出さない（入力面の通知が正本）。 */
  | { kind: 'none' }

type Common = {
  /** 入力面の現在の変換（変換中でなければnull）。 */
  composition: InputSurfaceCompositionState | null
  /** 入力面の通知（確定できなかった文字・変換の確定待ち）の種類。 */
  surfaceNoticeKind: InputSurfaceNoticeSnapshot['kind']
}

export type InputPathSwitchBlockedInput =
  | (Common & {
    source: 'barrier'
    ownerId: LocalImeDocumentActionParticipant['id'] | null
    status: Exclude<LocalImeDocumentActionPreparation['status'], 'ready'>
  })
  | (Common & { source: 'switch'; reason: InputPathChangeReason })

const notice = (reason: InputPathSwitchBlockedReason): InputPathSwitchBlockedDecision => ({ kind: 'notice', reason })
const none: InputPathSwitchBlockedDecision = { kind: 'none' }

/** 確定できなかった文字の文。入力面の通知がすでに出ていれば重ねない。 */
const surfacePayload = (input: Common): InputPathSwitchBlockedDecision =>
  input.surfaceNoticeKind === 'retained' ? none : notice('surface-payload')

export function resolveInputPathSwitchBlocked(input: InputPathSwitchBlockedInput): InputPathSwitchBlockedDecision {
  if (input.source === 'barrier') {
    if (input.ownerId === 'input-surface') {
      if (input.status === 'wait-for-composition') {
        // 保持文字のない変換はE4（確認つきの破棄）。保持文字と同居している変換は破棄できないので、変換中の文。
        if (input.composition?.discardable) return { kind: 'offer-discard', cycle: input.composition.cycle }
        // 変換の番号が読めない（変換の外の確定待ち）と、入力面の「変換中の文字を確定してから…」が出ている場面は、
        // 入力面の通知が正本（同じ内容の文を重ねない。レビューで足した）。
        if (!input.composition || input.surfaceNoticeKind === 'awaiting-composition') return none
        return notice('composing')
      }
      // 確定の処理の途中（同期の一瞬）。もっとも近い文は「変換中」。
      if (input.status === 'busy-flushing') return notice('composing')
      return surfacePayload(input)
    }
    // 入力面以外の参加者（PISの起動ではいない。Local Windowの参加者など）。もっとも近い文を使う。
    return input.status === 'recovery-required' ? surfacePayload(input) : notice('composing')
  }
  switch (input.reason) {
    case 'host-composing': return notice('composing')
    case 'host-pending-input': return notice('host-pending-input')
    // E4の確認の後に別の変換になっていた場合も、ここへ来る（変換中なら変換中の文）。
    case 'surface-payload': return input.composition ? notice('composing') : surfacePayload(input)
    case 'create-failed':
    case 'focus-failed':
      return notice('start-failed')
    // 製品の入口の操作からは届かない（`settingInteractive`がfalseで先に返る）。もっとも近い文。
    case 'not-capable':
    case 'forced':
      return notice('start-failed')
  }
}
