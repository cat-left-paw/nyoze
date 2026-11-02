import { createShortPreeditShadow } from './shortPreeditShadow'

let nextId = 0

/**
 * Paint only the receiver's text range; the indent before it remains transparent.
 *
 * PIS-S10-CURRENT-LINE2 (b): `update(painted)`の`painted`がfalseの間（Hostに予約領域が出ている、押し出しの表示）は、
 * 下地・書式の両方のHighlightを登録しない。下に本文の字がなく、現在行の帯・編集ブロックのハイライト・書式の背景が、
 * Hostの描画のまま見える。背景だけを透明にする形は採らない（短い横倒しの字の影が残って、字が太くなる）。
 */
export function createPreeditHighlight(element: HTMLElement) {
  const doc = element.ownerDocument
  const win = doc.defaultView! as Window & { CSS?: { highlights?: Map<string, unknown> }; Highlight?: new (...ranges: Range[]) => unknown }
  const name = `nyoze-input-surface-preedit-${++nextId}`
  const markName = `${name}-mark`
  const style = doc.createElement('style')
  style.dataset.nyozeInputSurfacePreedit = 'true'
  // 規則は寿命中不変。色は入力面自身の変数、表示はregistryで切り替える。
  style.textContent = `::highlight(${name}) { background-color: var(--nyoze-preedit-background); text-shadow: var(--nyoze-preedit-shadow, none); }` +
    ` ::highlight(${markName}) { background-color: var(--nyoze-preedit-mark-background); text-shadow: var(--nyoze-preedit-shadow, none); }`
  doc.head.appendChild(style)
  let hasMarkBackground = false
  const shortShadow = createShortPreeditShadow(element)
  let shadow: boolean | undefined
  const clear = () => { win.CSS?.highlights?.delete(name); win.CSS?.highlights?.delete(markName) }
  return {
    name,
    supported: !!win.CSS?.highlights && !!win.Highlight,
    configure(background: string, markBackground?: string) {
      element.style.setProperty('--nyoze-preedit-background', background)
      element.style.setProperty('--nyoze-preedit-mark-background', markBackground ?? 'transparent')
      hasMarkBackground = !!markBackground
    },
    update(painted: boolean) {
      // 短い横倒しの字の影の対策（SIDEWAYS-CLIP1）は、背景を塗る表示でだけ働く。
      const nextShadow = painted && shortShadow()
      if (shadow !== nextShadow) {
        element.style.setProperty('--nyoze-preedit-shadow', nextShadow ? '0 0 0 currentColor' : 'none')
        shadow = nextShadow
      }
      if (!painted || !element.textContent || !win.Highlight || !win.CSS?.highlights) { clear(); return }
      const range = doc.createRange()
      range.selectNodeContents(element)
      win.CSS.highlights.set(name, new win.Highlight(range))
      if (hasMarkBackground) win.CSS.highlights.set(markName, new win.Highlight(range))
      else win.CSS.highlights.delete(markName)
    },
    destroy() { clear(); style.remove() },
  }
}
export type PreeditHighlight = ReturnType<typeof createPreeditHighlight>
