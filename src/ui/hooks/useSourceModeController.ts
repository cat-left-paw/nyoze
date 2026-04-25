import { EditorState, Transaction } from '@codemirror/state'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
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
  /**
   * Snapshot the document offset nearest the center of the CodeMirror viewport.
   * Used to restore an approximate scroll position when leaving Source Mode.
   */
  captureViewportCenterOffset: () => number | null
  /**
   * Legacy name kept for compatibility with older wiring. It intentionally
   * returns the center offset now, matching the PM-side centered restore.
   */
  captureTopVisibleOffset: () => number | null
  /**
   * Scroll so the given document offset is near the viewport center.
   * No-op when offset is null or out of range. Does not steal focus.
   */
  scrollOffsetIntoView: (offset: number | null) => void
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
    const captureViewportCenterOffset = (): number | null => {
      const editor = attachedEditorRef.current
      if (!editor) return null
      const { view } = editor
      const scroller = view.scrollDOM
      const rect = scroller.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null

      // The PM restore centers the resolved position, so capture Source Mode's
      // viewport center too. Capturing the top edge here causes a half-screen
      // jump when returning to the regular editor.
      const probeY = rect.top + rect.height / 2
      try {
        const block = view.lineBlockAtHeight(probeY - view.documentTop)
        const blockCenter =
          block.to > block.from
            ? Math.floor((block.from + block.to) / 2)
            : block.from
        return Math.max(0, Math.min(blockCenter, view.state.doc.length))
      } catch {
        // Fall through to coordinate probing when CodeMirror has not measured
        // line blocks yet.
      }
      const contentRect = view.contentDOM.getBoundingClientRect()
      const probeX =
        contentRect.width > 0
          ? contentRect.left + Math.min(16, contentRect.width / 2)
          : rect.left + Math.min(16, rect.width / 2)
      const probes: Array<[number, number]> = [
        [probeX, probeY],
        [probeX, rect.top + rect.height * 0.45],
        [probeX, rect.top + rect.height * 0.55],
        [rect.left + rect.width / 2, probeY],
      ]
      for (const [x, y] of probes) {
        const pos = view.posAtCoords({ x, y }, false)
        if (typeof pos === 'number') {
          return Math.max(0, Math.min(pos, view.state.doc.length))
        }
      }
      return null
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
      captureViewportCenterOffset() {
        return captureViewportCenterOffset()
      },
      captureTopVisibleOffset() {
        return captureViewportCenterOffset()
      },
      scrollOffsetIntoView(offset) {
        const editor = attachedEditorRef.current
        if (!editor || offset === null) return
        const max = editor.view.state.doc.length
        const clamped = Math.max(0, Math.min(offset, max))
        editor.view.dispatch({
          effects: EditorView.scrollIntoView(clamped, { y: 'center' }),
        })
      },
    }
  }

  return controllerRef.current
}
