import { history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import {
  isBareArrowKey,
  isMacOsRenderer,
  maybeScheduleMacosArrowScrollClamp,
  readSinceLastInteractionMs,
  registerMacosArrowScrollClampHostInteractions,
} from '../../editor-core/features/macosArrowScrollClamp'
import type { SourceModeController } from '../hooks/useSourceModeController'
import type { TypewriterRuntimeRef } from '../hooks/typewriterRuntimeRef'
import { sourceModeHighlightStyle } from './sourceModeHighlightStyle'

type SourceModeEditorProps = {
  controller: SourceModeController
  /** Optional: Typewriter + macOS clamp snapshot (defaults to clamp on / typewriter off). */
  editorRuntimeRef?: TypewriterRuntimeRef
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
  editorRuntimeRef?: TypewriterRuntimeRef
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
    EditorView.domEventHandlers({
      keydown: (event, view) => {
        if (!isBareArrowKey(event)) return false
        const host = view.scrollDOM
        const { sinceLastWheelMs, sinceLastPointerDragMs } = readSinceLastInteractionMs(host)
        const rt = options.editorRuntimeRef?.current
        maybeScheduleMacosArrowScrollClamp(host, event, {
          clampSettingEnabled: rt?.macosArrowScrollClampEnabled !== false,
          isMacOS: isMacOsRenderer(),
          typewriterEnabled: rt?.enabled === true,
          wysiwygSuppressForSourceMode: false,
          paragraphPlainActive: false,
          composing: event.isComposing,
          selectionCollapsed: view.state.selection.main.empty,
          defaultPrevented: event.defaultPrevented,
          sinceLastWheelMs,
          sinceLastPointerDragMs,
        })
        return false
      },
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
  editorRuntimeRef,
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
      editorRuntimeRef,
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
    let unregisterClampHost: (() => void) | null = registerMacosArrowScrollClampHostInteractions(
      view.scrollDOM,
    )
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
        unregisterClampHost?.()
        unregisterClampHost = null
        controller.attachEditor(null)
        view.destroy()
      }
    }
    return () => {
      unregisterClampHost?.()
      unregisterClampHost = null
      controller.attachEditor(null)
      view.destroy()
    }
  }, [controller, editorRuntimeRef])

  return (
    <div className='source-mode-overlay' data-writing-mode='horizontal-tb'>
      <div ref={hostRef} className='source-mode-host' />
    </div>
  )
}
