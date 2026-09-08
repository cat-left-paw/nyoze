/**
 * STICKY-NOTE-ENDMARKER-LAYOUT1: 付箋 marker の hover preview を、marker 内部の
 * CSS `::after` から **単一の DOM-only floating preview** へ置き換える。
 *
 * 旧実装は `.note-anchor[data-note-anchor-preview]:hover::after` を
 * `bottom: calc(100% + 4px)` で常に物理上側へ置いていたため、
 * `.editor-panel { overflow: hidden }` により editor 上端付近の marker では
 * preview 上部が切れていた（反転も clamp も無かった）。
 *
 * ここでは配置の authority を
 *   marker の実 `getBoundingClientRect()` ∩ editor の実可視領域 ∩ viewport
 * に置き、上に入らなければ下へ反転し、左右は可視領域内へ clamp する。
 * overlay は `document.body` 直下の `position: fixed` layer なので、
 * `.editor-panel` の `overflow` を緩めずに clip を回避できる。
 *
 * 不変条件:
 * - preview は表示専用。PM Doc / transaction / selection / Markdown / clipboard に
 *   一切混入しない（DOM は editor の外、内容は `textContent` のみ）。
 * - 同時に表示する preview は最大 1 件。
 * - marker の click / context menu / selection を妨げない（`pointer-events: none`）。
 * - timer / polling / quiet period は使わない。`requestAnimationFrame` は
 *   scroll / resize 時の geometry 更新の coalescing だけに使い、hover の開始・終了や
 *   対象 identity の authority にはしない。
 */

export type PreviewRect = {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export type PreviewSize = {
  readonly width: number
  readonly height: number
}

export type NoteAnchorPreviewPlacement = {
  readonly left: number
  readonly top: number
  /** 実際に採用した側。上に入らなければ 'below' へ反転する。 */
  readonly side: 'above' | 'below'
  /** 可視領域が preview より小さく、はみ出しを完全には解消できない場合 true。 */
  readonly clampedToVisible: boolean
}

/** marker と preview の間隔（px）。 */
export const NOTE_ANCHOR_PREVIEW_GAP = 4


function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * preview の配置を決める pure 関数。
 *
 * - 上側に収まるなら従来どおり上へ出す。
 * - 上側に収まらなければ下へ反転する。
 * - どちらにも収まらない場合は空きの大きい側を選び、可視領域内へ clamp する。
 * - 左右は marker 中央揃えを基準に、preview 全体が可視領域へ入るよう clamp する。
 *
 * `visible` は「editor の実可視領域 ∩ viewport」を渡すこと。tab bar / toolbar は
 * editor 可視領域の外なので、この交差だけで裏側へ潜り込むことはない。
 */
export function resolveNoteAnchorPreviewPlacement(input: {
  readonly marker: PreviewRect
  readonly preview: PreviewSize
  readonly visible: PreviewRect
  readonly gap?: number
}): NoteAnchorPreviewPlacement {
  const gap = input.gap ?? NOTE_ANCHOR_PREVIEW_GAP
  const { marker, preview, visible } = input

  const visibleHeight = visible.bottom - visible.top
  const visibleWidth = visible.right - visible.left

  const aboveTop = marker.top - gap - preview.height
  const belowTop = marker.bottom + gap
  const fitsAbove = aboveTop >= visible.top
  const fitsBelow = belowTop + preview.height <= visible.bottom

  let side: 'above' | 'below'
  let top: number
  if (fitsAbove) {
    side = 'above'
    top = aboveTop
  } else if (fitsBelow) {
    side = 'below'
    top = belowTop
  } else {
    // どちらにも収まらない。空きの大きい側へ寄せてから clamp する。
    const spaceAbove = marker.top - visible.top
    const spaceBelow = visible.bottom - marker.bottom
    side = spaceAbove > spaceBelow ? 'above' : 'below'
    top = side === 'above' ? aboveTop : belowTop
  }

  const clampedToVisible = preview.height > visibleHeight || preview.width > visibleWidth
  top = clamp(top, visible.top, Math.max(visible.top, visible.bottom - preview.height))

  const centeredLeft = marker.left + (marker.right - marker.left) / 2 - preview.width / 2
  const left = clamp(
    centeredLeft,
    visible.left,
    Math.max(visible.left, visible.right - preview.width),
  )

  return { left, top, side, clampedToVisible }
}

/** 2 つの矩形の交差。交差が無い場合も矩形として返す（幅/高さが 0 以下になり得る）。 */
export function intersectPreviewRects(a: PreviewRect, b: PreviewRect): PreviewRect {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  }
}

export type NoteAnchorHoverPreviewController = {
  onMouseOver: (event: MouseEvent) => void
  onMouseOut: (event: MouseEvent) => void
  /** pointer leave 以外（document / tab 切替、writing mode 変更等）からの明示 cleanup。 */
  hide: () => void
  destroy: () => void
  /** E2E / unit 用の read-only probe。表示中 marker の note id。 */
  getActiveNoteIdForTest: () => string | null
}

export const NOTE_ANCHOR_HOVER_PREVIEW_CLASS = 'note-anchor-hover-preview'

const MARKER_SELECTOR = '.note-anchor[data-note-anchor-preview]'

export function createNoteAnchorHoverPreviewController(options: {
  /** editor の実可視領域を返す（通常は `.editor-surface`）。 */
  readonly getVisibleAreaElement: () => HTMLElement | null
}): NoteAnchorHoverPreviewController {
  let overlay: HTMLDivElement | null = null
  let activeMarker: HTMLElement | null = null
  let rafId: number | null = null
  let observer: MutationObserver | null = null
  // review-fix P2: active preview 中だけ editor 可視領域の resize を監視する
  // （pane 開閉 / pane 幅変更は window resize を伴わない）。常駐監視はしない。
  let surfaceResizeObserver: ResizeObserver | null = null
  let observedSurface: HTMLElement | null = null
  let destroyed = false

  function ensureOverlay(): HTMLDivElement {
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.className = NOTE_ANCHOR_HOVER_PREVIEW_CLASS
      // 表示専用 layer。hit-test を奪わないので marker の click / context menu は素通りする。
      overlay.setAttribute('aria-hidden', 'true')
      overlay.style.display = 'none'
      document.body.appendChild(overlay)
    }
    return overlay
  }

  function cancelScheduledReposition() {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
    }
    rafId = null
  }

  /** active preview 中だけ surface を監視する。 */
  function startObservingSurface(surface: HTMLElement) {
    if (typeof ResizeObserver !== 'function') return
    if (observedSurface === surface && surfaceResizeObserver) return
    stopObservingSurface()
    surfaceResizeObserver = new ResizeObserver(() => scheduleReposition())
    surfaceResizeObserver.observe(surface)
    observedSurface = surface
  }

  function stopObservingSurface() {
    surfaceResizeObserver?.disconnect()
    surfaceResizeObserver = null
    observedSurface = null
  }

  function hide() {
    cancelScheduledReposition()
    stopObservingSurface()
    activeMarker = null
    if (overlay) {
      overlay.style.display = 'none'
      // 次回表示まで内容を残さない（stale preview の視認を避ける）。
      overlay.textContent = ''
      overlay.removeAttribute('data-note-anchor-color')
    }
  }

  /** 対象 marker が生きていて preview を持ち続けているか。 */
  function isMarkerStillPreviewable(marker: HTMLElement): boolean {
    return marker.isConnected && marker.getAttribute('data-note-anchor-preview') !== null
  }

  function reposition() {
    if (destroyed) return
    const marker = activeMarker
    const el = overlay
    if (!marker || !el) return
    if (!isMarkerStillPreviewable(marker)) {
      hide()
      return
    }
    const surface = options.getVisibleAreaElement()
    if (!surface || !surface.isConnected) {
      hide()
      return
    }
    startObservingSurface(surface)
    const surfaceRect = surface.getBoundingClientRect()
    const viewportRect: PreviewRect = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }
    const visible = intersectPreviewRects(
      {
        left: surfaceRect.left,
        top: surfaceRect.top,
        right: surfaceRect.right,
        bottom: surfaceRect.bottom,
      },
      viewportRect,
    )
    const markerRect = marker.getBoundingClientRect()
    // marker 自身が可視領域の外に出たら preview も畳む（scroll 追従の終端）。
    if (
      markerRect.bottom < visible.top ||
      markerRect.top > visible.bottom ||
      markerRect.right < visible.left ||
      markerRect.left > visible.right
    ) {
      hide()
      return
    }
    // hover 中の付箋本文 / 色更新を反映してから測る（属性変更でサイズが変わり得る）。
    if (!syncContentFromMarker(marker, el)) {
      hide()
      return
    }
    // preview の最大サイズは CSS の `.note-anchor-hover-preview` が持つ
    // （max-width: min(336px, 100vw - 16px) / max-height: 60vh）。
    // 製品上到達できる最狭構成は、最小 window 幅から左右ペイン最小幅と divider 2 本を
    // 引いた 900 - 220 - 260 - 5 * 2 = 410px。実 Electron でも editor 可視領域は
    // 410x519 で preview 336x132 を上回った。したがって配置は原点の clamp だけでよく、
    // 実寸を editor 幅へ縮める追加制約は入れない（`tests/sticky-note-endmarker-layout1.test.ts`
    // がこの実到達下限と preview 最大幅の関係を静的に固定する）。
    const previewSize = { width: el.offsetWidth, height: el.offsetHeight }
    const placement = resolveNoteAnchorPreviewPlacement({
      marker: {
        left: markerRect.left,
        top: markerRect.top,
        right: markerRect.right,
        bottom: markerRect.bottom,
      },
      preview: previewSize,
      visible,
    })
    el.style.left = `${placement.left}px`
    el.style.top = `${placement.top}px`
    el.dataset.previewSide = placement.side
    // 可視領域が preview より小さかったことを診断用に残す（oracle が読む）。
    if (placement.clampedToVisible) {
      el.dataset.previewClamped = 'true'
    } else {
      delete el.dataset.previewClamped
    }
  }

  function scheduleReposition() {
    if (destroyed || !activeMarker) return
    if (rafId !== null) return
    if (typeof requestAnimationFrame !== 'function') {
      reposition()
      return
    }
    // 描画 coalescing のみ。hover の開始 / 終了や対象 identity には使わない。
    rafId = requestAnimationFrame(() => {
      rafId = null
      reposition()
    })
  }

  /**
   * marker の表示属性を overlay へ写す。
   * review-fix P2: 旧 CSS `attr()` 方式は hover 中の付箋本文 / 色更新が自動反映されて
   * いたので、floating layer でも同じ更新を mirror する（内容が変われば再配置する）。
   */
  function syncContentFromMarker(marker: HTMLElement, el: HTMLDivElement): boolean {
    const preview = marker.getAttribute('data-note-anchor-preview')
    if (preview === null) return false
    // innerHTML は使わない。notes.json 由来文字列を markup として解釈させない。
    if (el.textContent !== preview) el.textContent = preview
    const color = marker.getAttribute('data-note-anchor-color')
    if (color) {
      if (el.getAttribute('data-note-anchor-color') !== color) {
        el.setAttribute('data-note-anchor-color', color)
      }
    } else if (el.hasAttribute('data-note-anchor-color')) {
      el.removeAttribute('data-note-anchor-color')
    }
    return true
  }

  function show(marker: HTMLElement) {
    const el = ensureOverlay()
    if (!syncContentFromMarker(marker, el)) return
    activeMarker = marker
    // 実サイズを測るため先に表示してから配置する。
    el.style.display = 'block'
    el.style.left = '0px'
    el.style.top = '0px'
    reposition()
  }

  function onMouseOver(event: MouseEvent) {
    if (destroyed) return
    const target = event.target instanceof Element ? event.target : null
    const marker = target?.closest(MARKER_SELECTOR)
    if (!(marker instanceof HTMLElement)) return
    if (marker === activeMarker) return
    show(marker)
  }

  function onMouseOut(event: MouseEvent) {
    if (destroyed) return
    const target = event.target instanceof Element ? event.target : null
    const marker = target?.closest(MARKER_SELECTOR)
    if (!(marker instanceof HTMLElement)) return
    if (marker !== activeMarker) return
    // marker 内部（SVG 等）への移動では畳まない。
    const related = event.relatedTarget
    if (related instanceof Node && marker.contains(related)) return
    hide()
  }

  const onScrollOrResize = () => scheduleReposition()
  // scroll は capture phase で拾い、editor surface / 祖先どれの scroll でも追従する。
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)

  if (typeof MutationObserver === 'function') {
    // marker disconnect / preview 属性の消失 / writing mode 変更を event 駆動で
    // 検出する（timer / polling ではない）。
    observer = new MutationObserver((records) => {
      const marker = activeMarker
      if (!marker) return
      let markerAttributeChanged = false
      for (const record of records) {
        if (record.type !== 'attributes') continue
        if (record.attributeName === 'data-writing-mode') {
          // 同じ値の再設定でも MutationObserver は record を出すので、
          // **実際に値が変わったときだけ**畳む（無関係な再描画で消えないように）。
          const target = record.target
          const next =
            target instanceof Element ? target.getAttribute('data-writing-mode') : null
          if (record.oldValue === next) continue
          hide()
          return
        }
        if (record.target === marker) markerAttributeChanged = true
      }
      if (!isMarkerStillPreviewable(marker)) {
        hide()
        return
      }
      // review-fix P2: hover 中に付箋本文 / 色が更新されたら floating layer へ反映し、
      // サイズが変わり得るので同じ描画 coalescing 経路で再配置する。
      if (markerAttributeChanged) scheduleReposition()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        'data-note-anchor-preview',
        'data-note-anchor-color',
        'data-writing-mode',
      ],
    })
  }

  return {
    onMouseOver,
    onMouseOut,
    hide,
    destroy() {
      destroyed = true
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
      observer?.disconnect()
      observer = null
      stopObservingSurface()
      cancelScheduledReposition()
      activeMarker = null
      overlay?.remove()
      overlay = null
    },
    getActiveNoteIdForTest: () =>
      activeMarker?.getAttribute('data-note-anchor-id') ?? null,
  }
}
