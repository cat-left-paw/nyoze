import type { ReactNode } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'

type DocumentNotesResolvedSectionProps = {
  uiLanguageMode: UiLanguageMode
  children: ReactNode
}

export function DocumentNotesResolvedSection({
  uiLanguageMode,
  children,
}: DocumentNotesResolvedSectionProps) {
  const t = createUiTextGetter(uiLanguageMode)
  return (
    <section
      className="document-notes-resolved-section"
      aria-label={t('documentNotes.resolvedSectionTitle')}
    >
      <h3 className="document-notes-resolved-title">{t('documentNotes.resolvedSectionTitle')}</h3>
      <ul className="document-notes-list document-notes-list-resolved">{children}</ul>
    </section>
  )
}
