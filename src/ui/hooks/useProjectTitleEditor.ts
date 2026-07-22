import { useCallback, useRef, useState } from 'react'
import { validateProjectTitle } from '../../project/projectMetadata'
import type { ProjectPanelWriteAnchor, ProjectUpdateTitleResult } from '../../project/projectIpcTypes'

/**
 * Project タブの `.nyoze/project.json` title 編集 state hook。
 *
 * 境界:
 * - renderer から projectRoot は渡さない。保存時は context write anchor だけを
 *   `project:updateTitle` に渡し、main 側で project root 解決 + atomic write する。
 * - 編集対象は title のみ。Markdown / frontmatter には触れない。
 * - 保存失敗・検証エラー時は draft を保持する。
 * - 資料 edit（{@link useProjectAssetEditor}）とは別 hook。同時編集は container 側で防ぐ。
 */

export type ProjectTitleEditError = 'empty' | 'too-long' | 'save-failed'

export type ProjectTitleEditState =
  | { kind: 'idle' }
  | {
      kind: 'editing'
      original: string
      draft: string
      saving: boolean
      error: ProjectTitleEditError | null
    }

type ProjectBridge = NonNullable<typeof window.nyozeBridge>['project']

function getProjectBridge(): ProjectBridge | null {
  return window.nyozeBridge?.project ?? null
}

function isTitleEditDirty(original: string, draft: string): boolean {
  return original.trim() !== draft.trim()
}

function mapSaveError(result: ProjectUpdateTitleResult): ProjectTitleEditError {
  if (result.ok) return 'save-failed'
  if (result.reason === 'empty-title') return 'empty'
  if (result.reason === 'title-too-long') return 'too-long'
  return 'save-failed'
}

type UseProjectTitleEditorOptions = {
  onSaved: () => void
}

export function useProjectTitleEditor({ onSaved }: UseProjectTitleEditorOptions) {
  const [editState, setEditState] = useState<ProjectTitleEditState>({ kind: 'idle' })
  const [leaveBlocked, setLeaveBlocked] = useState(false)
  const generationRef = useRef(0)
  const stateRef = useRef(editState)
  stateRef.current = editState
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const reset = useCallback(() => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'idle' })
  }, [])

  const resetIfClean = useCallback((): boolean => {
    const current = stateRef.current
    if (current.kind === 'editing' && isTitleEditDirty(current.original, current.draft)) {
      return false
    }
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'idle' })
    return true
  }, [])

  const cancelEdit = useCallback(() => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'idle' })
  }, [])

  const beginEdit = useCallback((currentTitle: string) => {
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({
      kind: 'editing',
      original: currentTitle,
      draft: currentTitle,
      saving: false,
      error: null,
    })
  }, [])

  const setDraft = useCallback((text: string) => {
    setLeaveBlocked(false)
    setEditState((prev) => {
      if (prev.kind !== 'editing') return prev
      return { ...prev, draft: text, error: null }
    })
  }, [])

  const save = useCallback(async (writeAnchor: ProjectPanelWriteAnchor | null) => {
    const current = stateRef.current
    if (current.kind !== 'editing' || current.saving) return

    const clientValidation = validateProjectTitle(current.draft)
    if (!clientValidation.ok) {
      setEditState({
        ...current,
        error: clientValidation.reason === 'empty' ? 'empty' : 'too-long',
      })
      return
    }

    if (!writeAnchor) {
      setEditState({ ...current, error: 'save-failed' })
      return
    }

    const bridge = getProjectBridge()
    if (!bridge?.updateTitle) {
      setEditState({ ...current, error: 'save-failed' })
      return
    }

    const generation = generationRef.current
    setEditState({ ...current, saving: true, error: null })

    const result = await bridge.updateTitle(writeAnchor, current.draft).catch(
      (): ProjectUpdateTitleResult => ({ ok: false, reason: 'write-failed' }),
    )
    if (generation !== generationRef.current) return

    if (!result.ok) {
      setEditState({
        ...current,
        saving: false,
        error: mapSaveError(result),
      })
      return
    }

    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'idle' })
    onSavedRef.current()
  }, [])

  const requestLeave = useCallback((): boolean => {
    const current = stateRef.current
    if (current.kind !== 'editing') return false
    if (isTitleEditDirty(current.original, current.draft)) {
      setLeaveBlocked(true)
      return true
    }
    generationRef.current += 1
    setLeaveBlocked(false)
    setEditState({ kind: 'idle' })
    return false
  }, [])

  const isDirty =
    editState.kind === 'editing' && isTitleEditDirty(editState.original, editState.draft)

  return {
    editState,
    leaveBlocked,
    isDirty,
    beginEdit,
    setDraft,
    save,
    cancelEdit,
    requestLeave,
    reset,
    resetIfClean,
  }
}

export type ProjectTitleEditorApi = ReturnType<typeof useProjectTitleEditor>
