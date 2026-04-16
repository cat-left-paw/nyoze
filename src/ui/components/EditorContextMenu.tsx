import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { CommandAvailability } from '../../editor-core/types'
import type { WritingMode } from '../../settings/types'
import {
  IconArrowDown,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowUp,
  IconBold,
  IconSquareCheck,
  IconClipboard,
  IconCopy,
  IconDiamond,
  IconEraser,
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
  IconList,
  IconListNumbers,
  IconScissors,
  IconSelectAll,
  IconStrikethrough,
  IconNumber123,
} from '@tabler/icons-react'

const ICON_SIZE = 16
const ICON_STROKE = 1.2

type MenuAction = () => void | Promise<void>

type MenuItem = {
  id: string
  label: string
  icon: React.ReactNode
  disabled: boolean
  active?: boolean
  action?: MenuAction
  submenu?: MenuItem[]
  separator?: false
  shortcut?: string
}
type SeparatorItem = { separator: true; id: string }
type MenuEntry = MenuItem | SeparatorItem

type EditorContextMenuProps = {
  visible: boolean
  x: number
  y: number
  availability: CommandAvailability
  writingMode: WritingMode
  menuRef: RefObject<HTMLDivElement | null>
  onUndo: () => void
  onRedo: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void | Promise<void>
  onSelectAll: () => void
  onBold: () => void
  onItalic: () => void
  onStrike: () => void
  onHighlight: () => void
  onHeading: (level: number) => void
  onBulletList: () => void
  onOrderedList: () => void
  onChecklist: () => void
  onRuby: () => void
  onTcy: () => void
  onClearFormat: () => void
  onMoveListUp: () => void
  onMoveListDown: () => void
  onClose: () => void
}

export function EditorContextMenu({
  visible,
  x,
  y,
  availability,
  writingMode,
  menuRef,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
  onBold,
  onItalic,
  onStrike,
  onHighlight,
  onHeading,
  onBulletList,
  onOrderedList,
  onChecklist,
  onRuby,
  onTcy,
  onClearFormat,
  onMoveListUp,
  onMoveListDown,
  onClose,
}: EditorContextMenuProps) {
  const localRef = useRef<HTMLDivElement | null>(null)
  const [submenuDirection, setSubmenuDirection] = useState<'right' | 'left'>('right')

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el
      ;(menuRef as React.MutableRefObject<HTMLDivElement | null>).current = el
    },
    [menuRef],
  )

  useEffect(() => {
    if (!visible) return
    const el = localRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y
    if (left + rect.width > vw) left = vw - rect.width - 4
    if (top + rect.height > vh) top = vh - rect.height - 4
    if (left < 0) left = 4
    if (top < 0) top = 4
    el.style.left = `${left}px`
    el.style.top = `${top}px`

    const SUBMENU_ESTIMATED_WIDTH = 232
    const shouldOpenLeft = left + rect.width + SUBMENU_ESTIMATED_WIDTH > vw - 4
    setSubmenuDirection(shouldOpenLeft ? 'left' : 'right')
  }, [visible, x, y])

  if (!visible) return null

  const a = availability
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl'
  const selectAllShortcut = `${mod}+A`
  const headingResetShortcut = `${mod}+Alt+0`
  const listMoveUpShortcut = writingMode === 'horizontal-tb' ? `${mod}+↑` : `${mod}+→`
  const listMoveDownShortcut = writingMode === 'horizontal-tb' ? `${mod}+↓` : `${mod}+←`

  const wrap = (action: MenuAction) => () => {
    void Promise.resolve(action()).finally(onClose)
  }

  const headingEntries: MenuItem[] = [
    {
      id: 'h1',
      label: 'Heading 1',
      icon: <IconH1 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 1,
      action: wrap(() => onHeading(1)),
      shortcut: `${mod}+Alt+1`,
    },
    {
      id: 'h2',
      label: 'Heading 2',
      icon: <IconH2 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 2,
      action: wrap(() => onHeading(2)),
      shortcut: `${mod}+Alt+2`,
    },
    {
      id: 'h3',
      label: 'Heading 3',
      icon: <IconH3 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 3,
      action: wrap(() => onHeading(3)),
      shortcut: `${mod}+Alt+3`,
    },
    {
      id: 'h4',
      label: 'Heading 4',
      icon: <IconH4 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 4,
      action: wrap(() => onHeading(4)),
      shortcut: `${mod}+Alt+4`,
    },
    {
      id: 'h5',
      label: 'Heading 5',
      icon: <IconH5 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 5,
      action: wrap(() => onHeading(5)),
      shortcut: `${mod}+Alt+5`,
    },
    {
      id: 'h6',
      label: 'Heading 6',
      icon: <IconH6 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isHeading === 6,
      action: wrap(() => onHeading(6)),
      shortcut: `${mod}+Alt+6`,
    },
    {
      id: 'paragraph',
      label: 'Clear Heading',
      icon: <IconHeadingOff size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: a.isHeading === false || !a.canBlockTransforms,
      action: wrap(() => onHeading(0)),
      shortcut: headingResetShortcut,
    },
  ]

  const entries: MenuEntry[] = [
    {
      id: 'undo',
      label: 'Undo',
      icon: <IconArrowBackUp size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canUndo,
      action: wrap(onUndo),
      shortcut: `${mod}+Z`,
    },
    {
      id: 'redo',
      label: 'Redo',
      icon: <IconArrowForwardUp size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canRedo,
      action: wrap(onRedo),
      shortcut: `${mod}+Shift+Z`,
    },
    { separator: true, id: 'sep-edit-history' },
    {
      id: 'cut',
      label: 'Cut',
      icon: <IconScissors size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canCut,
      action: wrap(onCut),
      shortcut: `${mod}+X`,
    },
    {
      id: 'copy',
      label: 'Copy',
      icon: <IconCopy size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canCopy,
      action: wrap(onCopy),
      shortcut: `${mod}+C`,
    },
    {
      id: 'paste',
      label: 'Paste',
      icon: <IconClipboard size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canPaste,
      action: wrap(onPaste),
      shortcut: `${mod}+V`,
    },
    {
      id: 'selectAll',
      label: 'Select All',
      icon: <IconSelectAll size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canSelectAll,
      action: wrap(onSelectAll),
      shortcut: selectAllShortcut,
    },
    { separator: true, id: 'sep-clipboard' },
    {
      id: 'bold',
      label: 'Bold',
      icon: <IconBold size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBold,
      active: a.isBold,
      action: wrap(onBold),
      shortcut: `${mod}+B`,
    },
    {
      id: 'italic',
      label: 'Italic',
      icon: <IconItalic size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canItalic,
      active: a.isItalic,
      action: wrap(onItalic),
      shortcut: `${mod}+I`,
    },
    {
      id: 'strike',
      label: 'Strikethrough',
      icon: <IconStrikethrough size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canStrike,
      active: a.isStrike,
      action: wrap(onStrike),
      shortcut: `${mod}+Shift+X`,
    },
    {
      id: 'highlight',
      label: 'Highlight',
      icon: <IconHighlight size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canHighlight,
      active: a.isHighlight,
      action: wrap(onHighlight),
    },
    { separator: true, id: 'sep-format' },
    {
      id: 'heading-submenu',
      label: 'Heading',
      icon: <IconHeading size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      submenu: headingEntries,
    },
    {
      id: 'bulletList',
      label: 'Bullet List',
      icon: <IconList size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isBulletList,
      action: wrap(onBulletList),
    },
    {
      id: 'orderedList',
      label: 'Ordered List',
      icon: <IconListNumbers size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isOrderedList,
      action: wrap(onOrderedList),
    },
    {
      id: 'checklist',
      label: 'Checklist',
      icon: <IconSquareCheck size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canBlockTransforms,
      active: a.isChecklist,
      action: wrap(onChecklist),
    },
    {
      id: 'moveUp',
      label: 'Move List Item Up',
      icon: <IconArrowUp size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canMoveListUp,
      action: wrap(onMoveListUp),
      shortcut: listMoveUpShortcut,
    },
    {
      id: 'moveDown',
      label: 'Move List Item Down',
      icon: <IconArrowDown size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canMoveListDown,
      action: wrap(onMoveListDown),
      shortcut: listMoveDownShortcut,
    },
    { separator: true, id: 'sep-extra' },
    {
      id: 'ruby',
      label: 'Insert Ruby',
      icon: <IconDiamond size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canInsertRuby,
      action: wrap(onRuby),
    },
    {
      id: 'tcy',
      label: 'TCY',
      icon: <IconNumber123 size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canToggleTcy,
      action: wrap(onTcy),
    },
    {
      id: 'clearFormat',
      label: 'Clear Format',
      icon: <IconEraser size={ICON_SIZE} stroke={ICON_STROKE} />,
      disabled: !a.canClearFormat,
      action: wrap(onClearFormat),
      shortcut: `${mod}+Shift+C`,
    },
  ]

  return (
    <div
      ref={setRef}
      className={`editor-context-menu${submenuDirection === 'left' ? ' submenu-left' : ''}`}
      style={{ left: x, top: y }}
      role='menu'
    >
      {entries.map((entry) =>
        entry.separator ? (
          <div key={entry.id} className='editor-context-menu-separator' role='separator' />
        ) : entry.submenu ? (
          <div
            key={entry.id}
            className={`editor-context-menu-item has-submenu${entry.active ? ' active' : ''}${entry.disabled ? ' disabled' : ''}`}
            role='menuitem'
            aria-haspopup='menu'
            tabIndex={0}
            onMouseDown={(event) => event.preventDefault()}
          >
            <span className='editor-context-menu-icon'>{entry.icon}</span>
            <span className='editor-context-menu-label'>{entry.label}</span>
            <span className='editor-context-menu-submenu-caret'>›</span>
            <div className='editor-context-submenu' role='menu'>
              {entry.submenu.map((subItem) => (
                <button
                  key={subItem.id}
                  className={`editor-context-menu-item${subItem.active ? ' active' : ''}${subItem.disabled ? ' disabled' : ''}`}
                  type='button'
                  role='menuitem'
                  disabled={subItem.disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={subItem.action}
                >
                  <span className='editor-context-menu-icon'>{subItem.icon}</span>
                  <span className='editor-context-menu-label'>{subItem.label}</span>
                  {subItem.shortcut && (
                    <span className='editor-context-menu-shortcut'>{subItem.shortcut}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            key={entry.id}
            className={`editor-context-menu-item${entry.active ? ' active' : ''}${entry.disabled ? ' disabled' : ''}`}
            type='button'
            role='menuitem'
            disabled={entry.disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={entry.action}
          >
            <span className='editor-context-menu-icon'>{entry.icon}</span>
            <span className='editor-context-menu-label'>{entry.label}</span>
            {entry.shortcut && (
              <span className='editor-context-menu-shortcut'>{entry.shortcut}</span>
            )}
          </button>
        ),
      )}
    </div>
  )
}
