/**
 * Local Window — Home·End / Page表示系副作用 callback を
 * EditorCore から外へ寄せる。
 * EditorCore 行数予算を守りつつ、Typewriter / clamp / pseudo caret 入口の結線を 1 箇所に保つ。
 */

import type { EditorView } from '@tiptap/pm/view'
import { notifyLocalImeHomeEndNavigationHandoff } from './localImeHomeEndNavigationHandoff'
import { notifyLocalImePageUpDownNavigationHandoff } from './localImePageUpDownNavigationHandoff'

export type LocalImeNavigationHandoffWiringDeps = {
  view: EditorView
  noteTypewriterJumpSuppressHomeEnd?: () => void
  noteTypewriterJumpSuppressPageUpDown?: () => void
  notePseudoCaretIntent?: (event: KeyboardEvent) => void
}

export function createLocalImeNavigationHandoffCallbacks(
  deps: LocalImeNavigationHandoffWiringDeps,
): {
  onHomeEndNavigationHandoff: (event: KeyboardEvent) => void
  onPageUpDownNavigationHandoff: (event: KeyboardEvent) => void
} {
  return {
    onHomeEndNavigationHandoff: (event) =>
      notifyLocalImeHomeEndNavigationHandoff({
        event,
        noteTypewriterJumpSuppress: deps.noteTypewriterJumpSuppressHomeEnd,
        notePseudoCaretIntent: deps.notePseudoCaretIntent,
      }),
    onPageUpDownNavigationHandoff: () =>
      notifyLocalImePageUpDownNavigationHandoff({
        noteTypewriterJumpSuppress: deps.noteTypewriterJumpSuppressPageUpDown,
      }),
  }
}
