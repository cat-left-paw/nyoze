/**
 * EDITOR-PARAGRAPH-REPARSE1: 読み直した候補（`reparseCandidate.ts`）を、1 つの transaction として textblock へ適用する。
 *
 * - 置き換えは、元の node（付箋のマーカー・画像・ルビ・縦中横など）を飛ばして、その間の text の区間ごとに行う。
 *   区間ごとに共通の先頭・末尾を除いた違う部分だけを置き換える。元の node は同じ object のまま残る
 *   （付箋の保護の `filterTransaction` は、anchor の id の集合が変わらなければ通す）。
 * - `closeHistory(tr)` で独立した 1 つの Undo の単位にする。`appendTransaction` で足した transaction は、直前の入力と
 *   同じまとまりに入るため（`prosemirror-history` の `newGroup` の条件。`closeHistory` は `prevTime` を 0 にして
 *   `newGroup` を true にする）。Undo 1 回で記号のままに戻り、選択は置き換えの直前（離れた先）に戻る。
 * - 専用の meta `paragraphReparse`（`{ source, pos }`。pos は置き換え前の座標）を付ける。
 * - 置き換えた後の中身が候補と `eq` でなければ、何も返さない（安全網）。scroll の補正はしない。
 * - 保存の文字列（`serializeDocument`。保存と同じ書き出し）が、置き換えの前後で同じでなければ、何も返さない（最後の安全網。
 *   互換の改行モードの末尾の空白、読み込んだままで元の綴りで保存される段落の置き換えなど、block 単位の比べ方で拾えない保存の
 *   変化を防ぐ。自動の読み直しもコマンドも）。比べ方は改行のモードで分ける（`reparseSaveCheck.ts`。obsidian-paragraph は文書全体、
 *   commonmark-strict は窓）。
 * - 置き換えで対象の textblock の中身が空になる候補は採らない（空の段落は前後の block の書き方に効くので、strict の窓の前提が
 *   崩れる。安全側。どちらの改行のモードでも）。
 */
import { closeHistory } from '@tiptap/pm/history'
import { Slice } from '@tiptap/pm/model'
import { TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  computeBlockReparse,
  isParagraphReparseTarget,
  resolveTopLevelTarget,
  type ParagraphReparseAlignment,
  type ParagraphReparseContext,
  type ParagraphReparsePlan,
} from './reparseCandidate'
import { isSavedTextUnchanged } from './reparseSaveCheck'

export const PARAGRAPH_REPARSE_META_KEY = 'paragraphReparse'

export type ParagraphReparseMeta = {
  /** leave: 段落を離れたとき（案 1）。command: 明示のコマンド（案 2）。 */
  source: 'leave' | 'command'
  /** 置き換え前の座標での、対象の textblock の開始位置（その前の位置）。 */
  pos: number
}

type Segment = { o0: number; o1: number; c0: number; c1: number }

function buildSegments(alignment: ParagraphReparseAlignment, origSize: number, candSize: number): Segment[] {
  const segments: Segment[] = []
  let o = 0
  let c = 0
  for (const match of alignment.nodeMatches) {
    segments.push({ o0: o, o1: match.origOffset, c0: c, c1: match.candOffset })
    o = match.origOffset + match.origSize
    c = match.candOffset + match.candSize
  }
  segments.push({ o0: o, o1: origSize, c0: c, c1: candSize })
  return segments
}

/** 元の位置（content の先頭から）→ 候補の位置。残った文字・node の「その前」へ。node の内側は null。 */
function mapOffset(plan: ParagraphReparsePlan, offset: number): number | null {
  for (const match of plan.alignment.nodeMatches) {
    if (offset > match.origOffset && offset < match.origOffset + match.origSize) return null
  }
  for (const entry of plan.alignment.positionMap) {
    if (entry.orig >= offset) return entry.cand
  }
  return plan.candidate.size
}

function applyPlan(state: EditorState, blockPos: number, plan: ParagraphReparsePlan, tr: Transaction): void {
  const node = state.doc.nodeAt(blockPos)!
  const orig = node.content
  const candidate = plan.candidate
  const base = blockPos + 1
  const segments = buildSegments(plan.alignment, orig.size, candidate.size)
  // 後ろの区間から置き換える（前の区間の位置が動かない）。
  for (let k = segments.length - 1; k >= 0; k--) {
    const s = segments[k]
    const a = orig.cut(s.o0, s.o1)
    const b = candidate.cut(s.c0, s.c1)
    if (a.eq(b)) continue
    const start = a.findDiffStart(b)
    if (start === null) continue
    const end = a.findDiffEnd(b)
    let endA = end ? end.a : a.size
    let endB = end ? end.b : b.size
    const overlap = start - Math.min(endA, endB)
    if (overlap > 0) {
      endA += overlap
      endB += overlap
    }
    tr.replace(base + s.o0 + start, base + s.o0 + endA, new Slice(b.cut(start, endB), 0, 0))
  }
}

function mapSelectionThroughPlan(
  selection: Selection,
  blockPos: number,
  nodeSize: number,
  plan: ParagraphReparsePlan,
): { anchor: number; head: number } | null {
  const base = blockPos + 1
  const contentSize = nodeSize - 2
  if (!(selection instanceof TextSelection)) return null
  if (selection.anchor < base || selection.anchor > base + contentSize) return null
  if (selection.head < base || selection.head > base + contentSize) return null
  const anchor = mapOffset(plan, selection.anchor - base)
  const head = mapOffset(plan, selection.head - base)
  if (anchor === null || head === null) return null
  return { anchor: base + anchor, head: base + head }
}

/**
 * `blockPos`（textblock の開始位置）の段落を読み直す transaction を作る。置き換えるものがなければ null（transaction を作らない）。
 * `mapSelection` が true のとき（コマンド）、選択が段落の中にあれば、残った文字の対応で選択を置く。
 */
export function buildParagraphReparseTransaction(
  state: EditorState,
  blockPos: number,
  context: ParagraphReparseContext,
  options: {
    source: ParagraphReparseMeta['source']
    mapSelection: boolean
    /** 保存の文字列（保存と同じ書き出し）。渡したとき、置き換えの前後で保存の文字列が同じでなければ null（比べ方は `reparseSaveCheck.ts`）。 */
    serializeDocument?: (doc: PMNode) => string
  },
): Transaction | null {
  if (blockPos < 0 || blockPos > state.doc.content.size) return null
  const node = state.doc.nodeAt(blockPos)
  if (!isParagraphReparseTarget(node)) return null
  const target = resolveTopLevelTarget(state.doc, blockPos)
  if (!target) return null
  const plan = computeBlockReparse(state.schema, target.top, target.path, context)
  if (!plan) return null
  if (plan.candidate.size === 0) return null
  const tr = state.tr
  try {
    applyPlan(state, blockPos, plan, tr)
  } catch {
    return null
  }
  if (!tr.docChanged) return null
  const after = tr.doc.nodeAt(blockPos)
  if (!after || after.type !== node.type || !after.sameMarkup(node) || !after.content.eq(plan.candidate)) return null
  if (
    options.serializeDocument &&
    !isSavedTextUnchanged({
      before: state.doc,
      after: tr.doc,
      topIndex: target.topIndex,
      lineBreakPolicy: context.lineBreakPolicy,
      serializeDocument: options.serializeDocument,
    })
  ) {
    return null
  }
  if (options.mapSelection) {
    const mapped = mapSelectionThroughPlan(state.selection, blockPos, node.nodeSize, plan)
    if (mapped) tr.setSelection(TextSelection.create(tr.doc, mapped.anchor, mapped.head))
  }
  closeHistory(tr)
  tr.setMeta(PARAGRAPH_REPARSE_META_KEY, { source: options.source, pos: blockPos } satisfies ParagraphReparseMeta)
  return tr
}
