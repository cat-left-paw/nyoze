import {
  IconFileText,
  IconBook2,
  IconListTree,
  IconNote,
  IconPalette,
  type Icon,
} from '@tabler/icons-react'
import type { createUiTextGetter, UiTextKey } from '../i18n/uiText'
import { useFloatingTooltip } from '../hooks/useFloatingTooltip'
import { PaneTablerIcon } from './PaneTablerIcon'

export type RightPaneTab = 'outline' | 'document' | 'notes' | 'project' | 'theme'

const TAB_ICON_STROKE = 1.75

const RIGHT_PANE_TABS: ReadonlyArray<{
  id: RightPaneTab
  labelKey: UiTextKey
  icon: Icon
}> = [
  { id: 'project', labelKey: 'pane.project', icon: IconBook2 },
  { id: 'outline', labelKey: 'pane.outline', icon: IconListTree },
  { id: 'notes', labelKey: 'pane.notes', icon: IconNote },
  { id: 'document', labelKey: 'pane.document', icon: IconFileText },
  { id: 'theme', labelKey: 'pane.theme', icon: IconPalette },
]

type TextGetter = ReturnType<typeof createUiTextGetter>

/**
 * 右ペイン上部の icon-only tab bar。
 * visible label は出さず、既存 pane.* i18n を aria-label / floating tooltip に流用する。
 * tooltip は native `title` ではなく `position: fixed` の floating chip（FloatingTooltip）で出し、
 * tab bar 端や下のスクロール領域で切れないようにする。
 */
export function RightPaneTabBar({
  activeTab,
  onSelect,
  t,
}: {
  activeTab: RightPaneTab
  onSelect: (tab: RightPaneTab) => void
  t: TextGetter
}) {
  return (
    <div className="pane-header right-pane-tabs" role="tablist">
      {RIGHT_PANE_TABS.map(({ id, labelKey, icon }) => (
        <RightPaneTab
          key={id}
          icon={icon}
          label={t(labelKey)}
          active={activeTab === id}
          onSelect={() => onSelect(id)}
        />
      ))}
    </div>
  )
}

function RightPaneTab({
  icon: IconComponent,
  label,
  active,
  onSelect,
}: {
  icon: Icon
  label: string
  active: boolean
  onSelect: () => void
}) {
  const { anchorProps, tooltip } = useFloatingTooltip(label)
  return (
    <>
      <button
        type="button"
        role="tab"
        className={`right-pane-tab right-pane-tab-icon${active ? ' active' : ''}`}
        aria-selected={active}
        aria-label={label}
        onClick={onSelect}
        {...anchorProps}
      >
        <PaneTablerIcon icon={IconComponent} size="md" stroke={TAB_ICON_STROKE} />
      </button>
      {tooltip}
    </>
  )
}
