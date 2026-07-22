import { useCallback, useEffect, useRef, useState } from 'react'
import type { MissingFileNoteView } from '../../project/missingFileNotesQuery'
import type { ProjectMissingFileNotesResult } from '../../project/projectIpcTypes'

export type MissingFileNotesViewState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'ready'; notes: MissingFileNoteView[] }

export const MISSING_FILE_NOTES_READ_ERROR_MESSAGE =
  '付箋データを読み込めませんでした。'

/**
 * missing-file notes 取得に必要な最小 bridge 面。
 * 参照先ファイルの存在確認（NFC/NFD 差分の吸収・projectRoot 境界 / 中間 symlink ガード）は
 * main 側で行うため、renderer は active file path を渡すだけにする。
 */
export type MissingFileNotesBridge = {
  resolveMissingFileNotes: (filePath: string) => Promise<ProjectMissingFileNotesResult>
}

function getProjectBridge(): MissingFileNotesBridge | null {
  return window.nyozeBridge?.project ?? null
}

export async function loadMissingFileNotesForFile(
  bridge: MissingFileNotesBridge,
  activeFilePath: string,
): Promise<MissingFileNotesViewState> {
  const result = await bridge.resolveMissingFileNotes(activeFilePath)
  if (!result.ok) {
    if (result.reason === 'read-failed') {
      return { kind: 'error', message: MISSING_FILE_NOTES_READ_ERROR_MESSAGE }
    }
    // invalid-path / not-in-project は付箋一覧の対象外。
    return { kind: 'unavailable' }
  }

  if (result.notes.length === 0) {
    return { kind: 'empty' }
  }

  return { kind: 'ready', notes: result.notes }
}

type UseMissingFileNotesOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
}

export function useMissingFileNotes({
  getActiveFilePath,
  isInternalDoc,
}: UseMissingFileNotesOptions) {
  const getActiveFilePathRef = useRef(getActiveFilePath)
  const isInternalDocRef = useRef(isInternalDoc)
  const refreshGenerationRef = useRef(0)
  getActiveFilePathRef.current = getActiveFilePath
  isInternalDocRef.current = isInternalDoc

  const [state, setState] = useState<MissingFileNotesViewState>({ kind: 'loading' })

  const refreshMissingFileNotes = useCallback(async () => {
    const generation = ++refreshGenerationRef.current

    if (isInternalDocRef.current()) {
      setState({ kind: 'unavailable' })
      return
    }

    const activeFilePath = getActiveFilePathRef.current()
    if (!activeFilePath) {
      setState({ kind: 'unavailable' })
      return
    }

    const bridge = getProjectBridge()
    if (!bridge) {
      setState({ kind: 'unavailable' })
      return
    }

    setState({ kind: 'loading' })
    const next = await loadMissingFileNotesForFile(bridge, activeFilePath)
    if (
      generation !== refreshGenerationRef.current ||
      getActiveFilePathRef.current() !== activeFilePath ||
      isInternalDocRef.current()
    ) {
      return
    }
    setState(next)
  }, [])

  const activeFilePath = getActiveFilePath()

  useEffect(() => {
    void refreshMissingFileNotes()
  }, [activeFilePath, refreshMissingFileNotes])

  return { missingFileNotesState: state, refreshMissingFileNotes }
}
