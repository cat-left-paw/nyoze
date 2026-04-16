import { useRef } from 'react'
import type { SaveErrorKind } from '../utils/externalEditConflict'
import { useFocusTrap } from '../hooks/useFocusTrap'

/**
 * R3.5-2: Save 失敗時にユーザーへ対処方法を問うモーダル。
 *
 * 'retry'  : 同じパスに再書き込みを試みる
 * 'saveAs' : 別名で保存（ユーザーに保存先を選ばせる）
 * 'cancel' : 閉じて続行を止める
 */
export type SaveFailureAction = 'retry' | 'saveAs' | 'cancel'

export type SaveFailureInfo = {
  tabTitle: string
  filePath: string | null
  errorKind: SaveErrorKind
  errorMessage?: string
}

type SaveFailureModalProps = {
  info: SaveFailureInfo | null
  onAction: (action: SaveFailureAction) => void
}

function defaultMessageForKind(kind: SaveErrorKind): string {
  switch (kind) {
    case 'disk-full':
      return 'ディスクの空き容量が不足しています。'
    case 'permission':
      return 'ファイルに書き込む権限がありません。'
    case 'parent-missing':
      return '保存先のフォルダが見つかりません。'
    case 'validation':
      return '保存先の情報が不正です。'
    case 'canceled':
      return '保存がキャンセルされました。'
    case 'write-failed':
    default:
      return 'ファイルの保存に失敗しました。'
  }
}

export function SaveFailureModal({ info, onAction }: SaveFailureModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, info !== null)

  if (!info) return null

  const message = info.errorMessage?.trim() || defaultMessageForKind(info.errorKind)
  const pathHint = info.filePath ? info.filePath : info.tabTitle

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={() => onAction('cancel')}>
      <section
        className='save-failure-dialog'
        onClick={(event) => event.stopPropagation()}
      >
        <div className='prompt-title'>保存に失敗しました</div>
        <p className='save-failure-message'>{message}</p>
        <p className='save-failure-path' title={pathHint}>
          {pathHint}
        </p>
        <div className='prompt-buttons'>
          <button type='button' onClick={() => onAction('cancel')}>
            キャンセル
          </button>
          <button type='button' onClick={() => onAction('saveAs')}>
            名前を付けて保存
          </button>
          <button type='button' className='danger' onClick={() => onAction('retry')}>
            再試行
          </button>
        </div>
      </section>
    </div>
  )
}
