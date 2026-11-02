import { TextSelection, type Selection } from '@tiptap/pm/state'

/**
 * navigationが設定する`TextSelection`の端点の検査。端点がinline contentの外（`doc`の直下・blockの境界など）にある
 * `TextSelection`は、見た目より広い範囲（水平線などのblockを含む）になり、続く入力がそれを無言で置き換える
 * （PIS-S10-NAV-GAP1 P1b・REVIEWFIX1）。本文のcaret・範囲からの操作では、端点は常にinline contentの中にある。
 */
export function hasTextSelectionOutsideInlineContent(selection: Selection): boolean {
  return selection instanceof TextSelection && !(selection.$anchor.parent.inlineContent && selection.$head.parent.inlineContent)
}

/** navigationがselectionの設定を拒否した理由（receiptの`reason`）。 */
export const TEXT_SELECTION_OUTSIDE_INLINE_CONTENT = 'text-selection-outside-inline-content'
