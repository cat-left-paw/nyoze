import type { PlainModeKind } from './plainModeCommandGate'
import { isNativeTextFormControl } from './nativeTextTarget'

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
  // Select All は generic contenteditable も native 扱いにする（既存挙動）。
  if (targetInfo.isContentEditable) return true
  return isNativeTextFormControl(targetInfo)
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
