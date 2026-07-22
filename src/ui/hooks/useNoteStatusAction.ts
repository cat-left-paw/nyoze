import { useCallback, useRef } from 'react'
import {
  commitNoteStatusUpdate,
  prepareNoteStatusUpdate,
  type NoteStatusTransition,
} from './noteStatusController'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import type { PlainModeKind } from '../utils/plainModeCommandGate'

export type NoteStatusActionResult =
  | { kind: 'updated' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

type UseNoteStatusActionOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  isPlainModeActive: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  onSaved: () => void
}

export function useNoteStatusAction(options: UseNoteStatusActionOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const runTransition = useCallback(
    async (id: string, transition: NoteStatusTransition): Promise<NoteStatusActionResult> => {
      const o = optionsRef.current
      if (o.isInternalDoc()) return { kind: 'cancelled' }
      if (o.isPlainModeActive()) return { kind: 'cancelled' }

      const deps = {
        getActiveFilePath: o.getActiveFilePath,
        isInternalDoc: o.isInternalDoc,
        getPlainModeKind: o.getPlainModeKind,
        getBridge: o.getBridge,
      }

      const prepared = await prepareNoteStatusUpdate(deps)
      if (prepared.kind === 'blocked') {
        return { kind: 'failed', message: prepared.message }
      }

      const result = await commitNoteStatusUpdate(deps, {
        activeFilePath: prepared.activeFilePath,
        id,
        transition,
      })
      if (result.kind === 'failed') {
        return { kind: 'failed', message: result.message }
      }

      o.onSaved()
      return { kind: 'updated' }
    },
    [],
  )

  const handleMarkResolved = useCallback(
    (id: string) => runTransition(id, 'resolve'),
    [runTransition],
  )

  const handleReopenNote = useCallback(
    (id: string) => runTransition(id, 'reopen'),
    [runTransition],
  )

  return { handleMarkResolved, handleReopenNote }
}
