import type { EditorCoreHandle, SelectionRange } from '../../editor-core/types'

/**
 * 付箋マーカー専用コンテキストメニューの表示判定。
 *
 * テキスト選択中は通常メニューを優先し、selection が空で DOM 上の
 * `.note-anchor` を右クリックしたときだけ付箋専用メニューを出す。
 * `pmHasSelection` は「実際の非空テキスト選択」を表す値を渡すこと
 * （付箋マーカー自身への NodeSelection は含めない。
 * `CommandAvailability.hasNonAnchorTextSelection` を参照）。
 * それだけでは不十分なため、DOM selection と直近選択 cache も見る。
 */

export type NoteAnchorOnlyContextMenuInput = {
  pmHasSelection: boolean
  domHasTextSelection: boolean
  hadRecentEditorTextSelection: boolean
  domNoteAnchorContextId: string | null
}

function selectionEndpointInEditor(
  editorRoot: Element,
  node: Node | null,
): boolean {
  if (!node) return false
  const element =
    node.nodeType === 3
      ? (node as Text).parentElement
      : node instanceof Element
        ? node
        : null
  return element !== null && editorRoot.contains(element)
}

/** `window.getSelection()` が editor 内で非 collapsed か。 */
export function isNonCollapsedDomSelectionInEditor(
  editorRoot: Element,
  domSelection: Selection | null = typeof window !== 'undefined'
    ? window.getSelection()
    : null,
): boolean {
  if (!domSelection || domSelection.isCollapsed) return false
  if (
    !selectionEndpointInEditor(editorRoot, domSelection.anchorNode) ||
    !selectionEndpointInEditor(editorRoot, domSelection.focusNode)
  ) {
    return false
  }
  return domSelection.toString().length > 0
}

/** PM / DOM / 直近 cache のいずれかで editor 内テキスト選択があるか。 */
export function editorHasTextSelectionState(input: {
  pmHasSelection: boolean
  domHasTextSelection: boolean
  hadRecentEditorTextSelection: boolean
}): boolean {
  return (
    input.pmHasSelection ||
    input.domHasTextSelection ||
    input.hadRecentEditorTextSelection
  )
}

export function resolveNoteAnchorOnlyContextMenuId(
  input: NoteAnchorOnlyContextMenuInput,
): string | null {
  if (editorHasTextSelectionState(input)) return null
  return input.domNoteAnchorContextId
}

export function readEditorTextSelectionSignals(
  editorRoot: Element,
  core: EditorCoreHandle | null,
  domSelection: Selection | null = typeof window !== 'undefined'
    ? window.getSelection()
    : null,
): {
  pmHasSelection: boolean
  domHasTextSelection: boolean
  selectionRange: SelectionRange | null
} {
  const pmHasSelection = core?.getCommandAvailability().hasNonAnchorTextSelection ?? false
  const domHasTextSelection = isNonCollapsedDomSelectionInEditor(editorRoot, domSelection)
  return {
    pmHasSelection,
    domHasTextSelection,
    selectionRange: core?.getSelectionRange() ?? null,
  }
}

export function shouldPreferStandardContextMenuOverNoteAnchor(input: {
  pmHasSelection: boolean
  domHasTextSelection: boolean
  hadRecentEditorTextSelection: boolean
  snapshotHadTextSelection?: boolean
}): boolean {
  return editorHasTextSelectionState({
    pmHasSelection:
      input.pmHasSelection ||
      input.snapshotHadTextSelection === true,
    domHasTextSelection: input.domHasTextSelection,
    hadRecentEditorTextSelection: input.hadRecentEditorTextSelection,
  })
}
