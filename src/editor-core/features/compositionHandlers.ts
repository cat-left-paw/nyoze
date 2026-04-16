import type { EditorState } from '@tiptap/pm/state'
import { shouldBlockTcyTextInput } from './tcyFormatting'

type LogPush = (event: string, detail: string) => void

type CompositionEventHandlers = {
  onCompositionStart: () => void
  onCompositionUpdate: (event: CompositionEvent) => void
  onCompositionEnd: (event: CompositionEvent) => void
  onBeforeInput: (event: InputEvent) => void
  onInput: (event: Event) => void
  onKeyDown: (event: KeyboardEvent) => void
}

type CreateCompositionEventHandlersOptions = {
  getState: () => EditorState
  getIsComposing: () => boolean
  setIsComposing: (next: boolean) => void
  clearStoredMarks: () => boolean
  pushLog: LogPush
}

export function createCompositionEventHandlers({
  getState,
  getIsComposing,
  setIsComposing,
  clearStoredMarks,
  pushLog,
}: CreateCompositionEventHandlersOptions): CompositionEventHandlers {
  return {
    onCompositionStart() {
      setIsComposing(true)
      pushLog('compositionstart', '')
    },

    onCompositionUpdate(event: CompositionEvent) {
      pushLog('compositionupdate', event.data ?? '')
    },

    onCompositionEnd(event: CompositionEvent) {
      pushLog('compositionend', event.data ?? '')
      queueMicrotask(() => {
        setIsComposing(false)
        const changed = clearStoredMarks()
        if (changed) {
          pushLog('boundaryGuard', 'clearStoredMarks@compositionend')
        }
      })
    },

    onBeforeInput(event: InputEvent) {
      if (shouldBlockTcyTextInput(getState(), event.inputType)) {
        event.preventDefault()
        pushLog('tcyGuard', `blockedBeforeInput:${event.inputType ?? ''}`)
        return
      }
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
    },

    onKeyDown(event: KeyboardEvent) {
      if (!event.key.startsWith('Arrow')) return
      const label = `${event.shiftKey ? 'Shift+' : ''}${event.key}`
      pushLog('keydown', label)
    },
  }
}
