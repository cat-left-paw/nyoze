import type { EditOwner } from './editOwner'
import type { SurfaceRecord } from './inputSurface'
import { RANGE_NEWLINE_ATTRIBUTE } from './rangeNewlineBands'

type HighlightWindow = Window & {
  CSS?: { highlights?: Map<string, unknown> }
  Highlight?: new (...ranges: Range[]) => unknown
}
let sequence = 0

/**
 * `platform`: 試験で、macOS・Windows・Linuxの両方を試すための任意の引数。製品は渡さず、`navigator.platform`を読む
 * （入力面の`keyRouter.ts`と同じ判定`/Mac/.test(platform)`）。
 */
export function createRangePresenter(host: HTMLElement, currentOwner: () => EditOwner, record: SurfaceRecord, options: { platform?: string } = {}) {
  const doc = host.ownerDocument, win = doc.defaultView! as HighlightWindow
  const name = `nyoze-input-surface-range-${++sequence}`
  const style = doc.createElement('style')
  style.dataset.nyozeInputSurfaceHighlight = 'true'
  const selection = win.getComputedStyle(host, '::selection')
  // UAのnative selection色はcomputed styleでtransparentとなる場合がある。
  // その場合は同じsystem selection色を使い、透明なHighlightにしない。
  const systemColor = !selection.backgroundColor || selection.backgroundColor === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(selection.backgroundColor)
  const background = systemColor ? 'Highlight' : selection.backgroundColor
  // PIS-RANGE-DISPLAY1 (4a): 文字の色は、nativeの選択に合わせてplatformで分ける。
  // - macOS: nativeの選択は文字の色を変えない。`color`を書かない（system の選択の文字色を足すと、選んだ文字が黒く塗られ、暗いテーマで読めなくなる）。
  // - Windows・Linux: nativeの選択は、選んだ文字をsystemの選択の文字色（白）にする。`HighlightText`（`::selection`が色を決めていればその計算値）を書く。
  // 改行の帯（`rangeNewlineBands.ts`の層の要素）は背景だけで、同じ背景の値を属性selectorの規則で共有する。styleは生成時に1回だけ書く。
  const isMac = /Mac/.test(options.platform ?? win.navigator.platform)
  const color = isMac ? '' : ` color: ${systemColor ? 'HighlightText' : selection.color};`
  style.textContent = `::highlight(${name}) { background-color: ${background};${color} }\n[${RANGE_NEWLINE_ATTRIBUTE}="${name}"] { background-color: ${background}; }`
  doc.head.appendChild(style)
  // 表示の事実は1つ: Highlightが実際に登録されているか。`update`と`clear`の両方がこの記録を更新し、帯の層はこれに従う。
  let shown = false
  let listener: ((shown: boolean) => void) | null = null
  const setShown = (next: boolean) => {
    shown = next
    listener?.(next)
  }
  const clear = () => {
    win.CSS?.highlights?.delete(name)
    setShown(false)
  }
  return {
    name,
    supported: !!(win.CSS?.highlights && win.Highlight),
    clear,
    /** Highlightが登録されているか（改行の帯がこの記録に従う）。 */
    isShown: () => shown,
    /** 表示の事実の変化（登録した / 消した）の通知を1つだけ受ける。`update(true)`は範囲が同じでも通知する。 */
    subscribe(next: (shown: boolean) => void) { listener = next },
    update(show: boolean) {
      if (!show) { clear(); return }
      const start = performance.now()
      const range = currentOwner().rangeForPresentation()
      if (range && win.Highlight && win.CSS?.highlights) {
        win.CSS.highlights.set(name, new win.Highlight(range))
        setShown(true)
      } else clear()
      record('range-present', { durationMs: performance.now() - start, visible: !!range, supported: !!win.Highlight })
    },
    destroy() { clear(); listener = null; style.remove() },
  }
}
