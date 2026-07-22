/**
 * Page Viewer 下部 scrubber (rail + thumb) の pure helper。DOM / React には
 * 依存しない。
 *
 * PV-COL-2 (CSS multicol pagination) 以降、読書進行率は scroll 位置ではなく
 * `pageIndex / maxPageIndex` 由来 (`pageViewerColumnMetrics.ts` の
 * `progressRatioForPageIndex` / `pageIndexFromProgressRatio`) になったため、
 * この module の責務は「scrubber の画面上位置 ⇄ 読書進行率」と、PV-COL-3 の
 * scrubber 専用 keyboard / aria 変換だけ。
 * 旧実装の scroll 位置変換 helper (`progressRatioFromScrollMetrics` /
 * `scrollLeftFromProgressRatio` / `scrollTopFromProgressRatio`) は、任意
 * scroll offset の疑似ページ送りを廃止したため削除済み
 * (`docs/page-viewer-css-columns-design-2026-07.md` §1 / §12.3)。
 *
 * 「読書進行率」は writing mode に関わらず常に 0 (文書先頭) → 1 (文書末尾)。
 * scrubber 自体は常に横書き (左→右) で描画するため、画面上のポインタ位置
 * (0=左端, 1=右端) と読書進行率の対応は `horizontal-tb` ではそのまま、
 * `vertical-rl` では左右反転する (`flipRatioForWritingMode` が両方向とも
 * この 1 関数で表せる — 反転は自己逆写像なので同じ式を click→progress /
 * progress→thumb 表示位置のどちらにも使い回せる)。
 */

import type { WritingMode } from '../../settings/types'
import { pageIndexFromProgressRatio } from './pageViewerColumnMetrics'

/** `value` を 0〜1 にクランプする。`NaN` / `Infinity` は `0` 扱いにする。 */
export function clampRatio01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

/**
 * scrubber (常に横書き、左→右) の画面上位置 (0=左端 / 1=右端) と、
 * 読書進行率 (0=文書先頭 / 1=文書末尾) を相互変換する。
 *
 * - `horizontal-tb`: 左→右がそのまま 0→1 なので恒等写像。
 * - `vertical-rl`: 右→左が 0→1 (右端が文書先頭、左端が文書末尾) なので
 *   左右反転 (`1 - ratio`)。
 *
 * `1 - ratio` は自己逆写像 (2 回適用すると元に戻る) なので、この 1 関数を
 * 「pointer 位置 → 読書進行率」と「読書進行率 → thumb 表示位置」の両方に
 * 使い回せる。
 */
export function flipRatioForWritingMode(ratio: number, writingMode: WritingMode): number {
  const clamped = clampRatio01(ratio)
  return writingMode === 'vertical-rl' ? 1 - clamped : clamped
}

/** `pageCount` から最大 page index (`pageCount - 1`、最小 0) を返す。 */
export function maxPageIndexForPageCount(pageCount: number): number {
  if (!Number.isFinite(pageCount) || pageCount <= 1) return 0
  return Math.floor(pageCount) - 1
}

/**
 * scrubber rail 上の pointer X を最寄り page index へ変換する。
 * `railWidth <= 0` / 非有限座標は page 0。任意 scroll offset は作らない。
 */
export function pageIndexFromScrubberPointer(
  clientX: number,
  railLeft: number,
  railWidth: number,
  writingMode: WritingMode,
  pageCount: number,
): number {
  const pointerRatio =
    Number.isFinite(clientX) && Number.isFinite(railLeft) && Number.isFinite(railWidth) && railWidth > 0
      ? (clientX - railLeft) / railWidth
      : 0
  const progressRatio = flipRatioForWritingMode(pointerRatio, writingMode)
  return pageIndexFromProgressRatio(progressRatio, pageCount)
}

/**
 * scrubber rail に focus があるときのキー操作結果。
 * - `delta`: page index を ±1
 * - `home` / `end`: 文書先頭 / 末尾
 */
export type ScrubberKeyAction =
  | { kind: 'delta'; delta: 1 | -1 }
  | { kind: 'home' }
  | { kind: 'end' }

/**
 * scrubber rail に focus があるときのキー操作。
 *
 * - `Home` → 文書先頭 (page 0) / `End` → 文書末尾 (max page index)。
 * - 矢印は scrubber の視覚方向と writing mode を揃える (汎用 ARIA の
 *   「右=増加」固定にはしない):
 *   - `vertical-rl`: 左端が末尾なので `ArrowLeft` / `ArrowDown` = next、
 *     `ArrowRight` / `ArrowUp` = prev。
 *   - `horizontal-tb`: 右端が末尾なので `ArrowRight` = next、`ArrowLeft` = prev。
 *     ArrowUp / ArrowDownは本文ページ送りと同様に使わない。
 * - 該当しないキーは `null` (呼び出し側は `preventDefault` せず素通し)。
 */
export function resolveScrubberKeyAction(
  key: string,
  writingMode: WritingMode,
): ScrubberKeyAction | null {
  if (key === 'Home') return { kind: 'home' }
  if (key === 'End') return { kind: 'end' }

  if (writingMode === 'vertical-rl') {
    if (key === 'ArrowLeft' || key === 'ArrowDown') return { kind: 'delta', delta: 1 }
    if (key === 'ArrowRight' || key === 'ArrowUp') return { kind: 'delta', delta: -1 }
    return null
  }

  if (key === 'ArrowRight') return { kind: 'delta', delta: 1 }
  if (key === 'ArrowLeft') return { kind: 'delta', delta: -1 }
  return null
}

/**
 * scrubber の `aria-valuetext`。1 始まりの「現在ページ / 総ページ」表示
 * (`"1 / 10"`)。`pageCount <= 1` でも `"1 / 1"` に正規化し、NaN を出さない。
 */
export function scrubberAriaValueText(pageIndex: number, pageCount: number): string {
  const count = Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 1
  const maxIndex = Math.max(0, count - 1)
  const index = Number.isFinite(pageIndex)
    ? Math.min(Math.max(Math.floor(pageIndex), 0), maxIndex)
    : 0
  return `${index + 1} / ${count}`
}

/** scrubber rail へ渡す aria 属性一式 (`role="slider"` 前提)。 */
export function scrubberAriaProps(pageIndex: number, pageCount: number): {
  'aria-valuemin': number
  'aria-valuemax': number
  'aria-valuenow': number
  'aria-valuetext': string
} {
  const count = Number.isFinite(pageCount) && pageCount > 0 ? Math.floor(pageCount) : 1
  const maxIndex = Math.max(0, count - 1)
  const index = Number.isFinite(pageIndex)
    ? Math.min(Math.max(Math.floor(pageIndex), 0), maxIndex)
    : 0
  return {
    'aria-valuemin': 0,
    'aria-valuemax': maxIndex,
    'aria-valuenow': index,
    'aria-valuetext': scrubberAriaValueText(index, count),
  }
}
