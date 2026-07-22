import type { Icon } from '@tabler/icons-react'
import { useFloatingTooltip } from '../hooks/useFloatingTooltip'
import { PaneTablerIcon } from './PaneTablerIcon'

const DEFAULT_STROKE = 1.75

/**
 * Project タブ一覧行の icon-only 操作ボタン。
 * visible text は出さず、aria-label + floating tooltip（useFloatingTooltip）で既存 i18n 文言を残す。
 *
 * tooltip は `.project-pane-index`（overflow-y: auto）の中でも切れないよう、CSS 疑似要素では
 * なく `position: fixed` の portal として表示する（FloatingTooltip 参照）。native `title` は
 * 使わず custom chip と二重表示しない。
 *
 * `hoverIcon` を渡すと、通常時は `icon`、hover / focus-visible 時だけ `hoverIcon` を
 * 表示専用に差し替える（CSS のみ。aria-label / tooltip は不変）。未登録ファイルの
 * 「Book に追加」「資料にする」で、追加先 role を示しつつ操作時に plus を見せるために使う。
 * disabled 時は差し替えず通常 icon のまま。tooltip anchor は wrapper 側へ載せて説明を維持する
 * （disabled button は pointer event を出さないため）。
 */
export function ProjectPaneIconButton({
  icon: IconComponent,
  hoverIcon: HoverIconComponent,
  label,
  onClick,
  disabled = false,
  className = 'project-pane-icon-btn',
  ariaExpanded,
  ariaControls,
  ariaPressed,
  active = false,
}: {
  icon: Icon
  hoverIcon?: Icon
  label: string
  onClick?: () => void
  disabled?: boolean
  className?: string
  ariaExpanded?: boolean
  ariaControls?: string
  /** toggle button 用。指定すると `aria-pressed` を出す。 */
  ariaPressed?: boolean
  /** 選択状態。`is-active` class を付けて視覚的な ON を示す（aria-pressed とは独立）。 */
  active?: boolean
}) {
  const { anchorProps, tooltip } = useFloatingTooltip(label)

  const buttonClassName = [
    className,
    HoverIconComponent ? 'has-hover-glyph' : '',
    active ? 'is-active' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const glyphLayers = (
    <>
      <PaneTablerIcon
        icon={IconComponent}
        size="sm"
        stroke={DEFAULT_STROKE}
        className="project-pane-icon-btn-glyph project-pane-icon-btn-glyph-base"
      />
      {HoverIconComponent ? (
        <PaneTablerIcon
          icon={HoverIconComponent}
          size="sm"
          stroke={DEFAULT_STROKE}
          className="project-pane-icon-btn-glyph project-pane-icon-btn-glyph-hover"
        />
      ) : null}
    </>
  )

  // enabled button は button 自身を tooltip anchor にする。
  // disabled button は pointer event を出さないため、wrapper span を anchor にする。
  const button = (
    <button
      type="button"
      className={buttonClassName}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-pressed={ariaPressed}
      {...(!disabled ? anchorProps : {})}
    >
      {glyphLayers}
    </button>
  )

  if (!disabled) {
    return (
      <>
        {button}
        {tooltip}
      </>
    )
  }

  return (
    <span className="project-pane-icon-btn-host" {...anchorProps}>
      {button}
      {tooltip}
    </span>
  )
}
