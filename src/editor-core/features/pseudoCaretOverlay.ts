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
  el.style.display = 'block'
  el.style.visibility = 'hidden'
  el.style.left = '0px'
  el.style.top = '0px'
  el.style.width = '0px'
  el.style.height = '0px'
  el.style.pointerEvents = 'none'
  el.setAttribute('data-orientation', 'horizontal')
  el.setAttribute('data-blink', 'off')
  mountParent.appendChild(el)

  let hidden = true
  let blinkDesired = false
  let blinkActive = false
  let position: { left: number; top: number; width: number; height: number } | null = null

  const writePosition = (next: NonNullable<typeof position>) => {
    el.style.left = `${next.left}px`
    el.style.top = `${next.top}px`
    el.style.width = `${next.width}px`
    el.style.height = `${next.height}px`
  }

  const syncBlink = () => {
    const active = !hidden && blinkDesired
    if (active === blinkActive) return
    blinkActive = active
    el.classList.toggle(BLINK_CLASS, active)
    el.setAttribute('data-blink', active ? 'on' : 'off')
  }

  return {
    setHidden(nextHidden: boolean) {
      if (nextHidden === hidden) return
      hidden = nextHidden
      if (hidden) {
        el.style.visibility = 'hidden'
        syncBlink()
        // A visibility-hidden absolute child still contributes to scrollable overflow.
        writePosition({ left: 0, top: 0, width: 0, height: 0 })
      } else {
        if (position) writePosition(position)
        el.style.visibility = ''
        // Reattach the animation after every show, starting at opacity 1.
        syncBlink()
      }
    },
    setOrientation(orientation: PseudoCaretOrientation) {
      el.setAttribute('data-orientation', orientation)
    },
    setPosition(left: number, top: number, width: number, height: number) {
      position = { left, top, width, height }
      if (!hidden) writePosition(position)
    },
    setBlink(blink: boolean) {
      blinkDesired = blink
      syncBlink()
    },
    destroy() {
      el.remove()
    },
  }
}
