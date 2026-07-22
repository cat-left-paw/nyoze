import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { UiLanguageMode } from '../../settings/types'
import { getUiText } from '../i18n/uiText'
import type { WebBookCapacityReport } from '../../../electron/webBookCapacity'
import type { WebBookCapacityConfirmDecision } from '../hooks/useWebBookCapacityConfirmPrompt'

type WebBookCapacityConfirmModalProps = {
  capacity: WebBookCapacityReport | null
  uiLanguageMode: UiLanguageMode
  onResolve: (decision: WebBookCapacityConfirmDecision) => void
}

function formatMiB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

/**
 * WB-IMG-3A: capacity soft-warning confirmation (prompt-overlay pattern).
 * Does not write files; Cancel leaves the manuscript and settings unchanged.
 */
export function WebBookCapacityConfirmModal({
  capacity,
  uiLanguageMode,
  onResolve,
}: WebBookCapacityConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, capacity !== null)

  if (!capacity) return null

  const threeChoice = capacity.singleHtmlStrongWarn
  const profileLabel = getUiText(
    uiLanguageMode,
    capacity.requestedProfile === 'package'
      ? 'export.webBookCapacityProfilePackage'
      : 'export.webBookCapacityProfileSingleHtml',
  )

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={() => onResolve({ action: 'cancel' })}>
      <section className='prompt-dialog' onClick={(e) => e.stopPropagation()}>
        <label className='prompt-title'>
          {getUiText(uiLanguageMode, 'export.webBookCapacityTitle')}
        </label>
        <p className='prompt-note'>
          {getUiText(uiLanguageMode, 'export.webBookCapacityCurrentProfile')}: {profileLabel}
        </p>
        {capacity.requestedProfile === 'singleHtml' && capacity.singleHtmlByteLength !== undefined ? (
          <p className='prompt-note'>
            {getUiText(uiLanguageMode, 'export.webBookCapacitySingleHtmlSize')}:{' '}
            {formatMiB(capacity.singleHtmlByteLength)} MiB
          </p>
        ) : null}
        {capacity.requestedProfile === 'package' || capacity.singleHtmlStrongWarn ? (
          <p className='prompt-note'>
            {getUiText(uiLanguageMode, 'export.webBookCapacityPackageSummary')}:{' '}
            {formatMiB(capacity.packageAssetByteTotal)} MiB / {capacity.packageAssetCount}{' '}
            {getUiText(uiLanguageMode, 'export.webBookCapacityImagesUnit')}
          </p>
        ) : null}
        {capacity.packageSizeWarn ? (
          <p className='prompt-note'>
            {getUiText(uiLanguageMode, 'export.webBookCapacityPackageSizeWarn')}
          </p>
        ) : null}
        {capacity.packageCountWarn ? (
          <p className='prompt-note'>
            {getUiText(uiLanguageMode, 'export.webBookCapacityPackageCountWarn')}
          </p>
        ) : null}
        {capacity.singleHtmlStrongWarn ? (
          <p className='prompt-note'>
            {getUiText(uiLanguageMode, 'export.webBookCapacitySingleHtmlStrongWarn')}
          </p>
        ) : null}
        {capacity.largeImageWarn ? (
          <>
            <p className='prompt-note'>
              {getUiText(uiLanguageMode, 'export.webBookCapacityLargeImagesIntro')}
            </p>
            <ul className='prompt-note' style={{ maxHeight: '8rem', overflow: 'auto' }}>
              {capacity.largeImages.map((row, index) => (
                <li key={`${row.originLabel}:${row.rawSrc}:${index}`}>
                  {row.originLabel ? `${row.originLabel}: ` : ''}
                  {row.rawSrc} ({formatMiB(row.byteLength)} MiB)
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className='prompt-note'>
          {getUiText(uiLanguageMode, 'export.webBookCapacityCancelNote')}
        </p>
        <div className='prompt-buttons'>
          <button type='button' onClick={() => onResolve({ action: 'cancel' })}>
            {getUiText(uiLanguageMode, 'export.webBookCapacityCancel')}
          </button>
          {threeChoice ? (
            <>
              <button type='button' onClick={() => onResolve({ action: 'switch-to-package' })}>
                {getUiText(uiLanguageMode, 'export.webBookCapacitySwitchPackage')}
              </button>
              <button type='button' onClick={() => onResolve({ action: 'continue' })}>
                {getUiText(uiLanguageMode, 'export.webBookCapacityContinueSingleHtml')}
              </button>
            </>
          ) : (
            <button type='button' onClick={() => onResolve({ action: 'continue' })}>
              {getUiText(uiLanguageMode, 'export.webBookCapacityProceed')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
