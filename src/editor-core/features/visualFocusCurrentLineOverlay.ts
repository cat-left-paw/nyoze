const OVERLAY_CLASS = 'nyoze-visual-focus-current-line-overlay'

export type VisualFocusCurrentLineOverlayHandle = {
  setHidden(hidden: boolean): void
  setPosition(parentRelativeLeft: number, parentRelativeTop: number, width: number, height: number): void
  destroy(): void
}

/**
 * Mounts overlay inside `mountParent`, immediately before `insertBefore` (painted under following siblings).
 * When `insertBefore` is null, appends to `mountParent`.
 */
export function mountVisualFocusCurrentLineOverlay(
  mountParent: HTMLElement,
  insertBefore: HTMLElement | null,
): VisualFocusCurrentLineOverlayHandle {
  const el = document.createElement('div')
  el.className = OVERLAY_CLASS
  el.setAttribute('aria-hidden', 'true')
  el.style.display = 'none'
  if (insertBefore && insertBefore.parentNode === mountParent) {
    mountParent.insertBefore(el, insertBefore)
  } else {
    mountParent.appendChild(el)
  }

  return {
    setHidden(hidden: boolean) {
      el.style.display = hidden ? 'none' : 'block'
    },
    setPosition(parentRelativeLeft: number, parentRelativeTop: number, width: number, height: number) {
      el.style.left = `${parentRelativeLeft}px`
      el.style.top = `${parentRelativeTop}px`
      el.style.width = `${width}px`
      el.style.height = `${height}px`
    },
    destroy() {
      el.remove()
    },
  }
}
