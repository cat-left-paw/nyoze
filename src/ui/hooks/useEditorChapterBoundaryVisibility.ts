import { useCallback, useEffect, useRef, useState } from 'react'
import type { WritingMode } from '../../settings/types'
import type { ScrollEdges } from '../utils/editorScrollEdges'
import {
  createEditorChapterBoundaryVisibilityController,
  detectEditorBoundaryPointerZones,
  resolveChapterBoundaryHideDelayMs,
  type BoundaryGroupEligibility,
  type BoundaryGroupKind,
  type BoundaryGroupVisibility,
} from '../utils/editorChapterBoundaryVisibility'

type UseEditorChapterBoundaryVisibilityOptions = {
  getInteractionHost: () => HTMLElement | null
  enabled: boolean
  writingMode: WritingMode
  edges: ScrollEdges
  eligibility: BoundaryGroupEligibility
  resetKey: string
}

const INITIAL_VISIBILITY: BoundaryGroupVisibility = {
  startGroupVisible: false,
  endGroupVisible: false,
}

export function useEditorChapterBoundaryVisibility({
  getInteractionHost,
  enabled,
  writingMode,
  edges,
  eligibility,
  resetKey,
}: UseEditorChapterBoundaryVisibilityOptions) {
  const atStart = edges.atStart
  const atEnd = edges.atEnd
  const canShowStartGroup = eligibility.canShowStartGroup
  const canShowEndGroup = eligibility.canShowEndGroup
  const getInteractionHostRef = useRef(getInteractionHost)
  const writingModeRef = useRef(writingMode)
  const edgesRef = useRef<ScrollEdges>({ atStart, atEnd })
  const eligibilityRef = useRef<BoundaryGroupEligibility>({
    canShowStartGroup,
    canShowEndGroup,
  })
  getInteractionHostRef.current = getInteractionHost
  writingModeRef.current = writingMode
  edgesRef.current.atStart = atStart
  edgesRef.current.atEnd = atEnd
  eligibilityRef.current.canShowStartGroup = canShowStartGroup
  eligibilityRef.current.canShowEndGroup = canShowEndGroup

  const prevEdgesRef = useRef<ScrollEdges>({ atStart: false, atEnd: false })
  const controllerRef = useRef<ReturnType<
    typeof createEditorChapterBoundaryVisibilityController
  > | null>(null)

  const [visibility, setVisibility] = useState<BoundaryGroupVisibility>(INITIAL_VISIBILITY)
  const handleVisibilityChange = useCallback((next: BoundaryGroupVisibility) => {
    setVisibility((prev) =>
      prev.startGroupVisible === next.startGroupVisible &&
      prev.endGroupVisible === next.endGroupVisible
        ? prev
        : next,
    )
  }, [])

  if (!controllerRef.current) {
    controllerRef.current = createEditorChapterBoundaryVisibilityController({
      getHideDelayMs: resolveChapterBoundaryHideDelayMs,
      scheduleTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelTimeout: (handle) => window.clearTimeout(handle),
      onVisibilityChange: handleVisibilityChange,
    })
  }

  const handlePanelPointer = useCallback((event: PointerEvent) => {
    const host = getInteractionHostRef.current()
    if (!host) return

    const zones = detectEditorBoundaryPointerZones(
      writingModeRef.current,
      host.getBoundingClientRect(),
      { clientX: event.clientX, clientY: event.clientY },
    )
    controllerRef.current?.onPointerActivity(zones, {
      ...eligibilityRef.current,
      ...edgesRef.current,
    })
  }, [])

  const makeGroupHandlers = useCallback((group: BoundaryGroupKind) => {
    return {
      onPointerEnter: () => controllerRef.current?.onGroupPointerEnter(group),
      onPointerLeave: () => controllerRef.current?.onGroupPointerLeave(group),
      onPointerDown: () => controllerRef.current?.onGroupPointerDown(group),
    }
  }, [])

  const startGroupHandlers = makeGroupHandlers('start')
  const endGroupHandlers = makeGroupHandlers('end')

  useEffect(() => {
    prevEdgesRef.current = { atStart: false, atEnd: false }
    controllerRef.current?.reset()
  }, [resetKey])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return

    if (!enabled) {
      controller.reset()
      prevEdgesRef.current = { atStart: false, atEnd: false }
      return
    }

    const prev = prevEdgesRef.current
    const nextEdges = { atStart, atEnd }
    const nextEligibility = { canShowStartGroup, canShowEndGroup }
    controller.onEdgesChanged(prev, nextEdges, nextEligibility)
    prevEdgesRef.current = nextEdges
  }, [enabled, atStart, atEnd, canShowStartGroup, canShowEndGroup, resetKey])

  useEffect(() => {
    if (!enabled) return

    const host = getInteractionHostRef.current()
    if (!host) return

    const onPointerMove = (event: PointerEvent) => handlePanelPointer(event)
    const onPointerDown = (event: PointerEvent) => handlePanelPointer(event)

    host.addEventListener('pointermove', onPointerMove, { passive: true })
    host.addEventListener('pointerdown', onPointerDown, { passive: true })

    return () => {
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerdown', onPointerDown)
    }
  }, [enabled, resetKey, handlePanelPointer])

  useEffect(() => {
    return () => controllerRef.current?.reset()
  }, [])

  return {
    startGroupVisible: visibility.startGroupVisible,
    endGroupVisible: visibility.endGroupVisible,
    startGroupHandlers,
    endGroupHandlers,
  }
}
