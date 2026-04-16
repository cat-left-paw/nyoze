type FoldTooltipController = {
  onMouseOver: (event: MouseEvent, ellipsisClassName: string) => void
  onMouseOut: (event: MouseEvent, ellipsisClassName: string) => void
  destroy: () => void
}

export function createFoldTooltipController(
  tooltipClassName: string,
): FoldTooltipController {
  let tooltipEl: HTMLDivElement | null = null

  function ensureTooltipEl(): HTMLDivElement {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div')
      tooltipEl.className = tooltipClassName
      tooltipEl.style.display = 'none'
      document.body.appendChild(tooltipEl)
    }
    return tooltipEl
  }

  return {
    onMouseOver(event: MouseEvent, ellipsisClassName: string) {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const ellipsis = target.closest(`.${ellipsisClassName}`)
      if (!(ellipsis instanceof HTMLElement)) return

      const preview = ellipsis.dataset.preview
      if (!preview) return

      const tooltip = ensureTooltipEl()
      tooltip.textContent = preview
      tooltip.style.display = 'block'

      const rect = ellipsis.getBoundingClientRect()
      const tipHeight = tooltip.offsetHeight
      const tipWidth = tooltip.offsetWidth

      // Position below the icon, or above if it would overflow.
      let top = rect.bottom + 4
      if (top + tipHeight > window.innerHeight) {
        top = rect.top - tipHeight - 4
      }
      let left = rect.left
      if (left + tipWidth > window.innerWidth) {
        left = window.innerWidth - tipWidth - 8
      }

      tooltip.style.top = `${top}px`
      tooltip.style.left = `${Math.max(4, left)}px`
    },

    onMouseOut(event: MouseEvent, ellipsisClassName: string) {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (!target.closest(`.${ellipsisClassName}`)) return
      if (tooltipEl) tooltipEl.style.display = 'none'
    },

    destroy() {
      if (!tooltipEl) return
      tooltipEl.remove()
      tooltipEl = null
    },
  }
}
