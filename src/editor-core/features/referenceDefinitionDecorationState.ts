import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { isReferenceDefinitionLineText } from '../io/parseMarkdown'
import { changedBlockRanges } from './autoTcyDecorationState'

/**
 * MD-ESCAPE-EXPLICIT1（§3.5）: リンクの定義の行（`[注]: 説明`）の `[注]:` を、薄い色で表示する装飾の状態。
 * 行の文字は元のまま（編集でき、保存は打ったとおり）。装飾は表示だけで、PM の Doc・Markdown・history を変えない。
 *
 * 判定は段落ごとに独立なので、本文が変わったときは前回の装飾を写し（`DecorationSet.map`）、変更のあった
 * top-level block の範囲だけ作り直す（`autoTcyDecorationState.ts` と同じ形）。全文の作り直しは、初回と、
 * 範囲を求められなかったときだけ。
 */
export const REFERENCE_DEFINITION_LABEL_CLASS = 'nyoze-ref-def-label'

export type ReferenceDefinitionDecorationState = {
  readonly doc: ProseMirrorNode
  readonly decorations: DecorationSet
}

/** `[label]:`（label の中の `\]` を許す）。先頭の `[` から `:` まで。 */
const LABEL_PREFIX = /^\[(?:[^\\[\]]|\\.)*\]:/
const LEADING_BLANK = /^[ \t\u3000]*/

/**
 * 段落の中の `[label]:` の範囲（段落の内容の先頭からの文字数）。定義の行でなければ null。
 * text だけの段落が対象（ルビ・画像などを含むと、文字数と位置が1対1にならない）。
 */
export function findReferenceDefinitionLabelRange(paragraph: ProseMirrorNode): { from: number; to: number } | null {
  if (paragraph.type.name !== 'paragraph' || paragraph.childCount === 0) return null
  // 先頭の文字が `[` でなければ、定義の行ではない（多くの段落はここで終わる）。
  const first = paragraph.firstChild
  if (first === null || !first.isText) return null
  const lead = LEADING_BLANK.exec(first.text ?? '')?.[0].length ?? 0
  if ((first.text ?? '').charAt(lead) !== '[') return null
  let allText = true
  paragraph.forEach((child) => {
    if (!child.isText) allText = false
  })
  if (!allText) return null
  const text = paragraph.textContent.slice(lead)
  const match = LABEL_PREFIX.exec(text)
  if (match === null || !isReferenceDefinitionLineText(text.trimEnd())) return null
  return { from: lead, to: lead + match[0].length }
}

function collectDecorations(doc: ProseMirrorNode, from: number, to: number): Decoration[] {
  const decorations: Decoration[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    const range = findReferenceDefinitionLabelRange(node)
    if (range !== null) {
      decorations.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: REFERENCE_DEFINITION_LABEL_CLASS }))
    }
    return false
  })
  return decorations
}

export function buildReferenceDefinitionDecorationState(doc: ProseMirrorNode): ReferenceDefinitionDecorationState {
  return { doc, decorations: DecorationSet.create(doc, collectDecorations(doc, 0, doc.content.size)) }
}

export function applyReferenceDefinitionDecorationTransaction(
  previous: ReferenceDefinitionDecorationState,
  tr: Transaction,
): ReferenceDefinitionDecorationState {
  if (previous.doc !== tr.before) return buildReferenceDefinitionDecorationState(tr.doc)
  if (!tr.docChanged) return previous
  try {
    let decorations = previous.decorations.map(tr.mapping, tr.doc)
    for (const [from, to] of changedBlockRanges(tr)) {
      const stale = decorations.find(from, to)
      if (stale.length) decorations = decorations.remove(stale)
      const fresh = collectDecorations(tr.doc, from, to)
      if (fresh.length) decorations = decorations.add(tr.doc, fresh)
    }
    return { doc: tr.doc, decorations }
  } catch {
    return buildReferenceDefinitionDecorationState(tr.doc)
  }
}
