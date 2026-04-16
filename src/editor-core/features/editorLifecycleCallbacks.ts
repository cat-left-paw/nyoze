import type { EditorState } from '@tiptap/pm/state'
import type { SelectionListener, UpdateListener } from '../types'

type LogPush = (event: string, detail: string) => void

type SelectionUpdatePayload = {
  editor: {
    state: EditorState
  }
}

type CreateEditorLifecycleCallbacksOptions = {
  selectionListeners: Set<SelectionListener>
  updateListeners: Set<UpdateListener>
  pushLog: LogPush
}

export function createEditorLifecycleCallbacks({
  selectionListeners,
  updateListeners,
  pushLog,
}: CreateEditorLifecycleCallbacksOptions): {
  onSelectionUpdate: (payload: SelectionUpdatePayload) => void
  onUpdate: () => void
} {
  function onSelectionUpdate({ editor }: SelectionUpdatePayload): void {
    const { from, to, empty } = editor.state.selection
    const snapshot = `from=${from} to=${to} empty=${empty}`
    for (const listener of selectionListeners) {
      listener(snapshot)
    }
    pushLog('selectionUpdate', snapshot)
  }

  function onUpdate(): void {
    for (const listener of updateListeners) {
      listener()
    }
  }

  return {
    onSelectionUpdate,
    onUpdate,
  }
}
