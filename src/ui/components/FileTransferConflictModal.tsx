import { useRef } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import { getPathBaseName } from '../utils/path'
import type { FileTransferConflictState } from '../hooks/useFileExplorer'
import { useFocusTrap } from '../hooks/useFocusTrap'

type FileTransferConflictModalProps = {
  uiLanguageMode: UiLanguageMode
  conflict: FileTransferConflictState | null
  onCancel: () => void
  onOverwrite: () => void
  onKeepBoth: () => void
}

function fillName(template: string, fileName: string): string {
  const parts = template.split('{name}')
  return parts.join(fileName)
}

export function FileTransferConflictModal({
  uiLanguageMode,
  conflict,
  onCancel,
  onOverwrite,
  onKeepBoth,
}: FileTransferConflictModalProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, conflict !== null)

  if (!conflict) return null

  const existingFileName = getPathBaseName(conflict.targetPath)
  const line1Template =
    conflict.mode === 'cut'
      ? t('explorer.transferConflict.bodyLine1Move')
      : t('explorer.transferConflict.bodyLine1Copy')
  const helperTemplate =
    conflict.mode === 'cut'
      ? t('explorer.transferConflict.helperKeepBothMove')
      : t('explorer.transferConflict.helperKeepBothCopy')

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <section className='file-transfer-conflict-dialog' onClick={(event) => event.stopPropagation()}>
        <div className='prompt-title'>{t('explorer.transferConflict.title')}</div>

        <p className='file-transfer-conflict-note'>
          {fillName(line1Template, existingFileName)}
        </p>
        <p className='file-transfer-conflict-note file-transfer-conflict-note--secondary'>
          {t('explorer.transferConflict.bodyLine2')}
        </p>

        <p className='file-transfer-conflict-hint'>{helperTemplate}</p>

        {conflict.errorMessage && (
          <p className='file-transfer-conflict-error' role='alert'>
            {conflict.errorMessage}
          </p>
        )}

        <div className='prompt-buttons file-transfer-conflict-buttons'>
          <button
            type='button'
            data-testid='file-transfer-conflict-keep-both'
            onClick={onKeepBoth}
          >
            {t('explorer.transferConflict.keepBoth')}
          </button>
          <button type='button' data-testid='file-transfer-conflict-cancel' onClick={onCancel}>
            {t('explorer.transferConflict.cancel')}
          </button>
          <button
            type='button'
            data-testid='file-transfer-conflict-replace'
            className='danger'
            onClick={onOverwrite}
            title={t('explorer.transferConflict.replace')}
          >
            {t('explorer.transferConflict.replace')}
          </button>
        </div>
      </section>
    </div>
  )
}
