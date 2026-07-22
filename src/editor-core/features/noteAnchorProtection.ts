import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { isValidNoteAnchorId, NOTE_ANCHOR_NODE_NAME } from '../io/noteAnchor'
import { findNoteAnchorPosition } from './noteAnchorNavigation'

export const NOTE_ANCHOR_DELETE_META_KEY = 'noteAnchorDelete'
export const NOTE_ANCHOR_DOCUMENT_LOAD_META_KEY = 'noteAnchorDocumentLoad'

export function collectNoteAnchorIdsInDoc(doc: ProseMirrorNode): string[] {
  const ids: string[] = []
  doc.descendants((node) => {
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
  state.doc.descendants((node, pos) => {
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
