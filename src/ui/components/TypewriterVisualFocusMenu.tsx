import {
  IconAlignBoxLeftMiddle,
  IconArrowsVertical,
  IconCheck,
  IconChevronDown,
  IconLicense,
  IconPencilStar,
  IconSettings,
  IconShadowOff,
} from '@tabler/icons-react'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'

const ICON_SIZE = 18
const ICON_STROKE = 1.1
const MENU_VIEWPORT_MARGIN = 8

export type TypewriterVisualFocusMenuProps = {
  uiLanguageMode: UiLanguageMode
  typewriterModeEnabled: boolean
  onTypewriterModeEnabledChange: (enabled: boolean) => void
  visualFocusBlockHighlightEnabled: boolean
  onVisualFocusBlockHighlightEnabledChange: (enabled: boolean) => void
  visualFocusDimNonFocusedBlocksEnabled: boolean
  onVisualFocusDimNonFocusedBlocksEnabledChange: (enabled: boolean) => void
  visualFocusCurrentLineHighlightEnabled: boolean
  onVisualFocusCurrentLineHighlightEnabledChange: (enabled: boolean) => void
  onOpenDisplaySettingsForTypewriter: () => void
}

export function TypewriterVisualFocusMenu({
  uiLanguageMode,
  typewriterModeEnabled,
  onTypewriterModeEnabledChange,
  visualFocusBlockHighlightEnabled,
  onVisualFocusBlockHighlightEnabledChange,
  visualFocusDimNonFocusedBlocksEnabled,
  onVisualFocusDimNonFocusedBlocksEnabledChange,
  visualFocusCurrentLineHighlightEnabled,
  onVisualFocusCurrentLineHighlightEnabledChange,
  onOpenDisplaySettingsForTypewriter,
}: TypewriterVisualFocusMenuProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)

  const anyEnabled =
    typewriterModeEnabled ||
    visualFocusBlockHighlightEnabled ||
    visualFocusDimNonFocusedBlocksEnabled ||
    visualFocusCurrentLineHighlightEnabled

  const positionMenuPanel = useCallback(() => {
    const wrap = wrapRef.current
    const menu = menuPanelRef.current
    if (!wrap || !menu) return

    const rect = wrap.getBoundingClientRect()
    const mw = menu.offsetWidth || 280
    const mh = menu.offsetHeight || 1

    let left = rect.right - mw
    left = Math.max(
      MENU_VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - mw - MENU_VIEWPORT_MARGIN),
    )

    let top = rect.bottom + 4
    if (top + mh > window.innerHeight - MENU_VIEWPORT_MARGIN) {
      top = Math.max(MENU_VIEWPORT_MARGIN, rect.top - mh - 4)
    }

    menu.style.position = 'fixed'
    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.right = 'auto'
    menu.style.zIndex = '10000'
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    positionMenuPanel()
    const id = window.requestAnimationFrame(() => positionMenuPanel())
    return () => window.cancelAnimationFrame(id)
  }, [open, positionMenuPanel])

  useEffect(() => {
    if (!open) return

    const onResize = () => positionMenuPanel()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [open, positionMenuPanel])

  useEffect(() => {
    if (!open) return

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (wrapRef.current?.contains(target)) return
      if (menuPanelRef.current?.contains(target)) return
      setOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const btnLabel = t('toolbar.typewriterFocusMenu.button')
  const menuLabel = t('toolbar.typewriterFocusMenu.menuAriaLabel')
  const openSettingsLabel = t('toolbar.typewriterFocusMenu.openInDisplaySettings')

  const handleOpenSettings = () => {
    onOpenDisplaySettingsForTypewriter()
    setOpen(false)
  }

  const menuPanel = open ? (
    <div
      ref={menuPanelRef}
      className='toolbar-select-menu toolbar-select-menu--typewriter'
      role='menu'
      aria-label={menuLabel}
    >
      <button
        type='button'
        role='menuitem'
        className={`toolbar-select-menu-item${
          typewriterModeEnabled ? ' toolbar-select-menu-item--selected' : ''
        }`}
        onClick={() => onTypewriterModeEnabledChange(!typewriterModeEnabled)}
        aria-pressed={typewriterModeEnabled}
      >
        <IconArrowsVertical size={16} stroke={ICON_STROKE} />
        <span className='toolbar-select-menu-label'>{t('displaySettings.typewriter.enabled')}</span>
        <span className='toolbar-select-menu-check-slot' aria-hidden>
          {typewriterModeEnabled ? (
            <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
          ) : null}
        </span>
      </button>

      <div className='toolbar-heading-menu-separator' role='separator' />

      <button
        type='button'
        role='menuitem'
        className={`toolbar-select-menu-item${
          visualFocusCurrentLineHighlightEnabled ? ' toolbar-select-menu-item--selected' : ''
        }`}
        onClick={() =>
          onVisualFocusCurrentLineHighlightEnabledChange(
            !visualFocusCurrentLineHighlightEnabled,
          )
        }
        aria-pressed={visualFocusCurrentLineHighlightEnabled}
      >
        <IconPencilStar size={16} stroke={ICON_STROKE} />
        <span className='toolbar-select-menu-label'>
          {t('displaySettings.visualFocus.currentLineHighlight')}
        </span>
        <span className='toolbar-select-menu-check-slot' aria-hidden>
          {visualFocusCurrentLineHighlightEnabled ? (
            <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
          ) : null}
        </span>
      </button>
      <button
        type='button'
        role='menuitem'
        className={`toolbar-select-menu-item${
          visualFocusBlockHighlightEnabled ? ' toolbar-select-menu-item--selected' : ''
        }`}
        onClick={() =>
          onVisualFocusBlockHighlightEnabledChange(!visualFocusBlockHighlightEnabled)
        }
        aria-pressed={visualFocusBlockHighlightEnabled}
      >
        <IconAlignBoxLeftMiddle size={16} stroke={ICON_STROKE} />
        <span className='toolbar-select-menu-label'>
          {t('displaySettings.visualFocus.editBlockHighlight')}
        </span>
        <span className='toolbar-select-menu-check-slot' aria-hidden>
          {visualFocusBlockHighlightEnabled ? (
            <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
          ) : null}
        </span>
      </button>
      <button
        type='button'
        role='menuitem'
        className={`toolbar-select-menu-item${
          visualFocusDimNonFocusedBlocksEnabled ? ' toolbar-select-menu-item--selected' : ''
        }`}
        onClick={() =>
          onVisualFocusDimNonFocusedBlocksEnabledChange(
            !visualFocusDimNonFocusedBlocksEnabled,
          )
        }
        aria-pressed={visualFocusDimNonFocusedBlocksEnabled}
      >
        <IconShadowOff size={16} stroke={ICON_STROKE} />
        <span className='toolbar-select-menu-label'>
          {t('displaySettings.visualFocus.dimNonFocusedBlocks')}
        </span>
        <span className='toolbar-select-menu-check-slot' aria-hidden>
          {visualFocusDimNonFocusedBlocksEnabled ? (
            <IconCheck className='toolbar-select-menu-check' size={14} stroke={2} />
          ) : null}
        </span>
      </button>

      <div className='toolbar-heading-menu-separator' role='separator' />
      <button
        type='button'
        role='menuitem'
        className='toolbar-select-menu-item'
        onClick={handleOpenSettings}
        aria-label={openSettingsLabel}
      >
        <IconSettings size={16} stroke={ICON_STROKE} />
        <span className='toolbar-select-menu-label'>{openSettingsLabel}</span>
        <span className='toolbar-select-menu-check-slot' aria-hidden />
      </button>
    </div>
  ) : null

  return (
    <div className='toolbar-tw-vf-menu-wrap' ref={wrapRef}>
      <button
        type='button'
        className={`toolbar-btn-icon-only toolbar-tw-vf-menu-trigger${open ? ' open' : ''}${anyEnabled ? ' toggle-active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup='menu'
        aria-expanded={open}
        aria-label={btnLabel}
        data-tooltip={btnLabel}
        tabIndex={-1}
      >
        <IconLicense size={ICON_SIZE} stroke={ICON_STROKE} />
        <IconChevronDown size={12} stroke={ICON_STROKE} />
      </button>
      {menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  )
}
