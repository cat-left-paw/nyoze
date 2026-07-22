/**
 * 中央エディタのスクロール端（章頭 / 章末付近）判定の pure helper。
 *
 * DOM に依存しない純粋関数。スクロール metrics（offset / maxScroll / viewport 長）から、
 * 「先頭付近（章頭）」「末尾付近（章末）」かどうかを conservative に判定する。
 *
 * 縦書き（vertical-rl）では横スクロールになり、ブラウザによって scrollLeft の符号が
 * 0→負（標準的な RTL 規約）になる。符号差を吸収するため offset は絶対値で扱う。
 * read-only な表示判定で、本文 / PM doc / Markdown を一切変更しない。
 */

export type ScrollEdgeMetrics = {
  /** スクロール軸の現在 offset（横書き=scrollTop、縦書き=scrollLeft）。符号は問わない。 */
  offset: number
  /** スクロール可能な最大量（scrollHeight-clientHeight、または scrollWidth-clientWidth）。 */
  maxScroll: number
  /** スクロール軸方向の viewport 長（横書き=clientHeight、縦書き=clientWidth）。 */
  viewportLength: number
}

export type ScrollEdges = {
  /** 章頭（本文先頭）付近にいる。 */
  atStart: boolean
  /** 章末（本文末尾）付近にいる。 */
  atEnd: boolean
}

/** しきい値の下限（px）。狭い viewport でも最低限ここまでは「端」とみなす。 */
const EDGE_THRESHOLD_MIN_PX = 40
/** しきい値の上限（px）。広い viewport で端の判定が緩くなりすぎないようにする。 */
const EDGE_THRESHOLD_MAX_PX = 180
/** viewport 長に対するしきい値の比率（端から viewport の約 16% まで）。 */
const EDGE_THRESHOLD_RATIO = 0.16

/** viewport 長から、端判定のしきい値（px）を求める。 */
export function resolveEdgeThreshold(viewportLength: number): number {
  const raw = viewportLength * EDGE_THRESHOLD_RATIO
  return Math.max(EDGE_THRESHOLD_MIN_PX, Math.min(raw, EDGE_THRESHOLD_MAX_PX))
}

/**
 * スクロール metrics から章頭 / 章末付近かどうかを返す。
 *
 * - offset は絶対値で「先頭からの距離」とみなす（縦書きの符号差を吸収）。
 * - overflow が無い（maxScroll <= 0）短い文書では、先頭にも末尾にもいる扱い（両方 true）。
 */
export function computeScrollEdges(metrics: ScrollEdgeMetrics): ScrollEdges {
  const max = Math.max(0, metrics.maxScroll)
  const distanceFromStart = Math.min(Math.abs(metrics.offset), max)
  const distanceFromEnd = max - distanceFromStart
  const threshold = resolveEdgeThreshold(metrics.viewportLength)
  return {
    atStart: distanceFromStart <= threshold,
    atEnd: distanceFromEnd <= threshold,
  }
}
