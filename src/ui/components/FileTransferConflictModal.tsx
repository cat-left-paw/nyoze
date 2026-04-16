import { useEffect, useRef, useState } from 'react'
import { getPathBaseName } from '../utils/path'
import type { FileTransferConflictState } from '../hooks/useFileExplorer'
import { useFocusTrap } from '../hooks/useFocusTrap'

type FileTransferConflictModalProps = {
  conflict: FileTransferConflictState | null
  onCancel: () => void
  onOverwrite: () => void
  onRename: (nextName: string) => void
}

export function FileTransferConflictModal({
  conflict,
  onCancel,
  onOverwrite,
  onRename,
}: FileTransferConflictModalProps) {
  const [renameValue, setRenameValue] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, conflict !== null)

  useEffect(() => {
    setRenameValue(conflict?.suggestedName ?? '')
  }, [conflict?.suggestedName])

  if (!conflict) return null

  const existingFileName = getPathBaseName(conflict.targetPath)
  const sourceFileName = getPathBaseName(conflict.sourcePath)
  const modeLabel = conflict.mode === 'cut' ? '移動' : 'コピー'

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <section className='file-transfer-conflict-dialog' onClick={(event) => event.stopPropagation()}>
        <div className='prompt-title'>ファイルの競合</div>

        <p className='file-transfer-conflict-note'>
          <strong>{sourceFileName}</strong>
          {` を${modeLabel}しようとしましたが、`}
          {'移動先に同名のファイル '}
          <strong>{existingFileName}</strong>
          {' が既に存在します。'}
        </p>

        <div className='file-transfer-conflict-section'>
          <label className='setting-row file-transfer-conflict-row'>
            <span>{modeLabel}先の別名:</span>
            <input
              type='text'
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder='新しいファイル名'
            />
          </label>
        </div>

        {conflict.errorMessage && (
          <p className='file-transfer-conflict-error' role='alert'>
            {conflict.errorMessage}
          </p>
        )}

        <div className='prompt-buttons file-transfer-conflict-buttons'>
          <button type='button' onClick={onCancel}>
            キャンセル
          </button>
          <button type='button' onClick={() => onRename(renameValue)}>
            別名で{modeLabel}
          </button>
          <button
            type='button'
            className='danger'
            onClick={onOverwrite}
            title={`既存の ${existingFileName} を上書きします`}
          >
            既存ファイルを上書き
          </button>
        </div>
        <p className='file-transfer-conflict-hint'>
          ※「既存ファイルを上書き」を選ぶと、入力した別名は使用されません
        </p>
      </section>
    </div>
  )
}
