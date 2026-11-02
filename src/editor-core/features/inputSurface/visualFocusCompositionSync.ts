import type { Editor } from '@tiptap/core'
import type { VisualFocusBlockDecorationOptions } from '../../extensions/visualFocusBlockDecoration'

/** 範囲のpreeditはtransactionを出さない。開始・終了だけ既存decorationのlive述語を再評価する。 */
export function createVisualFocusCompositionSync(editor: Editor): (composing: boolean) => void {
  const options = editor.extensionManager.extensions.find(extension => extension.name === 'visualFocusBlockDecoration')?.options as VisualFocusBlockDecorationOptions | undefined
  let previous = false
  return composing => {
    if (composing === previous) return
    previous = composing
    // 空のselectionのdecorationはgetComposingに依らない。確定transactionが空へ変えた後も同じ。
    if (editor.view.state.selection.empty) return
    if (!options || (!options.getBlockHighlightEnabled() && !options.getDimNonFocusedBlocksEnabled())) return
    // 同じstateのview更新。Doc・selection・history・dirtyを変えるtransactionは発行しない。
    editor.view.updateState(editor.view.state)
  }
}
