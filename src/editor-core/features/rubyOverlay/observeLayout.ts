/**
 * P1: 本文の root の寸法を変えず、位置だけを動かす文書冒頭の表示と、本文内の画像の読み込みを受ける。
 * 対象は Workspace が surface の直下へ置く metadata の要素だけ。Overlay や入力面の DOM は監視しない。
 */
export function observeRubyOverlayLayout(options: {
  surface: HTMLElement
  root: HTMLElement
  schedule: () => void
  afterLayout: () => void
}): () => void {
  const { surface, root, schedule, afterLayout } = options
  const win = root.ownerDocument.defaultView!
  const metadata = new Set<Element>()
  const sizes = new win.ResizeObserver(afterLayout)
  const selector = '.frontmatter-view, .project-document-start-group'
  const reconcile = () => {
    const current = new Set(Array.from(surface.children).filter(el => el.matches(selector)))
    let changed = false
    for (const el of metadata) if (!current.has(el)) { sizes.unobserve(el); metadata.delete(el); changed = true }
    for (const el of current) if (!metadata.has(el)) { sizes.observe(el, { box: 'border-box' }); metadata.add(el); changed = true }
    if (changed) schedule()
  }
  const children = new win.MutationObserver(reconcile)
  children.observe(surface, { childList: true })
  reconcile()
  // load/error は DOM mutation を伴わない。画像の固有寸法が確定・失敗した時点で読み直す。
  const onImage = (event: Event) => { if (event.target instanceof win.HTMLImageElement) schedule() }
  root.addEventListener('load', onImage, true)
  root.addEventListener('error', onImage, true)
  return () => {
    children.disconnect()
    sizes.disconnect()
    metadata.clear()
    root.removeEventListener('load', onImage, true)
    root.removeEventListener('error', onImage, true)
  }
}
