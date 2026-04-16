type VerticalWheelScrollController = {
  onWheel: (event: WheelEvent) => void
  destroy: () => void
}

export function createVerticalWheelScrollController(
  scroller: HTMLElement,
): VerticalWheelScrollController {
  let wheelThrottleTimer: ReturnType<typeof setTimeout> | null = null

  return {
    onWheel(event: WheelEvent): void {
      const computed = window.getComputedStyle(scroller)
      if (!computed.writingMode.startsWith('vertical')) return

      // In vertical writing: normal wheel = horizontal scroll, Shift = vertical scroll.
      if (event.shiftKey) return

      // Find the nearest ancestor that actually scrolls horizontally.
      let scrollEl: HTMLElement | null = scroller.parentElement
      while (scrollEl) {
        const style = window.getComputedStyle(scrollEl)
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') break
        scrollEl = scrollEl.parentElement
      }
      if (!scrollEl) return

      event.preventDefault()
      const scrollAmount = -event.deltaY * 0.8 + event.deltaX
      if (wheelThrottleTimer !== null) return
      scrollEl.scrollLeft += scrollAmount
      wheelThrottleTimer = setTimeout(() => {
        wheelThrottleTimer = null
      }, 16)
    },

    destroy() {
      if (wheelThrottleTimer !== null) {
        clearTimeout(wheelThrottleTimer)
        wheelThrottleTimer = null
      }
    },
  }
}
