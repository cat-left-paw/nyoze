import { isInputSurfaceCapable } from './inputSurfaceGate'

/** PM commandのowner判定専用。Host DOM selectionのproofには使わない。 */
export function isInputSurfaceFocusOwner(element: Element | null, enabled = isInputSurfaceCapable()): boolean {
  return enabled && !!element?.closest('[data-nyoze-input-surface="true"]')
}

/**
 * 本文・選択に作用するtoolbarのmousedown（promptを開くボタン、書式・ブロック・Undo / Redoのボタン、
 * ドロップダウンのトリガー・メニュー・項目）で、実際の入力面ownerをbuttonへ移さない。
 * 移すと入力面が非アクティブになり、範囲のHighlightが消える（PIS-TOOLBAR-FOCUS-KEEP1）。
 * 入力面がfocusを持たないとき（以前の入力方式、別のUIにfocusがあるとき）は何もしない。
 */
export function preserveInputSurfacePromptOwner(event: { currentTarget: Element; preventDefault(): void }): void {
  const active = event.currentTarget.ownerDocument.activeElement
  if (isInputSurfaceFocusOwner(active) && getInputSurfaceFocusPort(active)?.isEligible()) event.preventDefault()
}

export function getInputSurfacePromptMouseDownHandler() {
  return isInputSurfaceCapable() ? preserveInputSurfacePromptOwner : undefined
}

export type InputSurfaceFocusPort = {
  isEligible(): boolean
  isComposing(): boolean
  /** エディタのfocusの持ち主（入力面、または貸し出し中のHost）がfocusを持っている。`focus()`を呼ぶ前の判定に使う。 */
  hasFocus(): boolean
  focus(): boolean
  /**
   * PIS-SETTINGS-FOCUS-RETURN1: modal を閉じて focus を戻すとき、いまの入力の方式のエディタの focus の持ち主へ戻す。
   * `surface` = 入力面（従来の`focus()`と同じ）、`host` = 従来の入力へ切り替わった後の Host の本文、`none` = どちらにも戻さない。
   */
  restoreEditorFocus(): 'surface' | 'host' | 'none'
  selectAll(): boolean
  focusForContextMenuClipboard(): 'surface' | 'blocked'
  contextMenuClosed(menuRoot?: Element | null): void
}
const ports = new WeakMap<Element, InputSurfaceFocusPort>()

export function registerInputSurfaceFocusPort(host: HTMLElement, surface: HTMLElement, port: InputSurfaceFocusPort): () => void {
  ports.set(host, port)
  ports.set(surface, port)
  return () => { ports.delete(host); ports.delete(surface) }
}

export function getInputSurfaceFocusPort(element: Element | null): InputSurfaceFocusPort | null {
  if (!element) return null
  return ports.get(element) ?? null
}

/** React context menuの明示close。OFFではDOMを読まず、既存closeだけを使う。 */
export function closeInputSurfaceContextMenu(editorRoot: Element | null, menuRoot: Element | null = null): void {
  if (!isInputSurfaceCapable() || !editorRoot) return
  const host = editorRoot.querySelector('.ProseMirror')
  getInputSurfaceFocusPort(host)?.contextMenuClosed(menuRoot)
}

export type ContextMenuClipboardFocusResult = 'surface' | 'not-applicable' | 'blocked'

/** Context menuのutilityがactiveElementを読む直前に、既存の入力面focus経路へ戻す。 */
export function prepareInputSurfaceContextMenuClipboard(editorRoot: Element | null): ContextMenuClipboardFocusResult {
  if (!isInputSurfaceCapable() || !editorRoot) return 'not-applicable'
  const host = editorRoot.querySelector('.ProseMirror')
  const port = getInputSurfaceFocusPort(host)
  if (!port?.isEligible()) return 'not-applicable'
  return port.focusForContextMenuClipboard()
}
