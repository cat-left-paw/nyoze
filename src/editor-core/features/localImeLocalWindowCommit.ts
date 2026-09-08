import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { LocalImeLocalWindowRange } from './localImeLocalWindowState'
import {
  areLocalImeLocalWindowSpecialInlinesPreserved,
  collectLocalImeLocalWindowSpecialInlines,
  isLocalImeLocalWindowCapableDoc,
} from './localImeLocalWindowCapability'

export type LocalImeLocalWindowCommitResult =
  | { ok: true; transaction: Transaction; mappedAnchor: number; mappedHead: number }
  | { ok: false; reason: 'local-doc-shape' | 'local-selection' | 'special-inline-changed' }

export function buildLocalImeLocalWindowCommit(input: {
  hostState: EditorState
  localState: EditorState
  range: LocalImeLocalWindowRange
}): LocalImeLocalWindowCommitResult {
  if (!isLocalImeLocalWindowCapableDoc(input.localState.doc)) {
    return { ok: false, reason: 'local-doc-shape' }
  }
  // LOCAL-WINDOW-SPECIALINLINE1: 現host range内のspecial-inline列とlocal docの列を
  // commit直前にも突き合わせる。capture時だけ通ってcommitで変質する経路を作らない。
  let hostSpecialInlines
  try {
    hostSpecialInlines = collectLocalImeLocalWindowSpecialInlines(
      input.hostState.doc.slice(input.range.from, input.range.to).content,
    )
  } catch {
    return { ok: false, reason: 'special-inline-changed' }
  }
  if (
    !areLocalImeLocalWindowSpecialInlinesPreserved(
      hostSpecialInlines,
      collectLocalImeLocalWindowSpecialInlines(input.localState.doc),
    )
  ) {
    return { ok: false, reason: 'special-inline-changed' }
  }
  const selection = input.localState.selection
  if (
    !(selection instanceof TextSelection) ||
    selection.$anchor.depth !== 1 ||
    selection.$head.depth !== 1 ||
    selection.anchor < 1 ||
    selection.head < 1 ||
    selection.anchor >= input.localState.doc.content.size ||
    selection.head >= input.localState.doc.content.size
  ) {
    return { ok: false, reason: 'local-selection' }
  }
  const mappedAnchor = input.range.from + selection.anchor
  const mappedHead = input.range.from + selection.head
  try {
    let transaction = input.hostState.tr.replaceWith(
      input.range.from,
      input.range.to,
      input.localState.doc.content,
    )
    transaction = transaction.setSelection(
      TextSelection.create(transaction.doc, mappedAnchor, mappedHead),
    )
    transaction.setMeta('addToHistory', true)
    closeHistory(transaction)
    transaction.setTime(0)
    return { ok: true, transaction, mappedAnchor, mappedHead }
  } catch {
    return { ok: false, reason: 'local-selection' }
  }
}

export function classifyLocalImeLocalWindowDispatchException(
  beforeDoc: ProseMirrorNode,
  currentDoc: ProseMirrorNode,
): 'before-apply' | 'after-apply' {
  return beforeDoc === currentDoc ? 'before-apply' : 'after-apply'
}

/** BOUNDED1 / SHRINK1 formal oracle: capture外の全top-level node列を独立比較する。 */
export function proveLocalImeLocalWindowOutsideRangeUnchanged(input: {
  before: ProseMirrorNode
  after: ProseMirrorNode
  capturedStartIndex: number
  capturedEndIndex: number
}): { readonly prefix: boolean; readonly suffix: boolean } {
  if (
    !Number.isInteger(input.capturedStartIndex) ||
    !Number.isInteger(input.capturedEndIndex) ||
    input.capturedStartIndex < 0 ||
    input.capturedEndIndex < input.capturedStartIndex ||
    input.capturedEndIndex >= input.before.childCount
  ) return { prefix: false, suffix: false }
  const beforeNodes = Array.from(
    { length: input.before.childCount },
    (_, index) => input.before.child(index),
  )
  const afterNodes = Array.from(
    { length: input.after.childCount },
    (_, index) => input.after.child(index),
  )
  const expectedPrefix = beforeNodes.slice(0, input.capturedStartIndex)
  const expectedSuffix = beforeNodes.slice(input.capturedEndIndex + 1)
  const actualPrefix = afterNodes.slice(0, expectedPrefix.length)
  const actualSuffix = expectedSuffix.length === 0
    ? []
    : afterNodes.slice(afterNodes.length - expectedSuffix.length)
  const sequenceEq = (
    expected: readonly ProseMirrorNode[],
    actual: readonly ProseMirrorNode[],
  ): boolean =>
    expected.length === actual.length &&
    expected.every((node, index) => node.eq(actual[index]!))
  return {
    prefix: sequenceEq(expectedPrefix, actualPrefix),
    suffix: sequenceEq(expectedSuffix, actualSuffix),
  }
}
