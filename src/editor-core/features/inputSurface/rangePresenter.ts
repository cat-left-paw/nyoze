import type { EditOwner } from './editOwner'
import type { SurfaceRecord } from './inputSurface'

type HighlightWindow = Window & {
  CSS?: { highlights?: Map<string, unknown> }
  Highlight?: new (...ranges: Range[]) => unknown
}
let sequence = 0

export function createRangePresenter(host: HTMLElement, currentOwner: () => EditOwner, record: SurfaceRecord) {
  const doc = host.ownerDocument, win = doc.defaultView! as HighlightWindow
  const name = `nyoze-input-surface-range-${++sequence}`
  const style = doc.createElement('style')
  style.dataset.nyozeInputSurfaceHighlight = 'true'
  const selection = win.getComputedStyle(host, '::selection')
  // UAのnative selection色はcomputed styleでtransparentとなる場合がある。
  // その場合は同じsystem selection色を使い、透明なHighlightにしない。
  const systemColor = !selection.backgroundColor || selection.backgroundColor === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(selection.backgroundColor)
  style.textContent = `::highlight(${name}) { background-color: ${systemColor ? 'Highlight' : selection.backgroundColor}; color: ${systemColor ? 'HighlightText' : selection.color}; }`
  doc.head.appendChild(style)
  const clear = () => win.CSS?.highlights?.delete(name)
  return {
    name,
    supported: !!(win.CSS?.highlights && win.Highlight),
    clear,
    update(show: boolean) {
      if (!show) { clear(); return }
      const start = performance.now()
      const range = currentOwner().rangeForPresentation()
      if (range && win.Highlight && win.CSS?.highlights) {
        win.CSS.highlights.set(name, new win.Highlight(range))
      } else clear()
      record('range-present', { durationMs: performance.now() - start, visible: !!range, supported: !!win.Highlight })
    },
    destroy() { clear(); style.remove() },
  }
}
