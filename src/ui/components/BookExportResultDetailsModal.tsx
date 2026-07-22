import { useRef } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { BookExportResultDetailsPromptState } from '../hooks/useBookExportResultDetailsPrompt'

type BookExportResultDetailsModalProps = {
  state: BookExportResultDetailsPromptState | null
  uiLanguageMode: UiLanguageMode
  onClose: () => void
}

type TextGetter = ReturnType<typeof createUiTextGetter>

function chapterWarningKindLabel(t: TextGetter, kind: string): string {
  return kind === 'chapter-read-error'
    ? t('export.bookResultDetailsChapterReadError')
    : t('export.bookResultDetailsChapterMissing')
}

function conversionWarningMeta(nodeType?: string, markType?: string, directive?: string): string {
  return [
    nodeType ? `node: ${nodeType}` : null,
    markType ? `mark: ${markType}` : null,
    directive ? `directive: ${directive}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' / ')
}

/**
 * Book export 実行後、warning 付き成功 / missing-chapters 中断の詳細を確認する read-only モーダル。
 * warning message 自体は既存 converter の pure warning をそのまま表示する（MVP、追加翻訳なし）。
 */
export function BookExportResultDetailsModal({
  state,
  uiLanguageMode,
  onClose,
}: BookExportResultDetailsModalProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, state !== null)

  if (!state) return null

  const titleKey =
    state.outcome === 'missing-chapters'
      ? 'export.bookResultDetailsTitleMissingChapters'
      : state.outcome === 'asset-error'
        ? 'export.bookResultDetailsTitleAssetError'
        : 'export.bookResultDetailsTitleWarnings'

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onClose}>
      <section
        className='prompt-dialog book-export-result-details-dialog'
        role='dialog'
        aria-modal='true'
        aria-labelledby='book-export-result-details-title'
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id='book-export-result-details-title' className='prompt-title'>
          {t(titleKey)}
        </h2>

        {state.outcome === 'missing-chapters' && state.totalChapterCount !== undefined && (
          <p className='book-export-result-details-summary'>
            {t('export.bookResultDetailsMissingSummary')
              .replace('{count}', String(state.chapterWarnings.length))
              .replace('{total}', String(state.totalChapterCount))}
          </p>
        )}

        {state.chapterWarnings.length > 0 && (
          <div className='book-export-result-details-section'>
            <h3 className='book-export-result-details-section-title'>
              {t('export.bookResultDetailsChapterSectionTitle')}
            </h3>
            <ul className='book-export-result-details-list'>
              {state.chapterWarnings.map((warning) => (
                <li key={warning.id} className='book-export-result-details-item'>
                  <span className='book-export-result-details-item-title'>{warning.title}</span>
                  <span className='book-export-result-details-item-kind'>
                    {chapterWarningKindLabel(t, warning.kind)}
                  </span>
                  <span className='book-export-result-details-item-path' title={warning.path}>
                    {warning.path}
                  </span>
                  {warning.detail && (
                    <span className='book-export-result-details-item-detail'>{warning.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.assetFailures && state.assetFailures.length > 0 && (
          <div className='book-export-result-details-section'>
            <h3 className='book-export-result-details-section-title'>
              {t('export.bookResultDetailsAssetSectionTitle')}
            </h3>
            <ul className='book-export-result-details-list'>
              {state.assetFailures.map((failure) => (
                <li key={failure.id} className='book-export-result-details-item'>
                  <span className='book-export-result-details-item-title'>{failure.originLabel}</span>
                  <span className='book-export-result-details-item-kind'>{failure.code}</span>
                  <span className='book-export-result-details-item-path' title={failure.rawSrc}>
                    {failure.rawSrc}
                  </span>
                  <span className='book-export-result-details-item-detail'>{failure.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.conversionWarnings.length > 0 && (
          <div className='book-export-result-details-section'>
            <h3 className='book-export-result-details-section-title'>
              {t('export.bookResultDetailsConversionSectionTitle')}
            </h3>
            <ul className='book-export-result-details-list'>
              {state.conversionWarnings.map((warning) => {
                const meta = conversionWarningMeta(warning.nodeType, warning.markType, warning.directive)
                return (
                  <li key={warning.id} className='book-export-result-details-item'>
                    <span className='book-export-result-details-item-kind'>{warning.code}</span>
                    <span className='book-export-result-details-item-detail'>{warning.message}</span>
                    {meta && <span className='book-export-result-details-item-path'>{meta}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className='prompt-buttons'>
          <button type='button' onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </section>
    </div>
  )
}
