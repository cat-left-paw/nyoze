import type { Node as PMNode } from '@tiptap/pm/model'
import type { HeadingInfo } from '../types'
import { indexDocumentHeadings } from './documentNodeIndex'

// UI tokens deliberately contain no Doc/node. Only the latest snapshot owns
// that association, so a stale React closure cannot keep old documents alive.
const targetBrand: unique symbol = Symbol('outline-heading-target')
export type OutlineHeadingTarget = Readonly<{ [targetBrand]: true }>
export type OutlineHeadingRow = HeadingInfo & { target: OutlineHeadingTarget }

export function createOutlineTargetReferences() {
  let snapshot: {
    owner: object
    doc: PMNode
    rows: OutlineHeadingRow[]
    nodes: Map<OutlineHeadingTarget, Readonly<{ node: PMNode; pos: number }>>
    unique: Set<PMNode>
  } | null = null
  let active: { doc: PMNode; index: number } | null = null

  function invalidate() { snapshot = null; active = null }

  function publish(owner: object, doc: PMNode, headings: HeadingInfo[]) {
    if (snapshot?.owner === owner && snapshot.doc === doc) return snapshot.rows
    const entries = indexDocumentHeadings(doc)
    const nodes = new Map<OutlineHeadingTarget, Readonly<{ node: PMNode; pos: number }>>()
    const counts = new Map<PMNode, number>()
    for (const { node } of entries) counts.set(node, (counts.get(node) ?? 0) + 1)
    const unique = new Set([...counts].filter(([, count]) => count === 1).map(([node]) => node))
    // Old rows remain rendered until React commits. Carry only tokens whose
    // node is unique in both snapshots; keep no previous Doc after publish.
    const inherited = new Map<PMNode, OutlineHeadingTarget>()
    if (snapshot?.owner === owner) {
      for (const [target, { node }] of snapshot.nodes) {
        if (snapshot.unique.has(node) && unique.has(node)) inherited.set(node, target)
      }
    }
    const rows = headings.map((heading, index): OutlineHeadingRow => {
      const entry = entries[index]
      const target: OutlineHeadingTarget =
        (entry?.pos === heading.pos ? inherited.get(entry.node) : undefined) ?? { [targetBrand]: true }
      // The snapshot and index must describe the same Doc. A mismatch fails
      // closed rather than finding a similarly named/numbered heading.
      if (entry?.pos === heading.pos) nodes.set(target, entry)
      return { ...heading, target }
    })
    snapshot = { owner, doc, rows, nodes, unique }
    return rows
  }

  function resolve(owner: object, doc: PMNode, target: OutlineHeadingTarget) {
    if (snapshot?.owner !== owner) return null
    const entry = snapshot.nodes.get(target)
    if (!entry) return null
    // In this exact immutable Doc, the snapshot position is itself a proof.
    // Duplicated node objects are distinct rows, and need no identity search.
    if (snapshot.doc === doc) return entry.pos
    const node = entry.node
    if (!snapshot.unique.has(node)) return null
    let pos: number | null = null
    for (const entry of indexDocumentHeadings(doc)) {
      if (entry.node !== node) continue
      if (pos !== null) return null
      pos = entry.pos
    }
    return pos
  }

  // Selection updates already compute an index. Record its source in O(1);
  // never apply a live index directly to rows from an older document.
  function recordActive(doc: PMNode, index: number) { active = { doc, index } }
  function activeTarget(owner: object, doc: PMNode, index: number) {
    if (snapshot?.owner !== owner || snapshot.doc !== doc || active?.doc !== doc || active.index !== index) return null
    const target = snapshot.rows[index]?.target
    return target && snapshot.nodes.has(target) ? target : null
  }

  return { publish, resolve, invalidate, recordActive, activeTarget }
}
