/**
 * LOCAL-WINDOW-PRODUCT-LABEL-STATUS1: 左ペイン下部の表示専用状態。
 *
 * coarse channel（`hidden | ready | editing`）は変更しない。`hidden` を無条件に
 * OFF と解釈せず、既存 product preference / capability / needs-attention から
 * read-only に導出する。PM 本文、selection、geometry、timer、polling は知らない。
 */

import type { LocalImeLocalEditingStatus } from './localImeLocalEditingStatusState'

export type LocalImeLocalEditingPresentationStatus =
  | 'hidden'
  | 'off'
  | 'ready'
  | 'editing'
  /** PIS-S10-ENTRY-UI1（D9）: 製品の入口がPISで、長文編集モードがON。 */
  | 'on'

/** App が既に持っている製品表示状態の read-only slice。 */
export type LocalImeLocalEditingPresentationSource = {
  settingVisible: boolean
  preferenceEnabled: boolean
  needsAttention: boolean
}

export type LocalImeLocalEditingPresentationInput =
  LocalImeLocalEditingPresentationSource & {
    coarseStatus: LocalImeLocalEditingStatus
    /**
     * PIS-S10-ENTRY-UI1: 製品の入口の方式（mainの固定値）。省略はLocal Windowの経路と同じ扱い。
     * `input-surface`のときだけ、下のPISの表を使う。
     */
    productStrategy?: 'input-surface' | 'local-window' | 'none'
    /** PIS: 入力面に確定できなかった文字が残っている（入力面の通知が正本）。 */
    inputSurfaceRetained?: boolean
  }

/**
 * 左ペイン下部へ出す表示状態。
 *
 * 判定順（Local Windowの経路。PISの起動は、2の後に PIS の表（保持文字あり → hidden、ON → on、OFF → off）を使う）:
 * 1. 制御面なし → hidden
 * 2. recovery / needs-attention → hidden（OFF と誤表示しない）
 * 3. 設定 OFF → off（coarse の ready / editing が残っていても設定を優先する）
 * 4. coarse ready / editing → そのまま投影
 * 5. それ以外 → hidden
 *
 * - hidden: 制御面なし、recovery / needs-attention、kill / breaker / halted
 * - off: capability あり・設定 OFF（正常停止）
 * - ready / editing: 設定 ON のときの既存 coarse channel
 */
export function resolveLocalImeLocalEditingPresentationStatus(
  input: LocalImeLocalEditingPresentationInput,
): LocalImeLocalEditingPresentationStatus {
  if (!input.settingVisible) return 'hidden'
  if (input.needsAttention) return 'hidden'
  if (input.productStrategy === 'input-surface') {
    // PIS-S10-ENTRY-UI1（D9）: OFF / ONの2状態。Local Windowのcoarse（ready / editing）は使わない。
    // 確定できなかった文字がある間は出さない（入力面の通知が正本）。
    if (input.inputSurfaceRetained) return 'hidden'
    return input.preferenceEnabled ? 'on' : 'off'
  }
  if (!input.preferenceEnabled) return 'off'
  if (input.coarseStatus === 'ready' || input.coarseStatus === 'editing') {
    return input.coarseStatus
  }
  return 'hidden'
}
