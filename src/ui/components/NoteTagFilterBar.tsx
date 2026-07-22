import type { StickyNoteTagDefinition } from '../../project/noteTags'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'

type NoteTagFilterBarProps = {
  definedTags: readonly StickyNoteTagDefinition[]
  selectedFilterTagId: string | null
  onSelectFilter: (tagId: string | null) => void
  uiLanguageMode: UiLanguageMode
}

export function NoteTagFilterBar({
  definedTags,
  selectedFilterTagId,
  onSelectFilter,
  uiLanguageMode,
}: NoteTagFilterBarProps) {
  const t = createUiTextGetter(uiLanguageMode)

  if (definedTags.length === 0) {
    return null
  }

  return (
    <section
      className="document-notes-tag-filter"
      aria-label={t('documentNotes.tagFilterTitle')}
    >
      <h3 className="document-notes-tag-filter-title">{t('documentNotes.tagFilterTitle')}</h3>
      <div className="document-notes-tag-filter-chips" role="group">
        <button
          type="button"
          className={
            selectedFilterTagId === null
              ? 'document-notes-tag-filter-chip document-notes-tag-filter-chip--active'
              : 'document-notes-tag-filter-chip'
          }
          aria-pressed={selectedFilterTagId === null}
          onClick={() => onSelectFilter(null)}
        >
          {t('documentNotes.tagFilterAll')}
        </button>
        {definedTags.map((tag) => {
          const active = selectedFilterTagId === tag.id
          return (
            <button
              key={tag.id}
              type="button"
              className={
                active
                  ? 'document-notes-tag-filter-chip document-notes-tag-filter-chip--active'
                  : 'document-notes-tag-filter-chip'
              }
              aria-pressed={active}
              data-note-tag-filter-id={tag.id}
              onClick={() => onSelectFilter(tag.id)}
            >
              {tag.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
