import { useEffect, useRef, useState } from 'react'
import type { FileExplorerNamePromptState } from '../hooks/useFileExplorer'
import { useFocusTrap } from '../hooks/useFocusTrap'

type FileExplorerNamePromptModalProps = {
  prompt: FileExplorerNamePromptState | null
  onCancel: () => void
  onSubmit: (value: string) => void
}

export function FileExplorerNamePromptModal({
  prompt,
  onCancel,
  onSubmit,
}: FileExplorerNamePromptModalProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, prompt !== null)

  useEffect(() => {
    setValue(prompt?.initialValue ?? '')
  }, [prompt?.initialValue])

  useEffect(() => {
    if (!prompt) return
    const timer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      if (prompt.selectAllOnOpen) input.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [prompt])

  if (!prompt) return null

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onCancel}>
      <form
        className='prompt-dialog'
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(value)
        }}
      >
        <label className='prompt-title'>{prompt.title}</label>
        <input
          ref={inputRef}
          className='prompt-input'
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel()
          }}
          autoFocus
        />
        <div className='prompt-buttons'>
          <button type='button' onClick={onCancel}>
            キャンセル
          </button>
          <button type='submit' disabled={value.trim().length === 0}>
            {prompt.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
