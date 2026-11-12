import { LocalImeExperimentalPreviewNotice } from './LocalImeExperimentalPreviewNotice'
import type { UiLanguageMode } from '../../settings/types'
import type { LocalImeExperimentalPreviewView } from '../hooks/localImeExperimentalPreviewView'
import type { InputPathSwitchBlockedReason } from '../hooks/inputPathSwitchNotice'
import { createUiTextGetter, type UiTextKey } from '../i18n/uiText'

const BLOCKED_TEXT: Record<InputPathSwitchBlockedReason, UiTextKey> = {
  composing: 'localImeExperimentalPreview.notice.switchBlocked.composing',
  'host-pending-input': 'localImeExperimentalPreview.notice.switchBlocked.hostPendingInput',
  'surface-payload': 'localImeExperimentalPreview.notice.switchBlocked.surfacePayload',
  'start-failed': 'inputMethod.notice.startFailed',
}

/** 製品の切り替えの通知。Local Windowのrecovery表示には手を入れない。 */
export function InputMethodSwitchNotice({ preview, uiLanguageMode }: { preview: LocalImeExperimentalPreviewView; uiLanguageMode: UiLanguageMode }) {
  const t = createUiTextGetter(uiLanguageMode)
  const confirming = preview.notice === 'confirm-discard-composition' && preview.effectiveEnabled
  const reason = preview.notice === 'switch-blocked' ? preview.switchBlockedReason : null
  if (!confirming && !reason) return null
  return <div className="local-ime-experimental-preview-notice" data-testid="local-ime-experimental-preview-notice" data-local-ime-control-surface="true" data-notice-kind={preview.notice} data-switch-blocked-reason={reason ?? undefined} role="status" aria-live="polite">
    <span className="local-ime-experimental-preview-notice-message">{t(confirming ? 'localImeExperimentalPreview.notice.confirmDiscardComposition' : BLOCKED_TEXT[reason!])}</span>
    {confirming ? <>
      <button type="button" data-testid="local-ime-experimental-preview-notice-discard-composition-confirm" onClick={preview.onConfirmForceReset}>{t('localImeExperimentalPreview.notice.confirmDiscardComposition.confirm')}</button>
      <button type="button" data-testid="local-ime-experimental-preview-notice-discard-composition-cancel" onClick={preview.onCancelForceReset}>{t('common.cancel')}</button>
    </> : <button type="button" className="local-ime-experimental-preview-notice-dismiss" data-testid="local-ime-experimental-preview-notice-dismiss" onClick={preview.onDismissNotice} aria-label={t('localImeExperimentalPreview.notice.dismiss')}>×</button>}
  </div>
}

/** 製品とLocal Windowの表示の分岐は、ここだけに置く。 */
export function InputMethodNotice(props: { preview: LocalImeExperimentalPreviewView; uiLanguageMode: UiLanguageMode }) {
  return props.preview.inputSurface ? <InputMethodSwitchNotice {...props} /> : <LocalImeExperimentalPreviewNotice {...props} />
}
