/**
 * Page Viewer の「heading anchor へジャンプする」共有ロジック (pure)。
 *
 * PV-COL-9 (outline side panel) 追加時に、既存 TOC synthetic section の
 * jump 経路 (旧 `jumpToTocAnchor`) から DOM 非依存部分を切り出した。TOC と
 * outline side panel は、この module の関数を経由する同一の
 * `jumpToHeadingAnchor()` (component 側、`PageViewerWindowRoot.tsx`) を
 * 呼ぶことで、DOM page 位置計算を複製しない。
 *
 * - `resolveHeadingJumpTarget()`: anchor id → heading `PageAnchor` +
 *   その anchor が属する page-sequence entry の対応付け。DOM に触れない。
 * - `computeHeadingJumpLocalPageIndex()`: 実測済みの rect / pitch から、
 *   flow section 内の local page index を求める算術だけの関数。実際の
 *   `getBoundingClientRect()` 呼び出しは component 側の責務。
 *
 * 既存の不変条件を維持する: 任意 scroll offset へは変換しない (DOM の
 * scroll-into-view 系 API や scroll 座標プロパティは使わない)。
 */

import type { PageViewAnchor } from '../../editor-core/io/pageModelView'
import type { WritingMode } from '../../settings/types'
import type { PageViewerPageSequenceEntry } from './pageViewerPageSequence'

export type HeadingJumpTarget = {
  anchor: PageViewAnchor
  entry: PageViewerPageSequenceEntry
}

/**
 * `anchorId` に対応する heading anchor と、その anchor が属する page-sequence
 * entry を解決する。heading anchor でない、または対応する entry が無い
 * (通常は起こらないが防御的に) 場合は `null`。
 */
export function resolveHeadingJumpTarget(
  anchorId: string,
  anchors: readonly PageViewAnchor[],
  entries: readonly PageViewerPageSequenceEntry[],
): HeadingJumpTarget | null {
  const anchor = anchors.find((candidate) => candidate.kind === 'heading' && candidate.id === anchorId)
  if (!anchor) return null
  const entry = entries.find((candidate) => candidate.sectionId === anchor.sectionId)
  if (!entry) return null
  return { anchor, entry }
}

export type ComputeHeadingJumpLocalPageIndexInput = {
  /** ジャンプ先 heading 要素の `getBoundingClientRect()`。 */
  targetRect: Pick<DOMRect, 'top' | 'left'>
  /** 属する flow section (`.page-viewer-window__page-flow`) の `getBoundingClientRect()`。transform 込みで良い (両者とも同じ transform を受けるため差分は transform 前の column position と一致する)。 */
  flowRect: Pick<DOMRect, 'top' | 'left'>
  /** 1 ページの送り量 (px)。frame の inline size。 */
  pagePitch: number
  writingMode: WritingMode
  /** section 内の総ページ数。結果をこの範囲へ clamp する。 */
  pageCount: number
}

/**
 * DOM 実測値 (transform 込みの target / flow rect と frame pitch) から、
 * flow section 内の local page index を求める。live scroll size は読まない
 * (呼び出し側も同様であること)。`pagePitch` が不正 (非有限 / 0 以下) の場合は
 * `0` にフォールバックする。
 */
export function computeHeadingJumpLocalPageIndex(input: ComputeHeadingJumpLocalPageIndexInput): number {
  const { targetRect, flowRect, pagePitch, writingMode, pageCount } = input
  if (!Number.isFinite(pagePitch) || pagePitch <= 0) return 0
  const offset = writingMode === 'vertical-rl' ? targetRect.top - flowRect.top : targetRect.left - flowRect.left
  if (!Number.isFinite(offset)) return 0
  const maxIndex = Math.max(0, Math.floor(pageCount) - 1)
  return Math.min(Math.max(Math.floor((offset + 0.5) / pagePitch), 0), maxIndex)
}
