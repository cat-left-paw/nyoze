/**
 * Page Viewer の CSS multicol pagination 用 page metrics adapter (pure)。
 *
 * 正本: `docs/page-viewer-css-columns-design-2026-07.md` §12 (Chromium spike 実測)。
 *
 * 責務は「実測値 → column CSS 値 / page metrics / page index 変換」の純粋計算だけで、
 * DOM / React には依存しない。frame の実測 (clientWidth/Height、transform なしの
 * scrollWidth/Height) は DOM 側 adapter (`usePageViewerColumnLayout.ts`) が行い、
 * この module の関数へ渡す。
 *
 * 設計の不変条件 (§12):
 * - page pitch = frame の inline size (vertical-rl: height / horizontal-tb: width)。
 * - `column-width = trunc(pitch - gap)`、inline 軸両端に `gap / 2` padding
 *   → 使用 column inline size がちょうど `pitch - gap` になり、column 境界の
 *   周期が pitch と厳密に一致する (foliate-js `paginator.js` の columnize() と同じ)。
 * - 末尾側 padding は scrollable overflow に算入されないため、実測は
 *   `setupScrollSize = pageCount * pitch - gap / 2` になる。pageCount は
 *   この式を逆算した `ceil(setupScrollSize / pitch)`。
 * - pageCount / progress は transform 後の live scrollWidth/scrollHeight から
 *   再計算しない (transform は scrollable overflow を縮める)。layout 確定時に
 *   実測した `setupScrollSize` から作る cached metrics だけを使う。
 * - ページ移動は transform (`flowTransformForPageIndex`)。scroll offset 方式は
 *   最終ページで clamp ずれするため採用しない。
 */

import type { WritingMode } from '../../settings/types'

/** ページ送りの内部軸。vertical-rl は column が上→下 (y)、horizontal-tb は左→右 (x)。 */
export type PageViewerPageAxis = 'x' | 'y'

/** column 間 gap (px)。半分ずつが各ページの inline 軸両端余白になる。 */
export const PAGE_VIEWER_COLUMN_GAP = 40

export function pageAxisForWritingMode(writingMode: WritingMode): PageViewerPageAxis {
  return writingMode === 'vertical-rl' ? 'y' : 'x'
}

export type PageViewerColumnLayoutInput = {
  writingMode: WritingMode
  /** frame (mask) の clientWidth (px)。 */
  frameWidth: number
  /** frame (mask) の clientHeight (px)。 */
  frameHeight: number
  /** column-gap (px)。省略側は `PAGE_VIEWER_COLUMN_GAP`。 */
  gap: number
}

/**
 * flow (multicol container) へ適用する CSS 値と、その前提になる page pitch。
 * `usePageViewerColumnLayout` がこの値を flow の inline style へ書き込む。
 */
export type PageViewerColumnLayout = {
  writingMode: WritingMode
  pageAxis: PageViewerPageAxis
  /** 1 ページの送り量 (px) = frame の inline size。 */
  pitch: number
  gap: number
  /** `column-width` (px) = trunc(pitch - gap)。最小 1。 */
  columnWidth: number
  /** flow の width/height (px) = frame の client size。 */
  frameWidth: number
  frameHeight: number
  /** inline 軸両端の padding (px) = gap / 2。vertical-rl: 上下 / horizontal-tb: 左右。 */
  inlinePadding: number
}

/**
 * frame 実測サイズから column layout を計算する。frame が未計測 (0 以下 /
 * 非有限) のときは `null` (呼び出し側は layout 未確定として扱う)。
 * gap は `[0, pitch / 2]` へ安全側にクランプする (frame が極端に小さくても
 * columnWidth が 1px 未満にならないようにする)。
 */
export function computePageViewerColumnLayout(
  input: PageViewerColumnLayoutInput,
): PageViewerColumnLayout | null {
  const { writingMode, frameWidth, frameHeight } = input
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) return null
  if (!Number.isFinite(frameHeight) || frameHeight <= 0) return null
  const pageAxis = pageAxisForWritingMode(writingMode)
  const pitch = pageAxis === 'y' ? frameHeight : frameWidth
  const rawGap = Number.isFinite(input.gap) && input.gap >= 0 ? input.gap : PAGE_VIEWER_COLUMN_GAP
  const gap = Math.min(rawGap, Math.floor(pitch / 2))
  const columnWidth = Math.max(1, Math.trunc(pitch - gap))
  return {
    writingMode,
    pageAxis,
    pitch,
    gap,
    columnWidth,
    frameWidth,
    frameHeight,
    inlinePadding: gap / 2,
  }
}

/**
 * layout 確定時に cache する page metrics。navigation / scrubber / keyboard は
 * この cached 値だけを使う (live scrollWidth/scrollHeight を読み直さない)。
 */
export type PageViewerColumnMetrics = PageViewerColumnLayout & {
  /** transform なしで実測した frame の scrollHeight (y) / scrollWidth (x)。 */
  setupScrollSize: number
  /** `ceil(setupScrollSize / pitch)`。最小 1。 */
  pageCount: number
}

/**
 * transform なしで実測した `setupScrollSize` から metrics を確定する。
 * `setupScrollSize` が不正 (非有限 / 0 以下) でも viewer を壊さないよう
 * pageCount は最小 1 にフォールバックする。
 */
export function buildPageViewerColumnMetrics(
  layout: PageViewerColumnLayout,
  setupScrollSize: number,
): PageViewerColumnMetrics {
  const size = Number.isFinite(setupScrollSize) && setupScrollSize > 0 ? setupScrollSize : 0
  const pageCount = layout.pitch > 0 ? Math.max(1, Math.ceil(size / layout.pitch)) : 1
  return { ...layout, setupScrollSize: size, pageCount }
}

/** page index を `[0, pageCount - 1]` にクランプする。非有限は 0。 */
export function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (!Number.isFinite(pageIndex)) return 0
  const maxIndex = Math.max(0, Math.floor(pageCount) - 1)
  return Math.min(Math.max(Math.floor(pageIndex), 0), maxIndex)
}

/**
 * flow へ適用する CSS transform。ページ移動はこれだけで行う (scroll offset は
 * 使わない)。page 0 は `none` (transform 由来の描画差分を残さない)。
 */
export function flowTransformForPageIndex(
  metrics: Pick<PageViewerColumnMetrics, 'pageAxis' | 'pitch' | 'pageCount'>,
  pageIndex: number,
): string {
  const clamped = clampPageIndex(pageIndex, metrics.pageCount)
  const offset = clamped * metrics.pitch
  if (offset === 0) return 'none'
  return metrics.pageAxis === 'y' ? `translateY(${-offset}px)` : `translateX(${-offset}px)`
}

/**
 * scrubber thumb / aria 用の読書進行率 (0〜1)。`pageIndex / maxPageIndex` 由来で、
 * scroll 位置からは計算しない。1 ページしかない文書は常に 0。
 */
export function progressRatioForPageIndex(pageIndex: number, pageCount: number): number {
  const maxIndex = Math.max(0, Math.floor(pageCount) - 1)
  if (maxIndex === 0) return 0
  return clampPageIndex(pageIndex, pageCount) / maxIndex
}

/**
 * scrubber の click / drag 位置 (読書進行率 0〜1) を最寄り page index へ snap する
 * (`progressRatioForPageIndex` の逆写像)。非有限 ratio は 0 扱い。
 */
export function pageIndexFromProgressRatio(progressRatio: number, pageCount: number): number {
  const maxIndex = Math.max(0, Math.floor(pageCount) - 1)
  if (maxIndex === 0) return 0
  const ratio = Number.isFinite(progressRatio) ? Math.min(Math.max(progressRatio, 0), 1) : 0
  return Math.round(ratio * maxIndex)
}
