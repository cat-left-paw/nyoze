import { NodeSelection, TextSelection, type EditorState } from '@tiptap/pm/state'
import type { Node as PMNode, NodeType } from '@tiptap/pm/model'
import { isProtectedTcySelection } from '../tcyFormatting'
import { indexDocumentNoteAnchors } from '../documentNodeIndex'
import { isValidNoteAnchorId } from '../../io/noteAnchor'
import { normalizeRubyInsertionRange } from './rubyInsertionPosition'

/**
 * PIS-INPUT-BLOCK-WARN1: 入力面の確定が、確定先の位置だけで拒否される場面（打つ前に分かる）。
 * - `tcy`: 縦中横の中、または縦中横を選択中（Hostのbeforeinputと同じ述語）。
 * - `note-anchor`: 付箋のマーカーを含む範囲を選択中（置き換えるとマーカーを消す）。
 * - `block-atom`: blockのatomを選択中で、その直後に段落を置けない（B15）。
 */
export type CommitTargetRestriction = 'tcy' | 'note-anchor' | 'block-atom'
/** 確定先。`OwnerInsertionSnapshot`の位置の部分（identityは`judgeInsertion`が先に証明する）。 */
export type CommitTargetRange = { readonly docRef: PMNode; readonly from: number; readonly to: number }

export type BlockAtomTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'ready'; readonly after: number; readonly type: NodeType }

/**
 * B15: blockのatom（leafのblock node）を`NodeSelection`で選択中の確定先。nodeを消さず、直後の新しい段落へ入れる。
 * 直後へ段落を置けなければ`blocked`。判定はnodeの性質で行い、nodeの種類の名前を列挙しない。
 */
export function resolveBlockAtomTarget(state: EditorState, range: Pick<CommitTargetRange, 'from' | 'to'>): BlockAtomTarget {
  const current = state.selection
  if (!(current instanceof NodeSelection) || current.from !== range.from || current.to !== range.to
    || !current.node.isBlock || !current.node.isLeaf) return { kind: 'none' }
  const after = current.to, $after = state.doc.resolve(after), index = $after.index()
  const type = $after.parent.contentMatchAt(index).defaultType
  if (!type?.isTextblock || type.spec.code || !$after.parent.canReplaceWith(index, index, type)) return { kind: 'blocked' }
  return { kind: 'ready', after, type }
}

/**
 * `[from, to)`に付箋のマーカーがあるか。`collectNoteAnchorIdsInRange(...).length > 0`と同じ結果を、
 * 文書ごとにキャッシュ済みの索引（`documentNodeIndex.ts`）の二分探索で求める（範囲を歩かない）。
 * 空の範囲にはマーカーは入らない。
 */
export function hasNoteAnchorInRange(doc: PMNode, from: number, to: number): boolean {
  if (from >= to) return false
  const entries = indexDocumentNoteAnchors(doc)
  let low = 0, high = entries.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (entries[middle].pos < from) low = middle + 1
    else high = middle
  }
  for (let index = low; index < entries.length && entries[index].pos < to; index++) {
    // 保護plugin（`noteAnchorProtection.ts`）が追跡するのは有効なidだけ。同じ範囲を同じ基準で数える。
    if (isValidNoteAnchorId((entries[index].node.attrs.id as string) ?? '')) return true
  }
  return false
}

/**
 * 確定先の位置だけで確定が拒否されるか。**直接入力の`beforeinput`、変換の`compositionstart`の事前の判定と、
 * `commitText`の拒否は、この1つの関数を呼ぶ**（警告が出たのに入れられた／警告なしで残った、のずれを作らない）。
 * 位置の局所だけを読む: 縦中横は祖先、B15は選択したnodeの直後、付箋のマーカーは空でない範囲のときだけ索引を引く。
 * 選択が変わるたびに評価して結果を持つことはしない（呼ぶ時点で同期に判定する）。
 */
export function resolveCommitTargetRestriction(state: EditorState, range: CommitTargetRange): CommitTargetRestriction | null {
  // 古いsnapshotは`judgeInsertion`が`stale`にする。位置の意味が変わった文書では判定しない。
  if (range.docRef !== state.doc) return null
  const { from, to } = range
  // GAP-SAFETY1: Hostのbeforeinputと同じ述語。TCYの中・TCYを選択中の入力は確定しない。
  const current = state.selection
  const target = current.from === from && current.to === to ? state
    : state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
  if (isProtectedTcySelection(target)) return 'tcy'
  // B15: 段落を置けないblockのatomの直後。置ける場合は拒否しない（付箋のマーカーを含まないnodeの選択）。
  const block = resolveBlockAtomTarget(state, range)
  if (block.kind !== 'none') return block.kind === 'blocked' ? 'block-atom' : null
  // 付箋のマーカー: 確定が実際に置き換える範囲（Rubyの内側の端を外へ投影した後）で判定する。
  const normalized = normalizeRubyInsertionRange(state, from, to)
  return hasNoteAnchorInRange(state.doc, normalized.from, normalized.to) ? 'note-anchor' : null
}

/** 診断の記録（`owner-commit-blocked`）に残す理由。既存の記録の理由の文字列を保つ。 */
export const COMMIT_TARGET_RESTRICTION_REASON: Readonly<Record<CommitTargetRestriction, string>> = {
  tcy: 'tcy-protected',
  'note-anchor': 'note-anchor-in-range',
  'block-atom': 'no-paragraph-after-block-atom',
}
