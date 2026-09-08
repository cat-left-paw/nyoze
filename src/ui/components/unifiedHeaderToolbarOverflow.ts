/**
 * APP-HEADER-OVERFLOW-DRAG1: Unified Header ツールバーの overflow 判定と
 * scroll indicator geometry を決める純粋関数群。
 *
 * Unified Header は標準の `overflow-x: auto` を使わない。Windows で scrollbar が
 * header 高を食うこと、横 auto と縦 visible を安定して両立できず tooltip / dropdown を
 * clip してしまうことが理由で、既存の `toolbarOffset` + `transform: translateX()` +
 * `clip-path` による横 clip 契約を維持する。このモジュールはその offset を
 * 「見える形」にするための薄い indicator geometry と、toolbar pan grip の
 * offset 解決だけを担当する。
 *
 * 不変条件:
 * - overflow authority は実 geometry。`toolbar wrapper width > toolbar viewport width`
 *   （fractional geometry 用の小さな epsilon つき）だけで判定し、
 *   `offsetBounds.min !== offsetBounds.max` を overflow 判定に使わない。
 *   toolbar が収まる場合でも bounds は左右への配置余地を返しうるためである。
 * - toolbar pan grip は同じ `computeOffsetBounds()` snapshot を使い、第二の bounds 計算を持たない。
 * - thumb 位置の正本は既存 `toolbarOffset` だけ。第二の scroll position state を持たない。
 * - offset は視覚的な scroll 方向と逆向きである。`translateX` が大きいほど toolbar は
 *   右へ動き、論理的な先頭が見える。したがって progress 0（先頭）は `bounds.max`、
 *   progress 1（末尾）は `bounds.min` に対応する。生の offset を thumb 座標へ
 *   そのまま使わず、必ずここの変換式を通す。
 * - timer / polling / quiet period を使わない。すべて呼び出し時点の snapshot から決まる。
 */

/** fractional geometry（DPR 由来の端数）を overflow とみなさないための許容幅（px）。 */
export const TOOLBAR_OVERFLOW_EPSILON = 1

/** thumb が掴めなくならないための最小幅（px）。 */
export const TOOLBAR_SCROLL_THUMB_MIN_WIDTH = 24

export type ToolbarOffsetBounds = { min: number; max: number }

/**
 * ResizeObserver の同一 snapshot から読み取る header geometry。
 *
 * `trackLeft` / `trackWidth` は left fixed zone の右端と right fixed zone の左端の間、
 * つまり実際の toolbar viewport だけを指す（native window controls / traffic lights を
 * 含む固定 zone は track に入れない）。
 */
export type ToolbarViewportMetrics = {
  /** header の左端を原点とした track の左位置。 */
  trackLeft: number
  /** track（= toolbar viewport）の幅。 */
  trackWidth: number
  /** toolbar wrapper の実幅。 */
  contentWidth: number
  /** 既存 `computeOffsetBounds()` の結果。 */
  bounds: ToolbarOffsetBounds
}

export type ToolbarScrollIndicatorGeometry = {
  trackLeft: number
  trackWidth: number
  thumbWidth: number
  /** track 左端を原点とした thumb の左位置。 */
  thumbLeft: number
  /** 0（論理先頭が見えている）〜 1（論理末尾が見えている）。 */
  progress: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** 有限かつ track / content 幅が正の snapshot だけを受理する。 */
export function isValidToolbarViewportMetrics(
  metrics: ToolbarViewportMetrics | null | undefined,
): metrics is ToolbarViewportMetrics {
  if (!metrics) return false
  if (!isFiniteNumber(metrics.trackLeft)) return false
  if (!isFiniteNumber(metrics.trackWidth) || metrics.trackWidth <= 0) return false
  if (!isFiniteNumber(metrics.contentWidth) || metrics.contentWidth <= 0) return false
  if (!metrics.bounds) return false
  if (!isFiniteNumber(metrics.bounds.min) || !isFiniteNumber(metrics.bounds.max)) return false
  return true
}

/**
 * overflow authority。実 geometry だけで fit / overflow を分類する。
 * stale / zero-width / 非有限 snapshot は「overflow なし」へ fail-safe する。
 */
export function isToolbarOverflowing(
  metrics: ToolbarViewportMetrics | null | undefined,
  epsilon: number = TOOLBAR_OVERFLOW_EPSILON,
): boolean {
  if (!isValidToolbarViewportMetrics(metrics)) return false
  return metrics.contentWidth > metrics.trackWidth + epsilon
}

/** `bounds.min <= bounds.max` へ正規化する（raw bounds が反転していても扱う）。 */
export function normalizeOffsetBounds(bounds: ToolbarOffsetBounds): ToolbarOffsetBounds {
  if (!isFiniteNumber(bounds.min) || !isFiniteNumber(bounds.max)) return { min: 0, max: 0 }
  return bounds.min <= bounds.max
    ? { min: bounds.min, max: bounds.max }
    : { min: bounds.max, max: bounds.min }
}

/** offset を bounds 内へ clamp する（resize 後 / 保存済み offset の復元で使う）。 */
export function clampOffsetToBounds(offset: number, bounds: ToolbarOffsetBounds): number {
  const { min, max } = normalizeOffsetBounds(bounds)
  if (!isFiniteNumber(offset)) return max
  if (offset < min) return min
  if (offset > max) return max
  return offset
}

/**
 * offset → progress。`bounds.max` が論理先頭（progress 0）、`bounds.min` が論理末尾。
 * travel 0（fit / zero travel）は常に 0 を返す。
 */
export function toolbarOffsetToProgress(offset: number, bounds: ToolbarOffsetBounds): number {
  const { min, max } = normalizeOffsetBounds(bounds)
  const travel = max - min
  if (travel <= 0) return 0
  return clamp01((max - clampOffsetToBounds(offset, bounds)) / travel)
}

/** progress → offset。`toolbarOffsetToProgress()` の逆変換。 */
export function progressToToolbarOffset(progress: number, bounds: ToolbarOffsetBounds): number {
  const { min, max } = normalizeOffsetBounds(bounds)
  const travel = max - min
  if (travel <= 0) return max
  return max - clamp01(progress) * travel
}

/**
 * indicator geometry。overflow していない / snapshot が不正なときは null を返し、
 * 呼び出し側が indicator を描画しないようにする。
 */
export function computeToolbarScrollIndicator(input: {
  metrics: ToolbarViewportMetrics | null | undefined
  offset: number
  minThumbWidth?: number
  epsilon?: number
}): ToolbarScrollIndicatorGeometry | null {
  const { metrics } = input
  if (!isToolbarOverflowing(metrics, input.epsilon ?? TOOLBAR_OVERFLOW_EPSILON)) return null
  // isToolbarOverflowing() が真なら metrics は valid。
  const valid = metrics as ToolbarViewportMetrics
  const minThumbWidth = input.minThumbWidth ?? TOOLBAR_SCROLL_THUMB_MIN_WIDTH
  const ratio = clamp01(valid.trackWidth / valid.contentWidth)
  const thumbWidth = Math.max(
    Math.min(minThumbWidth, valid.trackWidth),
    Math.min(valid.trackWidth, ratio * valid.trackWidth),
  )
  const progress = toolbarOffsetToProgress(input.offset, valid.bounds)
  const travel = Math.max(0, valid.trackWidth - thumbWidth)
  return {
    trackLeft: valid.trackLeft,
    trackWidth: valid.trackWidth,
    thumbWidth,
    thumbLeft: progress * travel,
    progress,
  }
}

/**
 * thumb pointer drag の 1 回分の解決。pointer 座標から新しい `toolbarOffset` を返す。
 * `grabOffset` は pointerdown 時に thumb 内のどこを掴んだかで、drag 中不変。
 */
export function resolveThumbDragOffset(input: {
  pointerX: number
  /** viewport 座標系での track 左端。 */
  trackClientLeft: number
  trackWidth: number
  thumbWidth: number
  grabOffset: number
  bounds: ToolbarOffsetBounds
}): number {
  const travel = input.trackWidth - input.thumbWidth
  if (!isFiniteNumber(input.pointerX) || !(travel > 0)) {
    // zero travel: 掴めても動かない。既存 offset を壊さないよう先頭側へ固定する。
    return progressToToolbarOffset(0, input.bounds)
  }
  const thumbLeft = input.pointerX - input.trackClientLeft - input.grabOffset
  return progressToToolbarOffset(thumbLeft / travel, input.bounds)
}

/**
 * toolbar pan grip の 1 回分の解決。開始時の clientX / offset / bounds snapshot だけを使い、
 * 現在 pointerX との差を既存 `computeOffsetBounds()` の範囲へ clamp する。
 * fit（余白内配置）でも overflow（alignment extreme 間）でも同じ式。
 */
export function resolveToolbarPanDragOffset(input: {
  pointerX: number
  startX: number
  startOffset: number
  bounds: ToolbarOffsetBounds
}): number {
  if (
    !isFiniteNumber(input.pointerX) ||
    !isFiniteNumber(input.startX) ||
    !isFiniteNumber(input.startOffset)
  ) {
    return clampOffsetToBounds(input.startOffset, input.bounds)
  }
  return clampOffsetToBounds(
    input.startOffset + (input.pointerX - input.startX),
    input.bounds,
  )
}
