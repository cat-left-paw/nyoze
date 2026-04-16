import { useRef } from 'react'
import type { ConflictKind } from '../utils/externalEditConflict'
import { useFocusTrap } from '../hooks/useFocusTrap'

export type ExternalEditConflictAction = 'overwrite' | 'saveAs' | 'cancel'

type ExternalEditConflictModalProps = {
  conflictKind: ConflictKind | null
  onAction: (action: ExternalEditConflictAction) => void
}

export function ExternalEditConflictModal({
  conflictKind,
  onAction,
}: ExternalEditConflictModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, conflictKind !== null)

  if (!conflictKind) return null

  const message =
    conflictKind === 'deleted'
      ? 'ファイルが外部で削除または移動されています。保存を続行しますか？'
      : 'ファイルが外部で変更されています。上書きすると外部の変更が失われます。'

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={() => onAction('cancel')}>
      <section
        className='external-edit-conflict-dialog'
        onClick={(event) => event.stopPropagation()}
      >
        <div className='prompt-title'>外部変更の検出</div>
        <p className='external-edit-conflict-message'>{message}</p>
        <div className='prompt-buttons'>
          <button type='button' onClick={() => onAction('cancel')}>
            キャンセル
          </button>
          <button type='button' onClick={() => onAction('saveAs')}>
            別名で保存
          </button>
          <button type='button' className='danger' onClick={() => onAction('overwrite')}>
            上書き保存
          </button>
        </div>
      </section>
    </div>
  )
}
