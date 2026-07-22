/**
 * Project タブ下部 preview / edit セクションの高さ比率を扱う pure helper。
 *
 * - React / DOM に依存しない（DOM 計測は呼び出し側が行い、生の px をここへ渡す）。
 * - 高さは body 高さに対する比率（0〜1）で保持し、Preview / Edit 切替や
 *   ペイン幅変更でも一定の表示高さを保てるようにする。
 * - 比率は `MIN_PREVIEW_RATIO` / `MAX_PREVIEW_RATIO` で clamp する。
 */

export const MIN_PREVIEW_RATIO = 0.15
export const MAX_PREVIEW_RATIO = 0.85

/** 比率を [MIN, MAX] に収める。非有限値は MIN に倒す。 */
export function clampPreviewRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return MIN_PREVIEW_RATIO
  return Math.min(MAX_PREVIEW_RATIO, Math.max(MIN_PREVIEW_RATIO, ratio))
}

/**
 * preview section の現在高さと body 高さから保持用比率を算出する。
 * 計測不能（body 高さ 0 以下 / 非有限 / section 高さ 0 以下）のときは null。
 * 値が得られた場合は必ず clamp 済みで返す。
 */
export function computePreviewRatio(
  sectionHeight: number,
  bodyHeight: number,
): number | null {
  if (!Number.isFinite(sectionHeight) || !Number.isFinite(bodyHeight)) return null
  if (bodyHeight <= 0 || sectionHeight <= 0) return null
  return clampPreviewRatio(sectionHeight / bodyHeight)
}

/**
 * Preview / Edit 切替時の高さ固定（lock）reducer。
 *
 * - 既に比率が確定している（`prev !== null`：divider 操作や直前の切替で固定済み）なら
 *   そのまま維持し、上書きしない（Preview→Edit→Preview で同じ高さを保ち、divider 設定も壊さない）。
 * - 未確定（null）のときだけ、現在の section 実高さを body 比率へ変換して固定する。
 *   計測不能なら null のままにする。
 */
export function nextLockedRatio(
  prev: number | null,
  sectionHeight: number,
  bodyHeight: number,
): number | null {
  if (prev !== null) return prev
  return computePreviewRatio(sectionHeight, bodyHeight)
}

/**
 * divider ドラッグ中の次の比率を算出する。
 * 上方向ドラッグ（startY - clientY > 0）で preview を広げる。
 */
export function computeDragPreviewRatio(input: {
  startHeight: number
  startY: number
  clientY: number
  bodyHeight: number
}): number | null {
  const { startHeight, startY, clientY, bodyHeight } = input
  if (!Number.isFinite(bodyHeight) || bodyHeight <= 0) return null
  const nextHeight = startHeight + (startY - clientY)
  return clampPreviewRatio(nextHeight / bodyHeight)
}
