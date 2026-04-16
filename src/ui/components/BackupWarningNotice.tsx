import { useEffect, useRef } from 'react'

/**
 * R3.5-2: 保存は成功したが pre-save backup が失敗した場合に通知するバナー。
 *
 * モーダルではなく dismissible な通知バー（保存自体は成功しているため作業を止めない）。
 */
type BackupWarningNoticeProps = {
  message: string | null
  onDismiss: () => void
}

export function BackupWarningNotice({
  message,
  onDismiss,
}: BackupWarningNoticeProps) {
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!message) return
    // 自動で閉じる（10 秒）。ユーザーが×を押した場合は onDismiss で即座に閉じる。
    timerRef.current = window.setTimeout(() => {
      onDismiss()
    }, 10000)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [message, onDismiss])

  if (!message) return null

  return (
    <div className='backup-warning-notice' role='status'>
      <span className='backup-warning-icon' aria-hidden='true'>
        ⚠
      </span>
      <span className='backup-warning-message'>
        保存は完了しましたが、バックアップ作成に失敗しました: {message}
      </span>
      <button
        type='button'
        className='backup-warning-dismiss'
        onClick={onDismiss}
        aria-label='通知を閉じる'
      >
        ×
      </button>
    </div>
  )
}
