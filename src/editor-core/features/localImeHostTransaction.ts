import type { Transaction } from '@tiptap/pm/state'

export type LocalImeHostTransactionKind =
  | 'content'
  | 'blur-meta'
  | 'focus-meta'
  | 'selection-only'
  | 'other-noncontent'

export type LocalImeHostTransactionCounts = {
  total: number
  docChanged: number
  blurMeta: number
  focusMeta: number
  selectionOnly: number
  otherNonContent: number
}

export function classifyLocalImeHostTransaction(
  transaction: Transaction,
): LocalImeHostTransactionKind {
  if (transaction.docChanged) return 'content'
  if (transaction.getMeta('blur') != null) return 'blur-meta'
  if (transaction.getMeta('focus') != null) return 'focus-meta'
  if (transaction.selectionSet) return 'selection-only'
  return 'other-noncontent'
}

export function noteLocalImeHostTransaction(
  counts: LocalImeHostTransactionCounts,
  transaction: Transaction,
): void {
  counts.total += 1
  switch (classifyLocalImeHostTransaction(transaction)) {
    case 'content':
      counts.docChanged += 1
      break
    case 'blur-meta':
      counts.blurMeta += 1
      break
    case 'focus-meta':
      counts.focusMeta += 1
      break
    case 'selection-only':
      counts.selectionOnly += 1
      break
    case 'other-noncontent':
      counts.otherNonContent += 1
      break
  }
}

export function diffLocalImeHostTransactionKinds(
  before: LocalImeHostTransactionCounts,
  after: LocalImeHostTransactionCounts,
): LocalImeHostTransactionKind[] {
  const result: LocalImeHostTransactionKind[] = []
  const append = (kind: LocalImeHostTransactionKind, count: number) => {
    for (let index = 0; index < count; index += 1) result.push(kind)
  }
  append('content', after.docChanged - before.docChanged)
  append('blur-meta', after.blurMeta - before.blurMeta)
  append('focus-meta', after.focusMeta - before.focusMeta)
  append('selection-only', after.selectionOnly - before.selectionOnly)
  append('other-noncontent', after.otherNonContent - before.otherNonContent)
  return result
}
