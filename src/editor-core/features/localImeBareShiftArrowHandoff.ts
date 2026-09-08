/**
 * strategy-neutral な bare Shift+Arrow host-handoff 判定。
 *
 * paragraph overlay / Local Window が同じ trusted 1 打条件を共有するための
 * 最小 pure module。feature 固有の Mode 型や lifecycle は持たない。
 * 物理方向の direction / granularity は writing-mode 共通 range adapter
 * が所有し、ここは対象 operation を返すだけである。
 *
 * 1-block 専用 classifier を Local Window 型へ偽装せず、同じ判定を丸ごと複製もしない。
 */
import {
  classifyWritingModeArrowKey,
  resolveSupportedEditorWritingMode,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'

export type BareShiftArrowHostHandoffRejectReason =
  | 'not-arrow-key'
  | 'not-trusted'
  | 'not-cancelable'
  | 'composing'
  | 'unsupported-modifier'
  | 'shift-required'
  | 'mode-not-active'
  | 'local-root-not-focused'
  | 'identity-invalid'
  | 'writing-mode'
  | 'selection-not-text'
  | 'selection-not-collapsed'

export type BareShiftArrowHostHandoffDecision =
  | { handoff: true; operation: WritingModeArrowOperation }
  | { handoff: false; reason: BareShiftArrowHostHandoffRejectReason }

export function resolveBareShiftArrowHostHandoff(input: {
  key: string
  isTrusted: boolean
  cancelable: boolean
  isComposing: boolean
  keyCode: number
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  /** `active-clean` / `active-dirty` 以外は mode-not-active。 */
  mode: string
  /** `document.activeElement === localView.dom` 相当の実 focus owner。 */
  localRootFocused: boolean
  /** current controller generation / document identity / base が有効か。 */
  identityValid: boolean
  writingMode: string
  selectionIsText: boolean
  /** local PM selection が collapsed か。 */
  selectionCollapsed: boolean
}): BareShiftArrowHostHandoffDecision {
  const operation = classifyWritingModeArrowKey(input.key)
  if (!operation) return { handoff: false, reason: 'not-arrow-key' }
  if (!input.isTrusted) return { handoff: false, reason: 'not-trusted' }
  if (!input.cancelable) return { handoff: false, reason: 'not-cancelable' }
  if (input.isComposing || input.keyCode === 229) {
    return { handoff: false, reason: 'composing' }
  }
  if (input.metaKey || input.ctrlKey || input.altKey) {
    return { handoff: false, reason: 'unsupported-modifier' }
  }
  if (!input.shiftKey) return { handoff: false, reason: 'shift-required' }
  if (input.mode !== 'active-clean' && input.mode !== 'active-dirty') {
    return { handoff: false, reason: 'mode-not-active' }
  }
  if (!input.localRootFocused) return { handoff: false, reason: 'local-root-not-focused' }
  if (!input.identityValid) return { handoff: false, reason: 'identity-invalid' }
  if (!resolveSupportedEditorWritingMode(input.writingMode)) {
    return { handoff: false, reason: 'writing-mode' }
  }
  if (!input.selectionIsText) return { handoff: false, reason: 'selection-not-text' }
  if (!input.selectionCollapsed) {
    return { handoff: false, reason: 'selection-not-collapsed' }
  }
  return { handoff: true, operation }
}
