import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { shouldBlockTcyTextInput } from './tcyFormatting'
import {
  handleRubyBaseBeforeInput,
  handleRubyBaseCompositionEnd,
  handleRubyBaseCompositionStart,
} from './rubyBoundarySelection'
import {
  emitSpecialInlineBoundaryDiag,
  emitSpecialInlineCompositionUpdateDiag,
  selectionTouchesSpecialInlineNode,
} from './specialInlineBoundaryDiagnostics'

type LogPush = (event: string, detail: string) => void

type CompositionEventHandlers = {
  onCompositionStart: (event: CompositionEvent) => void
  onCompositionUpdate: (event: CompositionEvent) => void
  onCompositionEnd: (event: CompositionEvent) => void
  onBeforeInput: (event: InputEvent) => void
  onInput: (event: Event) => void
  onKeyDown: (event: KeyboardEvent) => void
}

type CreateCompositionEventHandlersOptions = {
  getState: () => EditorState
  getView: () => EditorView
  getIsComposing: () => boolean
  setIsComposing: (next: boolean) => void
  noteTypewriterBeforeInput?: (event: InputEvent) => void
  scheduleVisualFocusCurrentLineUpdate?: () => void
  clearStoredMarks: () => boolean
  pushLog: LogPush
}

export function createCompositionEventHandlers({
  getState,
  getView,
  getIsComposing,
  setIsComposing,
  noteTypewriterBeforeInput,
  scheduleVisualFocusCurrentLineUpdate,
  clearStoredMarks,
  pushLog,
}: CreateCompositionEventHandlersOptions): CompositionEventHandlers {
  return {
    onCompositionStart(event: CompositionEvent) {
      emitSpecialInlineBoundaryDiag(pushLog, {
        phase: 'compositionstart:beforeRubyFallback',
        view: getView(),
        state: getState(),
        appComposing: getIsComposing(),
        compositionData: event.data ?? '',
        eventTarget: event.target,
      })
      handleRubyBaseCompositionStart(getView(), event, { pushLog })
      setIsComposing(true)
      pushLog('compositionstart', '')
      emitSpecialInlineBoundaryDiag(pushLog, {
        phase: 'compositionstart:afterRubyFallback',
        view: getView(),
        state: getState(),
        appComposing: true,
        compositionData: event.data ?? '',
        eventTarget: event.target,
      })
    },

    onCompositionUpdate(event: CompositionEvent) {
      pushLog('compositionupdate', event.data ?? '')
      emitSpecialInlineCompositionUpdateDiag(pushLog, {
        phase: 'compositionupdate',
        view: getView(),
        state: getState(),
        appComposing: getIsComposing(),
        compositionData: event.data ?? '',
        eventTarget: event.target,
      })
      scheduleVisualFocusCurrentLineUpdate?.()
    },

    onCompositionEnd(event: CompositionEvent) {
      pushLog('compositionend', event.data ?? '')
      emitSpecialInlineBoundaryDiag(pushLog, {
        phase: 'compositionend',
        view: getView(),
        state: getState(),
        appComposing: getIsComposing(),
        compositionData: event.data ?? '',
        eventTarget: event.target,
      })
      handleRubyBaseCompositionEnd(getView(), event, { pushLog })
      queueMicrotask(() => {
        setIsComposing(false)
        const changed = clearStoredMarks()
        if (changed) {
          pushLog('boundaryGuard', 'clearStoredMarks@compositionend')
        }
      })
    },

    onBeforeInput(event: InputEvent) {
      if (handleRubyBaseBeforeInput(getView(), event, { pushLog })) return
      const nearBoundaryDiag =
        selectionTouchesSpecialInlineNode(getState()) ||
        getIsComposing() ||
        getView().composing ||
        Boolean(event.inputType?.startsWith('insertComposition'))
      if (nearBoundaryDiag) {
        emitSpecialInlineBoundaryDiag(pushLog, {
          phase: 'beforeinput',
          view: getView(),
          state: getState(),
          appComposing: getIsComposing(),
          inputType: event.inputType,
          inputData: event.data ?? null,
          eventTarget: event.target,
        })
      }
      if (shouldBlockTcyTextInput(getState(), event.inputType)) {
        event.preventDefault()
        pushLog('tcyGuard', `blockedBeforeInput:${event.inputType ?? ''}`)
        return
      }
      noteTypewriterBeforeInput?.(event)
      if (getIsComposing()) return
      if (event.inputType?.startsWith('insertComposition')) return
      const changed = clearStoredMarks()
      if (changed) {
        pushLog('boundaryGuard', `clearStoredMarks@beforeinput:${event.inputType ?? ''}`)
      }
    },

    onInput(event: Event) {
      const inputEvent = event as InputEvent
      pushLog('input', inputEvent.inputType ?? '')
      const nearBoundaryDiag =
        selectionTouchesSpecialInlineNode(getState()) ||
        getIsComposing() ||
        getView().composing
      if (nearBoundaryDiag) {
        emitSpecialInlineBoundaryDiag(pushLog, {
          phase: 'input',
          view: getView(),
          state: getState(),
          appComposing: getIsComposing(),
          inputType: inputEvent.inputType,
          inputData: inputEvent.data ?? null,
          eventTarget: event.target,
        })
      }
    },

    onKeyDown(event: KeyboardEvent) {
      const nearBoundaryDiag =
        selectionTouchesSpecialInlineNode(getState()) ||
        getIsComposing() ||
        getView().composing
      if (nearBoundaryDiag) {
        emitSpecialInlineBoundaryDiag(pushLog, {
          phase: 'keydown',
          view: getView(),
          state: getState(),
          appComposing: getIsComposing(),
          key: event.key,
          code: event.code,
          eventTarget: event.target,
        })
      }
      if (!event.key.startsWith('Arrow')) return
      const label = `${event.shiftKey ? 'Shift+' : ''}${event.key}`
      pushLog('keydown', label)
    },
  }
}
