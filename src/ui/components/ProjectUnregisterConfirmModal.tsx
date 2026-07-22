import { useRef } from 'react'
import type { createUiTextGetter } from '../i18n/uiText'
import { useFocusTrap } from '../hooks/useFocusTrap'

type TextGetter = ReturnType<typeof createUiTextGetter>

/**
 * 作品登録解除の確認モーダル（prompt-overlay パターン）。
 */
export function ProjectUnregisterConfirmModal({
  open,
  busy,
  t,
  onConfirm,
  onCancel,
}: {
  open: boolean
  busy: boolean
  t: TextGetter
  onConfirm: () => void
  onCancel: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, open)

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="prompt-overlay"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <section
        className="prompt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-unregister-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="project-unregister-modal-title" className="prompt-title">
          {t('projectPanel.unregisterConfirm')}
        </h2>
        <p className="prompt-note">{t('projectPanel.unregisterConfirm', 'helper')}</p>
        <div className="prompt-buttons">
          <button type="button" onClick={onCancel} disabled={busy}>
            {t('projectPanel.cancel')}
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
            {t('projectPanel.unregisterSubmit')}
          </button>
        </div>
      </section>
    </div>
  )
}
