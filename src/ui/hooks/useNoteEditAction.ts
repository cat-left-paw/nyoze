import { useCallback, useRef } from 'react'
import {
  commitNoteEdit,
  prepareNoteEdit,
  type NoteEditDraft,
  type NoteEditResult,
} from './noteEditController'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import type { PlainModeKind } from '../utils/plainModeCommandGate'

/**
 * 右ペインからの付箋 title / text 編集アクションを App.tsx から分離する hook。
 *
 * ロジックは noteEditController に委譲し、ここは plain/internal の安全停止と
 * 保存成功後 refresh の配線だけを担う。projectRoot を IPC 引数に渡さない方針は
 * controller 側で担保している。
 */

type UseNoteEditActionOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  isPlainModeActive: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  /** 保存成功後に document notes / hover preview / missing-file を refresh する。 */
  onSaved: () => void
}

export function useNoteEditAction(options: UseNoteEditActionOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const handleSaveNoteEdit = useCallback(
    async (id: string, draft: NoteEditDraft): Promise<NoteEditResult> => {
      const o = optionsRef.current
      if (o.isInternalDoc()) return { kind: 'cancelled' }
      if (o.isPlainModeActive()) return { kind: 'cancelled' }

      const deps = {
        getActiveFilePath: o.getActiveFilePath,
        isInternalDoc: o.isInternalDoc,
        getPlainModeKind: o.getPlainModeKind,
        getBridge: o.getBridge,
      }

      const prepared = await prepareNoteEdit(deps)
      if (prepared.kind === 'blocked') {
        return { kind: 'failed', message: prepared.message }
      }

      const result = await commitNoteEdit(deps, {
        activeFilePath: prepared.activeFilePath,
        id,
        draft,
      })
      if (result.kind === 'failed') {
        return { kind: 'failed', message: result.message }
      }

      o.onSaved()
      return { kind: 'edited' }
    },
    [],
  )

  return { handleSaveNoteEdit }
}
