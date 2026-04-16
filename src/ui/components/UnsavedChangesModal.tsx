import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

type UnsavedChangesModalProps = {
  open: boolean
  onCancel: () => void
  onSaveAndContinue: () => void
  onDiscardAndContinue: () => void
}

export function UnsavedChangesModal({
  open,
  onCancel,
  onSaveAndContinue,
  onDiscardAndContinue,
}: UnsavedChangesModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, open)

  if (!open) return null

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <section className='unsaved-changes-dialog' onClick={(event) => event.stopPropagation()}>
        <div className='prompt-title'>未保存の変更があります</div>
        <p className='unsaved-changes-message'>
          保存していない内容があります。続行する前にどうしますか？
        </p>
        <div className='prompt-buttons'>
          <button type='button' onClick={onCancel}>
            キャンセル
          </button>
          <button type='button' onClick={onSaveAndContinue}>
            保存して続行
          </button>
          <button type='button' className='danger' onClick={onDiscardAndContinue}>
            破棄して続行
          </button>
        </div>
      </section>
    </div>
  )
}
