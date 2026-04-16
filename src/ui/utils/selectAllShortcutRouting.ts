import type { PlainModeKind } from './plainModeCommandGate'

export type SelectAllShortcutTargetInfo = {
  tagName: string | null
  inputType: string | null
  isContentEditable: boolean
}

export type SelectAllShortcutRoute =
  | 'native'
  | 'editor'
  | 'full-plain'
  | 'paragraph-plain'
  | 'none'

const NATIVE_TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number',
])

export function resolveSelectAllShortcutTargetInfo(
  target: EventTarget | null,
): SelectAllShortcutTargetInfo {
  if (!(target instanceof HTMLElement)) {
    return { tagName: null, inputType: null, isContentEditable: false }
  }
  return {
    tagName: target.tagName.toLowerCase(),
    inputType:
      target instanceof HTMLInputElement ? target.type.toLowerCase() : null,
    isContentEditable: target.isContentEditable,
  }
}

export function shouldRespectNativeSelectAll(
  targetInfo: SelectAllShortcutTargetInfo,
): boolean {
  if (targetInfo.isContentEditable) return true
  if (targetInfo.tagName === 'textarea') return true
  if (targetInfo.tagName !== 'input') return false
  return (
    targetInfo.inputType === null ||
    NATIVE_TEXT_INPUT_TYPES.has(targetInfo.inputType)
  )
}

/**
 * Returns true when the focused element is inside the TipTap / ProseMirror
 * editor contenteditable area.
 *
 * TipTap renders its editable root as:
 *   <div class="ProseMirror" contenteditable="true">
 *
 * We match on the class name rather than just `contenteditable` to avoid
 * false-positives from other contenteditable nodes in the UI (e.g. NodeView
 * decorations that carry contenteditable="false", or any future overlay).
 *
 * Used by list-move shortcuts so that Cmd/Ctrl+Arrow is only suppressed when
 * the regular editor has focus — not when focus is on a button, panel, native
 * input, or any other element.
 */
export function isProseMirrorFocused(el: Element | null): boolean {
  if (!el) return false
  return el.closest('.ProseMirror[contenteditable="true"]') !== null
}

export function resolveSelectAllShortcutRoute(params: {
  targetInfo: SelectAllShortcutTargetInfo
  plainModeKind: PlainModeKind | null
  hasEditorCore: boolean
  hasFullPlainEditor: boolean
}): SelectAllShortcutRoute {
  if (shouldRespectNativeSelectAll(params.targetInfo)) {
    return 'native'
  }
  if (params.plainModeKind === 'full-plain') {
    return params.hasFullPlainEditor ? 'full-plain' : 'none'
  }
  if (params.plainModeKind === 'paragraph-plain') {
    return params.hasEditorCore ? 'paragraph-plain' : 'none'
  }
  return params.hasEditorCore ? 'editor' : 'none'
}
