import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { NoteAnchorModalState } from '../hooks/useNoteAnchorInsert'
import { NOTE_ANCHOR_FIRST_NOTICE_MESSAGE } from '../hooks/noteAnchorInsertController'

type NoteAnchorModalProps = {
  modal: NoteAnchorModalState | null
  titleValue: string
  bodyValue: string
  onTitleValueChange: (value: string) => void
  onBodyValueChange: (value: string) => void
  onFirstNoticeConfirm: () => void
  onSubmit: () => void
  onCancel: () => void
}

/**
 * 付箋追加 (Task 3A-3) の最小 modal。
 * 既存 PromptModal の prompt-overlay / prompt-dialog CSS を共有しつつ、
 * 付箋専用の note-anchor-* class を足している。
 * - first-notice: 初回のみの説明 (確認後は settings に保存され再表示しない)
 * - input: 1 行タイトル + 複数行本文の入力 (どちらも notes.json のみへ保存される)
 * - notice: project 未所属などの案内・エラー表示
 *
 * 入力欄は付箋本文 / タイトルともに Markdown 本文へは混入しない (notes.json 専用)。
 */
export function NoteAnchorModal({
  modal,
  titleValue,
  bodyValue,
  onTitleValueChange,
  onBodyValueChange,
  onFirstNoticeConfirm,
  onSubmit,
  onCancel,
}: NoteAnchorModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, modal !== null)

  if (!modal) return null

  if (modal.kind === 'notice' || modal.kind === 'first-notice') {
    const message =
      modal.kind === 'first-notice' ? NOTE_ANCHOR_FIRST_NOTICE_MESSAGE : modal.message
    return (
      <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
        <div
          className='prompt-dialog'
          role='alertdialog'
          aria-label='付箋'
          onClick={(e) => e.stopPropagation()}
        >
          <label className='prompt-title'>付箋</label>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message}</div>
          <div className='prompt-buttons'>
            {modal.kind === 'first-notice' ? (
              <>
                <button type='button' onClick={onCancel}>
                  キャンセル
                </button>
                <button type='button' autoFocus onClick={onFirstNoticeConfirm}>
                  OK
                </button>
              </>
            ) : (
              <button type='button' autoFocus onClick={onCancel}>
                OK
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // タイトル・本文がともに空 (空白のみ) なら submit できない。
  const canSubmit = titleValue.trim().length > 0 || bodyValue.trim().length > 0

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <form
        className='prompt-dialog'
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) onSubmit()
        }}
      >
        <label className='prompt-title'>付箋を追加</label>
        <div className='note-anchor-fields'>
          <input
            className='prompt-input'
            value={titleValue}
            onChange={(e) => onTitleValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel()
            }}
            placeholder='タイトル（任意）'
            aria-label='付箋タイトル'
            autoFocus
          />
          <textarea
            className='prompt-input note-anchor-textarea'
            value={bodyValue}
            onChange={(e) => onBodyValueChange(e.target.value)}
            onKeyDown={(e) => {
              // textarea 内の Enter は改行として扱い submit しない。
              // submit は OK ボタン、またはタイトル入力上の Enter のみ。
              if (e.key === 'Escape') onCancel()
            }}
            placeholder='メモの詳細'
            aria-label='付箋メモ'
            rows={7}
          />
        </div>
        <div className='prompt-buttons'>
          <button type='button' onClick={onCancel}>
            キャンセル
          </button>
          <button type='submit' disabled={!canSubmit}>
            OK
          </button>
        </div>
      </form>
    </div>
  )
}
