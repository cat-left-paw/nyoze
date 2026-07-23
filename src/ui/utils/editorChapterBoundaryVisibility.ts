import type { WritingMode } from '../../settings/types'
import type { ScrollEdges } from './editorScrollEdges'

export const BOUNDARY_POINTER_ZONE_DEPTH_PX = 64
export const BOUNDARY_AUTO_HIDE_DELAY_MS = 1800

export type BoundaryPointerZones = {
  inStartZone: boolean
  inEndZone: boolean
}

export type BoundaryGroupKind = 'start' | 'end'

export type BoundaryGroupVisibility = {
  startGroupVisible: boolean
  endGroupVisible: boolean
}

export type BoundaryGroupEligibility = {
  canShowStartGroup: boolean
  canShowEndGroup: boolean
}

export type PanelRectLike = {
  left: number
  top: number
  right: number
  bottom: number
}

export type PointerClientPoint = {
  clientX: number
  clientY: number
}

let e2eHideDelayOverrideMs: number | null = null

/** NYOZE_E2E bridge から hide delay を上書きする（product 既定は維持）。 */
export function setChapterBoundaryHideDelayMsForE2e(delayMs: number | null): void {
  e2eHideDelayOverrideMs =
    typeof delayMs === 'number' && Number.isFinite(delayMs) && delayMs > 0 ? delayMs : null
}

export function resolveChapterBoundaryHideDelayMs(): number {
  if (e2eHideDelayOverrideMs !== null) return e2eHideDelayOverrideMs
  if (typeof window !== 'undefined') {
    const fromWindow = window.__NYOZE_E2E__?.chapterBoundaryHideDelayMs
    if (typeof fromWindow === 'number' && Number.isFinite(fromWindow) && fromWindow > 0) {
      return fromWindow
    }
  }
  return BOUNDARY_AUTO_HIDE_DELAY_MS
}

/**
 * editor panel 矩形と pointer 座標から章頭 / 章末 interaction zone を判定する。
 */
export function detectEditorBoundaryPointerZones(
  writingMode: WritingMode,
  panelRect: PanelRectLike,
  pointer: PointerClientPoint,
  depthPx = BOUNDARY_POINTER_ZONE_DEPTH_PX,
): BoundaryPointerZones {
  if (writingMode === 'vertical-rl') {
    return {
      inStartZone: panelRect.right - pointer.clientX <= depthPx,
      inEndZone: pointer.clientX - panelRect.left <= depthPx,
    }
  }

  return {
    inStartZone: pointer.clientY - panelRect.top <= depthPx,
    inEndZone: panelRect.bottom - pointer.clientY <= depthPx,
  }
}

type EditorChapterBoundaryVisibilityControllerDeps = {
  getHideDelayMs: () => number
  scheduleTimeout: (callback: () => void, delayMs: number) => number
  cancelTimeout: (handle: number) => void
  onVisibilityChange: (visibility: BoundaryGroupVisibility) => void
}

type GroupRuntime = {
  visible: boolean
  hovered: boolean
  hideTimerHandle: number
  hideTimerGeneration: number
}

/**
 * 章境界 group の表示 / 自動非表示 timer を管理する pure controller。
 *
 * generation token で stale timeout を無効化する。
 */
export function createEditorChapterBoundaryVisibilityController(
  deps: EditorChapterBoundaryVisibilityControllerDeps,
) {
  let sessionGeneration = 0
  const groups: Record<BoundaryGroupKind, GroupRuntime> = {
    start: { visible: false, hovered: false, hideTimerHandle: 0, hideTimerGeneration: 0 },
    end: { visible: false, hovered: false, hideTimerHandle: 0, hideTimerGeneration: 0 },
  }

  const emit = () => {
    deps.onVisibilityChange({
      startGroupVisible: groups.start.visible,
      endGroupVisible: groups.end.visible,
    })
  }

  const cancelHideTimer = (group: BoundaryGroupKind) => {
    const runtime = groups[group]
    if (runtime.hideTimerHandle !== 0) {
      deps.cancelTimeout(runtime.hideTimerHandle)
      runtime.hideTimerHandle = 0
    }
  }

  const setVisible = (group: BoundaryGroupKind, visible: boolean) => {
    if (groups[group].visible === visible) return
    groups[group].visible = visible
    emit()
  }

  const scheduleHide = (group: BoundaryGroupKind) => {
    const runtime = groups[group]
    cancelHideTimer(group)
    const timerGeneration = ++sessionGeneration
    runtime.hideTimerGeneration = timerGeneration
    runtime.hideTimerHandle = deps.scheduleTimeout(() => {
      runtime.hideTimerHandle = 0
      if (timerGeneration !== runtime.hideTimerGeneration) return
      if (runtime.hovered) return
      setVisible(group, false)
    }, deps.getHideDelayMs())
  }

  const reveal = (group: BoundaryGroupKind) => {
    setVisible(group, true)
    if (!groups[group].hovered) {
      scheduleHide(group)
    }
  }

  const hide = (group: BoundaryGroupKind) => {
    cancelHideTimer(group)
    groups[group].hideTimerGeneration = ++sessionGeneration
    groups[group].hovered = false
    setVisible(group, false)
  }

  const reset = () => {
    const visibilityChanged = groups.start.visible || groups.end.visible
    sessionGeneration += 1
    for (const group of ['start', 'end'] as const) {
      cancelHideTimer(group)
      groups[group].hovered = false
      groups[group].visible = false
      groups[group].hideTimerGeneration = sessionGeneration
    }
    if (visibilityChanged) {
      emit()
    }
  }

  const onEdgesChanged = (
    prev: ScrollEdges,
    next: ScrollEdges,
    eligibility: BoundaryGroupEligibility,
  ) => {
    if (!next.atStart || !eligibility.canShowStartGroup) {
      hide('start')
    } else if (!prev.atStart && next.atStart) {
      reveal('start')
    }

    if (!next.atEnd || !eligibility.canShowEndGroup) {
      hide('end')
    } else if (!prev.atEnd && next.atEnd) {
      reveal('end')
    }
  }

  const onPointerActivity = (
    zones: BoundaryPointerZones,
    context: BoundaryGroupEligibility & ScrollEdges,
  ) => {
    // zone 内のみ reveal + timer 延長。zone 外では edge reveal の auto-hide を維持する
    // （中央付近でホイールスクロールして端に到達した場合も、hover と同程度表示する）。
    if (context.atStart && context.canShowStartGroup && zones.inStartZone) {
      reveal('start')
    }

    if (context.atEnd && context.canShowEndGroup && zones.inEndZone) {
      reveal('end')
    }
  }

  const onGroupPointerEnter = (group: BoundaryGroupKind) => {
    groups[group].hovered = true
    cancelHideTimer(group)
    if (!groups[group].visible) {
      setVisible(group, true)
    }
  }

  const onGroupPointerLeave = (group: BoundaryGroupKind) => {
    groups[group].hovered = false
    if (groups[group].visible) {
      scheduleHide(group)
    }
  }

  const onGroupPointerDown = (group: BoundaryGroupKind) => {
    groups[group].hovered = true
    reveal(group)
    cancelHideTimer(group)
  }

  const isGroupVisible = (group: BoundaryGroupKind) => groups[group].visible

  return {
    reset,
    onEdgesChanged,
    onPointerActivity,
    onGroupPointerEnter,
    onGroupPointerLeave,
    onGroupPointerDown,
    isGroupVisible,
  }
}
