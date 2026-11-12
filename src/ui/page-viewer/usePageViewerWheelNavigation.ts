/**
 * Page Viewer の本文の領域（`.page-viewer-window__body`）に `wheel` の listener を付け、
 * マウスのホイール・トラックパッドで 1 回の操作 1 ページだけ進める（PAGE-VIEWER-WHEEL1）。
 *
 * 判定は純粋な controller（`pageViewerWheelNavigation.ts`）で、ここは DOM との接続だけ:
 * - 移動は、キーボードと同じ `navigateByPage`（ページめくりの演出を含む経路）を呼ぶ。ページ番号の計算を複製しない。
 *   演出の間だけ止める処理は足さない（新しい操作なら、キーを 2 回押したときと同じく受理した値から次へ進む）。
 * - listener は本文の領域だけに付ける。目次・スクラバー・設定などのパネルは本文の兄弟（または header の中）で
 *   子孫ではないので、パネルの上のホイールはここへ届かず、それぞれのスクロールが優先される。
 * - 本文の領域は `overflow: hidden` で自分ではスクロールしない（ページは transform で動かす）ので、移動の対象になる
 *   ホイール（Ctrl・Meta・Alt 付きを除く）は `preventDefault()` する。失うスクロールはなく、慣性の残りを
 *   scroll chaining へ流さない。Ctrl・Meta・Alt 付き（ピンチ・拡大縮小など）は、そのまま既定の動きに任せる。
 * - controller は `enabled`（`ready`）と書字方向ごとに作り直す。ready でない間・書字方向の変更・文書の読み込み直し・
 *   unmount で、累積と latch を捨てる。`navigateByPage` は ref 経由で読む（ページ数の再計測で関数が作り直されても、
 *   進行中の操作の latch を失わないため）。
 */

import { useEffect, useRef, type RefObject } from 'react'
import type { WritingMode } from '../../settings/types'
import type { PageMoveDirection } from './pageViewerPageNavigation'
import { createPageViewerWheelNavigationController, isPageViewerWheelModifierIgnored } from './pageViewerWheelNavigation'

type UsePageViewerWheelNavigationInput = {
  bodyRef: RefObject<HTMLElement | null>
  /** 文書が表示できる状態（`ready`）のときだけ true。 */
  enabled: boolean
  writingMode: WritingMode
  navigateByPage: (direction: PageMoveDirection) => void
}

export function usePageViewerWheelNavigation({
  bodyRef,
  enabled,
  writingMode,
  navigateByPage,
}: UsePageViewerWheelNavigationInput): void {
  const navigateByPageRef = useRef(navigateByPage)
  navigateByPageRef.current = navigateByPage

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !enabled) return
    const controller = createPageViewerWheelNavigationController()
    const handleWheel = (event: WheelEvent) => {
      if (isPageViewerWheelModifierIgnored(event)) return
      event.preventDefault()
      const direction = controller.handle({
        writingMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        nowMs: event.timeStamp,
      })
      if (direction === 'none') return
      navigateByPageRef.current(direction === 'next' ? 'next' : 'prev')
    }
    body.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      body.removeEventListener('wheel', handleWheel)
      controller.reset()
    }
  }, [bodyRef, enabled, writingMode])
}
