/**
 * P2-G1b — Edit menu command の focus target 抽出（impure）。
 *
 * `document.activeElement` と `closest()` から、pure classifier
 * (`editMenuCommandRouting.ts`) が読む `EditMenuCommandTargetInfo` を組み立てる。
 * 分類・command 実行はここでは行わない。
 */

import type {
  EditMenuCommandTargetInfo,
  EditMenuCommandTargetRegion,
} from './editMenuCommandRouting'
const SOURCE_MODE_SELECTOR = '.source-mode-host'
const PARAGRAPH_PLAIN_SELECTOR = 'textarea.tategaki-plain-overlay'
const PROSEMIRROR_SELECTOR = '.ProseMirror'
const DIALOG_SELECTOR = '[role="dialog"], dialog'

/**
 * 内側優先で所属領域を 1 つだけ解決する。
 *
 * Source Mode → Paragraph Plain → ProseMirror → none。
 * `.ProseMirror` は `contenteditable` の値を問わない（read-only internal document 対策）。
 */
export function resolveEditMenuCommandTargetRegion(
  element: Element | null,
): EditMenuCommandTargetRegion {
  if (!element) return 'none'
  if (element.closest(SOURCE_MODE_SELECTOR)) return 'source-mode'
  if (element.closest(PARAGRAPH_PLAIN_SELECTOR)) return 'paragraph-plain'
  if (element.closest(PROSEMIRROR_SELECTOR)) return 'prosemirror'
  return 'none'
}

export function isEditMenuCommandTargetInDialog(element: Element | null): boolean {
  if (!element) return false
  return element.closest(DIALOG_SELECTOR) !== null
}

/**
 * `document.activeElement`（または明示した element）から target info を抽出する。
 * element が無い / Element でない場合は空 target（region none）を返す。
 */
export function extractEditMenuCommandTargetInfo(
  active: EventTarget | null = typeof document !== 'undefined'
    ? document.activeElement
    : null,
): EditMenuCommandTargetInfo {
  // Node unit test 等で HTMLElement が無い場合も安全に空 target を返す。
  const htmlElementCtor =
    typeof HTMLElement !== 'undefined' ? HTMLElement : null
  if (!htmlElementCtor || !(active instanceof htmlElementCtor)) {
    return {
      tagName: null,
      inputType: null,
      isContentEditable: false,
      region: 'none',
      inDialog: false,
    }
  }
  return {
    tagName: active.tagName.toLowerCase(),
    inputType:
      active instanceof HTMLInputElement ? active.type.toLowerCase() : null,
    isContentEditable: active.isContentEditable,
    region: resolveEditMenuCommandTargetRegion(active),
    inDialog: isEditMenuCommandTargetInDialog(active),
  }
}
