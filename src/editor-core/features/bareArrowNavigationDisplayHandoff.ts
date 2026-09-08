/**
 * strategy-neutral bare Arrow の表示系handoff。
 *
 * local IME slot / paragraph overlayのどちらにも属さない、host PM selectionが
 * resolve済みでdispatch直前になったときのTypewriter / pseudo caret / macOS clamp
 * 通知だけを所有する。session mode・flush・strategy判定は持たない。
 */
import type { EditorView } from '@tiptap/pm/view'
import { scheduleMacosArrowScrollClampForView } from './macosArrowScrollClampForView'

export type BareArrowNavigationDisplayHandoffDeps = {
  view: EditorView
  noteTypewriterClassifiedArrowIntent?: () => void
  notePseudoCaretIntent?: (event: KeyboardEvent) => void
  clampSettingEnabled: () => boolean
  typewriterEnabled: () => boolean
  wysiwygSuppressForSourceMode: () => boolean
  paragraphPlainActive: () => boolean
}

/**
 * 手動dispatchするnavigation handoffでは、元DOM eventのpreventDefaultはlocal
 * browser defaultを止めた印であり、host clampのgate理由ではない。
 */
export function resolveBareArrowNavigationDisplayClampDefaultPrevented(
  _event: Pick<KeyboardEvent, 'defaultPrevented'>,
): false {
  void _event
  return false
}

/** host navigationのresolve成功後・dispatch直前に一度だけ呼ぶ。 */
export function createBareArrowNavigationDisplayHandoff(
  deps: BareArrowNavigationDisplayHandoffDeps,
): (event: KeyboardEvent) => void {
  return (event) => {
    deps.noteTypewriterClassifiedArrowIntent?.()
    deps.notePseudoCaretIntent?.(event)
    scheduleMacosArrowScrollClampForView(deps.view, event, {
      clampSettingEnabled: deps.clampSettingEnabled(),
      typewriterEnabled: deps.typewriterEnabled(),
      wysiwygSuppressForSourceMode: deps.wysiwygSuppressForSourceMode(),
      paragraphPlainActive: deps.paragraphPlainActive(),
      // ここへ来るArrowは既にhost navigation planが解決済みで、session固有の
      // composing状態を読まない。slot / overlayのいずれも同じ表示契約を使う。
      composing: false,
      selectionCollapsed: deps.view.state.selection.empty,
      defaultPrevented: resolveBareArrowNavigationDisplayClampDefaultPrevented(event),
    })
  }
}
