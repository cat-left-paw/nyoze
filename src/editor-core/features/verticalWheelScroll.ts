type VerticalWheelScrollController = {
  onWheel: (event: WheelEvent) => void
  destroy: () => void
}

type EditorSurfaceWheelController = {
  onWheel: (event: WheelEvent) => void
  destroy: () => void
}

type WheelTargetLike = EventTarget | null

type EditorSurfaceElement = HTMLElement & {
  getAttribute: (qualifiedName: string) => string | null
}

/** Paragraph Plain overlay 用: PM が横書きかつ editor-surface が縦スクロール可能なときだけ介入する。 */
export function shouldApplyHorizontalEditorSurfaceWheel(
  proseMirrorWritingMode: string,
  surfaceOverflowY: string,
  shiftKey: boolean,
): boolean {
  if (proseMirrorWritingMode.startsWith('vertical')) return false
  if (shiftKey) return false
  return surfaceOverflowY === 'auto' || surfaceOverflowY === 'scroll'
}

type HorizontalEditorSurfaceWheelApplier = {
  apply(event: WheelEvent, proseMirrorDom: HTMLElement, editorSurface: HTMLElement): void
  destroy(): void
}

/**
 * `.ProseMirror` 外の overlay 上では縦書き wheel 補正がバブルで届かない。
 * 横書き時は `.editor-surface` の scrollTop を更新する（通常 PM 上はブラウザ標準スクロール）。
 */
export function createHorizontalEditorSurfaceWheelApplier(): HorizontalEditorSurfaceWheelApplier {
  let wheelThrottleTimer: ReturnType<typeof setTimeout> | null = null

  return {
    apply(event: WheelEvent, proseMirrorDom: HTMLElement, editorSurface: HTMLElement): void {
      const pm = window.getComputedStyle(proseMirrorDom)
      const surface = window.getComputedStyle(editorSurface)
      if (
        !shouldApplyHorizontalEditorSurfaceWheel(
          pm.writingMode,
          surface.overflowY,
          event.shiftKey,
        )
      ) {
        return
      }
      event.preventDefault()
      if (wheelThrottleTimer !== null) return
      editorSurface.scrollTop += event.deltaY
      wheelThrottleTimer = setTimeout(() => {
        wheelThrottleTimer = null
      }, 16)
    },

    destroy(): void {
      if (wheelThrottleTimer !== null) {
        clearTimeout(wheelThrottleTimer)
        wheelThrottleTimer = null
      }
    },
  }
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

function isEventTargetWithin(
  container: Pick<HTMLElement, 'contains'>,
  target: WheelTargetLike,
): boolean {
  if (!target) return false
  if (target === (container as unknown as EventTarget)) return true
  return container.contains(target as Node)
}

function isTypewriterTrailingWheelZone(
  proseMirrorDom: Pick<HTMLElement, 'contains'>,
  editorSurface: Pick<EditorSurfaceElement, 'getAttribute'>,
  target: WheelTargetLike,
): boolean {
  if (isEventTargetWithin(proseMirrorDom, target)) return true
  if (editorSurface.getAttribute('data-typewriter-scroll-past-end') !== 'true') return false
  return target === (editorSurface as unknown as EventTarget)
}

export function createEditorSurfaceWheelController(
  proseMirrorDom: HTMLElement,
  editorSurface: EditorSurfaceElement,
): EditorSurfaceWheelController {
  const verticalWheel = createVerticalWheelScrollController(proseMirrorDom)
  const horizontalWheel = createHorizontalEditorSurfaceWheelApplier()

  return {
    onWheel(event: WheelEvent): void {
      if (!isTypewriterTrailingWheelZone(proseMirrorDom, editorSurface, event.target)) return
      verticalWheel.onWheel(event)
      if (event.defaultPrevented) return
      if (isEventTargetWithin(proseMirrorDom, event.target)) return
      horizontalWheel.apply(event, proseMirrorDom, editorSurface)
    },

    destroy(): void {
      verticalWheel.destroy()
      horizontalWheel.destroy()
    },
  }
}
