import { useEffect, useRef } from 'react'
import type { WritingMode } from '../../settings/types'
import type { ScrollEdges } from '../utils/editorScrollEdges'
import {
  createChapterBoundaryWheelNavigationController,
  type ChapterBoundaryWheelNavigationController,
} from '../utils/editorChapterBoundaryWheelNavigation'

/**
 * 中央エディタ（通常 WYSIWYG）の章境界で `Option/Alt + スクロール` を前後章ナビゲーションへ
 * 変換する runtime hook。判定ロジック自体は pure controller
 * （{@link createChapterBoundaryWheelNavigationController}）に閉じ込め、本 hook は DOM listener
 * 登録・WheelEvent → controller 入力変換・trigger 時の callback 呼び出し・cleanup・context reset・
 * navigation 多重実行防止だけを担う。
 *
 * listener:
 * - 対象は `getScrollHost()` が返す `.editor-surface` のみ（document / window への global listener なし）。
 * - `passive: false` かつ **capture phase** で登録し、EditorCore の bubble wheel 補正より先に判定する。
 * - pure controller が previous / next を返した event だけ `preventDefault()` + `stopPropagation()` し、
 *   navigation callback を 1 回呼ぶ。`none`（1 イベント目 / 閾値未到達 / gate 拒否）では一切阻害しない。
 *
 * 不変条件:
 * - Markdown / frontmatter / books.json を書かない（navigation callback 側の既存 flow に委譲）。
 * - dirty guard / Source Mode draft guard / Paragraph Plain commit を迂回しない（同上）。
 * - renderer から解決済み project root を渡さない。
 */

type UseEditorChapterBoundaryWheelNavigationOptions = {
  /** `.editor-surface` を返す getter。 */
  getScrollHost: () => HTMLElement | null
  /** active file path（文脈 reset 判定に使う）。 */
  getActiveFilePath: () => string | null
  writingMode: WritingMode
  /**
   * 明示的な無効化（Source Mode / Paragraph Plain / 内部 read-only doc 等）。
   * これが切り替わったときだけ full `reset()` し、cooldown / latch を破棄する。
   */
  navigationDisabled: boolean
  /**
   * 章 neighbors が解決済みか。章移動直後の再取得で loading→ready と一時的に揺れる
   * transient な値で、これだけでは cooldown / latch を破棄しない（listener の着脱のみ）。
   */
  neighborsReady: boolean
  /** スクロール端（章頭 / 章末）判定。 */
  edges: ScrollEdges
  hasPrevious: boolean
  hasNext: boolean
  /** IME composition 判定（EditorCoreHandle.isComposing() を渡す）。 */
  getIsComposing: () => boolean
  /** previous trigger（前章末尾へ same-tab 移動）。 */
  onNavigatePrevious: () => Promise<void> | void
  /** next trigger（次章先頭へ same-tab 移動）。 */
  onNavigateNext: () => Promise<void> | void
}

export function useEditorChapterBoundaryWheelNavigation({
  getScrollHost,
  getActiveFilePath,
  writingMode,
  navigationDisabled,
  neighborsReady,
  edges,
  hasPrevious,
  hasNext,
  getIsComposing,
  onNavigatePrevious,
  onNavigateNext,
}: UseEditorChapterBoundaryWheelNavigationOptions): void {
  const controllerRef = useRef<ChapterBoundaryWheelNavigationController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createChapterBoundaryWheelNavigationController()
  }
  // wheel による navigation Promise が未完了の間は、追加 trigger を無視する二重ガード。
  const navigationInFlightRef = useRef(false)

  // listener を張るのは「明示的に無効でなく」かつ「neighbors 解決済み」のときだけ。
  const listenerActive = !navigationDisabled && neighborsReady

  // listener は安定参照のまま最新値を読むため、変化しうる入力を ref へミラーする。
  const getScrollHostRef = useRef(getScrollHost)
  const writingModeRef = useRef(writingMode)
  const navigationDisabledRef = useRef(navigationDisabled)
  const listenerActiveRef = useRef(listenerActive)
  const edgesRef = useRef(edges)
  const hasPreviousRef = useRef(hasPrevious)
  const hasNextRef = useRef(hasNext)
  const getIsComposingRef = useRef(getIsComposing)
  const onNavigatePreviousRef = useRef(onNavigatePrevious)
  const onNavigateNextRef = useRef(onNavigateNext)
  getScrollHostRef.current = getScrollHost
  writingModeRef.current = writingMode
  navigationDisabledRef.current = navigationDisabled
  listenerActiveRef.current = listenerActive
  edgesRef.current = edges
  hasPreviousRef.current = hasPrevious
  hasNextRef.current = hasNext
  getIsComposingRef.current = getIsComposing
  onNavigatePreviousRef.current = onNavigatePrevious
  onNavigateNextRef.current = onNavigateNext

  const activeFilePath = getActiveFilePath()

  // 明示的な無効化（Source Mode / Paragraph Plain 出入り）と writing mode 変更でだけ完全 reset し、
  // cooldown / latch / 最終入力時刻を破棄する。neighbors の transient な loading では呼ばれない。
  useEffect(() => {
    controllerRef.current?.reset()
    navigationInFlightRef.current = false
  }, [navigationDisabled, writingMode])

  // active file / edge / neighbor 変更では accumulation *だけ* を部分 reset する。
  // latch / cooldown / 最終入力時刻は維持し、章移動直後の neighbors loading→ready を挟んでも、
  // 同一慣性 gesture で次章へ連続ジャンプしない。
  useEffect(() => {
    controllerRef.current?.resetAccumulation()
  }, [activeFilePath, edges.atStart, edges.atEnd, hasPrevious, hasNext, neighborsReady])

  // listener は transient な neighbors loading で着脱してよいが、cleanup で controller を reset しない
  // （cooldown / latch を維持する）。完全 reset は上の navigationDisabled / writingMode 用 effect が担う。
  useEffect(() => {
    if (!listenerActive) return
    const host = getScrollHostRef.current()
    if (!host) return

    const onWheel = (event: WheelEvent) => {
      if (!listenerActiveRef.current) return
      const result = controllerRef.current?.handle({
        writingMode: writingModeRef.current,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        atStart: edgesRef.current.atStart,
        atEnd: edgesRef.current.atEnd,
        hasPrevious: hasPreviousRef.current,
        hasNext: hasNextRef.current,
        composing: getIsComposingRef.current(),
        navigationDisabled: navigationDisabledRef.current,
        nowMs: performance.now(),
      })
      if (result === undefined || result === 'none') return
      // navigation 実行中は preventDefault も nav 起動もしない（trigger を無視する）。
      if (navigationInFlightRef.current) return

      event.preventDefault()
      event.stopPropagation()
      navigationInFlightRef.current = true
      const callback =
        result === 'previous' ? onNavigatePreviousRef.current : onNavigateNextRef.current
      Promise.resolve()
        .then(() => callback())
        .catch(() => {})
        .finally(() => {
          navigationInFlightRef.current = false
        })
    }

    host.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => {
      host.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [listenerActive, writingMode])
}
