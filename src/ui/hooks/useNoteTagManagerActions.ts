import { useCallback, useRef } from 'react'
import { countTagUsage } from '../../project/noteTags'
import type { UiLanguageMode } from '../../settings/types'
import { getUiText } from '../i18n/uiText'

import {
  commitNoteTagAdd,
  commitNoteTagDelete,
  commitNoteTagRename,
  prepareNoteTagSlotsSave,
  tagManagerValidationMessage,
  type NoteTagManagerSaveResult,
} from './noteTagSlotsController'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import type { PlainModeKind } from '../utils/plainModeCommandGate'

function formatTagDeleteConfirm(count: number, mode: UiLanguageMode): string {
  return getUiText(mode, 'documentNotes.tagDeleteConfirm').replace('{count}', String(count))
}

type UseNoteTagManagerActionsOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  isPlainModeActive: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  getUiLanguageMode: () => UiLanguageMode
  onSaved: () => void
}

async function runTagMutation(
  options: UseNoteTagManagerActionsOptions,
  mutate: (deps: ReturnType<typeof buildDeps>, activeFilePath: string) => Promise<NoteTagManagerSaveResult>,
): Promise<NoteTagManagerSaveResult> {
  const o = options
  if (o.isInternalDoc()) return { kind: 'cancelled' }
  if (o.isPlainModeActive()) return { kind: 'cancelled' }

  const deps = buildDeps(o)
  const prepared = await prepareNoteTagSlotsSave(deps)
  if (prepared.kind === 'blocked') {
    return { kind: 'failed', message: prepared.message }
  }

  return mutate(deps, prepared.activeFilePath)
}

function buildDeps(o: UseNoteTagManagerActionsOptions) {
  return {
    getActiveFilePath: o.getActiveFilePath,
    isInternalDoc: o.isInternalDoc,
    getPlainModeKind: o.getPlainModeKind,
    getBridge: o.getBridge,
  }
}

export function useNoteTagManagerActions(options: UseNoteTagManagerActionsOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const handleAddTag = useCallback(async (label: string): Promise<NoteTagManagerSaveResult> => {
    const result = await runTagMutation(optionsRef.current, async (deps, activeFilePath) => {
      const committed = await commitNoteTagAdd(deps, { activeFilePath, label })
      if (committed.kind === 'validation-failed') {
        return { kind: 'failed', message: tagManagerValidationMessage(committed.error) }
      }
      if (committed.kind === 'failed') {
        return { kind: 'failed', message: committed.message }
      }
      optionsRef.current.onSaved()
      return { kind: 'saved' }
    })
    return result
  }, [])

  const handleRenameTag = useCallback(
    async (tagId: string, label: string): Promise<NoteTagManagerSaveResult> => {
      const result = await runTagMutation(optionsRef.current, async (deps, activeFilePath) => {
        const committed = await commitNoteTagRename(deps, { activeFilePath, tagId, label })
        if (committed.kind === 'validation-failed') {
          return { kind: 'failed', message: tagManagerValidationMessage(committed.error) }
        }
        if (committed.kind === 'failed') {
          return { kind: 'failed', message: committed.message }
        }
        optionsRef.current.onSaved()
        return { kind: 'saved' }
      })
      return result
    },
    [],
  )

  const handleDeleteTag = useCallback(async (tagId: string): Promise<NoteTagManagerSaveResult> => {
    const o = optionsRef.current
    if (o.isInternalDoc()) return { kind: 'cancelled' }
    if (o.isPlainModeActive()) return { kind: 'cancelled' }

    const bridge = o.getBridge()
    if (!bridge) return { kind: 'cancelled' }

    const activeFilePath = o.getActiveFilePath()
    if (!activeFilePath) return { kind: 'cancelled' }

    const notes = await bridge.readNotes(activeFilePath)
    if (!notes.ok) return { kind: 'cancelled' }

    const usageCount = countTagUsage(notes.store, tagId)
    const message = formatTagDeleteConfirm(usageCount, o.getUiLanguageMode())
    if (!window.confirm(message)) {
      return { kind: 'cancelled' }
    }

    const result = await runTagMutation(o, async (deps, filePath) => {
      const committed = await commitNoteTagDelete(deps, { activeFilePath: filePath, tagId })
      if (committed.kind === 'validation-failed') {
        return { kind: 'failed', message: tagManagerValidationMessage(committed.error) }
      }
      if (committed.kind === 'failed') {
        return { kind: 'failed', message: committed.message }
      }
      o.onSaved()
      return { kind: 'saved' }
    })
    return result
  }, [])

  return {
    handleAddTag,
    handleRenameTag,
    handleDeleteTag,
  }
}
