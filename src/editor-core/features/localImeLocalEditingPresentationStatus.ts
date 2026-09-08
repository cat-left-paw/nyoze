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

/** App が既に持っている製品表示状態の read-only slice。 */
export type LocalImeLocalEditingPresentationSource = {
  settingVisible: boolean
  preferenceEnabled: boolean
  needsAttention: boolean
}

export type LocalImeLocalEditingPresentationInput =
  LocalImeLocalEditingPresentationSource & {
    coarseStatus: LocalImeLocalEditingStatus
  }

/**
 * 左ペイン下部へ出す表示状態。
 *
 * 判定順:
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
  if (!input.preferenceEnabled) return 'off'
  if (input.coarseStatus === 'ready' || input.coarseStatus === 'editing') {
    return input.coarseStatus
  }
  return 'hidden'
}
