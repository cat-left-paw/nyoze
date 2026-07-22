import type { Icon } from '@tabler/icons-react'

export type PaneTablerIconSize = 'xs' | 'sm' | 'md'

const DEFAULT_STROKE = 1.75

/**
 * 左右ペイン向け Tabler icon。glyph 寸法は CSS variable（--ui-icon-size-*）で制御する。
 * Tabler の `size` prop は使わず、stroke のみ渡す。
 */
export function PaneTablerIcon({
  icon: IconComponent,
  size = 'sm',
  stroke = DEFAULT_STROKE,
  className = '',
}: {
  icon: Icon
  size?: PaneTablerIconSize
  stroke?: number
  className?: string
}) {
  return (
    <IconComponent
      className={`ui-pane-tabler-icon ui-pane-tabler-icon--${size}${className ? ` ${className}` : ''}`}
      stroke={stroke}
      aria-hidden
    />
  )
}
