import { useNoteEditAction } from './useNoteEditAction'
import { useNoteStatusAction } from './useNoteStatusAction'
import { useNoteTagManagerActions } from './useNoteTagManagerActions'
import type { NoteAnchorProjectBridge } from './noteAnchorInsertController'
import type { PlainModeKind } from '../utils/plainModeCommandGate'
import type { UiLanguageMode } from '../../settings/types'

type UseNotePanelActionsOptions = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  isPlainModeActive: () => boolean
  getPlainModeKind: () => PlainModeKind | null
  getBridge: () => NoteAnchorProjectBridge | null
  getUiLanguageMode: () => UiLanguageMode
  onSaved: () => void
}

/** 右ペイン付箋の編集・status 更新アクションを App.tsx から分離する。 */
export function useNotePanelActions(options: UseNotePanelActionsOptions) {
  const edit = useNoteEditAction(options)
  const status = useNoteStatusAction(options)
  const tagManager = useNoteTagManagerActions(options)
  return {
    handleSaveNoteEdit: edit.handleSaveNoteEdit,
    handleMarkResolved: status.handleMarkResolved,
    handleReopenNote: status.handleReopenNote,
    handleAddTag: tagManager.handleAddTag,
    handleRenameTag: tagManager.handleRenameTag,
    handleDeleteTag: tagManager.handleDeleteTag,
  }
}
