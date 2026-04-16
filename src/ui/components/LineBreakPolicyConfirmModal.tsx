import { useRef } from 'react'
import type { DocumentType } from '../../editor-core/io/frontmatterDocumentSettings'
import type { LineBreakPolicy } from '../../editor-core/types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import {
  formatDocumentTypeConfirmNote,
  formatDocumentTypeConfirmTitle,
} from '../utils/documentTypePresentation'

type LineBreakPolicyConfirmModalProps = {
  pendingPolicy: LineBreakPolicy | null
  documentType: DocumentType
  onConfirm: () => void
  onCancel: () => void
}

export function LineBreakPolicyConfirmModal({
  pendingPolicy,
  documentType,
  onConfirm,
  onCancel,
}: LineBreakPolicyConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, pendingPolicy === 'commonmark-strict')

  if (pendingPolicy !== 'commonmark-strict') return null

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <section
        className='prompt-dialog'
        onClick={(e) => e.stopPropagation()}
      >
        <label className='prompt-title'>{formatDocumentTypeConfirmTitle(documentType)}</label>
        <p className='prompt-note'>
          {formatDocumentTypeConfirmNote(documentType)}
        </p>
        <div className='prompt-buttons'>
          <button type='button' onClick={onCancel}>
            キャンセル
          </button>
          <button type='button' onClick={onConfirm}>
            変更して適用
          </button>
        </div>
      </section>
    </div>
  )
}
