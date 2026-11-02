import { indexDocumentNoteAnchors } from './documentNodeIndex'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * PM doc 内の noteAnchor node の開始位置を id で検索する。
 * 見つからなければ null。
 */
export function findNoteAnchorPosition(doc: ProseMirrorNode, id: string): number | null {
  if (!id) return null
  return indexDocumentNoteAnchors(doc).find(({ node }) => node.attrs.id === id)?.pos ?? null
}
