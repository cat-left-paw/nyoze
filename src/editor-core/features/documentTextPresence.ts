import type { Node as PMNode } from '@tiptap/pm/model'

const presence = new WeakMap<PMNode, boolean>()

/** Same predicate as textContent.length > 0, without concatenating the document. */
export function hasDocumentText(node: PMNode): boolean {
  const cached = presence.get(node)
  if (cached !== undefined) return cached
  let result = node.isText ? !!node.text?.length
    : node.isLeaf ? !!node.type.spec.leafText?.(node).length : false
  for (let i = 0; !result && i < node.childCount; i++) result = hasDocumentText(node.child(i))
  presence.set(node, result)
  return result
}
