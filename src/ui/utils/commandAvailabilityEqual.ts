import type { CommandAvailability } from "../../editor-core/types";

const COMMAND_AVAILABILITY_KEYS: Array<keyof CommandAvailability> = [
  "hasSelection",
  "canBold",
  "canItalic",
  "canStrike",
  "canHighlight",
  "canUnderline",
  "canInlineCode",
  "canClearFormat",
  "canBlockTransforms",
  "canUndo",
  "canRedo",
  "canInsertRuby",
  "canParagraphPlain",
  "canToggleTcy",
  "canCopy",
  "canCut",
  "canPaste",
  "canSelectAll",
  "canMoveListUp",
  "canMoveListDown",
  "isHeading",
  "isBold",
  "isItalic",
  "isStrike",
  "isHighlight",
  "isUnderline",
  "isInlineCode",
  "isBulletList",
  "isOrderedList",
  "isChecklist",
  "isBlockquote",
  "isCodeBlock",
  "canBlockDirective",
  "blockDirectiveToken",
];

export function isSameCommandAvailability(
  a: CommandAvailability,
  b: CommandAvailability,
): boolean {
  return COMMAND_AVAILABILITY_KEYS.every((key) => a[key] === b[key]);
}
