import type { CommandAvailability } from "../../editor-core/types";

/**
 * Built-in internal help docs (e.g. shortcut reference) are read-only in the UI.
 * Clamp editing-related availability so toolbar / context menu stay disabled while
 * preserving copy / select-all for reading.
 */
export function clampCommandAvailabilityForInternalDoc(
  a: CommandAvailability,
): CommandAvailability {
  return {
    ...a,
    canBold: false,
    canItalic: false,
    canStrike: false,
    canHighlight: false,
    canUnderline: false,
    canInlineCode: false,
    canClearFormat: false,
    canBlockTransforms: false,
    canBlockDirective: false,
    blockDirectiveToken: null,
    canDeletePageBreak: false,
    canUndo: false,
    canRedo: false,
    canInsertRuby: false,
    canParagraphPlain: false,
    canToggleTcy: false,
    canCut: false,
    canPaste: false,
    canMoveListUp: false,
    canMoveListDown: false,
    isBold: false,
    isItalic: false,
    isStrike: false,
    isHighlight: false,
    isUnderline: false,
    isInlineCode: false,
    isBulletList: false,
    isOrderedList: false,
    isChecklist: false,
    isBlockquote: false,
    isCodeBlock: false,
    isHeading: false,
    noteAnchorContextId: null,
    touchesNoteAnchor: false,
    canShowNoteInPanel: false,
    canDeleteNoteAnchor: false,
  }
}
