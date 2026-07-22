import type { NoteColorId } from '../../project/noteColor'
import { NOTE_COLOR_PALETTE } from '../../project/noteColor'
import type { createUiTextGetter } from '../i18n/uiText'

type NoteColorPalettePickerProps = {
  value: NoteColorId
  onChange: (color: NoteColorId) => void
  disabled?: boolean
  t: ReturnType<typeof createUiTextGetter>
}

export function NoteColorPalettePicker({
  value,
  onChange,
  disabled = false,
  t,
}: NoteColorPalettePickerProps) {
  return (
    <div
      className="document-notes-color-picker"
      role="radiogroup"
      aria-label={t('documentNotes.editColorLabel')}
    >
      {NOTE_COLOR_PALETTE.map((entry) => {
        const selected = value === entry.id
        return (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(entry.labelKey)}
            className={
              selected
                ? 'document-notes-color-swatch document-notes-color-swatch--selected'
                : 'document-notes-color-swatch'
            }
            data-note-color-swatch={entry.id}
            disabled={disabled}
            onClick={() => onChange(entry.id)}
          />
        )
      })}
    </div>
  )
}
