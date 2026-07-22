import type { PseudoCaretOrientation } from './pseudoCaretGeometry'

const OVERLAY_CLASS = 'nyoze-pseudo-caret-overlay'
const BLINK_CLASS = 'nyoze-pseudo-caret-overlay--blink'

export type PseudoCaretOverlayHandle = {
  setHidden(hidden: boolean): void
  setOrientation(orientation: PseudoCaretOrientation): void
  setPosition(left: number, top: number, width: number, height: number): void
  setBlink(blink: boolean): void
  destroy(): void
}

/**
 * Mounts the pseudo caret overlay as the **last child** of `mountParent` (the `.editor-surface`),
 * so it paints above the current-line band overlay. The element is display-only:
 * `aria-hidden="true"` and `pointer-events: none` (also enforced in CSS).
 *
 * It is intentionally never inserted into the ProseMirror DOM.
 */
export function mountPseudoCaretOverlay(mountParent: HTMLElement): PseudoCaretOverlayHandle {
  const el = document.createElement('div')
  el.className = OVERLAY_CLASS
  el.setAttribute('aria-hidden', 'true')
  el.style.display = 'none'
  el.style.pointerEvents = 'none'
  el.setAttribute('data-orientation', 'horizontal')
  el.setAttribute('data-blink', 'off')
  mountParent.appendChild(el)

  return {
    setHidden(hidden: boolean) {
      el.style.display = hidden ? 'none' : 'block'
    },
    setOrientation(orientation: PseudoCaretOrientation) {
      el.setAttribute('data-orientation', orientation)
    },
    setPosition(left: number, top: number, width: number, height: number) {
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.width = `${width}px`
      el.style.height = `${height}px`
    },
    setBlink(blink: boolean) {
      if (blink) {
        el.classList.add(BLINK_CLASS)
        el.setAttribute('data-blink', 'on')
      } else {
        el.classList.remove(BLINK_CLASS)
        el.setAttribute('data-blink', 'off')
      }
    },
    destroy() {
      el.remove()
    },
  }
}
