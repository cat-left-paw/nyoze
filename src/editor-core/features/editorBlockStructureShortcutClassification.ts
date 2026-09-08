/**
 * 通常 PM（useGlobalShortcuts）と局所 IME slot（P2-G2a）が共有する
 * Heading / paragraph / Clear Format shortcut 分類。
 *
 * Mod 判定は `metaKey || ctrlKey`（useGlobalShortcuts と同型）。
 * 割り当てを両経路へ二重定義しないための正本。
 *
 * Heading の数字キーは `KeyboardEvent.code`（`Digit0`–`Digit3`）を正本にする。
 * 実 macOS では Option 修飾で `key` が `"¡"` 等へ変わり、`key === "1"` だけでは
 * 認識できない。`key: "1" / "2" / "3" / "0"` は code が無い synthetic 経路の
 * fallback。記号そのものは判定へ hardcode しない。
 *
 * Windows の AltGr は `ctrlKey` + `altKey` + `Digit*` になり得るため、
 * `altGraphKey === true`（`getModifierState('AltGraph')`）のときは Heading も
 * Clear Format も返さない。文字入力へ委譲する。
 */

export type EditorBlockStructureShortcutName =
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'paragraph'
  | 'clear-format'

export type EditorBlockStructureShortcutProbe = {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  /** Windows AltGr。true のときは shortcut を消費しない。 */
  altGraphKey?: boolean
  isComposing?: boolean
  keyCode?: number
  cancelable?: boolean
}

export type LocalImeBlockStructureOperation =
  | 'toggle-heading-1'
  | 'toggle-heading-2'
  | 'toggle-heading-3'
  | 'set-paragraph'
  | 'clear-format'

const HEADING_SHORTCUT_BY_DIGIT_CODE: Readonly<
  Record<string, EditorBlockStructureShortcutName>
> = {
  Digit1: 'heading-1',
  Digit2: 'heading-2',
  Digit3: 'heading-3',
  Digit0: 'paragraph',
}

function classifyHeadingDigitShortcut(
  probe: EditorBlockStructureShortcutProbe,
): EditorBlockStructureShortcutName | null {
  if (typeof probe.code === 'string' && probe.code.startsWith('Digit')) {
    return HEADING_SHORTCUT_BY_DIGIT_CODE[probe.code] ?? null
  }
  const key = probe.key.length === 1 ? probe.key.toLowerCase() : probe.key
  if (key === '1') return 'heading-1'
  if (key === '2') return 'heading-2'
  if (key === '3') return 'heading-3'
  if (key === '0') return 'paragraph'
  return null
}

/**
 * Cmd/Ctrl+Alt+1/2/3/0 と Cmd/Ctrl+Shift+C だけを返す。
 * IME 特殊 key / non-cancelable / 対象外は null（呼び出し側は消費しない）。
 */
export function classifyEditorBlockStructureShortcut(
  probe: EditorBlockStructureShortcutProbe,
): EditorBlockStructureShortcutName | null {
  if (probe.isComposing) return null
  if (probe.keyCode === 229) return null
  if (probe.key === 'Process' || probe.key === 'Unidentified') return null
  if (probe.cancelable === false) return null
  // Windows AltGr: ctrl+alt+Digit を Heading と誤認しない。
  if (probe.altGraphKey === true) return null

  const mod = probe.metaKey || probe.ctrlKey
  if (!mod) return null

  if (probe.altKey && !probe.shiftKey) {
    return classifyHeadingDigitShortcut(probe)
  }

  const key = probe.key.length === 1 ? probe.key.toLowerCase() : probe.key
  if (!probe.altKey && probe.shiftKey && key === 'c') {
    return 'clear-format'
  }

  return null
}

export function editorBlockStructureShortcutToLocalImeOperation(
  name: EditorBlockStructureShortcutName,
): LocalImeBlockStructureOperation {
  if (name === 'heading-1') return 'toggle-heading-1'
  if (name === 'heading-2') return 'toggle-heading-2'
  if (name === 'heading-3') return 'toggle-heading-3'
  if (name === 'paragraph') return 'set-paragraph'
  return 'clear-format'
}

export function localImeOperationToEditorBlockStructureShortcut(
  operation: LocalImeBlockStructureOperation,
): EditorBlockStructureShortcutName {
  if (operation === 'toggle-heading-1') return 'heading-1'
  if (operation === 'toggle-heading-2') return 'heading-2'
  if (operation === 'toggle-heading-3') return 'heading-3'
  if (operation === 'set-paragraph') return 'paragraph'
  return 'clear-format'
}

export function isLocalImeBlockStructureOperation(
  operation: string,
): operation is LocalImeBlockStructureOperation {
  return (
    operation === 'toggle-heading-1' ||
    operation === 'toggle-heading-2' ||
    operation === 'toggle-heading-3' ||
    operation === 'set-paragraph' ||
    operation === 'clear-format'
  )
}
