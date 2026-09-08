/**
 * LOCAL-WINDOW-RESIZEEXIT1 — Local Window active 中の viewport / editor 寸法変化を
 * geometry invalidation boundary として既存 close 経路へ exact 1 回渡す。
 *
 * live overlay 追従、timer / polling / quiet period、広域 DOM 監視、
 * resize callback からの auto-rearm は持たない。
 */

export const LOCAL_IME_LOCAL_WINDOW_RESIZE_EXIT_REASON = 'local-window-resize'
export const LOCAL_IME_LOCAL_WINDOW_RESIZE_EXIT_EPSILON_PX = 0

export type LocalImeLocalWindowResizeExitSize = {
  readonly width: number
  readonly height: number
}

export type LocalImeLocalWindowResizeExitRejectReason =
  | 'inactive'
  | 'no-baseline'
  | 'stale-generation'
  | 'stale-identity'
  | 'target-detached'
  | 'size-unchanged'

export type LocalImeLocalWindowResizeExitDecision =
  | { readonly accept: true; readonly reason: 'geometry-invalidation' }
  | { readonly accept: false; readonly reason: LocalImeLocalWindowResizeExitRejectReason }

export type LocalImeLocalWindowResizeExitDiagnostics = {
  readonly armed: boolean
  readonly latched: boolean
  readonly boundaryCalls: number
  readonly listenerCount: number
  readonly observerCount: number
}

export type LocalImeLocalWindowResizeExitHandle = {
  attach: (editorSurface: HTMLElement | null) => void
  armFromLiveDom: (input: { generation: number; identity: string }) => void
  disarm: () => void
  detach: () => void
  destroy: () => void
  diagnostics: () => LocalImeLocalWindowResizeExitDiagnostics
}

export function resolveLocalImeLocalWindowResizeExitTargets(
  editorSurface: HTMLElement | null,
): { panel: HTMLElement | null; surface: HTMLElement | null } {
  if (!editorSurface?.isConnected) return { panel: null, surface: null }
  const panel = editorSurface.closest('.editor-panel')
  return {
    panel: panel instanceof HTMLElement ? panel : null,
    surface: editorSurface,
  }
}

export function readLocalImeLocalWindowResizeExitRect(
  element: Element,
): LocalImeLocalWindowResizeExitSize {
  const rect = element.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

export function localImeLocalWindowResizeExitSizesDiffer(
  before: LocalImeLocalWindowResizeExitSize | null,
  after: LocalImeLocalWindowResizeExitSize,
  epsilonPx = LOCAL_IME_LOCAL_WINDOW_RESIZE_EXIT_EPSILON_PX,
): boolean {
  if (!before) return true
  return (
    Math.abs(before.width - after.width) > epsilonPx ||
    Math.abs(before.height - after.height) > epsilonPx
  )
}

export function captureLocalImeLocalWindowResizeExitBaseline(input: {
  readonly generation: number
  readonly identity: string
  readonly panel: LocalImeLocalWindowResizeExitSize
  readonly surface: LocalImeLocalWindowResizeExitSize
}): {
  readonly generation: number
  readonly identity: string
  readonly panel: LocalImeLocalWindowResizeExitSize
  readonly surface: LocalImeLocalWindowResizeExitSize
} {
  return {
    generation: input.generation,
    identity: input.identity,
    panel: { width: input.panel.width, height: input.panel.height },
    surface: { width: input.surface.width, height: input.surface.height },
  }
}

export function classifyLocalImeLocalWindowResizeExitInvalidation(input: {
  readonly sessionActive: boolean
  readonly armedGeneration: number | null
  readonly signalGeneration: number | null
  readonly armedIdentity: string | null
  readonly signalIdentity: string | null
  readonly panelConnected: boolean
  readonly surfaceConnected: boolean
  readonly baseline: LocalImeLocalWindowResizeExitSize | null
  readonly observed: LocalImeLocalWindowResizeExitSize
}): LocalImeLocalWindowResizeExitDecision {
  if (!input.sessionActive) return { accept: false, reason: 'inactive' }
  if (!input.panelConnected || !input.surfaceConnected) {
    return { accept: false, reason: 'target-detached' }
  }
  if (input.armedGeneration === null || input.baseline === null || input.armedIdentity === null) {
    return { accept: false, reason: 'no-baseline' }
  }
  if (input.signalGeneration !== input.armedGeneration) {
    return { accept: false, reason: 'stale-generation' }
  }
  if (input.signalIdentity !== input.armedIdentity) {
    return { accept: false, reason: 'stale-identity' }
  }
  if (!localImeLocalWindowResizeExitSizesDiffer(input.baseline, input.observed)) {
    return { accept: false, reason: 'size-unchanged' }
  }
  return { accept: true, reason: 'geometry-invalidation' }
}

/** latch は fire より先に立て、callback 起因の同期 re-entry を止める。 */
export function tryFireLocalImeLocalWindowResizeExitBoundary(input: {
  readonly accept: boolean
  readonly latch: { latched: boolean }
  readonly fire: () => void
}): { readonly fired: boolean } {
  if (!input.accept || input.latch.latched) return { fired: false }
  input.latch.latched = true
  input.fire()
  return { fired: true }
}

export function createLocalImeLocalWindowResizeExit(options: {
  getSessionActive: () => boolean
  getGeneration: () => number
  getDocumentIdentity: () => string
  requestBoundary: () => void
}): LocalImeLocalWindowResizeExitHandle {
  let panel: HTMLElement | null = null
  let surface: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  let attached = false
  let listenerCount = 0
  let observerCount = 0
  let armedGeneration: number | null = null
  let armedIdentity: string | null = null
  let baselinePanel: LocalImeLocalWindowResizeExitSize | null = null
  let baselineSurface: LocalImeLocalWindowResizeExitSize | null = null
  let boundaryCalls = 0
  const latch = { latched: false }

  const disarm = () => {
    armedGeneration = null
    armedIdentity = null
    baselinePanel = null
    baselineSurface = null
    latch.latched = false
  }

  const canObserveGeometry = (): boolean => {
    if (!attached) return false
    if (!options.getSessionActive() || armedGeneration === null) return false
    if (!panel?.isConnected || !surface?.isConnected) {
      disarm()
      return false
    }
    return true
  }

  const classifyObserved = (
    baseline: LocalImeLocalWindowResizeExitSize | null,
    observed: LocalImeLocalWindowResizeExitSize,
  ): LocalImeLocalWindowResizeExitDecision =>
    classifyLocalImeLocalWindowResizeExitInvalidation({
      sessionActive: options.getSessionActive(),
      armedGeneration,
      signalGeneration: options.getGeneration(),
      armedIdentity,
      signalIdentity: options.getDocumentIdentity(),
      panelConnected: panel?.isConnected === true,
      surfaceConnected: surface?.isConnected === true,
      baseline,
      observed,
    })

  const noteObserved = (
    baseline: LocalImeLocalWindowResizeExitSize | null,
    observed: LocalImeLocalWindowResizeExitSize,
  ) => {
    if (!canObserveGeometry()) return
    const decision = classifyObserved(baseline, observed)
    tryFireLocalImeLocalWindowResizeExitBoundary({
      accept: decision.accept,
      latch,
      fire: () => {
        boundaryCalls += 1
        options.requestBoundary()
      },
    })
  }

  const onWindowResize = () => {
    if (!canObserveGeometry() || !panel || !surface) return
    const panelSize = readLocalImeLocalWindowResizeExitRect(panel)
    const surfaceSize = readLocalImeLocalWindowResizeExitRect(surface)
    const panelDecision = classifyObserved(baselinePanel, panelSize)
    if (panelDecision.accept) {
      noteObserved(baselinePanel, panelSize)
      return
    }
    noteObserved(baselineSurface, surfaceSize)
  }

  const disconnectObservers = () => {
    if (!attached) return
    window.removeEventListener('resize', onWindowResize)
    observer?.disconnect()
    observer = null
    panel = null
    surface = null
    listenerCount = 0
    observerCount = 0
    attached = false
  }

  const detach = () => {
    disarm()
    disconnectObservers()
  }

  return {
    attach(editorSurface) {
      if (attached) return
      const targets = resolveLocalImeLocalWindowResizeExitTargets(editorSurface)
      if (!targets.panel || !targets.surface) return
      panel = targets.panel
      surface = targets.surface
      attached = true
      window.addEventListener('resize', onWindowResize)
      listenerCount = 1
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver((entries) => {
          if (!canObserveGeometry() || !panel || !surface) return
          for (const entry of entries) {
            if (entry.target === panel) {
              noteObserved(baselinePanel, readLocalImeLocalWindowResizeExitRect(panel))
            } else if (entry.target === surface) {
              noteObserved(baselineSurface, readLocalImeLocalWindowResizeExitRect(surface))
            }
          }
        })
        observer.observe(panel)
        observer.observe(surface)
        observerCount = 1
      }
    },
    armFromLiveDom(input) {
      if (!panel?.isConnected || !surface?.isConnected) {
        disarm()
        return
      }
      const captured = captureLocalImeLocalWindowResizeExitBaseline({
        generation: input.generation,
        identity: input.identity,
        panel: readLocalImeLocalWindowResizeExitRect(panel),
        surface: readLocalImeLocalWindowResizeExitRect(surface),
      })
      armedGeneration = captured.generation
      armedIdentity = captured.identity
      baselinePanel = captured.panel
      baselineSurface = captured.surface
      latch.latched = false
      boundaryCalls = 0
    },
    disarm,
    detach,
    destroy() {
      detach()
      boundaryCalls = 0
    },
    diagnostics: () => ({
      armed: armedGeneration !== null && baselinePanel !== null && armedIdentity !== null,
      latched: latch.latched,
      boundaryCalls,
      listenerCount,
      observerCount,
    }),
  }
}
