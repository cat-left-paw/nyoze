/**
 * Page Viewer の CSS multicol pagination の DOM 側 adapter hook。
 *
 * 正本: `docs/page-viewer-css-columns-design-2026-07.md` §12。純粋計算は
 * `pageViewerColumnMetrics.ts`、React component (DOM 構造 / keyboard / scrubber)
 * は `PageViewerWindowRoot.tsx` が担当し、この hook はその間の
 * 「実測 → column CSS 適用 → metrics cache → transform 適用」だけを持つ。
 *
 * 責務:
 * - frame (mask、`overflow: hidden`) の client size を実測し、flow (multicol
 *   container) の inline style を書く。**flow の inline style はこの hook が
 *   専有する** (component 側から style prop で触らない)。
 * - metrics 確定は必ず transform を外した状態で scrollWidth/scrollHeight を
 *   実測して行う。Chromium では flow への transform が frame の live scroll
 *   size を transform 後 bounds へ縮めるため (§12.3)、navigation 中に live
 *   値から pageCount / progress を再計算してはならない。
 * - 再計測のトリガは: 初回 mount / writingMode・gap・contentKey (viewModel)
 *   変更 / frame の resize (ResizeObserver) / フォント読み込み完了
 *   (`document.fonts.ready` — 明朝系 webfont 適用で column の折り返しが変わる)。
 *   viewer は open 時 snapshot 固定なので fontSize / lineHeight は変わらないが、
 *   変わる場合も CSS variables 経由で frame/flow のレイアウトが変わり
 *   ResizeObserver か contentKey で拾える設計にしておく。
 * - `pageIndex` は metrics 変更時に必ず clamp する (resize で pageCount が
 *   減っても範囲外に残らない)。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { WritingMode } from '../../settings/types'
import type { PageMoveDirection } from './pageViewerPageNavigation'
import {
  buildPageViewerColumnMetrics,
  clampPageIndex,
  computePageViewerColumnLayout,
  flowTransformForPageIndex,
  PAGE_VIEWER_COLUMN_GAP,
  type PageViewerColumnLayout,
  type PageViewerColumnMetrics,
} from './pageViewerColumnMetrics'

type UsePageViewerColumnLayoutInput = {
  /** 1 ページぶんの可視マスク。client size の実測と ResizeObserver の対象。 */
  frameRef: RefObject<HTMLDivElement | null>
  /** CSS multicol を適用する実 content flow。inline style はこの hook が専有する。 */
  flowRef: RefObject<HTMLDivElement | null>
  writingMode: WritingMode
  /**
   * 内容の同一性 key。viewer は snapshot 単位で `PageViewModel` を作り直すので
   * その object identity をそのまま渡す (内容が変われば再計測)。未 ready の間は
   * `null` (frame/flow が無いので計測しない)。
   */
  contentKey: unknown
  gap?: number
  /**
   * 呼び出し側が明示的に再計測を待ちたいgeneration。読書面reflowのratio復元は
   * ResizeObserver / metrics更新後にだけ消費するため、frameのsizeが偶然同じでも
   * このtoken変更で必ず1回measureする。
  */
  measureToken?: number
}

export type UsePageViewerColumnLayoutResult = {
  /** layout 確定時に cache した metrics。未計測 (loading / frame 未 mount) は null。 */
  metrics: PageViewerColumnMetrics | null
  /** 最後に実frameを計測できた明示token。ratio復元のackにだけ用いる。 */
  measuredToken: number | null
  pageIndex: number
  goToPage: (pageIndex: number) => void
  moveByPage: (direction: PageMoveDirection) => void
  /** image load/error など content height だけが変わる場合の rAF coalesced 再計測。 */
  scheduleMeasure: () => void
}

/** layout 値を flow の inline style へ書き込む (transform は含まない)。 */
function applyColumnLayoutToFlow(flow: HTMLDivElement, layout: PageViewerColumnLayout): void {
  const style = flow.style
  style.boxSizing = 'border-box'
  style.width = `${layout.frameWidth}px`
  style.height = `${layout.frameHeight}px`
  style.columnWidth = `${layout.columnWidth}px`
  style.columnGap = `${layout.gap}px`
  // Images use these logical constraints so their intrinsic dimensions cannot
  // escape one *content column* even inside a paragraph whose block size is
  // auto. The page pitch includes the column gap, whose half is padding on
  // each inline edge, so it must not be used as an image's inline maximum.
  const frameInlineSize = layout.pageAxis === 'y' ? layout.frameHeight : layout.frameWidth
  const frameBlockSize = layout.pageAxis === 'y' ? layout.frameWidth : layout.frameHeight
  style.setProperty('--page-viewer-frame-inline-size', `${frameInlineSize}px`)
  style.setProperty('--page-viewer-frame-block-size', `${frameBlockSize}px`)
  style.setProperty('--page-viewer-content-inline-size', `${layout.columnWidth}px`)
  // inline 軸両端の gap/2 余白 (§12.2)。vertical-rl の inline 軸は縦 (上下)、
  // horizontal-tb は横 (左右)。
  style.padding =
    layout.pageAxis === 'y' ? `${layout.inlinePadding}px 0` : `0 ${layout.inlinePadding}px`
}

export function usePageViewerColumnLayout(
  input: UsePageViewerColumnLayoutInput,
): UsePageViewerColumnLayoutResult {
  const { frameRef, flowRef, writingMode, contentKey } = input
  const gap = input.gap ?? PAGE_VIEWER_COLUMN_GAP
  const measureToken = input.measureToken ?? 0

  const [metrics, setMetrics] = useState<PageViewerColumnMetrics | null>(null)
  const [measuredToken, setMeasuredToken] = useState<number | null>(null)
  const [pageIndex, setPageIndex] = useState(0)

  // measure() は ResizeObserver / fonts.ready のコールバックからも呼ぶため、
  // 最新の値を ref で参照する (effect の依存を増やして listener を張り直さない)。
  const metricsRef = useRef<PageViewerColumnMetrics | null>(null)
  const pageIndexRef = useRef(0)
  const pendingMeasureFrameRef = useRef<number | null>(null)

  const measure = useCallback(() => {
    const frame = frameRef.current
    const flow = flowRef.current
    if (!frame || !flow) return
    const layout = computePageViewerColumnLayout({
      writingMode,
      frameWidth: frame.clientWidth,
      frameHeight: frame.clientHeight,
      gap,
    })
    if (!layout) {
      metricsRef.current = null
      setMetrics(null)
      return
    }
    // 計測は必ず transform なしで行う (§12.3: transform は live scroll size を縮める)。
    flow.style.transform = 'none'
    applyColumnLayoutToFlow(flow, layout)
    const setupScrollSize = layout.pageAxis === 'y' ? frame.scrollHeight : frame.scrollWidth
    const nextMetrics = buildPageViewerColumnMetrics(layout, setupScrollSize)
    // React の state 反映を待たずに現在ページの transform を戻す (resize 中に
    // 「一瞬 page 0 が見える」paint を挟まないため)。page index はここで clamp する。
    const clampedIndex = clampPageIndex(pageIndexRef.current, nextMetrics.pageCount)
    flow.style.transform = flowTransformForPageIndex(nextMetrics, clampedIndex)
    metricsRef.current = nextMetrics
    pageIndexRef.current = clampedIndex
    setMetrics(nextMetrics)
    setPageIndex(clampedIndex)
    setMeasuredToken(measureToken)
  }, [frameRef, flowRef, writingMode, gap, measureToken])

  // 初回 + writingMode / gap / content 変更時の計測。loading → ready の遷移も
  // contentKey (null → viewModel) の変化としてここで拾う。paint 前に layout と
  // transform を確定させるため useLayoutEffect にする。
  useLayoutEffect(() => {
    if (contentKey == null) return
    measure()
  }, [measure, contentKey, measureToken])

  // frame の resize (window resize / 将来の pane 化) で再計測する。measure() は
  // flow の style だけを書き、frame 自身のサイズには影響しないため観測ループに
  // ならない。
  useEffect(() => {
    const frame = frameRef.current
    if (!frame || contentKey == null) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frameRef, measure, contentKey])

  // フォント読み込み完了後に一度だけ再計測する (font metrics 変化で column の
  // 折り返し = setupScrollSize が変わり得る)。
  useEffect(() => {
    if (contentKey == null) return
    let cancelled = false
    const fonts = document.fonts
    if (!fonts?.ready) return
    void fonts.ready.then(() => {
      if (!cancelled) measure()
    })
    return () => {
      cancelled = true
    }
  }, [measure, contentKey])

  // pageIndex 変更時の transform 適用 (measure() 内の直接適用と同じ式)。
  useLayoutEffect(() => {
    const flow = flowRef.current
    if (!flow || !metrics) return
    flow.style.transform = flowTransformForPageIndex(metrics, pageIndex)
  }, [flowRef, metrics, pageIndex])

  const goToPage = useCallback((nextPageIndex: number) => {
    const current = metricsRef.current
    const clamped = clampPageIndex(nextPageIndex, current?.pageCount ?? 1)
    // page index が変わらないときは React state / transform を触らない
    // (scrubber drag 中の同一 page 上での pointer move で不要な再描画を避ける)。
    if (clamped === pageIndexRef.current) return
    pageIndexRef.current = clamped
    setPageIndex(clamped)
  }, [])

  const moveByPage = useCallback(
    (direction: PageMoveDirection) => {
      goToPage(pageIndexRef.current + (direction === 'next' ? 1 : -1))
    },
    [goToPage],
  )

  const scheduleMeasure = useCallback(() => {
    if (pendingMeasureFrameRef.current !== null) return
    pendingMeasureFrameRef.current = window.requestAnimationFrame(() => {
      pendingMeasureFrameRef.current = null
      measure()
    })
  }, [measure])

  useEffect(() => {
    return () => {
      if (pendingMeasureFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingMeasureFrameRef.current)
      }
    }
  }, [])

  return { metrics, measuredToken, pageIndex, goToPage, moveByPage, scheduleMeasure }
}
