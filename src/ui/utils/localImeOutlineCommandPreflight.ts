/**
 * 局所 contenteditable IME スロット製品化 P2-G2c1 — window global の Outline
 * shortcut（previous / next heading, fold toggle）向け session preflight。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md` §11
 * Product Slice P2-G2c1、`docs/local-ime-slot-pre-p3-shortcut-clipboard-audit-2026-07.md`。
 *
 * P2-G2b の `localImeUiTransitionPreflight.ts`（Search / pane toggle / Link
 * prompt という「別 surface への UI 遷移」専用の命名・型）とは責務を分け、
 * Outline navigation / fold という別ドメイン専用の薄い wrapper をここに置く。
 * 中身は同じ既存 P1 document-action barrier（`localImeDocumentActionBarrier`）
 * を再利用するだけで、新しい controller / adapter は作らない。
 *
 * armed は payload を持たないため、barrier が同期的に teardown してから
 * `ready` を返す。composing / awaiting-end / flushing / handoff /
 * recovery-required は `ready` 以外を返し、呼び出し側はコールバックを実行しない
 * （どの経路へも fallback しない）。
 *
 * production（coordinator 未登録）では barrier が常に `ready` を返すため、
 * この wrapper は既存挙動を一切変えない。
 */

import { prepareLocalImeForDocumentAction } from '../../editor-core/features/localImeDocumentActionBarrier'
import type { LocalImeDocumentActionPreparation } from '../../editor-core/features/localImeInputSessionState'

export type LocalImeOutlineCommandReason =
  | 'outline-jump-previous-heading'
  | 'outline-jump-next-heading'
  | 'outline-fold-toggle'

/**
 * `reason` で barrier を通し、`ready` のときだけ `run`（既存 Outline command）を
 * 1 回呼ぶ。
 *
 * - armed: barrier が同期的に session を off へ teardown してから `run` を呼ぶ。
 *   teardown は PM へ focus を戻すため、`run` が読む PM selection は常に実 state。
 * - composing / awaiting-end / flushing / handoff / recovery-required: `run` を
 *   呼ばず、preparation をそのまま返す。
 * - coordinator 未登録 / off / suspended: 通常経路。`run` を 1 回呼ぶ。
 * - navigation / fold 成功後もこの wrapper は re-arm を試みない（P3-A の責務）。
 */
export function runLocalImeOutlineCommand(
  reason: LocalImeOutlineCommandReason,
  run: () => void,
): LocalImeDocumentActionPreparation {
  const preparation = prepareLocalImeForDocumentAction(reason)
  if (preparation.status === 'ready') {
    run()
  }
  return preparation
}
