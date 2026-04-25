import { history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { SourceModeController } from '../hooks/useSourceModeController'
import { sourceModeHighlightStyle } from './sourceModeHighlightStyle'

type SourceModeEditorProps = {
  controller: SourceModeController
  initialValue: string
  /** Document offset to scroll near on mount. Null or out-of-range keeps the top. */
  initialScrollOffset?: number | null
  onChange: (value: string) => void
  onApply: () => void
  onClose: () => void
}

type SourceModeSelection = {
  anchor: number
  head: number
}

function buildSourceModeExtensions(options: {
  controller: SourceModeController
  onChangeRef: MutableRefObject<(value: string) => void>
  onApplyRef: MutableRefObject<() => void>
  onCloseRef: MutableRefObject<() => void>
}): Extension[] {
  const selectWholeDocument = (view: EditorView) => {
    view.dispatch({
      selection: {
        anchor: 0,
        head: view.state.doc.length,
      },
      scrollIntoView: true,
    })
    return true
  }

  return [
    history(),
    markdown(),
    syntaxHighlighting(sourceModeHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      'aria-label': 'Source Mode editor',
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off',
      autocomplete: 'off',
      'data-gramm': 'false',
    }),
    keymap.of([
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          options.onApplyRef.current()
          return true
        },
      },
      {
        key: 'Escape',
        preventDefault: true,
        run: () => {
          options.onCloseRef.current()
          return true
        },
      },
      {
        key: 'Mod-a',
        preventDefault: true,
        run: selectWholeDocument,
      },
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return
      options.controller.notifyStateChange()
      options.onChangeRef.current(update.state.doc.toString())
    }),
  ]
}

function createSourceModeState(
  doc: string,
  extensions: Extension[],
  selection?: SourceModeSelection,
): EditorState {
  return EditorState.create({
    doc,
    selection,
    extensions,
  })
}

export function SourceModeEditor({
  controller,
  initialValue,
  initialScrollOffset,
  onChange,
  onApply,
  onClose,
}: SourceModeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const initialValueRef = useRef(initialValue)
  const initialScrollOffsetRef = useRef(initialScrollOffset ?? null)
  const onChangeRef = useRef(onChange)
  const onApplyRef = useRef(onApply)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onChangeRef.current = onChange
    onApplyRef.current = onApply
    onCloseRef.current = onClose
  }, [onApply, onChange, onClose])

  useEffect(() => {
    const parent = hostRef.current
    if (!parent) return

    const extensions = buildSourceModeExtensions({
      controller,
      onChangeRef,
      onApplyRef,
      onCloseRef,
    })
    const createState = (
      doc: string,
      selection?: SourceModeSelection,
    ) => createSourceModeState(doc, extensions, selection)
    const view = new EditorView({
      state: createState(initialValueRef.current),
      parent,
    })

    controller.attachEditor({ view, createState })
    // Defer the initial scroll by two animation frames so CodeMirror finishes
    // its first measure pass before we request scrollIntoView. Running too
    // early lands on a zero-height viewport and silently no-ops.
    const pendingOffset = initialScrollOffsetRef.current
    if (typeof pendingOffset === 'number') {
      const raf1 = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          controller.scrollOffsetIntoView(pendingOffset)
        })
      })
      return () => {
        window.cancelAnimationFrame(raf1)
        controller.attachEditor(null)
        view.destroy()
      }
    }
    return () => {
      controller.attachEditor(null)
      view.destroy()
    }
  }, [controller])

  return (
    <div className='source-mode-overlay' data-writing-mode='horizontal-tb'>
      <div ref={hostRef} className='source-mode-host' />
    </div>
  )
}
