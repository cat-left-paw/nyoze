/** PUBLIC-ENTRY1: recovery-only product notice backed by RECOVERY-RESTART1. */

import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { LocalImeExperimentalPreviewView } from '../hooks/useLocalImeExperimentalPreview'
import type { InputPathSwitchBlockedReason } from '../hooks/inputPathSwitchNotice'
import type { UiTextKey } from '../i18n/uiText'

/** ENTRY-UI1: 止めた理由ごとの文（`texts-proposal.md` §4）。 */
const SWITCH_BLOCKED_TEXT: Record<InputPathSwitchBlockedReason, UiTextKey> = {
  composing: 'localImeExperimentalPreview.notice.switchBlocked.composing',
  'host-pending-input': 'localImeExperimentalPreview.notice.switchBlocked.hostPendingInput',
  'surface-payload': 'localImeExperimentalPreview.notice.switchBlocked.surfacePayload',
  'start-failed': 'localImeExperimentalPreview.notice.switchBlocked.startFailed',
}

type Props = {
  preview: LocalImeExperimentalPreviewView
  uiLanguageMode: UiLanguageMode
}

export function LocalImeExperimentalPreviewNotice({ preview, uiLanguageMode }: Props) {
  const t = createUiTextGetter(uiLanguageMode)
  if (!preview.notice) return null
  // 止められた切り替え（PIS）は、OFFのままでも表示する。ほかはONのときだけ。
  if (!preview.effectiveEnabled && preview.notice !== 'switch-blocked') return null
  if (preview.notice === 'switch-blocked' && !preview.switchBlockedReason) return null

  const recovery = preview.notice === 'attention'
  const message = recovery
    ? t('localImeExperimentalPreview.notice.attention')
    : preview.notice === 'awaiting-composition'
      ? t('localImeExperimentalPreview.notice.awaitingComposition')
      : preview.notice === 'switch-blocked' && preview.switchBlockedReason
        ? t(SWITCH_BLOCKED_TEXT[preview.switchBlockedReason])
        : preview.notice === 'confirm-discard-composition'
          ? t('localImeExperimentalPreview.notice.confirmDiscardComposition')
          : t('localImeExperimentalPreview.notice.busy')

  return (
    <div
      className="local-ime-experimental-preview-notice"
      data-testid="local-ime-experimental-preview-notice"
      data-local-ime-control-surface="true"
      data-notice-kind={preview.notice}
      data-switch-blocked-reason={preview.notice === 'switch-blocked' ? preview.switchBlockedReason ?? undefined : undefined}
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
      {preview.notice === 'confirm-discard-composition' ? (
        <>
          <button
            type="button"
            data-testid="local-ime-experimental-preview-notice-discard-composition-confirm"
            onClick={preview.onConfirmForceReset}
          >
            {t('localImeExperimentalPreview.notice.confirmDiscardComposition.confirm')}
          </button>
          <button
            type="button"
            data-testid="local-ime-experimental-preview-notice-discard-composition-cancel"
            onClick={preview.onCancelForceReset}
          >
            {t('common.cancel')}
          </button>
        </>
      ) : null}
      {recovery || preview.notice === 'confirm-discard-composition' ? null : (
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
