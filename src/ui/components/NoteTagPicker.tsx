import { useCallback } from 'react'
import type { StickyNoteTagDefinition } from '../../project/noteTags'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'

type NoteTagPickerProps = {
  definedTags: readonly StickyNoteTagDefinition[]
  selectedIds: readonly string[]
  disabled: boolean
  uiLanguageMode: UiLanguageMode
  onChange: (nextIds: string[]) => void
}

export function NoteTagPicker({
  definedTags,
  selectedIds,
  disabled,
  uiLanguageMode,
  onChange,
}: NoteTagPickerProps) {
  const t = createUiTextGetter(uiLanguageMode)

  const toggle = useCallback(
    (id: string) => {
      if (disabled) return
      const set = new Set(selectedIds)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      onChange([...set])
    },
    [disabled, onChange, selectedIds],
  )

  if (definedTags.length === 0) {
    return (
      <p className="document-notes-muted document-notes-tag-picker-empty">
        {t('documentNotes.tagsUnsetHint')}
      </p>
    )
  }

  return (
    <div className="document-notes-tag-picker" role="group" aria-label={t('documentNotes.editTagsLabel')}>
      {definedTags.map((tag) => {
        const checked = selectedIds.includes(tag.id)
        return (
          <label key={tag.id} className="document-notes-tag-picker-option">
            <input
              type="checkbox"
              className="document-notes-tag-picker-checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(tag.id)}
            />
            <span className="document-notes-tag-chip" data-note-tag-id={tag.id}>
              {tag.label}
            </span>
          </label>
        )
      })}
    </div>
  )
}
