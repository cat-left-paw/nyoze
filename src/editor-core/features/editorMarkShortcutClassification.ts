/**
 * 通常 PM（useGlobalShortcuts）と局所 IME slot（P2-D2）が共有する書式 shortcut 分類。
 *
 * Mod 判定は `metaKey || ctrlKey`（useGlobalShortcuts と同型）。
 * 割り当て文字列を両経路へ二重定義しないための正本。
 */

export type EditorMarkShortcutName = 'bold' | 'italic' | 'strike'

export type EditorMarkShortcutProbe = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Cmd/Ctrl+B / I / Shift+X だけを返す。それ以外は null（呼び出し側は消費しない）。
 */
export function classifyEditorMarkShortcut(
  probe: EditorMarkShortcutProbe,
): EditorMarkShortcutName | null {
  if (probe.altKey) return null
  const mod = probe.metaKey || probe.ctrlKey
  if (!mod) return null

  const key = probe.key.toLowerCase()
  if (key === 'b' && !probe.shiftKey) return 'bold'
  if (key === 'i' && !probe.shiftKey) return 'italic'
  if (key === 'x' && probe.shiftKey) return 'strike'
  return null
}

export function editorMarkShortcutToLocalImeOperation(
  mark: EditorMarkShortcutName,
): 'toggle-bold' | 'toggle-italic' | 'toggle-strike' {
  if (mark === 'bold') return 'toggle-bold'
  if (mark === 'italic') return 'toggle-italic'
  return 'toggle-strike'
}

export function localImeOperationToEditorMarkShortcut(
  operation: 'toggle-bold' | 'toggle-italic' | 'toggle-strike',
): EditorMarkShortcutName {
  if (operation === 'toggle-bold') return 'bold'
  if (operation === 'toggle-italic') return 'italic'
  return 'strike'
}
