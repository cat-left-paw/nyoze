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

/**
 * 縦書きの wheel の deltaY 係数（縦書きは `scrollLeft += -deltaY * 係数 + deltaX`）。
 * 章の境目の移動（`editorChapterBoundaryWheelNavigation.ts`）は、同じ向きと量で方向を決めるため、この定数を使う。
 * 速さ（係数）は作者が実機で決める。EDITOR-VERTICAL-WHEEL-ACCUM1 では、今までと同じ 0.8 のまま。
 */
export const VERTICAL_WHEEL_DELTA_Y_FACTOR = 0.8

/**
 * 縦書きの wheel を、足し合わせて frame ごとに 1 回だけ `scrollLeft` へ書く（EDITOR-VERTICAL-WHEEL-ACCUM1）。
 *
 * - event ごとに `preventDefault()` し、量を足し合わせる。**event を捨てない**（以前は 16 ms の `setTimeout`
 *   が済むまで次の event を捨てていて、連続した入力の約半分が使われず、描画が重いと物理のホイールも捨てられた）。
 * - 書き込みは `requestAnimationFrame` の 1 つの予約だけで、frame ごとに最大 1 回。この rAF は scroll の表示の
 *   ためだけで、所有・完了の根拠にはしない（timer・polling は使わない）。wheel event は frame の入力の段階で
 *   届き、rAF はその同じ frame の中で走るので、書き込みは event と同じ frame の描画に載る。
 * - 範囲の端の clamp はブラウザに任せる（`scrollLeft` に足すだけ）。
 * - 書く時点で、書く先が document から外れた・縦書きでなくなった・`destroy()` された場合は、何も書かずに
 *   足し合わせを捨てる。
 */
export function createVerticalWheelScrollController(
  scroller: HTMLElement,
): VerticalWheelScrollController {
  let destroyed = false
  let frameHandle: number | null = null
  let pendingTarget: HTMLElement | null = null
  let pendingAmount = 0

  const discardPending = (): void => {
    pendingTarget = null
    pendingAmount = 0
  }

  const flush = (): void => {
    frameHandle = null
    const target = pendingTarget
    const amount = pendingAmount
    discardPending()
    if (destroyed || target === null || amount === 0) return
    // `isConnected` を持たない軽量な要素（試験の fake）は「接続されている」とみなす。
    if (target.isConnected === false) return
    if (!window.getComputedStyle(scroller).writingMode.startsWith('vertical')) return
    target.scrollLeft += amount
  }

  return {
    onWheel(event: WheelEvent): void {
      // destroy 後の controller は何も扱わない（preventDefault もしない。ブラウザの既定に任せる）。
      if (destroyed) return

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
      // 同じ frame の中で書く先が変わる（nearest な横 scroll の祖先が変わる）ことは通常ないが、
      // 変わった場合は、それまでに足し合わせた量を元の書く先へ先に書いて、量を取りこぼさない。
      if (pendingTarget !== null && pendingTarget !== scrollEl) {
        const previousTarget = pendingTarget
        const previousAmount = pendingAmount
        discardPending()
        if (previousTarget.isConnected !== false) previousTarget.scrollLeft += previousAmount
      }
      pendingTarget = scrollEl
      pendingAmount += -event.deltaY * VERTICAL_WHEEL_DELTA_Y_FACTOR + event.deltaX
      if (frameHandle === null) frameHandle = window.requestAnimationFrame(flush)
    },

    destroy() {
      destroyed = true
      if (frameHandle !== null) {
        window.cancelAnimationFrame(frameHandle)
        frameHandle = null
      }
      discardPending()
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
      // capture phase で章境界ナビゲーションが受理した event は、ここで再度 scroll しない。
      if (event.defaultPrevented) return
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
