import {
  IconSettings,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBlockquote,
  IconBold,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconSquareCheck,
  IconCode,
  IconCodeDots,
  IconDeviceFloppy,
  IconDiamond,
  IconEraser,
  IconGripVertical,
  IconEye,
  IconEyeOff,
  IconFilePlus,
  IconFileCode,
  IconPilcrow,
  IconFolderOpen,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconH5,
  IconH6,
  IconHeading,
  IconHeadingOff,
  IconHighlight,
  IconItalic,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconLink,
  IconList,
  IconPhoto,
  IconListNumbers,
  IconMenu2,
  IconMinus,
  IconPlus,
  IconSeparatorHorizontal,
  IconSeparatorVertical,
  IconStrikethrough,
  IconSwitchHorizontal,
  IconSwitchVertical,
  IconNumber123,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEventHandler, ReactNode, WheelEventHandler } from 'react'
import type { CommandAvailability } from '../../editor-core/types'
import type { DocumentType } from '../../editor-core/io/frontmatterDocumentSettings'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import {
  getPlainFormattingUnavailableMessage,
  resolveFormattingButtonState,
  resolvePlainModeKind,
} from '../utils/plainModeCommandGate'
import {
  formatDocumentTypeHeaderTooltip,
  formatDocumentTypeLabel,
} from '../utils/documentTypePresentation'
import { useWindowControlsOverlayReservation } from '../hooks/useWindowControlsOverlayReservation'

const ICON_SIZE = 18
const ICON_STROKE = 1.1
const SHIFT_PLUS_SIZE = 9
const SHIFT_PLUS_STROKE = 2.4

function ShiftPlusIcon({ children }: { children: ReactNode }) {
  return (
    <span className='toolbar-shift-plus-icon' aria-hidden='true'>
      {children}
      <span className='toolbar-shift-plus-badge'>
        <IconPlus size={SHIFT_PLUS_SIZE} stroke={SHIFT_PLUS_STROKE} />
      </span>
    </span>
  )
}

type UnifiedHeaderProps = {
  // Pane toggles
  leftPaneOpen: boolean
  rightPaneOpen: boolean
  onToggleLeftPane: () => void
  onToggleRightPane: () => void
  // Window controls (non-native)
  usesNativeWindowControls: boolean
  onWindowMinimize: () => void
  onWindowClose: () => void
  // Platform
  platform: string
  uiLanguageMode: UiLanguageMode
  // Toolbar visibility & drag
  toolbarVisible: boolean
  onToggleToolbarVisible: () => void
  toolbarOffset: number
  onToolbarOffsetChange: (offset: number) => void
  onToolbarOffsetReset: () => void
  // Toolbar
  rubyVisible: boolean
  writingMode: WritingMode
  availability: CommandAvailability
  paragraphPlainModeActive: boolean
  fullPlainEditActive: boolean
  displaySettingsOpen: boolean
  onRunMarkCommand: (commandName: 'bold' | 'italic' | 'strike' | 'highlight') => void
  onUndo: () => void
  onRedo: () => void
  onToggleInlineCode: () => void
  onInsertHorizontalRule: () => void
  onToggleHeading: (level: number) => void
  onToggleBulletList: () => void
  onToggleOrderedList: () => void
  onToggleChecklist: () => void
  onToggleBlockquote: () => void
  onToggleCodeBlock: () => void
  onClearFormat: () => void
  onSetOrUnsetLink: () => void
  onInsertImage: () => void
  onInsertRubyBouten: () => void
  onToggleTcy: () => void
  onToggleRubyVisible: () => void
  onToggleWritingMode: () => void
  documentType: DocumentType
  hasDocumentBehaviorOverride: boolean
  onOpenDocumentSettings: () => void
  onToggleParagraphPlainMode: () => void
  onToggleFullPlainEdit: () => void
  onOpenDisplaySettings: () => void
  onShowEditorInlineHint: (message: string) => void
  // Search
  searchOpen: boolean
  onOpenSearch: () => void
  onLoad: MouseEventHandler<HTMLButtonElement>
  onSave: MouseEventHandler<HTMLButtonElement>
  // Menu (Win/Linux)
  onOpenAppMenu: () => void
  appTitleVisible: boolean
  appTitleText: string
}

export function UnifiedHeader({
  leftPaneOpen,
  rightPaneOpen,
  onToggleLeftPane,
  onToggleRightPane,
  usesNativeWindowControls,
  onWindowMinimize,
  onWindowClose,
  platform,
  uiLanguageMode,
  toolbarVisible,
  onToggleToolbarVisible,
  toolbarOffset,
  onToolbarOffsetChange,
  onToolbarOffsetReset,
  rubyVisible,
  writingMode,
  availability,
  paragraphPlainModeActive,
  fullPlainEditActive,
  displaySettingsOpen,
  onRunMarkCommand,
  onUndo,
  onRedo,
  onToggleInlineCode,
  onInsertHorizontalRule,
  onToggleHeading,
  onToggleBulletList,
  onToggleOrderedList,
  onToggleChecklist,
  onToggleBlockquote,
  onToggleCodeBlock,
  onClearFormat,
  onSetOrUnsetLink,
  onInsertImage,
  onInsertRubyBouten,
  onToggleTcy,
  onToggleRubyVisible,
  onToggleWritingMode,
  documentType,
  hasDocumentBehaviorOverride,
  onOpenDocumentSettings,
  onToggleParagraphPlainMode,
  onToggleFullPlainEdit,
  onOpenDisplaySettings,
  onShowEditorInlineHint,
  searchOpen,
  onOpenSearch,
  onLoad,
  onSave,
  onOpenAppMenu,
  appTitleVisible,
  appTitleText,
}: UnifiedHeaderProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const isVertical = writingMode === 'vertical-rl'
  const isMac = platform === 'darwin'
  const documentTypeLabel = formatDocumentTypeLabel(documentType, uiLanguageMode)
  const headingItems = [
    { id: 'h1', label: t('editor.heading.level1'), level: 1, icon: IconH1 },
    { id: 'h2', label: t('editor.heading.level2'), level: 2, icon: IconH2 },
    { id: 'h3', label: t('editor.heading.level3'), level: 3, icon: IconH3 },
    { id: 'h4', label: t('editor.heading.level4'), level: 4, icon: IconH4 },
    { id: 'h5', label: t('editor.heading.level5'), level: 5, icon: IconH5 },
    { id: 'h6', label: t('editor.heading.level6'), level: 6, icon: IconH6 },
  ] as const
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [shiftPressed, setShiftPressed] = useState(false)
  const headingMenuRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const leftZoneRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  const rightZoneRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null)
  const offsetRef = useRef(toolbarOffset)
  offsetRef.current = toolbarOffset
  const windowControlsReservedWidth = useWindowControlsOverlayReservation({
    headerRef,
    platform,
    usesNativeWindowControls,
  })
  const plainModeKind = resolvePlainModeKind({
    paragraphPlainModeActive,
    fullPlainEditActive,
  })
  const plainFormattingBlocked = plainModeKind !== null
  const plainFormattingTooltip = plainModeKind
    ? getPlainFormattingUnavailableMessage(plainModeKind)
    : ''

  useEffect(() => {
    const syncShiftState = (event: KeyboardEvent) => {
      setShiftPressed(event.shiftKey)
    }
    const resetShiftState = () => {
      setShiftPressed(false)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetShiftState()
      }
    }

    window.addEventListener('keydown', syncShiftState)
    window.addEventListener('keyup', syncShiftState)
    window.addEventListener('blur', resetShiftState)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('keydown', syncShiftState)
      window.removeEventListener('keyup', syncShiftState)
      window.removeEventListener('blur', resetShiftState)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Compute min/max offset so wrapper stays between left zone right edge and right zone left edge
  const computeOffsetBounds = useCallback(() => {
    const leftZone = leftZoneRef.current
    const rightZone = rightZoneRef.current
    const wrapper = wrapperRef.current
    if (!leftZone || !rightZone || !wrapper) return null
    const leftBound = leftZone.getBoundingClientRect().right
    const rightBound = rightZone.getBoundingClientRect().left
    const wrapperRect = wrapper.getBoundingClientRect()
    const cur = offsetRef.current
    const wrapperLeftAt0 = wrapperRect.left - cur
    const wrapperRightAt0 = wrapperRect.right - cur
    const rawMinOffset = leftBound - wrapperLeftAt0
    const rawMaxOffset = rightBound - wrapperRightAt0
    // When the toolbar is wider than the gap, rawMinOffset > rawMaxOffset. Clamp range must still
    // span panning from one alignment extreme to the other (swap so bounds.min <= bounds.max).
    if (rawMinOffset <= rawMaxOffset) {
      return { min: rawMinOffset, max: rawMaxOffset }
    }
    return { min: rawMaxOffset, max: rawMinOffset }
  }, [])

  const clampToolbarOffset = useCallback(() => {
    const bounds = computeOffsetBounds()
    if (!bounds) return
    const cur = offsetRef.current
    if (cur < bounds.min) onToolbarOffsetChange(bounds.min)
    else if (cur > bounds.max) onToolbarOffsetChange(bounds.max)
  }, [computeOffsetBounds, onToolbarOffsetChange])

  // Re-clamp offset on window / header resize
  useEffect(() => {
    const header = headerRef.current
    const leftZone = leftZoneRef.current
    const center = centerRef.current
    const rightZone = rightZoneRef.current
    const wrapper = wrapperRef.current
    if (!header) return
    const observer = new ResizeObserver(() => {
      clampToolbarOffset()
    })
    observer.observe(header)
    if (leftZone) observer.observe(leftZone)
    if (center) observer.observe(center)
    if (rightZone) observer.observe(rightZone)
    if (wrapper) observer.observe(wrapper)

    // The center region animates width during collapse/expand; re-check on the next
    // frames so persisted offsets are clamped after layout settles.
    clampToolbarOffset()
    let raf1 = 0
    let raf2 = 0
    raf1 = window.requestAnimationFrame(() => {
      clampToolbarOffset()
      raf1 = 0
      raf2 = window.requestAnimationFrame(() => {
        clampToolbarOffset()
        raf2 = 0
      })
    })
    return () => {
      observer.disconnect()
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
    }
  }, [clampToolbarOffset, toolbarVisible, windowControlsReservedWidth])

  const handleToolbarCenterWheel: WheelEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (!toolbarVisible || !wrapperRef.current) return
      const bounds = computeOffsetBounds()
      if (!bounds) return
      const dominant =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const cur = offsetRef.current
      const next = Math.max(bounds.min, Math.min(bounds.max, cur + dominant))
      if (next !== cur) {
        event.preventDefault()
        onToolbarOffsetChange(next)
      }
    },
    [toolbarVisible, computeOffsetBounds, onToolbarOffsetChange],
  )

  useEffect(() => {
    if (!headingMenuOpen) return

    const onMouseDown = (event: MouseEvent) => {
      if (!headingMenuRef.current) return
      if (headingMenuRef.current.contains(event.target as Node)) return
      setHeadingMenuOpen(false)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setHeadingMenuOpen(false)
    }

    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [headingMenuOpen])

  useEffect(() => {
    if (!plainFormattingBlocked) return
    setHeadingMenuOpen(false)
  }, [plainFormattingBlocked])

  const withPlainFormattingGuard = useCallback(
    (action: () => void) => () => {
      if (plainModeKind) {
        onShowEditorInlineHint(plainFormattingTooltip)
        setHeadingMenuOpen(false)
        return
      }
      action()
    },
    [onShowEditorInlineHint, plainFormattingTooltip, plainModeKind],
  )

  const getFormattingButtonProps = useCallback(
    (tooltip: string, baseDisabled: boolean) => {
      const state = resolveFormattingButtonState({
        plainModeKind,
        baseDisabled,
        defaultTooltip: tooltip,
      })
      return {
        disabled: state.disabled,
        'aria-disabled': state.ariaDisabled ? true : undefined,
        'data-tooltip': state.tooltip,
        title: state.title,
      }
    },
    [plainModeKind],
  )

  const handleDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startOffset: toolbarOffset }

      // Snapshot bounds at drag start (layout doesn't change during drag)
      const bounds = computeOffsetBounds()
      const minOffset = bounds ? bounds.min : -9999
      const maxOffset = bounds ? bounds.max : 9999

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const delta = ev.clientX - dragRef.current.startX
        const raw = dragRef.current.startOffset + delta
        onToolbarOffsetChange(Math.max(minOffset, Math.min(maxOffset, raw)))
      }

      const onUp = () => {
        dragRef.current = null
        document.removeEventListener('mousemove', onMove, false)
        document.removeEventListener('mouseup', onUp, false)
        document.body.classList.remove('is-dragging-toolbar')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.classList.add('is-dragging-toolbar')
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove, false)
      document.addEventListener('mouseup', onUp, false)
    },
    [toolbarOffset, computeOffsetBounds, onToolbarOffsetChange],
  )

  return (
    <header ref={headerRef} className='unified-header'>
      {/* ---- Left zone ---- */}
      <div ref={leftZoneRef} className='unified-header-left'>
        {/* Hamburger menu button: Win/Linux only */}
        {!isMac && (
          <button
            className='toolbar-btn-icon-only'
            onClick={onOpenAppMenu}
            type='button'
            data-tooltip={t('common.menu')}
            aria-label={t('common.menu')}
          >
            <IconMenu2 size={ICON_SIZE} stroke={ICON_STROKE} />
          </button>
        )}
        <button
          className={`pane-toggle has-tooltip${leftPaneOpen ? ' active' : ''}`}
          onClick={onToggleLeftPane}
          data-tooltip={leftPaneOpen ? t('header.closeLeftPane') : t('header.openLeftPane')}
          aria-label={leftPaneOpen ? t('header.closeLeftPane') : t('header.openLeftPane')}
          type='button'
        >
          {leftPaneOpen ? (
            <IconLayoutSidebarLeftCollapse size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconLayoutSidebarLeftExpand size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        {appTitleVisible && <span className='app-name'>{appTitleText}</span>}
        <button
          className={`toolbar-collapse-toggle has-tooltip${toolbarVisible ? ' expanded' : ''}`}
          onClick={onToggleToolbarVisible}
          onDoubleClick={onToolbarOffsetReset}
          type='button'
          data-tooltip={toolbarVisible ? t('header.hideToolbar') : t('header.showToolbar')}
          aria-label={toolbarVisible ? t('header.hideToolbar') : t('header.showToolbar')}
          aria-expanded={toolbarVisible}
        >
          {toolbarVisible ? (
            <IconChevronLeft size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconChevronRight size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        <span className='unified-header-sep' aria-hidden='true' />
      </div>

      {/* ---- Center: toolbar buttons ---- */}
      <div
        ref={centerRef}
        className={`unified-header-center${toolbarVisible ? '' : ' collapsed'}`}
        onWheel={handleToolbarCenterWheel}
      >
        {toolbarVisible && (
          <div
            ref={wrapperRef}
            className='toolbar-drag-wrapper'
            style={{ transform: `translateX(${toolbarOffset}px)` }}
          >
            <button
              className='toolbar-drag-handle has-tooltip'
              onMouseDown={handleDragHandleMouseDown}
              onDoubleClick={onToolbarOffsetReset}
              type='button'
              data-tooltip={t('header.dragToolbar')}
              aria-label={t('header.dragToolbar')}
              tabIndex={-1}
            >
              <IconGripVertical />
            </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={onToggleWritingMode}
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
        <button
          className='toolbar-btn-icon-only'
          onClick={onLoad}
          type='button'
          data-tooltip={shiftPressed ? t('common.newDocument') : t('common.load')}
          aria-label={shiftPressed ? t('common.newDocument') : t('common.load')}
        >
          {shiftPressed ? (
            <IconFilePlus size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconFolderOpen size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={onSave}
          type='button'
          data-tooltip={shiftPressed ? t('common.saveAs') : t('common.save')}
          aria-label={shiftPressed ? t('common.saveAs') : t('common.save')}
        >
          {shiftPressed ? (
            <ShiftPlusIcon>
              <IconDeviceFloppy size={ICON_SIZE} stroke={ICON_STROKE} />
            </ShiftPlusIcon>
          ) : (
            <IconDeviceFloppy size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        <span className='toolbar-sep'>|</span>
        <button
          className='toolbar-btn-icon-only'
          onClick={onUndo}
          disabled={!availability.canUndo}
          type='button'
          data-tooltip={t('common.undo')}
          aria-label={t('common.undo')}
        >
          <IconArrowBackUp size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={onRedo}
          disabled={!availability.canRedo}
          type='button'
          data-tooltip={t('common.redo')}
          aria-label={t('common.redo')}
        >
          <IconArrowForwardUp size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <button
          className={`toolbar-btn-icon-only${availability.isBold ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('bold'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.bold')}
          aria-pressed={availability.isBold}
          {...getFormattingButtonProps(t('editor.bold'), !availability.canBold)}
        >
          <IconBold size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isItalic ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('italic'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.italic')}
          aria-pressed={availability.isItalic}
          {...getFormattingButtonProps(t('editor.italic'), !availability.canItalic)}
        >
          <IconItalic size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isStrike ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('strike'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.strike')}
          aria-pressed={availability.isStrike}
          {...getFormattingButtonProps(t('editor.strike'), !availability.canStrike)}
        >
          <IconStrikethrough size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isHighlight ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(() => onRunMarkCommand('highlight'))}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.highlight')}
          aria-pressed={availability.isHighlight}
          {...getFormattingButtonProps(t('editor.highlight'), !availability.canHighlight)}
        >
          <IconHighlight size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isInlineCode ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleInlineCode)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.inlineCode')}
          aria-pressed={availability.isInlineCode}
          {...getFormattingButtonProps(t('editor.inlineCode'), !availability.canInlineCode)}
        >
          <IconCode size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onClearFormat)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.clearFormat')}
          {...getFormattingButtonProps(t('editor.clearFormat'), !availability.canClearFormat)}
        >
          <IconEraser size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <div className='toolbar-heading-menu-wrap' ref={headingMenuRef}>
          <button
            className={`toolbar-btn-icon-only toolbar-heading-trigger${headingMenuOpen ? ' open' : ''}`}
            onClick={withPlainFormattingGuard(() => setHeadingMenuOpen((prev) => !prev))}
            type='button'
            tabIndex={-1}
            aria-label={t('editor.heading')}
            aria-haspopup='menu'
            aria-expanded={headingMenuOpen}
            {...getFormattingButtonProps(t('editor.heading'), !availability.canBlockTransforms)}
          >
            <IconHeading size={ICON_SIZE} stroke={ICON_STROKE} />
            <IconChevronDown size={12} stroke={ICON_STROKE} />
          </button>
          {headingMenuOpen && (
            <div className='toolbar-heading-menu' role='menu' aria-label={t('editor.headingMenu')}>
              {headingItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className={`toolbar-heading-menu-item${availability.isHeading === item.level ? ' active' : ''}`}
                    type='button'
                    role='menuitem'
                    disabled={plainFormattingBlocked}
                    onClick={withPlainFormattingGuard(() => {
                      onToggleHeading(item.level)
                      setHeadingMenuOpen(false)
                    })}
                  >
                    <Icon size={16} stroke={ICON_STROKE} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
              <div className='toolbar-heading-menu-separator' role='separator' />
              <button
                className={`toolbar-heading-menu-item${availability.isHeading === false ? ' active' : ''}`}
                type='button'
                role='menuitem'
                disabled={plainFormattingBlocked}
                onClick={withPlainFormattingGuard(() => {
                  onToggleHeading(0)
                  setHeadingMenuOpen(false)
                })}
              >
                <IconHeadingOff size={16} stroke={ICON_STROKE} />
                <span>{t('editor.heading.clear')}</span>
              </button>
            </div>
          )}
        </div>
        <button
          className={`toolbar-btn-icon-only${availability.isBulletList ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleBulletList)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.bulletList')}
          {...getFormattingButtonProps(t('editor.bulletList'), !availability.canBlockTransforms)}
        >
          <IconList size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isOrderedList ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleOrderedList)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.orderedList')}
          {...getFormattingButtonProps(t('editor.orderedList'), !availability.canBlockTransforms)}
        >
          <IconListNumbers size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isChecklist ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleChecklist)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.checklist')}
          {...getFormattingButtonProps(t('editor.checklist'), !availability.canBlockTransforms)}
        >
          <IconSquareCheck size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isBlockquote ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleBlockquote)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.blockquote')}
          {...getFormattingButtonProps(t('editor.blockquote'), !availability.canBlockTransforms)}
        >
          <IconBlockquote size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className={`toolbar-btn-icon-only${availability.isCodeBlock ? ' toggle-active' : ''}`}
          onClick={withPlainFormattingGuard(onToggleCodeBlock)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.codeBlock')}
          {...getFormattingButtonProps(t('editor.codeBlock'), !availability.canBlockTransforms)}
        >
          <IconCodeDots size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onSetOrUnsetLink)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.link')}
          {...getFormattingButtonProps(t('editor.link'), false)}
        >
          <IconLink size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onInsertImage)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.image')}
          {...getFormattingButtonProps(t('editor.image'), false)}
        >
          <IconPhoto size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onInsertRubyBouten)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.insertRuby')}
          {...getFormattingButtonProps(t('editor.insertRuby'), !availability.canInsertRuby)}
        >
          <IconDiamond size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onToggleTcy)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.tcy')}
          {...getFormattingButtonProps(t('editor.tcy'), !availability.canToggleTcy)}
        >
          <IconNumber123 size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
        <span className='toolbar-sep'>|</span>
        <button
          className='toolbar-btn-icon-only'
          onClick={withPlainFormattingGuard(onInsertHorizontalRule)}
          type='button'
          tabIndex={-1}
          aria-label={t('editor.horizontalRule')}
          {...getFormattingButtonProps(t('editor.horizontalRule'), !availability.canBlockTransforms)}
        >
          {isVertical ? (
            <IconSeparatorVertical size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconSeparatorHorizontal size={ICON_SIZE} stroke={ICON_STROKE} />
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
          disabled={fullPlainEditActive || (!availability.canParagraphPlain && !paragraphPlainModeActive)}
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
          disabled={paragraphPlainModeActive}
          type='button'
          data-tooltip={t('editor.sourceMode')}
          aria-label={t('editor.sourceMode')}
          aria-pressed={fullPlainEditActive}
        >
          <IconFileCode size={ICON_SIZE} stroke={ICON_STROKE} />
        </button>
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
            <span className='toolbar-sep'>|</span>
          </div>
        )}
      </div>

      {/* ---- Right zone ---- */}
      <div ref={rightZoneRef} className='unified-header-right'>
        <button
          type='button'
          className='unified-header-line-break-policy-btn has-tooltip'
          onClick={onOpenDocumentSettings}
          aria-label={
            hasDocumentBehaviorOverride
              ? `${t('documentSettings.documentType')}: ${documentTypeLabel}. ${t('documentType.overrideLockedNotice', 'tooltip')}. ${t('documentSettings.openPanel', 'tooltip')}`
              : `${t('documentSettings.documentType')}: ${documentTypeLabel}. ${t('documentSettings.openPanel', 'tooltip')}`
          }
          data-tooltip={formatDocumentTypeHeaderTooltip(documentType, hasDocumentBehaviorOverride, uiLanguageMode)}
        >
          <span className='editor-tab-policy-badge'>{documentTypeLabel}</span>
          {hasDocumentBehaviorOverride ? (
            <span className='unified-header-line-break-policy-doc' aria-hidden='true'>
              {t('documentType.fixedBadge')}
            </span>
          ) : null}
        </button>
        <span className='unified-header-sep' aria-hidden='true' />
        <button
          className={`pane-toggle has-tooltip${rightPaneOpen ? ' active' : ''}`}
          onClick={onToggleRightPane}
          data-tooltip={rightPaneOpen ? t('header.closeRightPane') : t('header.openRightPane')}
          aria-label={rightPaneOpen ? t('header.closeRightPane') : t('header.openRightPane')}
          type='button'
        >
          {rightPaneOpen ? (
            <IconLayoutSidebarRightCollapse size={ICON_SIZE} stroke={ICON_STROKE} />
          ) : (
            <IconLayoutSidebarRightExpand size={ICON_SIZE} stroke={ICON_STROKE} />
          )}
        </button>
        {!usesNativeWindowControls && (
          <div className='window-controls'>
            <button
              className='window-control-btn has-tooltip'
              type='button'
              data-tooltip={t('common.minimize')}
              aria-label={t('common.minimize')}
              onClick={onWindowMinimize}
            >
              <IconMinus size={12} stroke={1.7} />
            </button>
            <button
              className='window-control-btn window-control-btn-close has-tooltip'
              type='button'
              data-tooltip={t('common.close')}
              aria-label={t('common.close')}
              onClick={onWindowClose}
            >
              <IconX size={11} stroke={1.7} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
