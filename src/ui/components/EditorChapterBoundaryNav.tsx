import {
  IconChevronsDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronsUp,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import { useFloatingTooltip } from '../hooks/useFloatingTooltip'
import type { BookOutlineItem } from '../../project/bookOutlineTypes'

/**
 * 中央エディタ上の章境界ナビゲーション（表示専用オーバーレイ / presentational）。
 *
 * 章頭付近で「前章の末尾へ」「章の末尾へ」、章末付近で「章の先頭へ」「次章へ」を出す read-only ボタン。
 * 章解決 / open flow / スクロール端判定は {@link EditorChapterBoundaryNavContainer} 側が担う。
 *
 * tooltip は {@link useFloatingTooltip} 経由の `position: fixed` chip。
 */

const ICON_SIZE = 18
const ICON_STROKE = 1.1

type GroupPointerHandlers = {
  onPointerEnter: () => void
  onPointerLeave: () => void
  onPointerDown: () => void
}

function scheduleDeferredGroupLeave(
  group: HTMLElement,
  onLeave: () => void,
  event: ReactPointerEvent<HTMLElement>,
) {
  const related = event.relatedTarget
  if (related instanceof Node && group.contains(related)) return
  window.requestAnimationFrame(() => {
    if (group.matches(':hover')) return
    onLeave()
  })
}

type EditorChapterBoundaryNavProps = {
  uiLanguageMode: UiLanguageMode
  writingMode: WritingMode
  navigationDisabled: boolean
  /** 章頭付近で前章ありのときだけ非 null。 */
  previousChapter: BookOutlineItem | null
  /** 章末付近で次章ありのときだけ非 null。 */
  nextChapter: BookOutlineItem | null
  /** 章頭付近かつ末尾にいないときだけ true。 */
  showChapterEnd: boolean
  /** 章末付近かつ先頭にいないときだけ true。 */
  showChapterStart: boolean
  startGroupVisible: boolean
  endGroupVisible: boolean
  startGroupHandlers: GroupPointerHandlers
  endGroupHandlers: GroupPointerHandlers
  onGoToPreviousChapterEnd: (openInNewTab: boolean) => void
  onScrollToChapterStart: () => void
  onScrollToChapterEnd: () => void
  onGoToNextChapter: (openInNewTab: boolean) => void
}

function EditorChapterBoundaryNavButton({
  variant,
  icon: IconComponent,
  label,
  chapterTitle,
  tooltipHint,
  onClick,
  ignoreShiftKey = false,
  onPointerDownCapture,
  groupPointerHandlers,
}: {
  variant: 'prev' | 'chapter-end' | 'start' | 'next'
  icon: Icon
  label: string
  chapterTitle?: string
  /** 隣接章ボタンの tooltip 補足（Option/Alt + スクロールでも移動）。 */
  tooltipHint?: string
  onClick: (openInNewTab: boolean) => void
  ignoreShiftKey?: boolean
  onPointerDownCapture?: () => void
  groupPointerHandlers?: GroupPointerHandlers
}) {
  const baseLabel = chapterTitle ? `${label}: ${chapterTitle}` : label
  const tooltipLabel = tooltipHint ? `${baseLabel} · ${tooltipHint}` : baseLabel
  const { anchorProps, tooltip } = useFloatingTooltip(tooltipLabel)

  const handlePointerEnter = () => {
    anchorProps.onPointerEnter()
    groupPointerHandlers?.onPointerEnter()
  }

  const handlePointerLeave = (event: ReactPointerEvent<HTMLButtonElement>) => {
    anchorProps.onPointerLeave()
    const group = event.currentTarget.parentElement
    if (!group || !groupPointerHandlers) return
    scheduleDeferredGroupLeave(group, groupPointerHandlers.onPointerLeave, event)
  }

  return (
    <>
      <button
        type="button"
        className={`editor-chapter-boundary-btn is-${variant}`}
        tabIndex={-1}
        onClick={(e) => onClick(!ignoreShiftKey && e.shiftKey)}
        onPointerDownCapture={onPointerDownCapture}
        ref={anchorProps.ref}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocus={anchorProps.onFocus}
        onBlur={anchorProps.onBlur}
        aria-label={tooltipLabel}
      >
        <IconComponent size={ICON_SIZE} stroke={ICON_STROKE} />
        <span className="editor-chapter-boundary-label">{label}</span>
      </button>
      {tooltip}
    </>
  )
}

export function EditorChapterBoundaryNav({
  uiLanguageMode,
  writingMode,
  navigationDisabled,
  previousChapter,
  nextChapter,
  showChapterEnd,
  showChapterStart,
  startGroupVisible,
  endGroupVisible,
  startGroupHandlers,
  endGroupHandlers,
  onGoToPreviousChapterEnd,
  onScrollToChapterStart,
  onScrollToChapterEnd,
  onGoToNextChapter,
}: EditorChapterBoundaryNavProps) {
  if (navigationDisabled) return null
  if (!previousChapter && !nextChapter && !showChapterStart && !showChapterEnd) return null

  const t = createUiTextGetter(uiLanguageMode)
  const isVertical = writingMode === 'vertical-rl'
  const previousEndLabel = t('editor.chapterBoundary.previousEnd')
  const chapterEndLabel = t('editor.chapterBoundary.end')
  const chapterStartLabel = t('editor.chapterBoundary.start')
  const nextLabel = t('editor.chapterBoundary.next')
  // 隣接章へ移動する 2 ボタン（前章末尾 / 次章）だけ wheel 操作の補足を付ける。
  const wheelHint = t('editor.chapterBoundary.wheelHint')
  const PreviousEndIcon = isVertical ? IconChevronsRight : IconChevronsUp
  const ChapterEndIcon = isVertical ? IconChevronsLeft : IconChevronsDown
  const ChapterStartIcon = isVertical ? IconChevronsRight : IconChevronsUp
  const NextIcon = isVertical ? IconChevronsLeft : IconChevronsDown

  const showStartGroup = Boolean(previousChapter || showChapterEnd)
  const showEndGroup = Boolean(showChapterStart || nextChapter)

  return (
    <div className="editor-chapter-boundary-nav">
      {showStartGroup && (
        <div
          className={`editor-chapter-boundary-group is-at-start ${startGroupVisible ? 'is-visible' : 'is-hidden'}`}
          onPointerEnter={startGroupHandlers.onPointerEnter}
          onPointerLeave={(event) =>
            scheduleDeferredGroupLeave(event.currentTarget, startGroupHandlers.onPointerLeave, event)
          }
          onPointerDown={startGroupHandlers.onPointerDown}
        >
          {previousChapter && (
            <EditorChapterBoundaryNavButton
              variant="prev"
              icon={PreviousEndIcon}
              label={previousEndLabel}
              chapterTitle={previousChapter.title}
              tooltipHint={wheelHint}
              onClick={onGoToPreviousChapterEnd}
              onPointerDownCapture={startGroupHandlers.onPointerDown}
              groupPointerHandlers={startGroupHandlers}
            />
          )}
          {showChapterEnd && (
            <EditorChapterBoundaryNavButton
              variant="chapter-end"
              icon={ChapterEndIcon}
              label={chapterEndLabel}
              onClick={() => onScrollToChapterEnd()}
              ignoreShiftKey
              onPointerDownCapture={startGroupHandlers.onPointerDown}
              groupPointerHandlers={startGroupHandlers}
            />
          )}
        </div>
      )}
      {showEndGroup && (
        <div
          className={`editor-chapter-boundary-group is-at-end ${endGroupVisible ? 'is-visible' : 'is-hidden'}`}
          onPointerEnter={endGroupHandlers.onPointerEnter}
          onPointerLeave={(event) =>
            scheduleDeferredGroupLeave(event.currentTarget, endGroupHandlers.onPointerLeave, event)
          }
          onPointerDown={endGroupHandlers.onPointerDown}
        >
          {showChapterStart && (
            <EditorChapterBoundaryNavButton
              variant="start"
              icon={ChapterStartIcon}
              label={chapterStartLabel}
              onClick={() => onScrollToChapterStart()}
              ignoreShiftKey
              onPointerDownCapture={endGroupHandlers.onPointerDown}
              groupPointerHandlers={endGroupHandlers}
            />
          )}
          {nextChapter && (
            <EditorChapterBoundaryNavButton
              variant="next"
              icon={NextIcon}
              label={nextLabel}
              chapterTitle={nextChapter.title}
              tooltipHint={wheelHint}
              onClick={onGoToNextChapter}
              onPointerDownCapture={endGroupHandlers.onPointerDown}
              groupPointerHandlers={endGroupHandlers}
            />
          )}
        </div>
      )}
    </div>
  )
}
