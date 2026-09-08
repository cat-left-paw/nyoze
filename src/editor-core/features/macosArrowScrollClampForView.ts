/** host `EditorView`からmacOS bare Arrow scroll clampを起動する中立入口。 */
import type { EditorView } from '@tiptap/pm/view'
import {
  isMacOsRenderer,
  maybeScheduleMacosArrowScrollClamp,
  readSinceLastInteractionMs,
} from './macosArrowScrollClamp'

export function scheduleMacosArrowScrollClampForView(
  view: EditorView,
  event: KeyboardEvent,
  options: {
    clampSettingEnabled: boolean
    typewriterEnabled: boolean
    wysiwygSuppressForSourceMode: boolean
    paragraphPlainActive: boolean
    composing: boolean
    selectionCollapsed: boolean
    defaultPrevented: boolean
  },
): void {
  const host = view.dom.closest('.editor-surface') as HTMLElement | null
  if (!host) return
  const { sinceLastWheelMs, sinceLastPointerDragMs } = readSinceLastInteractionMs(host)
  maybeScheduleMacosArrowScrollClamp(host, event, {
    ...options,
    isMacOS: isMacOsRenderer(),
    sinceLastWheelMs,
    sinceLastPointerDragMs,
  })
}
