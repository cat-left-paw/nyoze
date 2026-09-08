import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Selection, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { runHostHistoryCommand } from './hostHistoryCommand'
import type { LocalImeHistoryOperation } from './localImeHistoryHandoffState'
import { isProseMirrorHistoryTransaction } from './localImeHistoryTransaction'

export const LOCAL_IME_LOCAL_WINDOW_HISTORY_HANDOFF_REASON = 'local-window-history-handoff'

export type LocalImeHostHistoryTransactionCounts = {
  readonly total: number
  readonly docChanged: number
  readonly selectionOnly: number
}

export type LocalImeHostHistoryTransactionBatch = {
  readonly sequence: number
  readonly rootTransaction: Transaction
  readonly appendedTransactions: readonly Transaction[]
}

export type LocalImeLocalWindowHostHistoryFailure =
  | 'command-rejected'
  | 'command-threw-before-apply'
  | 'command-threw-after-apply'
  | 'command-invocation-count-mismatch'
  | 'command-dispatch-count-mismatch'
  | 'command-dispatch-dropped'
  | 'command-extra-transaction'
  | 'command-content-count-mismatch'
  | 'command-content-generation-mismatch'
  | 'command-selection-transaction'
  | 'command-batch-mismatch'
  | 'command-transaction-mismatch'
  | 'command-history-meta-missing'
  | 'command-root-not-docchanged'
  | 'command-appended-docchanged'
  | 'command-doc-mismatch'
  | 'command-selection-mismatch'
  | 'command-document-identity-changed'

export type LocalImeLocalWindowHostHistoryResult =
  | {
      readonly ok: true
      readonly operation: LocalImeHistoryOperation
      readonly commandInvocationCount: 1
      readonly commandDispatchCount: 1
      readonly contentGenerationDelta: 1
      readonly rootTransactionCount: 1
      readonly appendedDocChangedCount: 0
      readonly expectedDoc: ProseMirrorNode
      readonly expectedSelection: Selection
    }
  | {
      readonly ok: false
      readonly operation: LocalImeHistoryOperation
      readonly reason: LocalImeLocalWindowHostHistoryFailure
      readonly commandInvocationCount: number
      readonly commandDispatchCount: number
      readonly contentGenerationDelta: number
      readonly rootTransactionCount: number
      readonly appendedDocChangedCount: number
    }

const diff = (
  before: LocalImeHostHistoryTransactionCounts,
  after: LocalImeHostHistoryTransactionCounts,
) => ({
  total: after.total - before.total,
  docChanged: after.docChanged - before.docChanged,
  selectionOnly: after.selectionOnly - before.selectionOnly,
})

/** command callback自体の呼出回数を自己申告ではなくcaller counterで固定する。 */
export function isLocalImeLocalWindowHostHistoryCommandInvocationExact(
  invocationCount: number,
): invocationCount is 1 {
  return invocationCount === 1
}

/**
 * commandを一度だけ実行し、そのcommandがdispatch前に作ったTransactionをplanとして、
 * actual root/appended batchと最終host stateを同期照合する。
 */
export function runLocalImeLocalWindowHostHistoryCommand(input: {
  readonly operation: LocalImeHistoryOperation
  readonly hostView: EditorView
  readonly getDocumentIdentity: () => string
  readonly getTransactionCounts: () => LocalImeHostHistoryTransactionCounts
  readonly getContentGeneration: () => number
  readonly getTransactionSequence: () => number
  readonly getTransactionBatchesSince: (sequence: number) => readonly LocalImeHostHistoryTransactionBatch[]
  readonly dispatchCommandTransactionForTest?: (transaction: Transaction) => void
  readonly forceCommandRejectForTest?: boolean
}): LocalImeLocalWindowHostHistoryResult {
  const beforeIdentity = input.getDocumentIdentity()
  const beforeDoc = input.hostView.state.doc
  const beforeCounts = input.getTransactionCounts()
  const beforeContentGeneration = input.getContentGeneration()
  const beforeSequence = input.getTransactionSequence()
  let expectedTransaction: Transaction | null = null
  let expectedDoc: ProseMirrorNode | null = null
  let expectedSelection: Selection | null = null
  let commandDispatchCount = 0
  let commandThrew = false
  let handled = false
  let commandInvocationCount = 0
  try {
    commandInvocationCount += 1
    handled = input.forceCommandRejectForTest ? false : runHostHistoryCommand({
      operation: input.operation,
      getState: () => input.hostView.state,
      view: input.hostView,
      focus: () => input.hostView.focus(),
      dispatch: (transaction) => {
        commandDispatchCount += 1
        if (expectedTransaction === null) {
          expectedTransaction = transaction
          expectedDoc = transaction.doc
          expectedSelection = transaction.selection
        }
        if (input.dispatchCommandTransactionForTest) {
          input.dispatchCommandTransactionForTest(transaction)
        } else {
          input.hostView.dispatch(transaction)
        }
      },
    })
  } catch {
    commandThrew = true
  }

  const afterCounts = input.getTransactionCounts()
  const contentGenerationDelta = input.getContentGeneration() - beforeContentGeneration
  const delta = diff(beforeCounts, afterCounts)
  const batches = input.getTransactionBatchesSince(beforeSequence)
  const appendedDocChangedCount = batches.reduce(
    (count, batch) => count + batch.appendedTransactions.filter((tr) => tr.docChanged).length,
    0,
  )
  const failed = (
    reason: LocalImeLocalWindowHostHistoryFailure,
  ): LocalImeLocalWindowHostHistoryResult => ({
    ok: false,
    operation: input.operation,
    reason,
    commandInvocationCount,
    commandDispatchCount,
    contentGenerationDelta,
    rootTransactionCount: batches.length,
    appendedDocChangedCount,
  })

  if (!isLocalImeLocalWindowHostHistoryCommandInvocationExact(commandInvocationCount)) {
    return failed('command-invocation-count-mismatch')
  }
  if (commandThrew) {
    const beforeApply = input.hostView.state.doc === beforeDoc && delta.total === 0 && delta.docChanged === 0
    return failed(beforeApply ? 'command-threw-before-apply' : 'command-threw-after-apply')
  }
  if (!handled) return failed('command-rejected')
  if (
    commandDispatchCount !== 1 ||
    expectedTransaction === null ||
    expectedDoc === null ||
    expectedSelection === null
  ) {
    return failed('command-dispatch-count-mismatch')
  }
  if (delta.total === 0 && delta.docChanged === 0 && batches.length === 0) {
    return failed('command-dispatch-dropped')
  }
  if (delta.total !== 1 || batches.length > 1) return failed('command-extra-transaction')
  if (delta.docChanged !== 1) return failed('command-content-count-mismatch')
  if (contentGenerationDelta !== 1) return failed('command-content-generation-mismatch')
  if (delta.selectionOnly !== 0) return failed('command-selection-transaction')
  if (batches.length !== 1) return failed('command-batch-mismatch')
  const batch = batches[0]!
  if (!isProseMirrorHistoryTransaction(batch.rootTransaction)) {
    return failed('command-history-meta-missing')
  }
  if (!batch.rootTransaction.docChanged) return failed('command-root-not-docchanged')
  if (appendedDocChangedCount !== 0) return failed('command-appended-docchanged')
  if (!input.hostView.state.doc.eq(expectedDoc)) return failed('command-doc-mismatch')
  if (!input.hostView.state.selection.eq(expectedSelection)) {
    return failed('command-selection-mismatch')
  }
  if (batch.rootTransaction !== expectedTransaction) return failed('command-transaction-mismatch')
  if (input.getDocumentIdentity() !== beforeIdentity) {
    return failed('command-document-identity-changed')
  }
  return {
    ok: true,
    operation: input.operation,
    commandInvocationCount: 1,
    commandDispatchCount: 1,
    contentGenerationDelta: 1,
    rootTransactionCount: 1,
    appendedDocChangedCount: 0,
    expectedDoc,
    expectedSelection,
  }
}
