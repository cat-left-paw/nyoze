import type { Node as PMNode } from '@tiptap/pm/model'

export type IndexedDocumentNode = Readonly<{ node: PMNode; pos: number }>

/**
 * Positions are relative to the node's content. PM nodes are immutable: after
 * an edit, reuse unchanged branches and rebuild only new ancestors' indexes.
 * Rebuilding the root still visits its direct children, but never their cached
 * descendants. Keep this index private; callers expose fresh UI arrays.
 */
export function createDocumentNodeIndex(name: string) {
  const cache = new WeakMap<PMNode, readonly IndexedDocumentNode[]>()
  const empty: readonly IndexedDocumentNode[] = []
  function collect(node: PMNode): readonly IndexedDocumentNode[] {
    if (node.isLeaf) return empty
    const cached = cache.get(node)
    if (cached) return cached
    const entries: IndexedDocumentNode[] = []
    node.forEach((child, offset) => {
      if (child.type.name === name) entries.push({ node: child, pos: offset })
      else for (const entry of collect(child)) {
        entries.push({ node: entry.node, pos: offset + 1 + entry.pos })
      }
    })
    const result = entries.length ? entries : empty
    cache.set(node, result)
    return result
  }
  return collect
}

export const indexDocumentHeadings = createDocumentNodeIndex('heading')
export const indexDocumentNoteAnchors = createDocumentNodeIndex('noteAnchor')
