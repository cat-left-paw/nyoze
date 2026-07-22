import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * PM doc 内の noteAnchor node の開始位置を id で検索する。
 * 見つからなければ null。
 */
export function findNoteAnchorPosition(doc: ProseMirrorNode, id: string): number | null {
  if (!id) return null
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === 'noteAnchor' && node.attrs.id === id) {
      found = pos
      return false
    }
    return true
  })
  return found
}
