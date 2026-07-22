import type { ReactNode } from 'react'
import { IconNote } from '@tabler/icons-react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'

const ICON_SIZE = 16
const ICON_STROKE = 1.2

export type AddNoteContextMenuItem = {
  id: string
  label: string
  icon: ReactNode
  disabled: boolean
  action?: () => void | Promise<void>
  separator?: false
}

type BuildAddNoteContextMenuItemOptions = {
  uiLanguageMode: UiLanguageMode
  onAddNote: () => void
}

export function buildAddNoteContextMenuItem({
  uiLanguageMode,
  onAddNote,
}: BuildAddNoteContextMenuItemOptions): AddNoteContextMenuItem {
  const t = createUiTextGetter(uiLanguageMode)
  return {
    id: 'note-add',
    label: t('editor.noteAnchor'),
    icon: <IconNote size={ICON_SIZE} stroke={ICON_STROKE} />,
    disabled: false,
    action: onAddNote,
  }
}
