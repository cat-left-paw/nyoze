import { useSyncExternalStore } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import {
  cancelInputSurfaceRetainedDiscard,
  confirmInputSurfaceRetainedDiscard,
  copyInputSurfaceRetainedText,
  getInputSurfaceNoticeSnapshot,
  requestInputSurfaceRetainedDiscard,
  subscribeInputSurfaceNotice,
} from '../../editor-core/features/inputSurface/documentAction'
import { isInputSurfaceCapable } from '../../editor-core/features/inputSurface/inputSurfaceGate'
import { createUiTextGetter } from '../i18n/uiText'

const empty = { kind: null, reason: null, confirmDiscard: false, pendingSaveContinuation: false } as const
const noSubscription = () => () => {}

export function InputSurfaceDocumentActionNotice({ uiLanguageMode }: { uiLanguageMode: UiLanguageMode }) {
  const enabled = isInputSurfaceCapable()
  const notice = useSyncExternalStore(
    enabled ? subscribeInputSurfaceNotice : noSubscription,
    enabled ? getInputSurfaceNoticeSnapshot : () => empty,
    () => empty,
  )
  if (!notice.kind) return null
  const t = createUiTextGetter(uiLanguageMode)
  const retained = notice.kind === 'retained'
  const message = retained
    ? t('inputSurface.notice.retained')
    : notice.pendingSaveContinuation
      ? t('inputSurface.notice.awaitingSave')
      : t('inputSurface.notice.awaitingComposition')
  const copy = () => {
    void copyInputSurfaceRetainedText(async (text) => {
      if (!navigator.clipboard?.writeText) return false
      await navigator.clipboard.writeText(text)
      return true
    })
  }
  return (
    <div className="local-ime-experimental-preview-notice local-ime-experimental-preview-notice--input-surface" data-testid="input-surface-document-action-notice"
      data-local-ime-control-surface="true" data-notice-kind={notice.kind} data-confirm-discard={retained && notice.confirmDiscard ? 'true' : undefined}
      role="status" aria-live="polite">
      <span className="local-ime-experimental-preview-notice-message">{message}</span>
      {retained ? <button type="button" data-testid="input-surface-notice-copy" onClick={copy}>{t('inputSurface.notice.copy')}</button> : null}
      {retained && !notice.confirmDiscard ? (
        <button type="button" data-testid="input-surface-notice-discard" onClick={requestInputSurfaceRetainedDiscard}>{t('inputSurface.notice.discard')}</button>
      ) : null}
      {retained && notice.confirmDiscard ? <>
        <span className="local-ime-experimental-preview-notice-confirm">{t('inputSurface.notice.confirmDiscard', 'helper')}</span>
        <button type="button" data-testid="input-surface-notice-confirm-discard" onClick={confirmInputSurfaceRetainedDiscard}>{t('inputSurface.notice.confirmDiscard')}</button>
        <button type="button" data-testid="input-surface-notice-cancel-discard" onClick={cancelInputSurfaceRetainedDiscard}>{t('common.cancel')}</button>
      </> : null}
    </div>
  )
}
