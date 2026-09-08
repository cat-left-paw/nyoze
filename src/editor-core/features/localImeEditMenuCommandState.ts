/** Local Window と renderer Edit menu routing が共有する typed command result。 */
export type LocalImeEditMenuOperation = 'undo' | 'redo' | 'select-all'

const EDIT_MENU_OPERATIONS: readonly LocalImeEditMenuOperation[] = [
  'undo',
  'redo',
  'select-all',
]

export function isLocalImeEditMenuOperation(
  value: unknown,
): value is LocalImeEditMenuOperation {
  return (
    typeof value === 'string' &&
    (EDIT_MENU_OPERATIONS as readonly string[]).includes(value)
  )
}

export type LocalImeEditMenuBlockedReason =
  | 'composing'
  | 'busy'
  | 'recovery-required'
  | 'state-mismatch'

export type LocalImeEditMenuCommandResult =
  | {
      status: 'handled'
      operation: LocalImeEditMenuOperation
      transactionCount: number
      noop: boolean
    }
  | { status: 'not-active' }
  | { status: 'blocked'; reason: LocalImeEditMenuBlockedReason }
  | {
      status: 'failed'
      retainedOperation: LocalImeEditMenuOperation
      reason: 'guard-rejected' | 'command-rejected' | 'dispatch-failed'
    }

export function shouldFallBackToNormalEditingForEditMenuCommand(
  result: LocalImeEditMenuCommandResult,
): boolean {
  return result.status === 'not-active'
}
