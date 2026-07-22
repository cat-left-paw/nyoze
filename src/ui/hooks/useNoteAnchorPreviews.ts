import { useCallback, useEffect, useRef } from 'react'
import type { EditorCoreHandle } from '../../editor-core/types'
import { buildNoteAnchorColorMap, type NoteColorId } from '../../project/noteColor'
import { buildNoteAnchorPreviewMap } from '../../project/notePreview'
import { toProjectRelativeFilePath } from '../../project/notePath'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'

type UseNoteAnchorPreviewsOptions = {
  coreRef: { current: EditorCoreHandle | null }
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
}

function getProjectBridge(): NoteAnchorProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

/**
 * active document の notes.json から noteAnchor hover preview を読み込み、
 * EditorCore へ DOM-only 反映する thin hook。
 */
export async function loadNoteAnchorPreviewsForFile(
  bridge: NoteAnchorProjectBridge,
  activeFilePath: string,
): Promise<Record<string, string>> {
  const resolved = await bridge.resolveForFile(activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return {}
  }
  const relativeFile = toProjectRelativeFilePath(
    resolved.project.projectRoot,
    activeFilePath,
  )
  if (relativeFile === null) {
    return {}
  }
  const notes = await bridge.readNotes(activeFilePath)
  if (!notes.ok) {
    return {}
  }
  return buildNoteAnchorPreviewMap(notes.store, relativeFile)
}

export async function loadNoteAnchorColorsForFile(
  bridge: NoteAnchorProjectBridge,
  activeFilePath: string,
): Promise<Record<string, NoteColorId>> {
  const resolved = await bridge.resolveForFile(activeFilePath)
  if (!resolved.ok || resolved.project === null) {
    return {}
  }
  const relativeFile = toProjectRelativeFilePath(
    resolved.project.projectRoot,
    activeFilePath,
  )
  if (relativeFile === null) {
    return {}
  }
  const notes = await bridge.readNotes(activeFilePath)
  if (!notes.ok) {
    return {}
  }
  return buildNoteAnchorColorMap(notes.store, relativeFile)
}

export function useNoteAnchorPreviews({
  coreRef,
  getActiveFilePath,
  isInternalDoc,
}: UseNoteAnchorPreviewsOptions) {
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const refreshGenerationRef = useRef(0)
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const refreshNoteAnchorPreviews = useCallback(async () => {
    const generation = ++refreshGenerationRef.current
    const core = coreRef.current
    if (!core) return

    if (isInternalDocRef.current()) {
      core.setNoteAnchorPreviews({})
      core.setNoteAnchorColors({})
      return
    }

    const activeFilePath = getActiveFilePathRef.current()
    if (!activeFilePath) {
      core.setNoteAnchorPreviews({})
      core.setNoteAnchorColors({})
      return
    }

    const bridge = getProjectBridge()
    if (!bridge) {
      core.setNoteAnchorPreviews({})
      core.setNoteAnchorColors({})
      return
    }

    const [previews, colors] = await Promise.all([
      loadNoteAnchorPreviewsForFile(bridge, activeFilePath),
      loadNoteAnchorColorsForFile(bridge, activeFilePath),
    ])
    if (
      generation !== refreshGenerationRef.current ||
      getActiveFilePathRef.current() !== activeFilePath ||
      isInternalDocRef.current()
    ) {
      return
    }
    core.setNoteAnchorPreviews(previews)
    core.setNoteAnchorColors(colors)
  }, [coreRef])

  const activeFilePath = getActiveFilePath()

  useEffect(() => {
    void refreshNoteAnchorPreviews()
  }, [activeFilePath, refreshNoteAnchorPreviews])

  return { refreshNoteAnchorPreviews }
}
