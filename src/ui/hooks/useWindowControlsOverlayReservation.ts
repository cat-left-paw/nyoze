import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

const WINDOW_CONTROLS_OVERLAY_FALLBACK_WIDTH = 138
const WINDOW_CONTROLS_OVERLAY_MAX_WIDTH = 320

type WindowControlsOverlayLike = EventTarget & {
  visible?: boolean
  getTitlebarAreaRect?: () => DOMRect
}

type NavigatorWithWindowControlsOverlay = Navigator & {
  windowControlsOverlay?: WindowControlsOverlayLike
}

type OverlayReservationSource = 'unsupported' | 'fallback' | 'measured'

type WindowControlsOverlayReservationOptions = {
  headerRef: RefObject<HTMLElement | null>
  platform: string
  usesNativeWindowControls: boolean
  // P2 fix: optional extra elements (e.g. the Page Viewer's dedicated,
  // non-transforming native drag-region sibling, and the window root used by
  // reading-surface furniture) that must reserve the exact same width as
  // `headerRef`, applied from the same `applyReservation()` call. Without
  // this, a caller that mirrors the value onto a sibling via its own separate
  // `useEffect` keyed on this hook's returned number would apply it one render
  // late relative to `headerRef` — on every `resize`/`geometrychange` tick,
  // there is a transient frame where the two elements disagree on the reserved
  // width (headerRef already has the new value; the sibling still has the
  // previous one), which is exactly the kind of native-hit-test-vs-DOM race
  // this hook exists to keep out of. Passing siblings in here instead keeps
  // all writes atomic — same call, same measurement, same frame.
  additionalTargetRef?: RefObject<HTMLElement | null>
  additionalTargetRefs?: ReadonlyArray<RefObject<HTMLElement | null>>
}

function clampReservedWidth(width: number, viewportWidth: number): number {
  const upperBound = Math.min(WINDOW_CONTROLS_OVERLAY_MAX_WIDTH, viewportWidth)
  return Math.max(0, Math.min(upperBound, Math.round(width)))
}

function getViewportWidth(): number {
  return Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0)
}

function inferRightReservedWidthFromTitlebarArea(
  rect: DOMRect,
  viewportWidth: number,
): number | null {
  if (viewportWidth <= 0) return null
  const x = Number(rect.x)
  const width = Number(rect.width)
  if (!Number.isFinite(x) || !Number.isFinite(width) || width < 0) return null

  const right = x + width
  if (x > viewportWidth / 2) {
    return clampReservedWidth(viewportWidth - x, viewportWidth)
  }
  if (right < viewportWidth - 1) {
    return clampReservedWidth(viewportWidth - right, viewportWidth)
  }
  if (x > 1 && right >= viewportWidth - 1) {
    return 0
  }
  return null
}

function measureWindowControlsOverlayReservation(
  overlay: WindowControlsOverlayLike | undefined,
): { width: number; source: OverlayReservationSource } {
  const viewportWidth = getViewportWidth()
  if (!overlay || typeof overlay.getTitlebarAreaRect !== 'function') {
    return {
      width: clampReservedWidth(WINDOW_CONTROLS_OVERLAY_FALLBACK_WIDTH, viewportWidth),
      source: 'unsupported',
    }
  }

  try {
    const rect = overlay.getTitlebarAreaRect()
    const inferred = inferRightReservedWidthFromTitlebarArea(rect, viewportWidth)
    if (inferred !== null) {
      return { width: inferred, source: 'measured' }
    }
  } catch {
    // Fall back to the known Electron overlay width when the experimental API is unavailable.
  }

  return {
    width: clampReservedWidth(WINDOW_CONTROLS_OVERLAY_FALLBACK_WIDTH, viewportWidth),
    source: 'fallback',
  }
}

function shouldReserveNativeOverlay(platform: string, usesNativeWindowControls: boolean): boolean {
  return usesNativeWindowControls && (platform === 'win32' || platform === 'linux')
}

export function useWindowControlsOverlayReservation({
  headerRef,
  platform,
  usesNativeWindowControls,
  additionalTargetRef,
  additionalTargetRefs,
}: WindowControlsOverlayReservationOptions): number {
  const [reservedWidth, setReservedWidth] = useState(0)

  useEffect(() => {
    const header = headerRef.current
    // P2 fix: collect every element that must reserve the same width and
    // write to all of them from the one `applyReservation()` call below —
    // never from a second, independently-scheduled effect, which is what
    // produced the one-frame stale-value race this hook now closes.
    const targets: HTMLElement[] = []
    if (header) targets.push(header)
    const additionalTarget = additionalTargetRef?.current
    if (additionalTarget) targets.push(additionalTarget)
    for (const ref of additionalTargetRefs ?? []) {
      const node = ref.current
      if (node && !targets.includes(node)) targets.push(node)
    }

    if (!header || !shouldReserveNativeOverlay(platform, usesNativeWindowControls)) {
      for (const target of targets) {
        target.style.removeProperty('--header-window-controls-reserved-width')
      }
      if (header) {
        delete header.dataset.windowControlsOverlay
        delete header.dataset.windowControlsReservedWidth
      }
      setReservedWidth(0)
      return
    }

    const navigatorWithOverlay = navigator as NavigatorWithWindowControlsOverlay
    const overlay = navigatorWithOverlay.windowControlsOverlay
    let raf = 0

    const applyReservation = () => {
      const measurement = measureWindowControlsOverlayReservation(overlay)
      for (const target of targets) {
        target.style.setProperty(
          '--header-window-controls-reserved-width',
          `${measurement.width}px`,
        )
      }
      header.dataset.windowControlsOverlay = measurement.source
      header.dataset.windowControlsReservedWidth = String(measurement.width)
      setReservedWidth(measurement.width)
    }

    const scheduleApplyReservation = () => {
      if (raf) window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        raf = 0
        applyReservation()
      })
    }

    applyReservation()
    window.addEventListener('resize', scheduleApplyReservation)
    overlay?.addEventListener('geometrychange', scheduleApplyReservation)

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', scheduleApplyReservation)
      overlay?.removeEventListener('geometrychange', scheduleApplyReservation)
      for (const target of targets) {
        target.style.removeProperty('--header-window-controls-reserved-width')
      }
      delete header.dataset.windowControlsOverlay
      delete header.dataset.windowControlsReservedWidth
    }
  }, [headerRef, platform, usesNativeWindowControls, additionalTargetRef, additionalTargetRefs])

  return reservedWidth
}
