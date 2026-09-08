/**
 * LOCAL-WINDOW-FOLD-HANDOFF1 — fold 対象 heading の PM node identity。
 *
 * dirty Local Window commit は split / join で後続 heading の数値 position を
 * ずらす。commit 前の `headingPos` を無検証で再利用せず、同一 PM Node だけを
 * 最新 host Doc 上で再証明する。
 *
 * heading text・旧数値 pos・DOM / Markdown は identity にしない。
 */

import type { Node as PMNode } from '@tiptap/pm/model'

export type HeadingFoldTargetIdentity = {
  readonly node: PMNode
  readonly pos: number
}

export function captureHeadingFoldTarget(
  doc: PMNode,
  pos: number,
): HeadingFoldTargetIdentity | null {
  if (!Number.isInteger(pos) || pos < 0 || pos >= doc.content.size) return null
  let node: PMNode | null
  try {
    node = doc.nodeAt(pos)
  } catch {
    return null
  }
  if (!node || node.type.name !== 'heading') return null
  return { node, pos }
}

export function resolveHeadingFoldTarget(
  doc: PMNode,
  captured: HeadingFoldTargetIdentity,
): number | null {
  if (captured.node.type.name !== 'heading') return null
  const matches: number[] = []
  doc.descendants((node, pos) => {
    if (node === captured.node && node.type.name === 'heading') {
      matches.push(pos)
    }
    return true
  })
  return matches.length === 1 ? matches[0] : null
}
