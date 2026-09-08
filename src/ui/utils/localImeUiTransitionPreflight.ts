/**
 * 局所 contenteditable IME スロット製品化 P2-G2b — window global shortcut から
 * 起動する UI 遷移（Search / Search Replace / pane toggle / Link / Image / 付箋 prompt）の
 * 共通 session preflight。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md` §11
 * Product Slice P2-G2b、`docs/local-ime-slot-pre-p3-shortcut-clipboard-audit-2026-07.md`。
 *
 * 対象操作は本文 PM Doc をその場で変更しない「別 surface への遷移」
 * （Search / pane / Link / Image / 付箋 prompt）だけなので、
 * 既存の文書操作 barrier（`localImeDocumentActionBarrier`）をそのまま再利用する。
 * Image / 付箋の本文挿入は prompt 確定後の通常 host 経路であり、ここでは
 * `ready` のときだけ prompt を開く。continuation / queue / replay はない。
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

export type LocalImeUiTransitionReason =
  | 'search-open'
  | 'search-replace-open'
  | 'pane-toggle-left'
  | 'pane-toggle-right'
  | 'link-prompt-open'
  | 'image-prompt-open'
  | 'note-anchor-prompt-open'

/**
 * `reason` で barrier を通し、`ready` のときだけ `run` を 1 回呼ぶ。
 *
 * - armed: barrier が同期的に session を off へ teardown してから `run` を呼ぶ。
 * - composing / awaiting-end / flushing / handoff / recovery-required: `run` を
 *   呼ばず、preparation をそのまま返す（呼び出し側で fallback しないこと）。
 * - coordinator 未登録 / off / suspended: 通常経路。`run` を 1 回呼ぶ。
 */
export function runLocalImeUiTransitionCommand(
  reason: LocalImeUiTransitionReason,
  run: () => void,
): LocalImeDocumentActionPreparation {
  const preparation = prepareLocalImeForDocumentAction(reason)
  if (preparation.status === 'ready') {
    run()
  }
  return preparation
}
