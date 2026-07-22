import { useEffect, useRef, useState } from 'react'
import { computeScrollEdges, type ScrollEdges } from '../utils/editorScrollEdges'

/**
 * 中央エディタ（`.editor-surface` scroll host）のスクロール端を観測する hook。
 *
 * 章境界オーバーレイ（章頭・章末のボタン表示判定）に使う。
 * read-only な表示専用で、PM doc / Markdown / frontmatter を一切変更しない。
 *
 * 軽量化方針:
 * - scroll は passive listener + rAF で間引く。編集 hot path に全文シリアライズや
 *   重い DOM 全走査を入れない（端判定は scroll metrics の数値計算のみ）。
 * - `enabled` が false（Source Mode / Paragraph Plain / 章 neighbors 未解決）の間は listener を張らない。
 */

type UseEditorScrollEdgesOptions = {
  /** `.editor-surface` を返す getter（renderer は解決済み project root を一切渡さない）。 */
  getScrollHost: () => HTMLElement | null
  /** 観測を有効にするか（Source Mode / Paragraph Plain / 章 neighbors 未解決では false）。 */
  enabled: boolean
  /** 縦書きなら横スクロール軸（scrollLeft / scrollWidth / clientWidth）を見る。 */
  vertical: boolean
  /** 文書切替などで再計測したいとき変える key（active file path など）。 */
  resetKey: string
}

const HIDDEN: ScrollEdges = { atStart: false, atEnd: false }

export function useEditorScrollEdges({
  getScrollHost,
  enabled,
  vertical,
  resetKey,
}: UseEditorScrollEdgesOptions): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(HIDDEN)
  // getScrollHost は呼び出し側で inline 定義されがちなので ref 経由にし、effect の
  // 再subスクライブを resetKey / enabled / vertical の変化だけに限定する。
  const getScrollHostRef = useRef(getScrollHost)
  getScrollHostRef.current = getScrollHost

  useEffect(() => {
    if (!enabled) {
      setEdges(HIDDEN)
      return
    }
    const host = getScrollHostRef.current()
    if (!host) {
      setEdges(HIDDEN)
      // エディタ未mount直後などは host が取れないことがある。次フレームで一度だけ再試行。
      const retry = window.requestAnimationFrame(() => setEdges((prev) => prev))
      return () => window.cancelAnimationFrame(retry)
    }

    let rafHandle = 0
    const measure = () => {
      rafHandle = 0
      const target = getScrollHostRef.current()
      if (!target) {
        setEdges(HIDDEN)
        return
      }
      const metrics = vertical
        ? {
            offset: target.scrollLeft,
            maxScroll: target.scrollWidth - target.clientWidth,
            viewportLength: target.clientWidth,
          }
        : {
            offset: target.scrollTop,
            maxScroll: target.scrollHeight - target.clientHeight,
            viewportLength: target.clientHeight,
          }
      const next = computeScrollEdges(metrics)
      setEdges((prev) =>
        prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next,
      )
    }
    const schedule = () => {
      if (rafHandle === 0) rafHandle = window.requestAnimationFrame(measure)
    }

    schedule()
    host.addEventListener('scroll', schedule, { passive: true })
    // viewport / 本文サイズ変化（ウィンドウ resize, 文書ロード, ruby 切替など）でも再計測。
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(host)
    const content = host.querySelector('.editor-core-host')
    if (content) resizeObserver.observe(content)

    return () => {
      host.removeEventListener('scroll', schedule)
      resizeObserver.disconnect()
      if (rafHandle !== 0) window.cancelAnimationFrame(rafHandle)
    }
  }, [enabled, vertical, resetKey])

  return enabled ? edges : HIDDEN
}
