/** vertical-rl compatibility API。値の正本はwritingModeArrowNavigationState。 */
import type { EditorState } from '@tiptap/pm/state'
import {
  classifyWritingModeArrowKey,
  isSafeWritingModeArrowGraphemeCaret,
  resolveWritingModeArrowMapping,
  type WritingModeArrowOperation,
} from './writingModeArrowNavigationState'

export type VerticalRlArrowOperation = WritingModeArrowOperation
export type VerticalRlArrowModifyMapping = {
  direction: 'forward' | 'backward'
  granularity: 'character' | 'line'
}

export function classifyVerticalRlArrowKey(key: string): VerticalRlArrowOperation | null {
  return classifyWritingModeArrowKey(key)
}

/** vertical-rl専用compatibility wrapper。 */
export function resolveVerticalRlArrowModifyMapping(
  operation: VerticalRlArrowOperation,
): VerticalRlArrowModifyMapping {
  const mapping = resolveWritingModeArrowMapping('vertical-rl', operation)
  return { direction: mapping.direction, granularity: mapping.granularity }
}

export function isSafeVerticalRlArrowGraphemeCaret(
  state: EditorState,
  pos: number,
): boolean {
  return isSafeWritingModeArrowGraphemeCaret(state, pos)
}
