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
}: WindowControlsOverlayReservationOptions): number {
  const [reservedWidth, setReservedWidth] = useState(0)

  useEffect(() => {
    const header = headerRef.current
    if (!header || !shouldReserveNativeOverlay(platform, usesNativeWindowControls)) {
      header?.style.removeProperty('--header-window-controls-reserved-width')
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
      header.style.setProperty(
        '--header-window-controls-reserved-width',
        `${measurement.width}px`,
      )
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
      header.style.removeProperty('--header-window-controls-reserved-width')
      delete header.dataset.windowControlsOverlay
      delete header.dataset.windowControlsReservedWidth
    }
  }, [headerRef, platform, usesNativeWindowControls])

  return reservedWidth
}
