/** vertical-rl compatibility API。DOM Selection primitiveはwriting-mode中立層が正本。 */
import type { EditorView } from '@tiptap/pm/view'
import {
  syncWritingModeArrowDomSelectionAtPmPosition,
  syncWritingModeArrowDomSelectionFromPm,
} from './writingModeArrowNavigationDomSelection'

export function syncVerticalRlArrowDomSelectionFromPm(view: EditorView): boolean {
  return syncWritingModeArrowDomSelectionFromPm(view)
}

export function syncVerticalRlArrowDomSelectionAtPmPosition(
  view: EditorView,
  position: number,
): boolean {
  return syncWritingModeArrowDomSelectionAtPmPosition(view, position)
}
