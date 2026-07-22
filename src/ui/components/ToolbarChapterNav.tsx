import {
  IconChevronsDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronsUp,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import { useFloatingTooltip } from '../hooks/useFloatingTooltip'
import type { BookOutlineItem } from '../../project/bookOutlineTypes'

/**
 * エディタ上部 toolbar の前章 / 次章ボタン（presentational）。
 *
 * 同一 Book 内の隣接 body 章へ移動するための常設ボタン。実際の章解決 / open flow は
 * {@link ToolbarChapterNavContainer} 側で行い、ここは表示と disabled 判定だけを担う。
 *
 * disabled 条件（右ペイン Book全体Outline の前後章ボタンと同方針）:
 * - 隣接章が無い（previousChapter / nextChapter が null）。
 *   not-in-project / no-current-book / 資料ファイル / 読込失敗時は container 側で null に畳まれる。
 * - Source Mode / Paragraph Plain 編集中（navigationDisabled）。
 *
 * 方向アイコン / 並び順は本文のスクロール方向に合わせる:
 * - 縦書き（vertical-rl、右→左スクロール）: 次章 = `<<`（左）、前章 = `>>`（右）。
 *   前進（次章）が左側に来るよう、次章ボタンを左、前章ボタンを右に並べる。
 * - 横書き（上→下スクロール）: 前章 = `↑`、次章 = `↓`。前章を左、次章を右に並べる。
 *
 * tooltip は {@link useFloatingTooltip} 経由の `position: fixed` chip。pane / window 端で
 * clip されないよう CSS 疑似要素 tooltip は使わない（disabled 時も従来どおり非表示）。
 */

const ICON_SIZE = 18
const ICON_STROKE = 1.1

type ToolbarChapterNavProps = {
  uiLanguageMode: UiLanguageMode
  writingMode: WritingMode
  previousChapter: BookOutlineItem | null
  nextChapter: BookOutlineItem | null
  navigationDisabled: boolean
  /** openInNewTab=true（Shift+クリック）で別タブ、false で同じタブに切り替える。 */
  onGoToPreviousChapter: (openInNewTab: boolean) => void
  onGoToNextChapter: (openInNewTab: boolean) => void
}

function ToolbarChapterNavButton({
  icon: IconComponent,
  ariaLabel,
  tooltipLabel,
  disabled,
  onClick,
}: {
  icon: Icon
  ariaLabel: string
  tooltipLabel: string
  disabled: boolean
  onClick: (openInNewTab: boolean) => void
}) {
  const { anchorProps, tooltip } = useFloatingTooltip(disabled ? '' : tooltipLabel)

  const button = (
    <button
      className="toolbar-btn-icon-only"
      type="button"
      tabIndex={-1}
      onClick={(e) => onClick(e.shiftKey)}
      disabled={disabled}
      aria-label={ariaLabel}
      {...(!disabled ? anchorProps : {})}
    >
      <IconComponent size={ICON_SIZE} stroke={ICON_STROKE} />
    </button>
  )

  return (
    <>
      {button}
      {tooltip}
    </>
  )
}

export function ToolbarChapterNav({
  uiLanguageMode,
  writingMode,
  previousChapter,
  nextChapter,
  navigationDisabled,
  onGoToPreviousChapter,
  onGoToNextChapter,
}: ToolbarChapterNavProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const isVertical = writingMode === 'vertical-rl'
  const previousLabel = t('editor.previousChapter')
  const nextLabel = t('editor.nextChapter')
  const previousDisabled = navigationDisabled || previousChapter === null
  const nextDisabled = navigationDisabled || nextChapter === null
  // 縦書きは右方向 / 横書きは上方向が「前」、縦書きは左方向 / 横書きは下方向が「次」。
  const PreviousIcon = isVertical ? IconChevronsRight : IconChevronsUp
  const NextIcon = isVertical ? IconChevronsLeft : IconChevronsDown

  const previousButton = (
    <ToolbarChapterNavButton
      key="previous"
      icon={PreviousIcon}
      ariaLabel={previousLabel}
      tooltipLabel={
        previousChapter ? `${previousLabel}: ${previousChapter.title}` : previousLabel
      }
      disabled={previousDisabled}
      onClick={onGoToPreviousChapter}
    />
  )
  const nextButton = (
    <ToolbarChapterNavButton
      key="next"
      icon={NextIcon}
      ariaLabel={nextLabel}
      tooltipLabel={nextChapter ? `${nextLabel}: ${nextChapter.title}` : nextLabel}
      disabled={nextDisabled}
      onClick={onGoToNextChapter}
    />
  )

  // 縦書きは前進（次章）が左側＝スクロール方向。横書きは従来どおり前→次の順。
  return <>{isVertical ? [nextButton, previousButton] : [previousButton, nextButton]}</>
}
