import {
  IconChevronDown,
  IconEye,
  IconEyeOff,
  IconFileCode,
  IconPilcrow,
  IconPresentation,
  IconSearch,
  IconSettings,
  IconSwitchHorizontal,
  IconSwitchVertical,
} from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { BookPageViewerToolbarAvailability } from '../hooks/useBookExportMenuAvailability'
import { TypewriterVisualFocusMenu } from './TypewriterVisualFocusMenu'

const ICON_SIZE = 18
const ICON_STROKE = 1.1

/**
 * 中央エディタのタブ列右端に固定表示する、非装飾系のエディタアクション群
 * （書字方向 / 検索 / ルビ表示 / Paragraph Plain / Source Mode /
 * Typewriter・Visual Focus / Display Settings / Page Viewer）。
 *
 * 装飾・本文挿入・ファイル操作は `UnifiedHeader` 側に残り、ここには重複させない。
 * `UnifiedHeader` と同じ callback / disabled / active / aria を再利用するだけで、
 * 各機能自体のロジックは複製しない（Typewriter portal は既存 `TypewriterVisualFocusMenu`
 * を再利用、Page Viewer launcher は呼び出し側 App.tsx の既存経路を再利用）。
 */
export type EditorTabUtilityActionsProps = {
  uiLanguageMode: UiLanguageMode
  writingMode: WritingMode
  onToggleWritingMode: () => void
  /** Built-in read-only internal doc (shortcut reference): 書字方向 / Page Viewer を無効化。 */
  internalDocActive?: boolean
  searchOpen: boolean
  onOpenSearch: () => void
  fullPlainEditActive: boolean
  rubyVisible: boolean
  onToggleRubyVisible: () => void
  paragraphPlainModeActive: boolean
  onToggleParagraphPlainMode: () => void
  /** `CommandAvailability.canParagraphPlain` のうち、この button の disabled 判定にだけ使う値。 */
  canParagraphPlain: boolean
  onToggleFullPlainEdit: () => void
  displaySettingsOpen: boolean
  onOpenDisplaySettings: () => void
  onOpenDisplaySettingsForTypewriter: () => void
  typewriterModeEnabled: boolean
  onTypewriterModeEnabledChange: (enabled: boolean) => void
  visualFocusBlockHighlightEnabled: boolean
  onVisualFocusBlockHighlightEnabledChange: (enabled: boolean) => void
  visualFocusDimNonFocusedBlocksEnabled: boolean
  onVisualFocusDimNonFocusedBlocksEnabledChange: (enabled: boolean) => void
  visualFocusCurrentLineHighlightEnabled: boolean
  onVisualFocusCurrentLineHighlightEnabledChange: (enabled: boolean) => void
  /** active document を軽量ページビューアで開く (File menu と同じ `openPageViewer` 経路)。 */
  onOpenPageViewer: () => void
  /** Book 全体をページビューアで開く (File menu と同じ `openBookPageViewer` 経路)。 */
  onOpenBookPageViewer: () => void
  /** Book body 章のときだけ split button 化する availability（checking/unavailable では単独 button）。 */
  bookPageViewerToolbarAvailability: BookPageViewerToolbarAvailability
}

export function EditorTabUtilityActions({
  uiLanguageMode,
  writingMode,
  onToggleWritingMode,
  internalDocActive = false,
  searchOpen,
  onOpenSearch,
  fullPlainEditActive,
  rubyVisible,
  onToggleRubyVisible,
  paragraphPlainModeActive,
  onToggleParagraphPlainMode,
  canParagraphPlain,
  onToggleFullPlainEdit,
  displaySettingsOpen,
  onOpenDisplaySettings,
  onOpenDisplaySettingsForTypewriter,
  typewriterModeEnabled,
  onTypewriterModeEnabledChange,
  visualFocusBlockHighlightEnabled,
  onVisualFocusBlockHighlightEnabledChange,
  visualFocusDimNonFocusedBlocksEnabled,
  onVisualFocusDimNonFocusedBlocksEnabledChange,
  visualFocusCurrentLineHighlightEnabled,
  onVisualFocusCurrentLineHighlightEnabledChange,
  onOpenPageViewer,
  onOpenBookPageViewer,
  bookPageViewerToolbarAvailability,
}: EditorTabUtilityActionsProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const isVertical = writingMode === 'vertical-rl'
  const bookPageViewerSplitAvailable = bookPageViewerToolbarAvailability.kind === 'available'

  const [pageViewerTargetMenuOpen, setPageViewerTargetMenuOpen] = useState(false)
  const pageViewerTargetMenuRef = useRef<HTMLDivElement | null>(null)
  const pageViewerPrimaryButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!pageViewerTargetMenuOpen) return

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (pageViewerTargetMenuRef.current?.contains(target)) return
      setPageViewerTargetMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPageViewerTargetMenuOpen(false)
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [pageViewerTargetMenuOpen])

  useEffect(() => {
    if (bookPageViewerSplitAvailable) return
    setPageViewerTargetMenuOpen(false)
  }, [bookPageViewerSplitAvailable])

  const closePageViewerTargetMenuAndFocusPrimary = useCallback(() => {
    setPageViewerTargetMenuOpen(false)
    pageViewerPrimaryButtonRef.current?.focus()
  }, [])

  const runPageViewerDocumentAction = useCallback(() => {
    onOpenPageViewer()
    closePageViewerTargetMenuAndFocusPrimary()
  }, [onOpenPageViewer, closePageViewerTargetMenuAndFocusPrimary])

  const runPageViewerBookAction = useCallback(() => {
    onOpenBookPageViewer()
    closePageViewerTargetMenuAndFocusPrimary()
  }, [onOpenBookPageViewer, closePageViewerTargetMenuAndFocusPrimary])

  return (
    <>
      <button
        className='toolbar-btn-icon-only'
        onClick={onToggleWritingMode}
        disabled={internalDocActive}
        type='button'
        data-tooltip={isVertical ? t('editor.switchHorizontal') : t('editor.switchVertical')}
        aria-label={isVertical ? t('editor.switchHorizontal') : t('editor.switchVertical')}
      >
        {isVertical ? (
          <IconSwitchVertical size={ICON_SIZE} stroke={ICON_STROKE} />
        ) : (
          <IconSwitchHorizontal size={ICON_SIZE} stroke={ICON_STROKE} />
        )}
      </button>
      <span className='toolbar-sep'>|</span>
      <button
        className={`toolbar-btn-icon-only${searchOpen ? ' toggle-active' : ''}`}
        onClick={onOpenSearch}
        type='button'
        disabled={fullPlainEditActive}
        data-tooltip={t('common.search')}
        aria-label={t('common.search')}
        aria-pressed={searchOpen}
      >
        <IconSearch size={ICON_SIZE} stroke={ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-icon-only${rubyVisible ? ' toggle-active' : ''}`}
        onClick={onToggleRubyVisible}
        type='button'
        data-tooltip={t('editor.rubyView')}
        aria-label={t('editor.rubyView')}
        aria-pressed={rubyVisible}
      >
        {rubyVisible ? (
          <IconEye size={ICON_SIZE} stroke={ICON_STROKE} />
        ) : (
          <IconEyeOff size={ICON_SIZE} stroke={ICON_STROKE} />
        )}
      </button>
      <button
        className={`toolbar-btn-icon-only${paragraphPlainModeActive ? ' toggle-active' : ''}`}
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleParagraphPlainMode}
        disabled={
          fullPlainEditActive || (!canParagraphPlain && !paragraphPlainModeActive) || internalDocActive
        }
        type='button'
        data-tooltip={t('editor.paragraphPlain')}
        aria-label={t('editor.paragraphPlain')}
        aria-pressed={paragraphPlainModeActive}
      >
        <IconPilcrow size={ICON_SIZE} stroke={ICON_STROKE} />
      </button>
      <button
        className={`toolbar-btn-icon-only${fullPlainEditActive ? ' toggle-active' : ''}`}
        onClick={onToggleFullPlainEdit}
        disabled={paragraphPlainModeActive || internalDocActive}
        type='button'
        data-tooltip={t('editor.sourceMode')}
        aria-label={t('editor.sourceMode')}
        aria-pressed={fullPlainEditActive}
      >
        <IconFileCode size={ICON_SIZE} stroke={ICON_STROKE} />
      </button>
      <span className='toolbar-sep'>|</span>
      <TypewriterVisualFocusMenu
        uiLanguageMode={uiLanguageMode}
        typewriterModeEnabled={typewriterModeEnabled}
        onTypewriterModeEnabledChange={onTypewriterModeEnabledChange}
        visualFocusBlockHighlightEnabled={visualFocusBlockHighlightEnabled}
        onVisualFocusBlockHighlightEnabledChange={onVisualFocusBlockHighlightEnabledChange}
        visualFocusDimNonFocusedBlocksEnabled={visualFocusDimNonFocusedBlocksEnabled}
        onVisualFocusDimNonFocusedBlocksEnabledChange={onVisualFocusDimNonFocusedBlocksEnabledChange}
        visualFocusCurrentLineHighlightEnabled={visualFocusCurrentLineHighlightEnabled}
        onVisualFocusCurrentLineHighlightEnabledChange={
          onVisualFocusCurrentLineHighlightEnabledChange
        }
        onOpenDisplaySettingsForTypewriter={onOpenDisplaySettingsForTypewriter}
      />
      <button
        className={`toolbar-btn-icon-only${displaySettingsOpen ? ' toggle-active' : ''}`}
        onClick={onOpenDisplaySettings}
        type='button'
        data-tooltip={t('editor.viewSettings')}
        aria-label={t('editor.viewSettings')}
        aria-pressed={displaySettingsOpen}
      >
        <IconSettings size={ICON_SIZE} stroke={ICON_STROKE} />
      </button>
      {bookPageViewerSplitAvailable ? (
        <div className='toolbar-page-viewer-menu-wrap' ref={pageViewerTargetMenuRef}>
          <button
            ref={pageViewerPrimaryButtonRef}
            className='toolbar-btn-icon-only toolbar-page-viewer-primary'
            onClick={onOpenPageViewer}
            disabled={internalDocActive}
            type='button'
            data-toolbar-action='open-page-viewer'
            data-tooltip={t('menu.pageViewer')}
            aria-label={t('menu.pageViewer')}
          >
            <IconPresentation size={ICON_SIZE} stroke={ICON_STROKE} />
          </button>
          <button
            className={`toolbar-btn-icon-only toolbar-page-viewer-chevron${pageViewerTargetMenuOpen ? ' open' : ''}`}
            onClick={() => setPageViewerTargetMenuOpen((open) => !open)}
            disabled={internalDocActive}
            type='button'
            data-toolbar-action='open-page-viewer-menu'
            data-tooltip={t('toolbar.pageViewerTargetMenu.chevron')}
            aria-label={t('toolbar.pageViewerTargetMenu.chevron')}
            aria-haspopup='menu'
            aria-expanded={pageViewerTargetMenuOpen}
          >
            <IconChevronDown size={12} stroke={ICON_STROKE} />
          </button>
          {pageViewerTargetMenuOpen && (
            <div
              className='toolbar-select-menu'
              role='menu'
              aria-label={t('toolbar.pageViewerTargetMenu.menuAriaLabel')}
            >
              <button
                type='button'
                role='menuitem'
                className='toolbar-select-menu-item'
                data-toolbar-action='open-page-viewer-document'
                onClick={runPageViewerDocumentAction}
              >
                <span className='toolbar-select-menu-label'>
                  {t('toolbar.pageViewerTargetMenu.openDocument')}
                </span>
                <span className='toolbar-select-menu-check-slot' aria-hidden />
              </button>
              <button
                type='button'
                role='menuitem'
                className='toolbar-select-menu-item'
                data-toolbar-action='open-page-viewer-book'
                onClick={runPageViewerBookAction}
              >
                <span className='toolbar-select-menu-label'>
                  {t('toolbar.pageViewerTargetMenu.openBook')}
                </span>
                <span className='toolbar-select-menu-check-slot' aria-hidden />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          ref={pageViewerPrimaryButtonRef}
          className='toolbar-btn-icon-only'
          onClick={onOpenPageViewer}
          disabled={internalDocActive}
          type='button'
          data-toolbar-action='open-page-viewer'
          data-tooltip={t('menu.pageViewer')}
          aria-label={t('menu.pageViewer')}
        >
          <IconPresentation size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
      )}
    </>
  )
}
