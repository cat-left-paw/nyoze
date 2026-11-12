import type { EditOwner } from './editOwner'
import type { PreeditHighlight } from './preeditHighlight'
import { LOCAL_IME_LOCAL_WINDOW_TYPOGRAPHY_PROPERTIES } from '../localImeLocalWindowTypographyParity'
import { classifySurfaceMarks, domSurfaceMarks, sameSurfaceMarks, surfaceMarkStyle } from './surfaceMarks'
import { isOpaqueColor, isTransparentColor, resolveOpaqueBackdrop } from './surfaceBackdrop'
import { RETAINED_TEXT_COLOR_VARIABLE, resolveRetainedTextColorForSurface } from './retainedDisplay'

// Typography selectors and theme variables depend on this small ancestor chain,
// never on the manuscript's text. Ancestor/viewport changes invalidate this snapshot;
// compositionstart explicitly forces its existing frozen typography read.
function ancestrySignature(source: Element): string {
  const parts: string[] = []
  for (let node: Element | null = source; node; node = node.parentElement) {
    parts.push(node.tagName, ...Array.from(node.attributes, attr => `${attr.name}=${attr.value}`))
  }
  return JSON.stringify(parts)
}

export function createSurfaceTypography(options: {
  host: HTMLElement
  element: HTMLElement
  currentOwner(): EditOwner
  preedit: PreeditHighlight
  record(kind: string, detail?: Record<string, unknown>): void
  visual(): void
}) {
  const { host, element, preedit, record, visual } = options
  const win = host.ownerDocument.defaultView!
  let background = '#fff', markBackground: string | undefined
  let previousBlock: HTMLElement | null | undefined
  let previousSignature: string | undefined
  // 最初の下地を読むまで（書式が対応外で読めない場合を含む）も、保持の色の変数が未定義にならないようにする
  // （未定義だと、固定のCSSの規則が無効になり、色が継承色になる）。
  element.style.setProperty(RETAINED_TEXT_COLOR_VARIABLE, resolveRetainedTextColorForSurface(background, markBackground))
  return (force = false) => {
    const owner = options.currentOwner(), block = owner.insertionTextblock()
    const caret = owner.caretElement(), desired = classifySurfaceMarks(owner.nextMarkNames())
    if (!desired) { record('unsupported-mark', { names: owner.nextMarkNames() }); return }
    const same = !!block && sameSurfaceMarks(desired, domSurfaceMarks(caret, block))
    const source = same ? caret : block ?? caret
    const signature = desired.join(',') + ':' + win.innerWidth + ':' + win.innerHeight + ':' + ancestrySignature(source)
    if (!force && block === previousBlock && signature === previousSignature) return
    const style = win.getComputedStyle(source)
    // 下地は、最初の不透明な背景まで進み、途中の半透明の背景（編集ブロックのハイライトなど）を先に合成した不透明な色。
    // 半透明の色で止めると、本文へ重ねる表示で、下の字が透けて見える（PIS-S10-CURRENT-LINE2）。
    const backgrounds: string[] = []
    for (let node: HTMLElement | null = block ?? host; node; node = node.parentElement) {
      const color = win.getComputedStyle(node).backgroundColor
      if (!color) continue
      backgrounds.push(color)
      if (isOpaqueColor(color)) break
    }
    background = resolveOpaqueBackdrop(backgrounds, background)
    // Link/highlight/code colors resolve against the live theme, while opaque
    // preedit paint still covers only the actual composing glyph range.
    // caretの要素がtextblockそのもののときは、その背景（編集ブロックのハイライト）は書式の背景ではない（下地に含めた）。
    const rawPaint = !same ? surfaceMarkStyle(desired)['background-color'] : caret === block ? undefined : style.backgroundColor
    markBackground = rawPaint?.startsWith('var(')
      ? win.getComputedStyle(block ?? host).getPropertyValue(rawPaint.slice(4, -1)).trim() : rawPaint
    if (!markBackground || isTransparentColor(markBackground)) markBackground = undefined
    const properties = [...LOCAL_IME_LOCAL_WINDOW_TYPOGRAPHY_PROPERTIES, 'color', 'text-decoration-line', 'text-underline-position']
    const values = properties.map(property => [property, style.getPropertyValue(property)] as const)
    for (const [property, value] of values) element.style.setProperty(property, value)
    for (const property of ['background-color', 'border', 'border-radius', 'padding'] as const) {
      element.style.setProperty(property, property === 'background-color' ? 'transparent' : '0')
    }
    if (!same) for (const [property, value] of Object.entries(surfaceMarkStyle(desired))) {
      if (property !== 'background-color') element.style.setProperty(property, value)
    }
    previousBlock = block
    previousSignature = signature
    preedit.configure(background, markBackground)
    // PIS-RETAINED-TEXT-COLOR1: 保持文字の色。下地を求めた同じ時点で、入力面自身の変数へ書く（1打ごとには計算しない）。
    element.style.setProperty(RETAINED_TEXT_COLOR_VARIABLE, resolveRetainedTextColorForSurface(background, markBackground, style.color))
    visual()
  }
}
