/**
 * EDITOR-RUBY-OVERLAY-P0: top-level の block の矩形を二分探索して、帯（画面の近く）に交差する block の範囲を決める（pure）。
 * 全ルビ・全 block を走査しない。矩形の読み取りは block の数の log₂ 回程度。
 *
 * 帯と矩形は、どちらも viewport 座標。縦書き（vertical-rl）は x、横書き（horizontal-tb）は y が、読み進める向き。
 * block は文書の順に、縦書きなら右から左へ、横書きなら上から下へ並ぶ。
 * `display: none`の block（折りたたみ）の矩形は 0 なので、次の空でない block の判定を借りる（空の block に読みはない）。
 */
export type RectLike = { left: number; right: number; top: number; bottom: number }
export type Band = { lo: number; hi: number }

export const isEmptyRect = (rect: RectLike): boolean => rect.right - rect.left === 0 && rect.bottom - rect.top === 0

/** 帯より文書の前（縦書きは右、横書きは上）にだけある。 */
export const isBeforeBand = (rect: RectLike, band: Band, vertical: boolean): boolean =>
  vertical ? rect.left > band.hi : rect.bottom < band.lo
/** 帯より文書の後（縦書きは左、横書きは下）にだけある。 */
export const isAfterBand = (rect: RectLike, band: Band, vertical: boolean): boolean =>
  vertical ? rect.right < band.lo : rect.top > band.hi

function firstIndexWhere(count: number, rectOf: (index: number) => RectLike, test: (rect: RectLike) => boolean): number {
  let a = 0
  let b = count
  while (a < b) {
    const mid = (a + b) >> 1
    let probe = mid
    let rect = rectOf(probe)
    // 空の矩形（display: none）は、次の空でない block の判定を借りる。
    while (isEmptyRect(rect) && probe + 1 < b) {
      probe += 1
      rect = rectOf(probe)
    }
    if (isEmptyRect(rect)) {
      b = mid
      continue
    }
    if (test(rect)) b = mid
    else a = probe + 1
  }
  return a
}

/** 帯に交差し得る block の範囲 `[start, end)`。空の block を余分に含んでよい（読みがない）。 */
export function findBlockRange(
  count: number,
  rectOf: (index: number) => RectLike,
  band: Band,
  vertical: boolean,
): [number, number] {
  const start = firstIndexWhere(count, rectOf, (rect) => !isBeforeBand(rect, band, vertical))
  const end = firstIndexWhere(count, rectOf, (rect) => isAfterBand(rect, band, vertical))
  return [start, Math.max(start, end)]
}
