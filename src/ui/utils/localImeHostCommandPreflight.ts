/**
 * LOCAL-WINDOW-HOSTCOMMAND1 — Local Window / host PM の active session 中に
 * toolbar / shortcut から起動する caret-based 構造 command 向け session preflight。
 *
 * UI 遷移（`localImeUiTransitionPreflight`）、Outline / fold
 * （`localImeOutlineCommandPreflight`）、list-move
 * （`localImeListMoveCommandPreflight`）とはドメインを分け、構造 command 専用の
 * reason だけを持つ薄い wrapper をここに置く。中身は同じ既存 document-action
 * barrier（`localImeDocumentActionBarrier`）を再利用するだけで、新しい
 * controller / commit builder / generic input-intent framework は作らない。
 *
 * 対象は collapsed caret から実行できる host の block 変換・挿入だけ。
 * marks / Copy / Cut / Ruby / TCY / clear-format / delete page break /
 * Image / 付箋 prompt は載せない（後者は UI-transition）。
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
import { isProseMirrorFocused } from './selectAllShortcutRouting'

export type LocalImeHostCommandReason =
  | 'host-command-heading'
  | 'host-command-list'
  | 'host-command-blockquote'
  | 'host-command-code-block'
  | 'host-command-horizontal-rule'
  | 'host-command-block-directive'

/**
 * heading / paragraph shortcut を HOSTCOMMAND1 barrier へ通してよい focus owner か。
 *
 * host ProseMirrorとLocal Windowだけを対象にする。
 * 検索欄など native input は barrier も command も走らせない。
 */
export function isLocalImeHostBlockStructureShortcutFocusOwner(
  target: Element | null,
): boolean {
  if (!target) return false
  return isProseMirrorFocused(target)
}

/**
 * `reason` で barrier を通し、`ready` のときだけ `run`（既存 host 構造 command）を
 * 1 回呼ぶ。
 *
 * - armed / Local Window active: barrier が同期的に session を off へ teardown
 *   してから `run` を呼ぶ。`run` が読む PM selection は close 後の最新 host state。
 * - composing / awaiting-end / flushing / handoff / recovery-required: `run` を
 *   呼ばず、preparation をそのまま返す。
 * - coordinator 未登録 / off / suspended: 通常経路。`run` を 1 回呼ぶ。
 * - continuation は登録しない。command 引数を queue しない。
 */
export function runLocalImeHostCommand(
  reason: LocalImeHostCommandReason,
  run: () => void,
): LocalImeDocumentActionPreparation {
  const preparation = prepareLocalImeForDocumentAction(reason)
  if (preparation.status === 'ready') {
    run()
  }
  return preparation
}
