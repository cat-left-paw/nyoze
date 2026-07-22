import type { ReactNode } from 'react'
import {
  IconMessage,
  IconTrash,
} from '@tabler/icons-react'
import type { CommandAvailability } from '../../editor-core/types'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { NoteAnchorDeletePath } from '../utils/noteAnchorDeletePath'

const ICON_SIZE = 16
const ICON_STROKE = 1.2

export type NoteAnchorContextMenuItem = {
  id: string
  label: string
  icon: ReactNode
  disabled: boolean
  action?: () => void | Promise<void>
  separator?: false
}

export type NoteAnchorContextMenuSeparator = {
  separator: true
  id: string
}

export type NoteAnchorContextMenuEntry = NoteAnchorContextMenuItem | NoteAnchorContextMenuSeparator

type BuildNoteAnchorContextMenuItemsOptions = {
  availability: CommandAvailability
  noteAnchorContextId: string | null
  markerDeleteMode: NoteAnchorDeletePath | null
  uiLanguageMode: UiLanguageMode
  onShowNoteInPanel: (id: string) => void
  onDeleteNoteAnchor: (id: string) => void
}

export function buildNoteAnchorContextMenuItems({
  availability,
  noteAnchorContextId,
  markerDeleteMode,
  uiLanguageMode,
  onShowNoteInPanel,
  onDeleteNoteAnchor,
}: BuildNoteAnchorContextMenuItemsOptions): NoteAnchorContextMenuEntry[] {
  if (!noteAnchorContextId) return []

  const t = createUiTextGetter(uiLanguageMode)
  const a = availability
  const deleteLabel =
    markerDeleteMode === 'markerOnly'
      ? t('editor.noteAnchor.removeMarkerOnly')
      : t('editor.noteAnchor.delete')
  // DOM marker 右クリック時は prop の id だけが立ち、PM selection 上の context id は null のことがある。
  const deleteDisabled =
    !noteAnchorContextId ||
    (a.noteAnchorContextId !== null && !a.canDeleteNoteAnchor)

  return [
    {
      id: 'note-show',
      label: t('editor.noteAnchor.showInPanel'),
      icon: <IconMessage size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canShowNoteInPanel,
      action: () => onShowNoteInPanel(noteAnchorContextId),
    },
    {
      id: 'note-delete',
      label: deleteLabel,
      icon: <IconTrash size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: deleteDisabled,
      action: () => onDeleteNoteAnchor(noteAnchorContextId),
    },
  ]
}
