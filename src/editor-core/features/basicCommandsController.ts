import type { Editor } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { resolveSelectedTcyRanges } from './tcyFormatting'

type Dispatch = (tr: Transaction) => void
type LogPush = (event: string, detail: string) => void

type ToggleMarkCommand = 'bold' | 'italic' | 'strike' | 'highlight'

type CreateBasicCommandsControllerOptions = {
  editor: Editor
  getIsComposing: () => boolean
  pushLog: LogPush
  clearCheckedChecklistItemsInRange: (
    state: EditorState,
    from: number,
    to: number,
    dispatch?: Dispatch,
  ) => number
  toggleChecklistItemAtSelection: (state: EditorState, dispatch?: Dispatch) => boolean
  toggleChecklistInSelection: (state: EditorState, dispatch?: Dispatch) => boolean
  moveListItemUp: (state: EditorState, dispatch?: Dispatch) => boolean
  moveListItemDown: (state: EditorState, dispatch?: Dispatch) => boolean
}

export function createBasicCommandsController({
  editor,
  getIsComposing,
  pushLog,
  clearCheckedChecklistItemsInRange,
  toggleChecklistItemAtSelection,
  toggleChecklistInSelection,
  moveListItemUp,
  moveListItemDown,
}: CreateBasicCommandsControllerOptions): {
  undo: () => boolean
  redo: () => boolean
  execute: (command: ToggleMarkCommand) => void
  toggleInlineCode: () => void
  clearFormat: () => void
  toggleChecklistChecked: () => void
  toggleChecklist: () => void
  toggleBulletList: () => void
  toggleOrderedList: () => void
  toggleBlockquote: () => void
  toggleCodeBlock: () => void
  insertHorizontalRule: () => void
  moveListItemUp: () => boolean
  selectAll: () => void
  moveListItemDown: () => boolean
} {
  const dispatch = (tr: Transaction) => editor.view.dispatch(tr)

  function undo(): boolean {
    if (getIsComposing()) return false
    const changed = editor.chain().focus().undo().run()
    if (changed) pushLog('command', 'undo')
    return changed
  }

  function redo(): boolean {
    if (getIsComposing()) return false
    const changed = editor.chain().focus().redo().run()
    if (changed) pushLog('command', 'redo')
    return changed
  }

  function execute(command: ToggleMarkCommand): void {
    if (getIsComposing()) return
    if (command === 'bold') editor.chain().focus().toggleBold().run()
    if (command === 'italic') editor.chain().focus().toggleItalic().run()
    if (command === 'strike') editor.chain().focus().toggleStrike().run()
    if (command === 'highlight') editor.chain().focus().toggleMark('highlight').run()
    pushLog('command', `toggle-${command}`)
  }

  function toggleInlineCode(): void {
    if (getIsComposing()) return
    editor.chain().focus().toggleCode().run()
    pushLog('command', 'toggle-inline-code')
  }

  function clearFormat(): void {
    if (getIsComposing()) return
    const initialState = editor.state
    const initialSelection = initialState.selection
    const clearedTcyRanges = resolveSelectedTcyRanges(initialState)
    if (initialSelection.empty && clearedTcyRanges.length === 0) return

    let tr = initialState.tr
    for (let index = clearedTcyRanges.length - 1; index >= 0; index--) {
      const range = clearedTcyRanges[index]
      if (!range) continue
      tr = tr.replaceWith(range.from, range.to, initialState.schema.text(range.text))
    }

    const mappedFrom = tr.mapping.map(initialSelection.from, -1)
    const mappedTo = tr.mapping.map(initialSelection.to, 1)
    tr = tr.removeMark(mappedFrom, mappedTo)
    dispatch(tr)

    const uncheckedCount = clearCheckedChecklistItemsInRange(editor.state, mappedFrom, mappedTo, dispatch)
    pushLog('command', `clearFormat unchecked=${uncheckedCount} clearedTcy=${clearedTcyRanges.length}`)
  }

  function toggleChecklistChecked(): void {
    if (getIsComposing()) return
    const changed = toggleChecklistItemAtSelection(editor.state, dispatch)
    if (changed) pushLog('command', 'toggleChecklistChecked')
  }

  function toggleChecklist(): void {
    if (getIsComposing()) return
    let changed = toggleChecklistInSelection(editor.state, dispatch)
    if (!changed) {
      const listChanged = editor.chain().focus().toggleBulletList().run()
      if (!listChanged) return
      changed = toggleChecklistInSelection(editor.state, dispatch)
    }
    if (changed) pushLog('command', 'toggleChecklist')
  }

  function toggleBulletList(): void {
    if (getIsComposing()) return
    editor.chain().focus().toggleBulletList().run()
    pushLog('command', 'toggleBulletList')
  }

  function toggleOrderedList(): void {
    if (getIsComposing()) return
    editor.chain().focus().toggleOrderedList().run()
    pushLog('command', 'toggleOrderedList')
  }

  function toggleBlockquote(): void {
    if (getIsComposing()) return
    editor.chain().focus().toggleBlockquote().run()
    pushLog('command', 'toggleBlockquote')
  }

  function toggleCodeBlock(): void {
    if (getIsComposing()) return
    editor.chain().focus().toggleCodeBlock().run()
    pushLog('command', 'toggleCodeBlock')
  }

  function insertHorizontalRule(): void {
    if (getIsComposing()) return
    editor.chain().focus().setHorizontalRule().run()
    pushLog('command', 'insertHorizontalRule')
  }

  function moveListItemUpCommand(): boolean {
    if (getIsComposing()) return false
    const moved = moveListItemUp(editor.state, dispatch)
    if (moved) pushLog('command', 'moveListItemUp')
    return moved
  }

  function selectAll(): void {
    if (getIsComposing()) return
    editor.chain().focus().selectAll().run()
    pushLog('command', 'selectAll')
  }

  function moveListItemDownCommand(): boolean {
    if (getIsComposing()) return false
    const moved = moveListItemDown(editor.state, dispatch)
    if (moved) pushLog('command', 'moveListItemDown')
    return moved
  }

  return {
    undo,
    redo,
    execute,
    toggleInlineCode,
    clearFormat,
    toggleChecklistChecked,
    toggleChecklist,
    toggleBulletList,
    toggleOrderedList,
    toggleBlockquote,
    toggleCodeBlock,
    insertHorizontalRule,
    moveListItemUp: moveListItemUpCommand,
    selectAll,
    moveListItemDown: moveListItemDownCommand,
  }
}
