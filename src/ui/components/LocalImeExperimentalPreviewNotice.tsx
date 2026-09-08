/** PUBLIC-ENTRY1: recovery-only product notice backed by RECOVERY-RESTART1. */

import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { LocalImeExperimentalPreviewView } from '../hooks/useLocalImeExperimentalPreview'

type Props = {
  preview: LocalImeExperimentalPreviewView
  uiLanguageMode: UiLanguageMode
}

export function LocalImeExperimentalPreviewNotice({ preview, uiLanguageMode }: Props) {
  const t = createUiTextGetter(uiLanguageMode)
  if (!preview.effectiveEnabled || !preview.notice) return null

  const recovery = preview.notice === 'attention'
  const message = recovery
    ? t('localImeExperimentalPreview.notice.attention')
    : preview.notice === 'awaiting-composition'
      ? t('localImeExperimentalPreview.notice.awaitingComposition')
      : t('localImeExperimentalPreview.notice.busy')

  return (
    <div
      className="local-ime-experimental-preview-notice"
      data-testid="local-ime-experimental-preview-notice"
      data-local-ime-control-surface="true"
      data-notice-kind={preview.notice}
      role="status"
      aria-live="polite"
    >
      <span className="local-ime-experimental-preview-notice-message">{message}</span>
      {recovery && preview.controls.showRetry ? (
        <button
          type="button"
          data-testid="local-ime-experimental-preview-notice-retry"
          onClick={preview.onRetryRecovery}
        >
          {t('displaySettings.experimentalLocalIme.retry')}
        </button>
      ) : null}
      {recovery && preview.recoveryDraftCopyAvailable ? (
        <button
          type="button"
          data-testid="local-ime-experimental-preview-notice-copy-draft"
          onClick={preview.onCopyRecoveryDraft}
        >
          {t('displaySettings.experimentalLocalIme.copyDraft')}
        </button>
      ) : null}
      {recovery && preview.forceResetPending ? (
        <>
          <span className="local-ime-experimental-preview-notice-confirm">
            {t('displaySettings.experimentalLocalIme.discard.confirm', 'helper')}
          </span>
          <button
            type="button"
            data-testid="local-ime-experimental-preview-notice-force-reset-confirm"
            onClick={preview.onConfirmForceReset}
          >
            {t('displaySettings.experimentalLocalIme.discard.confirm')}
          </button>
          <button
            type="button"
            data-testid="local-ime-experimental-preview-notice-force-reset-cancel"
            onClick={preview.onCancelForceReset}
          >
            {t('common.cancel')}
          </button>
        </>
      ) : null}
      {recovery && !preview.forceResetPending ? (
        <button
          type="button"
          data-testid="local-ime-experimental-preview-notice-force-reset"
          onClick={preview.onRequestForceReset}
        >
          {t('displaySettings.experimentalLocalIme.discard')}
        </button>
      ) : null}
      {recovery ? null : (
        <button
          type="button"
          className="local-ime-experimental-preview-notice-dismiss"
          data-testid="local-ime-experimental-preview-notice-dismiss"
          onClick={preview.onDismissNotice}
          aria-label={t('localImeExperimentalPreview.notice.dismiss')}
        >
          ×
        </button>
      )}
    </div>
  )
}
