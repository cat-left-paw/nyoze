/**
 * Paragraph Plain「表示優先」(comfortable) 時の host 側 `--pp-reserved-block-size` 更新を
 * 粗くするための純関数と stepPx 解決。
 *
 * overlay の textarea 寸法・キャレットは paragraphPlainMode 側で即時更新し、
 * ここでは host に書く予約サイズの量子化のみを担う。
 *
 * ## 微小 overflow とステップ帯（再スパイク）
 *
 * `scrollHeight` の端数や overlay の padding などで、`idealPx - basePx` が 1〜2px だけ
 * 正になることがある。従来の `ceil(overflow / step)` だと、この微小差だけで 1 step 分
 * 背後本文が押し出され、Paragraph Plain を開始しただけで段がずれたように見える。
 *
 * 対策は二段構え:
 * 1. **微小 overflow 閾値** — `overflow <= epsilonPx` の間は `hostTarget = basePx` のまま据え置き。
 *    クリック開始直後の 1〜2px 級のずれでは背後を動かさない。
 * 2. **閾値超過後は ceil で量子化** — `excess = overflow - epsilonPx` に対し
 *    `steps = ceil(excess / stepPx)` とする。`floor` だけだと
 *    `epsilon < overflow < epsilon + stepPx` の間が常に 0 step となり、本文が次の行/列へ
 *    回り込み始めても host が増えず、背後が半分隠れる・次の入力で一段ずれる現象になる。
 *    `ceil` により「有意な excess が生じたら最低 1 step」を確保しつつ、複数行/列は
 *    引き続き step 単位で粗くまとめられる。
 *
 * excess がごく小さい（epsilon 直後の数 px）で 1 step につながる場合は、epsilon を
 * 十分に取ることで実機では稀に抑える。
 */

import {
  computeOverlayReservedHostTargetPx,
  parseCssFontSizeToPx,
  parseCssLineHeightToPx,
  resolveOverlayReservedEpsilonPx,
} from './overlayReservedBlockLayout'

export { parseCssFontSizeToPx, parseCssLineHeightToPx } from './overlayReservedBlockLayout'

export type ParagraphPlainReservedStepPxCache = {
  signature: string
  stepPx: number
}

const MIN_STEP_PX = 4
const MAX_STEP_PX = 512

function clampStep(px: number): number {
  if (!Number.isFinite(px)) return 16
  return Math.min(MAX_STEP_PX, Math.max(MIN_STEP_PX, Math.round(px)))
}

/** 押し出し軸の「ブロック寸法」ベース（ideal と同じ軸）。 */
export function paragraphPlainReserveAxisBasePx(params: {
  baseRect: { width: number; height: number }
  writingMode: string
}): number {
  const wm = params.writingMode || ''
  return wm === 'vertical-rl' ? params.baseRect.width : params.baseRect.height
}

/**
 * `stepPx`（行送り相当）から微小 overflow 無視幅を決める。
 * 固定 px だけでもよいが、縦書きで step が小さい/大きい極端に寄らないよう
 * 比例項と下限・上限でクリップする。
 */
export function resolveComfortableReservedEpsilonPx(stepPx: number): number {
  return resolveOverlayReservedEpsilonPx(Math.max(1, stepPx)) ?? 3
}

/**
 * ideal（`computeOverlayReservedBlockSize` と同一）から host に書く量子化済み px を求める。
 *
 * - `overflow <= epsilonPx` → `basePx`（微小ずれでは背後を動かさない）
 * - それ以外 → `basePx + ceil((overflow - epsilonPx) / stepPx) * stepPx`
 */
export function computeComfortableReservedHostTargetPx(params: {
  idealPx: number
  basePx: number
  stepPx: number
  /** 省略時は `resolveComfortableReservedEpsilonPx(stepPx)` */
  epsilonPx?: number
}): number {
  return computeOverlayReservedHostTargetPx({
    ...params,
    stepPx: Math.max(1, params.stepPx),
    epsilonPx: params.epsilonPx ?? resolveComfortableReservedEpsilonPx(params.stepPx),
  }) ?? params.basePx
}

/**
 * overlay textarea の computed style から stepPx を得る。
 * writingMode + font-size + line-height の指紋が変わらない限り cache を再利用し hot path の getComputedStyle を抑える。
 */
export function resolveParagraphPlainReservedStepPx(
  overlay: HTMLTextAreaElement,
  writingMode: string,
  cache: ParagraphPlainReservedStepPxCache | null,
): { stepPx: number; cache: ParagraphPlainReservedStepPxCache } {
  const cs = getComputedStyle(overlay)
  const wm = writingMode || cs.writingMode || ''
  const fontSizeRaw = cs.fontSize
  const lineHeightRaw = cs.lineHeight
  const signature = `${wm}\0${fontSizeRaw}\0${lineHeightRaw}`

  if (cache != null && cache.signature === signature) {
    return { stepPx: cache.stepPx, cache }
  }

  const fontSizePx = parseCssFontSizeToPx(fontSizeRaw, 16)
  const isVertical = wm === 'vertical-rl'
  const stepPx = isVertical
    ? clampStep(fontSizePx)
    : parseCssLineHeightToPx(lineHeightRaw, fontSizePx)

  const next: ParagraphPlainReservedStepPxCache = { signature, stepPx }
  return { stepPx, cache: next }
}
