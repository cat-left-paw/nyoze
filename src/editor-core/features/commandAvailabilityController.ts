import type { EditorState } from '@tiptap/pm/state'
import type { CommandAvailability } from '../types'

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

type CreateCommandAvailabilityControllerOptions = {
  getState: () => EditorState
  getIsComposing: () => boolean
  getEnableRuby: () => boolean
  canMoveListUp: (state: EditorState) => boolean
  canMoveListDown: (state: EditorState) => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  getActiveMarks: () => ActiveMarksSnapshot
  buildCommandAvailability: (input: {
    state: EditorState
    composing: boolean
    canMoveListUp: boolean
    canMoveListDown: boolean
    canUndo: boolean
    canRedo: boolean
    active: ActiveMarksSnapshot
    enableRuby: boolean
  }) => CommandAvailability
}

export function createCommandAvailabilityController({
  getState,
  getIsComposing,
  getEnableRuby,
  canMoveListUp,
  canMoveListDown,
  canUndo,
  canRedo,
  getActiveMarks,
  buildCommandAvailability,
}: CreateCommandAvailabilityControllerOptions): {
  getCommandAvailability: () => CommandAvailability
} {
  function getCommandAvailability(): CommandAvailability {
    const state = getState()
    const composing = getIsComposing()

    let canMoveUp = false
    let canMoveDown = false
    if (!composing) {
      canMoveUp = canMoveListUp(state)
      canMoveDown = canMoveListDown(state)
    }

    return buildCommandAvailability({
      state,
      composing,
      canMoveListUp: canMoveUp,
      canMoveListDown: canMoveDown,
      canUndo: canUndo(),
      canRedo: canRedo(),
      active: getActiveMarks(),
      enableRuby: getEnableRuby(),
    })
  }

  return {
    getCommandAvailability,
  }
}
