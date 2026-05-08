import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import {
  IconChevronDown,
  IconChevronUp,
  IconLetterCase,
  IconReplace,
  IconReplaceFilled,
  IconSearch,
  IconX,
} from '@tabler/icons-react'

type SearchBarProps = {
  open: boolean
  replaceOpen: boolean
  /** Read-only internal docs: hide replace affordances (search navigation stays enabled). */
  replaceDisabled?: boolean
  query: string
  replacement: string
  caseSensitive: boolean
  matchCount: number
  currentIndex: number
  searchInputRef: RefObject<HTMLInputElement>
  onQueryChange: (query: string) => void
  onReplacementChange: (replacement: string) => void
  onToggleCaseSensitive: () => void
  onToggleReplace: () => void
  onExecuteSearch: () => void
  onNext: () => void
  onPrev: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

function isImeComposingEnter(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
  if (event.key !== 'Enter') return false
  const native = event.nativeEvent as KeyboardEvent
  return native.isComposing || native.keyCode === 229
}

export function SearchBar({
  open,
  replaceOpen,
  replaceDisabled = false,
  query,
  replacement,
  caseSensitive,
  matchCount,
  currentIndex,
  searchInputRef,
  onQueryChange,
  onReplacementChange,
  onToggleCaseSensitive,
  onToggleReplace,
  onExecuteSearch,
  onNext,
  onPrev,
  onReplaceOne,
  onReplaceAll,
  onClose,
}: SearchBarProps) {
  if (!open) return null

  const countLabel =
    matchCount === 0
      ? query
        ? '0 件'
        : ''
      : `${currentIndex + 1} / ${matchCount} 件`

  return (
    <div className='search-bar'>
      <div className='search-bar-row'>
        <button
          className='search-bar-btn search-bar-toggle-replace'
          type='button'
          disabled={replaceDisabled}
          onClick={() => {
            if (replaceDisabled) return
            onToggleReplace()
          }}
          title={
            replaceDisabled
              ? '置換はこのドキュメントでは使用できません'
              : replaceOpen
                ? '置換を閉じる'
                : '置換を開く'
          }
        >
          {replaceOpen ? (
            <IconChevronUp size={14} />
          ) : (
            <IconChevronDown size={14} />
          )}
        </button>

        <div className='search-bar-input-wrap'>
          <input
            ref={searchInputRef}
            className='search-bar-input'
            type='text'
            value={query}
            placeholder='検索…'
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (isImeComposingEnter(e)) {
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) {
                  onPrev()
                } else {
                  onNext()
                }
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          <button
            className={`search-bar-btn search-bar-case-btn${caseSensitive ? ' active' : ''}`}
            type='button'
            onClick={onToggleCaseSensitive}
            title='大文字小文字を区別'
          >
            <IconLetterCase size={16} />
          </button>
        </div>

        <button
          className='search-bar-btn'
          type='button'
          onClick={onExecuteSearch}
          disabled={!query}
          title='検索 (Enter)'
        >
          <IconSearch size={16} />
        </button>
        <span className='search-bar-count'>{countLabel}</span>

        <button
          className='search-bar-btn'
          type='button'
          onClick={onPrev}
          disabled={matchCount === 0}
          title='前の一致 (Shift+Enter)'
        >
          <IconChevronUp size={16} />
        </button>
        <button
          className='search-bar-btn'
          type='button'
          onClick={onNext}
          disabled={matchCount === 0}
          title='次の一致 (Enter)'
        >
          <IconChevronDown size={16} />
        </button>
        <button
          className='search-bar-btn search-bar-close'
          type='button'
          onClick={onClose}
          title='閉じる (Escape)'
        >
          <IconX size={16} />
        </button>
      </div>

      {replaceOpen && !replaceDisabled && (
        <div className='search-bar-row search-bar-replace-row'>
          <div className='search-bar-spacer' />
          <input
            className='search-bar-input search-bar-replace-input'
            type='text'
            value={replacement}
            placeholder='置換…'
            onChange={(e) => onReplacementChange(e.target.value)}
            onKeyDown={(e) => {
              if (isImeComposingEnter(e)) {
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onReplaceOne()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              }
            }}
          />
          <button
            className='search-bar-btn'
            type='button'
            onClick={onReplaceOne}
            disabled={matchCount === 0}
            title='置換'
          >
            <IconReplace size={16} />
          </button>
          <button
            className='search-bar-btn'
            type='button'
            onClick={onReplaceAll}
            disabled={matchCount === 0}
            title='すべて置換'
          >
            <IconReplaceFilled size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
