import { commands, Extension, resolveFocusPosition, type RawCommands } from '@tiptap/core'
import { getInputSurfaceFocusPort, type InputSurfaceFocusPort } from './focusOwner'

export function createInputSurfaceFocusCommand(
  getPort: (host: HTMLElement) => InputSurfaceFocusPort | null = getInputSurfaceFocusPort,
  fallback: RawCommands['focus'] = commands.focus,
): RawCommands['focus'] {
  return (position = null, options = {}) => props => {
    const port = getPort(props.view.dom)
    if (!port?.isEligible()) return fallback(position, options)(props)
    if (position === false || port.isComposing()) return true
    if (props.dispatch) {
      // Tiptapの`focus`は、すでにfocusを持っていて`position === null`なら何もしない（scrollも求めない）。
      // 印は同じ条件のときだけ付ける。focusを移す前に判定する（B033: 中央のrevealが印を実行するため）。
      const hadFocus = port.hasFocus()
      // nullは現在のchain selectionを保つ。Tiptapと同じhelper / 同じPM runtime。
      const selection = resolveFocusPosition(props.tr.doc, position)
      if (selection && !props.tr.selection.eq(selection)) props.tr.setSelection(selection)
      port.focus() // 配置とI5の正規化もS2の単一経路で行う。
      if (options.scrollIntoView !== false && !(hadFocus && position === null)) props.tr.scrollIntoView()
    }
    return true
  }
}

export const InputSurfaceFocus = Extension.create({
  name: 'inputSurfaceFocus',
  // commandsは後勝ち。coreのCommandsより後に解決する（pluginは追加しない）。
  priority: -1000,
  addCommands() { return { focus: createInputSurfaceFocusCommand() } },
})
