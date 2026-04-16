import { EditorState, Transaction } from '@codemirror/state'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { useRef } from 'react'

type SourceModeSelection = {
  anchor: number
  head: number
}

type SourceModeStateFactory = (
  doc: string,
  selection?: SourceModeSelection,
) => EditorState

type AttachedSourceModeEditor = {
  view: EditorView
  createState: SourceModeStateFactory
}

export type SourceModeController = {
  attachEditor: (editor: AttachedSourceModeEditor | null) => void
  subscribe: (listener: () => void) => () => void
  getStateVersion: () => number
  notifyStateChange: () => void
  hasEditor: () => boolean
  getValue: () => string | null
  setValue: (value: string, options?: { resetHistory?: boolean }) => void
  focus: () => void
  selectAll: () => void
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
}

function clampSelection(
  editor: AttachedSourceModeEditor,
  nextDoc: string,
): SourceModeSelection {
  const { main } = editor.view.state.selection
  const max = nextDoc.length
  return {
    anchor: Math.min(main.anchor, max),
    head: Math.min(main.head, max),
  }
}

export function useSourceModeController(): SourceModeController {
  const attachedEditorRef = useRef<AttachedSourceModeEditor | null>(null)
  const listenersRef = useRef(new Set<() => void>())
  const stateVersionRef = useRef(0)
  const controllerRef = useRef<SourceModeController | null>(null)

  if (controllerRef.current === null) {
    const emitStateChange = () => {
      stateVersionRef.current += 1
      listenersRef.current.forEach((listener) => listener())
    }

    controllerRef.current = {
      attachEditor(editor) {
        attachedEditorRef.current = editor
        emitStateChange()
      },
      subscribe(listener) {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      },
      getStateVersion() {
        return stateVersionRef.current
      },
      notifyStateChange() {
        emitStateChange()
      },
      hasEditor() {
        return attachedEditorRef.current !== null
      },
      getValue() {
        const editor = attachedEditorRef.current
        return editor ? editor.view.state.doc.toString() : null
      },
      setValue(value, options) {
        const editor = attachedEditorRef.current
        if (!editor) return

        if (options?.resetHistory) {
          editor.view.setState(editor.createState(value, clampSelection(editor, value)))
          emitStateChange()
          return
        }

        const currentValue = editor.view.state.doc.toString()
        if (currentValue === value) {
          return
        }

        editor.view.dispatch({
          changes: { from: 0, to: editor.view.state.doc.length, insert: value },
          selection: clampSelection(editor, value),
          annotations: Transaction.userEvent.of('input'),
        })
      },
      focus() {
        attachedEditorRef.current?.view.focus()
      },
      selectAll() {
        const editor = attachedEditorRef.current
        if (!editor) return
        editor.view.focus()
        editor.view.dispatch({
          selection: {
            anchor: 0,
            head: editor.view.state.doc.length,
          },
          scrollIntoView: true,
        })
      },
      undo() {
        const editor = attachedEditorRef.current
        if (!editor) return false
        editor.view.focus()
        return undo(editor.view)
      },
      redo() {
        const editor = attachedEditorRef.current
        if (!editor) return false
        editor.view.focus()
        return redo(editor.view)
      },
      canUndo() {
        const editor = attachedEditorRef.current
        return editor ? undoDepth(editor.view.state) > 0 : false
      },
      canRedo() {
        const editor = attachedEditorRef.current
        return editor ? redoDepth(editor.view.state) > 0 : false
      },
    }
  }

  return controllerRef.current
}
