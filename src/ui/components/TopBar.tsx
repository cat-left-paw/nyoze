import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMinus,
  IconX,
} from '@tabler/icons-react'
import type { Theme } from '../../settings/types'
import { THEME_LABELS } from '../../settings/defaults'
import { UI_THEME_VALUES } from '../../settings/themeUtils'

const TOOLBAR_ICON_SIZE = 18
const TOOLBAR_ICON_STROKE = 1.1

type TopBarProps = {
  leftPaneOpen: boolean
  rightPaneOpen: boolean
  activeTabTitle: string
  activeTabDirty: boolean
  theme: Theme
  usesNativeWindowControls: boolean
  onToggleLeftPane: () => void
  onToggleRightPane: () => void
  onThemeChange: (theme: Theme) => void
  onWindowMinimize: () => void
  onWindowClose: () => void
}

export function TopBar({
  leftPaneOpen,
  rightPaneOpen,
  activeTabTitle,
  activeTabDirty,
  theme,
  usesNativeWindowControls,
  onToggleLeftPane,
  onToggleRightPane,
  onThemeChange,
  onWindowMinimize,
  onWindowClose,
}: TopBarProps) {
  return (
    <header className='topbar'>
      <div className='topbar-left'>
        {/* macOS/Windows: native controls are used by the title bar. */}
        <button
          className={`pane-toggle${leftPaneOpen ? ' active' : ''}`}
          onClick={onToggleLeftPane}
          title={leftPaneOpen ? '左ペインを閉じる' : '左ペインを開く'}
          type='button'
        >
          {leftPaneOpen ? (
            <IconLayoutSidebarLeftCollapse
              size={TOOLBAR_ICON_SIZE}
              stroke={TOOLBAR_ICON_STROKE}
            />
          ) : (
            <IconLayoutSidebarLeftExpand
              size={TOOLBAR_ICON_SIZE}
              stroke={TOOLBAR_ICON_STROKE}
            />
          )}
        </button>
        <span className='app-name'>Nyoze</span>
      </div>
      <div className='topbar-center'>
        <span className='document-name'>
          {activeTabTitle}
          {activeTabDirty ? ' *' : ''}
        </span>
      </div>
      <div className='topbar-right'>
        <div className='theme-switcher'>
          {UI_THEME_VALUES.map((value) => (
            <button
              key={value}
              className={`theme-btn${theme === value ? ' active' : ''}`}
              onClick={() => onThemeChange(value)}
              type='button'
            >
              {THEME_LABELS[value]}
            </button>
          ))}
        </div>
        <button
          className={`pane-toggle${rightPaneOpen ? ' active' : ''}`}
          onClick={onToggleRightPane}
          title={rightPaneOpen ? '右ペインを閉じる' : '右ペインを開く'}
          type='button'
        >
          {rightPaneOpen ? (
            <IconLayoutSidebarRightCollapse
              size={TOOLBAR_ICON_SIZE}
              stroke={TOOLBAR_ICON_STROKE}
            />
          ) : (
            <IconLayoutSidebarRightExpand
              size={TOOLBAR_ICON_SIZE}
              stroke={TOOLBAR_ICON_STROKE}
            />
          )}
        </button>
        {!usesNativeWindowControls && (
          <div className='window-controls'>
            <button
              className='window-control-btn has-tooltip'
              type='button'
              data-tooltip='最小化'
              aria-label='最小化'
              onClick={onWindowMinimize}
            >
              <IconMinus size={12} stroke={1.7} />
            </button>
            <button
              className='window-control-btn window-control-btn-close has-tooltip'
              type='button'
              data-tooltip='閉じる'
              aria-label='閉じる'
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
