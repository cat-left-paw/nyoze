import { useRef } from 'react'
import type { RefObject } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'

export type PromptModalState = {
  title: string
  defaultValue: string
  selectAllOnOpen?: boolean
  action: {
    kind: 'ruby' | 'bouten' | 'rubyBouten' | 'link' | 'image'
    from: number
    to: number
  }
}

type PromptModalProps = {
  promptModal: PromptModalState | null
  promptValue: string
  promptInputRef: RefObject<HTMLInputElement>
  rubyBoutenTab: 'ruby' | 'bouten'
  boutenValue: string
  customBoutenInput: string
  boutenOptions: string[]
  customBoutenChars: string[]
  onPromptValueChange: (value: string) => void
  onPromptCancel: () => void
  onPromptSubmit: () => void
  onRubyBoutenTabChange: (tab: 'ruby' | 'bouten') => void
  onBoutenValueChange: (value: string) => void
  onCustomBoutenInputChange: (value: string) => void
  onAddCustomBoutenChar: () => void
  onRemoveSelectedCustomBoutenChar: () => void
  imageSrc: string
  imageAlt: string
  imageTitle: string
  onImageSrcChange: (value: string) => void
  onImageAltChange: (value: string) => void
  onImageTitleChange: (value: string) => void
}

export function PromptModal({
  promptModal,
  promptValue,
  promptInputRef,
  rubyBoutenTab,
  boutenValue,
  customBoutenInput,
  boutenOptions,
  customBoutenChars,
  onPromptValueChange,
  onPromptCancel,
  onPromptSubmit,
  onRubyBoutenTabChange,
  onBoutenValueChange,
  onCustomBoutenInputChange,
  onAddCustomBoutenChar,
  onRemoveSelectedCustomBoutenChar,
  imageSrc,
  imageAlt,
  imageTitle,
  onImageSrcChange,
  onImageAltChange,
  onImageTitleChange,
}: PromptModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  useFocusTrap(overlayRef, promptModal !== null)

  if (!promptModal) return null

  return (
    <div ref={overlayRef} className='prompt-overlay' onClick={onPromptCancel}>
      <form
        className='prompt-dialog'
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onPromptSubmit()
        }}
      >
        {promptModal.action.kind === 'image' ? (
          <>
            <label className='prompt-title'>{promptModal.title}</label>
            <div className='prompt-image-fields'>
              <label className='prompt-field-label'>
                パス (src)
                <input
                  ref={promptInputRef}
                  className='prompt-input'
                  value={imageSrc}
                  onChange={(e) => onImageSrcChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onPromptCancel()
                  }}
                  placeholder='images/photo.png'
                  autoFocus
                />
              </label>
              <label className='prompt-field-label'>
                代替テキスト (alt)
                <input
                  className='prompt-input'
                  value={imageAlt}
                  onChange={(e) => onImageAltChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onPromptCancel()
                  }}
                  placeholder='画像の説明'
                />
              </label>
              <label className='prompt-field-label'>
                タイトル (任意)
                <input
                  className='prompt-input'
                  value={imageTitle}
                  onChange={(e) => onImageTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onPromptCancel()
                  }}
                  placeholder='ツールチップ'
                />
              </label>
            </div>
          </>
        ) : promptModal.action.kind === 'rubyBouten' ? (
          <>
            <div className='ruby-bouten-tabs'>
              <button
                type='button'
                className={`ruby-bouten-tab${rubyBoutenTab === 'ruby' ? ' active' : ''}`}
                onClick={() => onRubyBoutenTabChange('ruby')}
              >
                ルビ
              </button>
              <button
                type='button'
                className={`ruby-bouten-tab${rubyBoutenTab === 'bouten' ? ' active' : ''}`}
                onClick={() => onRubyBoutenTabChange('bouten')}
              >
                傍点
              </button>
            </div>
            <div className='ruby-bouten-target'>{promptModal.title}</div>
            <div className='ruby-bouten-body'>
              {rubyBoutenTab === 'ruby' ? (
                <input
                  ref={promptInputRef}
                  className='prompt-input'
                  value={promptValue}
                  onChange={(e) => onPromptValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onPromptCancel()
                  }}
                  placeholder='ルビを入力'
                  autoFocus
                />
              ) : (
                <>
                  <select
                    className='prompt-input prompt-select'
                    value={boutenValue}
                    onChange={(e) => onBoutenValueChange(e.target.value)}
                    autoFocus
                  >
                    {boutenOptions.map((char) => (
                      <option key={char} value={char}>
                        {char}
                      </option>
                    ))}
                  </select>
                  <div className='prompt-custom-row'>
                    <input
                      className='prompt-input'
                      value={customBoutenInput}
                      onChange={(e) => onCustomBoutenInputChange(e.target.value)}
                      placeholder='任意の傍点文字を1文字入力'
                    />
                    <button type='button' onClick={onAddCustomBoutenChar}>
                      追加
                    </button>
                    <button
                      type='button'
                      onClick={onRemoveSelectedCustomBoutenChar}
                      disabled={!customBoutenChars.includes(boutenValue)}
                    >
                      選択を削除
                    </button>
                  </div>
                  <div className='prompt-note'>
                    候補はローカル保存されます
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <label className='prompt-title'>{promptModal.title}</label>
            <input
              ref={promptInputRef}
              className='prompt-input'
              value={promptValue}
              onChange={(e) => onPromptValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onPromptCancel()
              }}
              autoFocus
            />
          </>
        )}
        <div className='prompt-buttons'>
          <button type='button' onClick={onPromptCancel}>
            キャンセル
          </button>
          <button type='submit'>OK</button>
        </div>
      </form>
    </div>
  )
}
