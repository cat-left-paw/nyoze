import { redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { LocalImeHistoryOperation } from './localImeHistoryHandoffState'

export type HostHistoryDepths = {
  readonly undo: number
  readonly redo: number
}

export function readHostHistoryDepths(state: EditorState): HostHistoryDepths {
  return { undo: undoDepth(state), redo: redoDepth(state) }
}

export function readRequestedHostHistoryDepth(
  state: EditorState,
  operation: LocalImeHistoryOperation,
): number {
  const depths = readHostHistoryDepths(state)
  return operation === 'undo' ? depths.undo : depths.redo
}

/**
 * 通常hostとLocal Window handoffが共有するProseMirror history command authority。
 * commandはexact 1回だけ呼び、dispatch差し替えはfailure injectionを含むcaller境界に限定する。
 */
export function runHostHistoryCommand(input: {
  readonly operation: LocalImeHistoryOperation
  readonly getState: () => EditorState
  readonly dispatch: (transaction: Transaction) => void
  readonly focus: () => void
  readonly view?: EditorView
}): boolean {
  input.focus()
  const command = input.operation === 'undo' ? undo : redo
  return command(input.getState(), input.dispatch, input.view)
}
