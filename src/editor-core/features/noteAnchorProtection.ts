import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { isValidNoteAnchorId, NOTE_ANCHOR_NODE_NAME } from '../io/noteAnchor'
import { indexDocumentNoteAnchors } from './documentNodeIndex'
import { findNoteAnchorPosition } from './noteAnchorNavigation'

export const NOTE_ANCHOR_DELETE_META_KEY = 'noteAnchorDelete'
export const NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY = 'noteAnchorDocumentLoad'
/**
 * STICKY-NOTE-LIFECYCLE1: prosemirror-history が Undo / Redo の transaction に付ける meta
 * （`new PluginKey('history')` の key）。history の transaction は anchor を出し入れしてよい。
 * 付箋データは保存まで notes.json に残っているので、Undo で anchor が戻れば付箋も戻る。
 * `tests/sticky-note-lifecycle1.test.ts` が実 `history()` でこの key を固定している。
 */
export const HISTORY_TRANSACTION_META_KEY = 'history$'
/**
 * STICKY-NOTE-LIFECYCLE1（N4）: Paragraph Plain の確定（段落の Markdown の再解釈）に付ける meta。
 * Source Mode の適用と同じ考え方で、段落の編集でコメントが消えても通す（付箋は「マーカーのない付箋」
 * として右ペインに残り、notes.json は書かない）。読み込みの meta は流用しない。
 */
export const NOTE_ANCHOR_PARAGRAPH_PLAIN_COMMIT_META_KEY = 'noteAnchorParagraphPlainCommit'

export const noteAnchorProtectionPluginKey = new PluginKey('noteAnchorProtection')

/** anchor を消す transaction を通してよいか（専用削除・文書の読み込み・Undo / Redo だけ）。 */
export function isNoteAnchorRemovalAllowed(tr: Transaction): boolean {
  return Boolean(
    tr.getMeta(NOTE_ANCHOR_DELETE_META_KEY) ||
      tr.getMeta(NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY) ||
      tr.getMeta(NOTE_ANCHOR_PARAGRAPH_PLAIN_COMMIT_META_KEY) ||
      tr.getMeta(HISTORY_TRANSACTION_META_KEY),
  )
}

/**
 * production の保護 plugin。Tiptap extension はこれをそのまま登録する（unit test も同じ instance を使う）。
 */
export function createNoteAnchorProtectionPlugin(): Plugin {
  return new Plugin({
    key: noteAnchorProtectionPluginKey,
    state: {
      init: (_, state) => { indexDocumentNoteAnchors(state.doc); return null },
      apply: (_tr, value) => value,
    },
    filterTransaction(tr, state) {
      if (!tr.docChanged) return true
      if (isNoteAnchorRemovalAllowed(tr)) return true
      if (!transactionRemovesNoteAnchor(tr, state.doc)) return true
      return false
    },
    appendTransaction(_transactions, _oldState, newState) {
      return buildStripNoteAnchorMarksTransaction(newState)
    },
  })
}

export function collectNoteAnchorIdsInDoc(doc: ProseMirrorNode): string[] {
  const ids: string[] = []
  indexDocumentNoteAnchors(doc).forEach(({ node }) => {
    if (node.type.name !== NOTE_ANCHOR_NODE_NAME) return true
    const id = (node.attrs.id as string) ?? ''
    if (isValidNoteAnchorId(id)) ids.push(id)
    return true
  })
  return ids
}

export function collectNoteAnchorIdsInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): string[] {
  const ids: string[] = []
  doc.nodesBetween(from, to, (node) => {
    if (node.type.name !== NOTE_ANCHOR_NODE_NAME) return true
    const id = (node.attrs.id as string) ?? ''
    if (isValidNoteAnchorId(id)) ids.push(id)
    return false
  })
  return ids
}

export function resolveNoteAnchorIdAtTarget(target: EventTarget | null): string | null {
  const element = (() => {
    if (!target || typeof target !== 'object') return null
    if (typeof Element !== 'undefined' && target instanceof Element) return target
    if (typeof Text !== 'undefined' && target instanceof Text) return target.parentElement
    const node = target as { nodeType?: number; parentElement?: Element | null }
    if (node.nodeType === 1) return target as Element
    if (node.nodeType === 3) return node.parentElement ?? null
    return null
  })()
  if (!element) return null
  const marker = element.closest('.note-anchor[data-note-anchor-id]')
  if (!(marker instanceof Element)) return null
  const id = marker.getAttribute('data-note-anchor-id')
  return id && isValidNoteAnchorId(id) ? id : null
}

/** 現在の selection が付箋マーカー自身への NodeSelection か。 */
export function isNoteAnchorNodeSelection(state: EditorState): boolean {
  const { selection } = state
  return selection instanceof NodeSelection && selection.node.type.name === NOTE_ANCHOR_NODE_NAME
}

export function resolveNoteAnchorContextId(state: EditorState): string | null {
  const { selection } = state
  if (isNoteAnchorNodeSelection(state)) {
    const id = ((selection as NodeSelection).node.attrs.id as string) ?? ''
    return isValidNoteAnchorId(id) ? id : null
  }
  const ids = collectNoteAnchorIdsInRange(state.doc, selection.from, selection.to)
  if (ids.length === 1) return ids[0]
  return null
}

export function selectionTouchesNoteAnchor(state: EditorState): boolean {
  const { selection } = state
  if (isNoteAnchorNodeSelection(state)) {
    return true
  }
  if (!selection.empty) {
    return collectNoteAnchorIdsInRange(state.doc, selection.from, selection.to).length > 0
  }
  const { $from } = selection
  if ($from.nodeBefore?.type.name === NOTE_ANCHOR_NODE_NAME) return true
  if ($from.nodeAfter?.type.name === NOTE_ANCHOR_NODE_NAME) return true
  return false
}

export function transactionRemovesNoteAnchor(tr: Transaction, oldDoc: ProseMirrorNode): boolean {
  const oldIds = new Set(collectNoteAnchorIdsInDoc(oldDoc))
  const newIds = new Set(collectNoteAnchorIdsInDoc(tr.doc))
  for (const id of oldIds) {
    if (!newIds.has(id)) return true
  }
  return false
}

export function buildStripNoteAnchorMarksTransaction(state: EditorState): Transaction | null {
  let tr: Transaction | null = null
  indexDocumentNoteAnchors(state.doc).forEach(({ node, pos }) => {
    if (node.type.name !== NOTE_ANCHOR_NODE_NAME) return true
    if (node.marks.length === 0) return true
    if (!tr) tr = state.tr
    tr = tr.setNodeMarkup(pos, undefined, node.attrs, [])
    return true
  })
  return tr
}

export function noteAnchorExistsInDoc(doc: ProseMirrorNode, id: string): boolean {
  return findNoteAnchorPosition(doc, id) !== null
}
