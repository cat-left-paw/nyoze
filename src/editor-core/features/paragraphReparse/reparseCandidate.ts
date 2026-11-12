/**
 * EDITOR-PARAGRAPH-REPARSE1: 1 つの textblock（paragraph / heading）の中身を、ファイルの読み込みと同じ規則で
 * 読み直した候補を作る（純粋。transaction・state を持たない）。
 *
 * 目的は、段落を離れた時点の表示を「保存して開き直したときの表示」と一致させること。装飾の記号を後から閉じた段落
 * （`****` を書いてから中へ文字を入れた、など）や、入力規則を持たない記法（ルビ・縦中横・リンク）が、記号のまま残る。
 *
 * 手順（`computeBlockReparse`。**対象の段落を含む、文書直下の block（top-level の祖先）の単位**で行う。リスト・引用・装飾ブロックの
 * 中の段落は、文脈なしに段落だけで読むと、開き直したときの表示と違う・保存が変わることがあるため（追記 1）。文書直下の段落・見出しは
 * block が段落そのものなので、段落だけを読むのと同じ）:
 *   1. その block だけの文書を、保存と同じ serializer で Markdown の文字列にする。
 *   2. その文字列を、いまの文書の読み込みと同じ設定で読む。結果が「同じ種類の top-level の block 1 つ」で、構造
 *      （入れ子・種類・attrs。対象以外の段落・見出しの中身は比べない）が元と同じでなければ置き換えない
 *      （`- 項目` や `# 見出し` の形の文字が、リスト・見出しに変わらない。block の種類・構造は変えない）。
 *      候補は、その block の中の、同じ位置の対象の段落の中身。
 *   3. 次の条件をすべて満たすときだけ、候補とする。1 つでも欠ければ null（何もしない）。
 *      (a) 候補の中身が、元の中身と `eq` でない。
 *      (b) 元の block の対象の中身だけを候補へ替えた block を書き出した文字列が、元の block を書き出した文字列と完全に同じ
 *          （保存されるファイルの中身が 1 文字も変わらない）。さらに最後の安全網として、文書全体の保存の文字列が、置き換えの前後で
 *          同じことを、transaction を作るとき（`reparseTransaction.ts`）に確かめる。
 *      (c) 今ある書式・node を失わない:
 *          - 元の text 以外の inline node（付箋のマーカー・画像・inline HTML・hardBreak・ルビ・縦中横）が、候補に同じ順で `eq` のまま残る。
 *          - 候補の見える文字が、元の見える文字から文字を取り除いただけの並びになる（見える文字が増えない）。
 *          - 残った各文字に、元で付いていた mark が候補でも付いている（端の空白から太字・斜体・取り消し線が外れるのは、
 *            保存の規則 N1 と同じなので許す）。
 *          対応の取り方は先頭からの貪欲な対応。取れなければ null（安全な側に倒す）。
 *
 * 新しく増えてよい inline node は、ルビ・縦中横・inline HTML・画像（読み込みと同じ結果）。付箋のマーカー・hardBreak は、
 * 元にあるものだけを残し、新しく作らない（本文に打った文字から付箋・改行を作らない）。
 *
 * hardBreak を含む段落（(d)）: 手順 2 の結果が 1 つの `paragraph` にならない場合は置き換えない（`obsidian-paragraph` は
 * 1 行 = 1 段落なので、hardBreak のある段落の書き出しは複数の段落に読み直され、何もしない）。`commonmark-strict` は 1 つの
 * `paragraph` に読み直され、hardBreak は (c) の対応で `eq` のまま残る。部分ごとに読み直してつなぎ直す方式は、行をまたぐ
 * 記法（`**a  \nb**`）で「読み込みと同じ結果」にならないので採らない。
 */
import { Fragment, type Mark, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { parseMarkdown } from '../../io/parseMarkdown'
import { serializeMarkdown } from '../../io/serializeMarkdown'
import type { LineBreakPolicy } from '../../types'

export type ParagraphReparseContext = {
  lineBreakPolicy: LineBreakPolicy
  /** ルビ表示が OFF のとき、ルビは作られない（読み込みと同じ）。 */
  enableRuby: boolean
  preserveEmptyParagraphs: boolean
}

/** 置き換えの対象にする textblock。code block・HTML block・そのほかの block は対象外。 */
export function isParagraphReparseTarget(node: PMNode | null | undefined): node is PMNode {
  return !!node && (node.type.name === 'paragraph' || node.type.name === 'heading')
}

/**
 * 中身の大きさ（位置の数）の上限。これを超える段落は読み直さない（離れる操作が重くならないための安全網。
 * 通常の段落は数百〜数千の位置）。測定は docs/editor-paragraph-reparse1-2026-11.md。
 */
export const PARAGRAPH_REPARSE_MAX_CONTENT_SIZE = 20000

/** 端の空白から外れてよい mark（保存の規則 N1 が外す L1 の mark）。 */
const WHITESPACE_DROPPABLE_MARKS = new Set(['bold', 'italic', 'strike'])
const WHITESPACE_PATTERN = /^[\t\n\f\r \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]$/

type CharUnit = { kind: 'char'; ch: string; marks: readonly Mark[]; offset: number }
type NodeUnit = { kind: 'node'; node: PMNode; offset: number; nodeIndex: number }
type Unit = CharUnit | NodeUnit

function unitsOf(fragment: Fragment): Unit[] {
  const units: Unit[] = []
  let nodeIndex = 0
  fragment.forEach((child, offset) => {
    if (child.isText) {
      let at = offset
      for (const ch of child.text ?? '') {
        units.push({ kind: 'char', ch, marks: child.marks, offset: at })
        at += ch.length
      }
    } else {
      units.push({ kind: 'node', node: child, offset, nodeIndex: nodeIndex++ })
    }
  })
  return units
}

/** 候補に新しく現れた node の、見える文字。作ってよい種類だけ（それ以外は null = 置き換えない）。 */
function newNodeChars(node: PMNode): string[] | null {
  switch (node.type.name) {
    case 'aozoraRuby':
      return [...node.textContent, ...String(node.attrs.ruby ?? '')]
    case 'aozoraTcy':
      return [...node.textContent]
    case 'html_inline_atom':
      return [...String(node.attrs.raw ?? '')]
    case 'nyoze_image':
      return [...`${node.attrs.alt ?? ''}${node.attrs.src ?? ''}${node.attrs.title ?? ''}`]
    default:
      return null
  }
}

function markUnion(a: readonly Mark[], b: readonly Mark[]): readonly Mark[] {
  if (b.length === 0) return a
  if (a.length === 0) return b
  const out = [...a]
  for (const mark of b) if (!out.some((existing) => existing.eq(mark))) out.push(mark)
  return out
}

/** 新しい node の中の text に付いている mark（node 自身の mark と、中の text の mark の和）。 */
function newNodeMarks(node: PMNode): readonly Mark[] {
  let marks: readonly Mark[] = node.marks
  node.forEach((child) => {
    marks = markUnion(marks, child.marks)
  })
  return marks
}

type CandidateItem =
  | { kind: 'char'; ch: string; marks: readonly Mark[]; candOffset: number }
  | { kind: 'token'; origNodeIndex: number; candOffset: number }

export type ParagraphReparseAlignment = {
  /** 元の node の順番（`nodeIndex`）→ 候補の中の同じ node の offset（content の先頭からの位置）。 */
  nodeMatches: Array<{ origOffset: number; origSize: number; candOffset: number; candSize: number }>
  /** 元の位置（content の先頭から）→ 候補の位置。残った文字・node の「その前」の位置だけ。 */
  positionMap: Array<{ orig: number; cand: number }>
}

export type ParagraphReparsePlan = {
  candidate: Fragment
  alignment: ParagraphReparseAlignment
}

function alignNodes(origNodes: NodeUnit[], candNodes: NodeUnit[]): Map<number, number> | null {
  const candToOrig = new Map<number, number>()
  let j = 0
  for (let i = 0; i < origNodes.length; i++) {
    while (j < candNodes.length && !candNodes[j].node.eq(origNodes[i].node)) j++
    if (j >= candNodes.length) return null
    candToOrig.set(candNodes[j].nodeIndex, i)
    j++
  }
  return candToOrig
}

/** 条件 (c)。通れば、元の位置 → 候補の位置の対応を返す。 */
function checkPreservation(orig: Fragment, cand: Fragment): ParagraphReparseAlignment | null {
  const origUnits = unitsOf(orig)
  const candUnits = unitsOf(cand)
  const origNodes = origUnits.filter((u): u is NodeUnit => u.kind === 'node')
  const candNodes = candUnits.filter((u): u is NodeUnit => u.kind === 'node')
  // 元の node は、候補に同じ順で `eq` のまま残る。増えるのは新しく読めた node だけ（種類は newNodeChars が決める）。
  const candToOrig = alignNodes(origNodes, candNodes)
  if (!candToOrig) return null

  const items: CandidateItem[] = []
  for (const unit of candUnits) {
    if (unit.kind === 'char') {
      items.push({ kind: 'char', ch: unit.ch, marks: unit.marks, candOffset: unit.offset })
      continue
    }
    const matched = candToOrig.get(unit.nodeIndex)
    if (matched !== undefined) {
      items.push({ kind: 'token', origNodeIndex: matched, candOffset: unit.offset })
      continue
    }
    const chars = newNodeChars(unit.node)
    if (chars === null) return null
    const marks = newNodeMarks(unit.node)
    // 新しい node の元の綴りの文字（`漢字《かんじ》` の各文字など）は、その node の前の位置へ対応させる。
    for (const ch of chars) items.push({ kind: 'char', ch, marks, candOffset: unit.offset })
  }

  const positionMap: Array<{ orig: number; cand: number }> = []
  const nodeMatches: ParagraphReparseAlignment['nodeMatches'] = []
  let oi = 0
  for (const item of items) {
    if (item.kind === 'token') {
      while (oi < origUnits.length && origUnits[oi].kind === 'char') oi++
      const unit = origUnits[oi]
      if (!unit || unit.kind !== 'node' || unit.nodeIndex !== item.origNodeIndex) return null
      positionMap.push({ orig: unit.offset, cand: item.candOffset })
      nodeMatches.push({
        origOffset: unit.offset,
        origSize: unit.node.nodeSize,
        candOffset: item.candOffset,
        candSize: unit.node.nodeSize,
      })
      oi++
      continue
    }
    let unit: Unit | undefined
    for (;;) {
      unit = origUnits[oi]
      if (!unit) return null
      if (unit.kind === 'node') return null // 元の node を飛ばして、先の文字へは対応させない
      if (unit.ch === item.ch) break
      oi++
    }
    const origChar = unit as CharUnit
    for (const mark of origChar.marks) {
      if (item.marks.some((candidateMark) => candidateMark.eq(mark))) continue
      const droppable = WHITESPACE_DROPPABLE_MARKS.has(mark.type.name) && WHITESPACE_PATTERN.test(origChar.ch)
      if (!droppable) return null
    }
    positionMap.push({ orig: origChar.offset, cand: item.candOffset })
    oi++
  }
  for (; oi < origUnits.length; oi++) if (origUnits[oi].kind === 'node') return null
  return { nodeMatches, positionMap }
}

function isWhitespaceOnly(content: Fragment): boolean {
  let only = true
  content.forEach((child) => {
    if (!child.isText || !/^\s*$/.test(child.text ?? '')) only = false
  })
  return only
}

/** 対象の段落を含む、文書直下の block の大きさ（位置の数）の上限。これを超える block は読み直さない（離れる操作が重くならないための安全網）。 */
export const PARAGRAPH_REPARSE_MAX_BLOCK_SIZE = 60000

function blockToMarkdown(schema: Schema, block: PMNode, context: ParagraphReparseContext): string | null {
  try {
    const doc = schema.topNodeType.create(null, block)
    return serializeMarkdown(doc, context.lineBreakPolicy, { preserveEmptyParagraphs: context.preserveEmptyParagraphs })
  } catch {
    return null
  }
}

/** 文書直下の block から、`path`（子の番号の列）をたどった node。たどれなければ null。 */
export function nodeAtPath(top: PMNode, path: readonly number[]): PMNode | null {
  let node: PMNode = top
  for (const index of path) {
    if (index < 0 || index >= node.childCount) return null
    node = node.child(index)
  }
  return node
}

/** `path` の node の中身だけを `content` へ替えた block（ほかの node は同じ object）。 */
export function replaceContentAtPath(node: PMNode, path: readonly number[], content: Fragment): PMNode {
  if (path.length === 0) return node.copy(content)
  const [head, ...rest] = path
  const children: PMNode[] = []
  node.forEach((child, _offset, index) => {
    children.push(index === head ? replaceContentAtPath(child, rest, content) : child)
  })
  return node.copy(Fragment.fromArray(children))
}

/**
 * 構造が同じか（種類・attrs・子の数・入れ子）。対象以外の段落・見出しの中身は比べない（置き換えない中身なので）。
 * code block の中身と、葉の block（水平線・改ページ・白紙・HTML block）は、そのまま比べる。
 */
function sameShape(a: PMNode, b: PMNode): boolean {
  if (!a.sameMarkup(b)) return false
  if (a.isTextblock) return a.type.spec.code ? a.content.eq(b.content) : true
  if (a.isLeaf) return a.eq(b)
  if (a.childCount !== b.childCount) return false
  for (let i = 0; i < a.childCount; i += 1) if (!sameShape(a.child(i), b.child(i))) return false
  return true
}

/** textblock の位置（その前の位置）から、文書直下の block（と、その文書直下の子の番号）と、そこからの子の番号の列を求める。 */
export function resolveTopLevelTarget(
  doc: PMNode,
  blockPos: number,
): { top: PMNode; topPos: number; topIndex: number; path: number[] } | null {
  if (blockPos < 0 || blockPos + 1 > doc.content.size) return null
  const $in = doc.resolve(blockPos + 1)
  if ($in.depth < 1 || $in.before($in.depth) !== blockPos) return null
  const path: number[] = []
  for (let depth = 1; depth < $in.depth; depth += 1) path.push($in.index(depth))
  return { top: $in.node(1), topPos: $in.before(1), topIndex: $in.index(0), path }
}

/**
 * 文書直下の block `top` の中の、`path` にある段落・見出しの中身を、読み直した候補を作る。置き換えるものがなければ null。
 * 純粋（同じ入力は同じ結果）。
 */
export function computeBlockReparse(
  schema: Schema,
  top: PMNode,
  path: readonly number[],
  context: ParagraphReparseContext,
): ParagraphReparsePlan | null {
  const target = nodeAtPath(top, path)
  if (!isParagraphReparseTarget(target)) return null
  const content = target.content
  if (content.size === 0 || content.size > PARAGRAPH_REPARSE_MAX_CONTENT_SIZE) return null
  if (top.nodeSize > PARAGRAPH_REPARSE_MAX_BLOCK_SIZE) return null
  // 空白だけの段落は読み直さない（厳密な CommonMark の読み込みは空白だけの段落を空にするが、打った空白を、記法でもないのに消さない）。
  if (isWhitespaceOnly(content)) return null
  const markdown = blockToMarkdown(schema, top, context)
  if (markdown === null) return null
  let parsed: PMNode
  try {
    parsed = parseMarkdown(schema, markdown, context.lineBreakPolicy, {
      enableRuby: context.enableRuby,
      preserveEmptyParagraphs: context.preserveEmptyParagraphs,
    })
  } catch {
    return null
  }
  if (parsed.childCount !== 1) return null
  const candidateTop = parsed.child(0)
  if (candidateTop.type !== top.type || !sameShape(top, candidateTop)) return null
  const candidateTarget = nodeAtPath(candidateTop, path)
  if (!candidateTarget || !candidateTarget.sameMarkup(target)) return null
  const candidate = candidateTarget.content
  // (a)
  if (candidate.eq(content)) return null
  // (b) 元の block の対象の中身だけを候補へ替えた block の書き出しが、元の block と同じ
  const rewritten = replaceContentAtPath(top, path, candidate)
  if (blockToMarkdown(schema, rewritten, context) !== markdown) return null
  // (c)
  const alignment = checkPreservation(content, candidate)
  if (!alignment) return null
  return { candidate, alignment }
}

/**
 * 文書直下の段落 1 つ（中身が `content`）を読み直した候補。`computeBlockReparse` の、段落そのものが top-level の block の場合。
 */
export function computeParagraphReparse(
  schema: Schema,
  content: Fragment,
  context: ParagraphReparseContext,
): ParagraphReparsePlan | null {
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return null
  try {
    return computeBlockReparse(schema, paragraph.create(null, content), [], context)
  } catch {
    return null
  }
}
