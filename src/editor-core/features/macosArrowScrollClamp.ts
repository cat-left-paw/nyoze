/**
 * macOS Chromium/Electron: caret reveal による過大スクロールジャンプを、
 * bare Arrow の直後だけ短時間観測して clamp する（Typewriter とは独立）。
 */

export const MACOS_ARROW_SCROLL_CLAMP_JUMP_THRESHOLD = 0.25
export const MACOS_ARROW_SCROLL_CLAMP_STEP_FRACTION = 0.1
export const MACOS_ARROW_SCROLL_MANUAL_WHEEL_SUPPRESS_MS = 180
export const MACOS_ARROW_SCROLL_POINTER_DRAG_SUPPRESS_MS = 220

const lastWheelByHost = new WeakMap<HTMLElement, number>()
const lastPointerDragByHost = new WeakMap<HTMLElement, number>()
const pointerDownByHost = new WeakMap<
  HTMLElement,
  { x: number; y: number; moved: boolean }
>()

export function isMacOsRenderer(): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.userAgent.toLowerCase().includes('mac os')) return true
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const p = (nav.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase()
  return p.includes('mac')
}

export function isBareArrowKey(event: KeyboardEvent): boolean {
  if (
    event.key !== 'ArrowUp' &&
    event.key !== 'ArrowDown' &&
    event.key !== 'ArrowLeft' &&
    event.key !== 'ArrowRight'
  ) {
    return false
  }
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

export type MacosArrowScrollClampGateInput = {
  clampSettingEnabled: boolean
  isMacOS: boolean
  typewriterEnabled: boolean
  /** WYSIWYG 経路: Source Mode 中は隠れた PM への誤介入を避ける */
  wysiwygSuppressForSourceMode: boolean
  paragraphPlainActive: boolean
  composing: boolean
  selectionCollapsed: boolean
  defaultPrevented: boolean
  sinceLastWheelMs: number | null
  sinceLastPointerDragMs: number | null
}

export function shouldGateMacosArrowScrollClamp(i: MacosArrowScrollClampGateInput): boolean {
  if (!i.clampSettingEnabled || !i.isMacOS) return false
  if (i.typewriterEnabled) return false
  if (i.wysiwygSuppressForSourceMode) return false
  if (i.paragraphPlainActive) return false
  if (i.composing) return false
  if (!i.selectionCollapsed) return false
  if (i.defaultPrevented) return false
  if (
    i.sinceLastWheelMs !== null &&
    i.sinceLastWheelMs < MACOS_ARROW_SCROLL_MANUAL_WHEEL_SUPPRESS_MS
  ) {
    return false
  }
  if (
    i.sinceLastPointerDragMs !== null &&
    i.sinceLastPointerDragMs < MACOS_ARROW_SCROLL_POINTER_DRAG_SUPPRESS_MS
  ) {
    return false
  }
  return true
}

export function readSinceLastInteractionMs(host: HTMLElement): {
  sinceLastWheelMs: number | null
  sinceLastPointerDragMs: number | null
} {
  const now = performance.now()
  const lw = lastWheelByHost.get(host)
  const lp = lastPointerDragByHost.get(host)
  return {
    sinceLastWheelMs: lw === undefined ? null : now - lw,
    sinceLastPointerDragMs: lp === undefined ? null : now - lp,
  }
}

export function noteMacosArrowScrollClampWheel(host: HTMLElement): void {
  lastWheelByHost.set(host, performance.now())
}

function pointerDownHandler(host: HTMLElement, event: PointerEvent): void {
  if (event.button !== 0) return
  pointerDownByHost.set(host, { x: event.clientX, y: event.clientY, moved: false })
}

function pointerMoveHandler(host: HTMLElement, event: PointerEvent): void {
  const s = pointerDownByHost.get(host)
  if (!s || s.moved) return
  const dx = event.clientX - s.x
  const dy = event.clientY - s.y
  if (dx * dx + dy * dy > 100) {
    s.moved = true
  }
}

function pointerUpHandler(host: HTMLElement): void {
  const s = pointerDownByHost.get(host)
  pointerDownByHost.delete(host)
  if (s?.moved) {
    lastPointerDragByHost.set(host, performance.now())
  }
}

/**
 * wheel / pointer のみ記録（scroll 常駐監視はしない）。
 */
export function registerMacosArrowScrollClampHostInteractions(host: HTMLElement): () => void {
  const onWheel = () => {
    noteMacosArrowScrollClampWheel(host)
  }
  const pd = (e: PointerEvent) => pointerDownHandler(host, e)
  const pm = (e: PointerEvent) => pointerMoveHandler(host, e)
  const pu = () => pointerUpHandler(host)
  host.addEventListener('wheel', onWheel, { passive: true })
  host.addEventListener('pointerdown', pd)
  host.addEventListener('pointermove', pm)
  host.addEventListener('pointerup', pu)
  host.addEventListener('pointercancel', pu)
  return () => {
    host.removeEventListener('wheel', onWheel)
    host.removeEventListener('pointerdown', pd)
    host.removeEventListener('pointermove', pm)
    host.removeEventListener('pointerup', pu)
    host.removeEventListener('pointercancel', pu)
  }
}

export type ClampedScrollOffsets = {
  scrollTop: number
  scrollLeft: number
  changed: boolean
}

export function computeMacosArrowScrollClampOffsets(
  host: HTMLElement,
  beforeTop: number,
  beforeLeft: number,
  options?: { jumpThreshold?: number; stepFraction?: number },
): ClampedScrollOffsets {
  const thr = options?.jumpThreshold ?? MACOS_ARROW_SCROLL_CLAMP_JUMP_THRESHOLD
  const frac = options?.stepFraction ?? MACOS_ARROW_SCROLL_CLAMP_STEP_FRACTION
  const cw = host.clientWidth
  const ch = host.clientHeight
  const afterTop = host.scrollTop
  const afterLeft = host.scrollLeft
  const dY = afterTop - beforeTop
  const dX = afterLeft - beforeLeft
  let newTop = afterTop
  let newLeft = afterLeft
  let changed = false

  if (cw > 0 && Math.abs(dX) > thr * cw) {
    const step = Math.sign(dX) * Math.min(Math.abs(dX), cw * frac)
    newLeft = beforeLeft + step
    changed = true
  }
  if (ch > 0 && Math.abs(dY) > thr * ch) {
    const step = Math.sign(dY) * Math.min(Math.abs(dY), ch * frac)
    newTop = beforeTop + step
    changed = true
  }
  return { scrollTop: newTop, scrollLeft: newLeft, changed }
}

export function applyMacosArrowScrollClampAfterNative(
  host: HTMLElement,
  beforeTop: number,
  beforeLeft: number,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const { scrollTop, scrollLeft, changed } = computeMacosArrowScrollClampOffsets(
        host,
        beforeTop,
        beforeLeft,
      )
      if (changed) {
        host.scrollTop = scrollTop
        host.scrollLeft = scrollLeft
      }
    })
  })
}

export function maybeScheduleMacosArrowScrollClamp(
  host: HTMLElement | null,
  event: KeyboardEvent,
  gate: MacosArrowScrollClampGateInput,
): void {
  if (!host || !isBareArrowKey(event)) return
  if (!shouldGateMacosArrowScrollClamp(gate)) return
  const beforeTop = host.scrollTop
  const beforeLeft = host.scrollLeft
  applyMacosArrowScrollClampAfterNative(host, beforeTop, beforeLeft)
}
