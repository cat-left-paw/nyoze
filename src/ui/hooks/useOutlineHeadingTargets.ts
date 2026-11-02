import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import { createOutlineTargetReferences, type OutlineHeadingRow, type OutlineHeadingTarget } from '../../editor-core/features/outlineTargetReference'
import type { ActiveHeadingStore } from './activeHeadingStore'
import { arePositionSetsEqual } from './headingUiState'
import { toggleHeadingFoldViaDocumentAction } from '../utils/localImeHeadingFoldCommand'

export function useOutlineHeadingTargets(
  coreRef: RefObject<EditorCoreHandle | null>,
  activeTabId: string,
  activeHeadingStore: ActiveHeadingStore,
) {
  const [references] = useState(createOutlineTargetReferences)
  const [headings, setHeadings] = useState<OutlineHeadingRow[]>([])
  const [foldedHeadingPositions, setFoldedHeadingPositions] = useState<Set<number>>(() => new Set())
  const invalidateOutlineTargets = useCallback(() => references.invalidate(), [references])

  const publish = useCallback((core: EditorCoreHandle) => {
    const doc = core.getEditorState().doc
    const snapshot = core.getHeadingSnapshot()
    setHeadings(references.publish(core, doc, snapshot.headings))
    references.recordActive(doc, snapshot.activeHeadingIndex)
    activeHeadingStore.set(snapshot.activeHeadingIndex)
    setFoldedHeadingPositions(prev => arePositionSetsEqual(prev, snapshot.foldedHeadingPositions) ? prev : snapshot.foldedHeadingPositions)
  }, [references, activeHeadingStore])
  const refreshHeadings = useCallback(() => {
    if (coreRef.current) publish(coreRef.current)
  }, [coreRef, publish])

  const previousTab = useRef(activeTabId)
  useLayoutEffect(() => {
    if (previousTab.current === activeTabId) return
    previousTab.current = activeTabId
    references.invalidate()
    refreshHeadings()
  }, [activeTabId, references, refreshHeadings])
  useLayoutEffect(() => () => references.invalidate(), [references])

  const onOutlineCoreReady = useCallback((core: EditorCoreHandle) => {
    references.invalidate()
    publish(core)
  }, [references, publish])
  const updateActiveHeading = useCallback(() => {
    const core = coreRef.current
    if (!core) return
    const index = core.getActiveHeadingIndex()
    references.recordActive(core.getEditorState().doc, index)
    activeHeadingStore.set(index)
  }, [coreRef, references, activeHeadingStore])
  const getActiveOutlineTarget = useCallback((index: number) => {
    const core = coreRef.current
    return core ? references.activeTarget(core, core.getEditorState().doc, index) : null
  }, [coreRef, references])

  const toggleOutlineHeadingFold = useCallback((target: OutlineHeadingTarget) => {
    const core = coreRef.current
    if (!core) return
    const pos = references.resolve(core, core.getEditorState().doc, target)
    if (pos === null) return
    // Keep the existing capture -> barrier -> node-identity handoff intact.
    toggleHeadingFoldViaDocumentAction(core, pos)
  }, [coreRef, references])
  const scrollToOutlineHeading = useCallback((target: OutlineHeadingTarget) => {
    const core = coreRef.current
    if (!core) return
    const pos = references.resolve(core, core.getEditorState().doc, target)
    if (pos !== null) core.scrollToPos(pos)
  }, [coreRef, references])
  const requestOutlineHeadingPreview = useCallback((target: OutlineHeadingTarget) => {
    const core = coreRef.current
    if (!core) return ''
    const pos = references.resolve(core, core.getEditorState().doc, target)
    return pos === null ? '' : core.getHeadingPreview(pos)
  }, [coreRef, references])
  const watchOutlinePreview = useCallback((close: () => void) => {
    // Subscribe only while a preview is open. A Doc change invalidates its
    // text immediately, without a permanent per-keystroke App state update.
    return coreRef.current?.onUpdate(changed => { if (changed) close() }) ?? (() => {})
  }, [coreRef])

  return { headings, foldedHeadingPositions, invalidateOutlineTargets, refreshHeadings, onOutlineCoreReady, updateActiveHeading, getActiveOutlineTarget, toggleOutlineHeadingFold, scrollToOutlineHeading, requestOutlineHeadingPreview, watchOutlinePreview }
}
