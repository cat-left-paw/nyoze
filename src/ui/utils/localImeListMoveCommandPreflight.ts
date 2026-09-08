/**
 * 局所 contenteditable IME スロット製品化 P2-G2c2 — list-move shortcut
 * （`Cmd/Ctrl+ArrowUp/Down/Left/Right`）向け session preflight。
 *
 * 正本: `docs/local-contenteditable-ime-productization-design-2026-07.md` §11
 * Product Slice P2-G2c2、`docs/local-ime-slot-pre-p3-shortcut-clipboard-audit-2026-07.md`。
 *
 * Local Window active時はdocument-action barrierでwindowを安全に閉じてから、
 * 既存host commandへexact 1回だけ委譲する。
 * P2-G2b の `localImeUiTransitionPreflight.ts`（UI 遷移専用）、P2-G2c1 の
 * `localImeOutlineCommandPreflight.ts`（Outline navigation / fold 専用）とは
 * ドメインを分け、list-move 専用の reason だけを持つ薄い wrapper をここに置く。
 * 中身は同じ既存 P1 document-action barrier（`localImeDocumentActionBarrier`）
 * を再利用するだけで、新しい controller / adapter は作らない。
 */

import { prepareLocalImeForDocumentAction } from '../../editor-core/features/localImeDocumentActionBarrier'
import type { LocalImeDocumentActionPreparation } from '../../editor-core/features/localImeInputSessionState'

export type LocalImeListMoveCommandReason = 'list-move-up' | 'list-move-down'

/**
 * `reason` で barrier を通し、`ready` のときだけ `run`（既存
 * `core.moveListItemUp()` / `core.moveListItemDown()`）を 1 回呼ぶ。
 *
 * - active: barrier が同期的にsessionをoffへteardownしてから`run`を呼ぶ。
 * - composing / awaiting-end / flushing / handoff / recovery-required: `run` を
 *   呼ばず、preparation をそのまま返す（native / 通常 PM へ fallback しない）。
 * - participant未登録 / off: 通常経路。`run`を1回呼ぶ。
 */
export function runLocalImeListMoveCommand(
  reason: LocalImeListMoveCommandReason,
  run: () => void,
): LocalImeDocumentActionPreparation {
  const preparation = prepareLocalImeForDocumentAction(reason)
  if (preparation.status === 'ready') {
    run()
  }
  return preparation
}
