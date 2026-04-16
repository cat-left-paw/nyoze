import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { LargeDocumentGuardAction } from '../hooks/useLargeDocumentGuard'

type LargeDocumentGuardModalProps = {
  pendingAction: LargeDocumentGuardAction | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * BETA-SP9: 大文書での全文変換操作前に表示する確認モーダル。
 * 既存 LineBreakPolicyConfirmModal と同じ prompt-overlay / prompt-dialog パターン。
 */
export function LargeDocumentGuardModal({
  pendingAction,
  onConfirm,
  onCancel,
}: LargeDocumentGuardModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, pendingAction !== null)

  if (!pendingAction) return null

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <section
        className='prompt-dialog'
        onClick={(e) => e.stopPropagation()}
      >
        <label className='prompt-title'>大きな文書の変換確認</label>
        <p className='prompt-note'>
          {pendingAction.label}
        </p>
        <div className='prompt-buttons'>
          <button type='button' onClick={onCancel}>
            キャンセル
          </button>
          <button type='button' onClick={onConfirm}>
            続行
          </button>
        </div>
      </section>
    </div>
  )
}
