import type { EditorState } from '@tiptap/pm/state'
import type { CommandAvailability } from '../types'
import {
  isNoteAnchorNodeSelection,
  resolveNoteAnchorContextId,
  selectionTouchesNoteAnchor,
} from './noteAnchorProtection'
import { resolveSelectedTcyRanges } from './tcyFormatting'
import { isPageBreakNodeSelected, resolveCurrentDirectiveDescriptor } from '../commands/customBlockDirectiveCommands'
import { formatDirectiveToken } from '../io/customBlockDirective'

type ActiveMarksSnapshot = {
  isBold: boolean
  isItalic: boolean
  isStrike: boolean
  isHighlight: boolean
  isUnderline: boolean
  isInlineCode: boolean
  isBulletList: boolean
  isOrderedList: boolean
  isBlockquote: boolean
  isCodeBlock: boolean
}

type BuildCommandAvailabilityInput = {
  state: EditorState
  composing: boolean
  canMoveListUp: boolean
  canMoveListDown: boolean
  canUndo: boolean
  canRedo: boolean
  active: ActiveMarksSnapshot
  enableRuby: boolean
}

function resolveChecklistState(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name !== 'listItem') continue
    return node.attrs.checked === true || node.attrs.checked === false
  }
  return false
}

function resolveHeadingState(state: EditorState): false | number {
  const parentType = state.selection.$from.parent.type.name
  if (parentType !== 'heading') return false
  return (state.selection.$from.parent.attrs.level as number) ?? 1
}

function resolveParagraphPlainState(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    let insideListItem = false
    for (let d = depth - 1; d > 0; d--) {
      if ($from.node(d).type.name === 'listItem') {
        insideListItem = true
        break
      }
    }
    if (insideListItem) continue

    const typeName = $from.node(depth).type.name
    if (
      typeName === 'paragraph' ||
      typeName === 'heading' ||
      typeName === 'codeBlock' ||
      typeName === 'html_block_atom'
    ) {
      return true
    }
  }
  return false
}

export function buildCommandAvailability({
  state,
  composing,
  canMoveListUp,
  canMoveListDown,
  canUndo,
  canRedo,
  active,
  enableRuby,
}: BuildCommandAvailabilityInput): CommandAvailability {
  const { from, to } = state.selection
  const hasSelection = from !== to
  const hasNonAnchorTextSelection = hasSelection && !isNoteAnchorNodeSelection(state)
  const hasTcyClearTarget = resolveSelectedTcyRanges(state).length > 0
  const touchesNoteAnchor = selectionTouchesNoteAnchor(state)
  const noteAnchorContextId = resolveNoteAnchorContextId(state)
  const blockNoteAnchorEdits = touchesNoteAnchor && !composing
  const directiveDescriptor = resolveCurrentDirectiveDescriptor(state)
  const blockDirectiveToken = directiveDescriptor ? formatDirectiveToken(directiveDescriptor) : null

  return {
    hasSelection,
    hasNonAnchorTextSelection,
    canBold: hasSelection && !composing && !blockNoteAnchorEdits,
    canItalic: hasSelection && !composing && !blockNoteAnchorEdits,
    canStrike: hasSelection && !composing && !blockNoteAnchorEdits,
    canHighlight: hasSelection && !composing && !blockNoteAnchorEdits,
    canUnderline: hasSelection && !composing && !blockNoteAnchorEdits,
    canInlineCode: hasSelection && !composing && !blockNoteAnchorEdits,
    canClearFormat: (hasSelection || hasTcyClearTarget) && !composing && !blockNoteAnchorEdits,
    canBlockTransforms: !composing && !blockNoteAnchorEdits,
    canUndo: !composing && canUndo,
    canRedo: !composing && canRedo,
    canInsertRuby: hasSelection && !composing && enableRuby && !blockNoteAnchorEdits,
    canParagraphPlain: !composing && resolveParagraphPlainState(state),
    canToggleTcy: hasSelection && !composing && !blockNoteAnchorEdits,
    canCopy: hasSelection && !composing,
    canCut: hasSelection && !composing && !blockNoteAnchorEdits,
    canPaste: !composing,
    canSelectAll: !composing && state.doc.textContent.length > 0,
    canMoveListUp: canMoveListUp,
    canMoveListDown: canMoveListDown,
    isHeading: resolveHeadingState(state),
    isBold: active.isBold,
    isItalic: active.isItalic,
    isStrike: active.isStrike,
    isHighlight: active.isHighlight,
    isUnderline: active.isUnderline,
    isInlineCode: active.isInlineCode,
    isBulletList: active.isBulletList,
    isOrderedList: active.isOrderedList,
    isChecklist: resolveChecklistState(state),
    isBlockquote: active.isBlockquote,
    isCodeBlock: active.isCodeBlock,
    canBlockDirective: !composing,
    blockDirectiveToken,
    canDeletePageBreak: !composing && isPageBreakNodeSelected(state),
    noteAnchorContextId,
    touchesNoteAnchor,
    canShowNoteInPanel: noteAnchorContextId !== null && !composing,
    canDeleteNoteAnchor: noteAnchorContextId !== null && !composing,
  }
}
