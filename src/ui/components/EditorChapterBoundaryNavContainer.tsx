import { useCallback } from 'react'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { useChapterNeighbors } from '../hooks/useChapterNeighbors'
import { useChapterFileNavigator, type ChapterOpenMode } from '../hooks/useChapterFileNavigator'
import { useEditorScrollEdges } from '../hooks/useEditorScrollEdges'
import { useScheduleEditorBoundaryScroll } from '../hooks/useScheduleEditorBoundaryScroll'
import { useEditorChapterBoundaryVisibility } from '../hooks/useEditorChapterBoundaryVisibility'
import { useEditorChapterBoundaryWheelNavigation } from '../hooks/useEditorChapterBoundaryWheelNavigation'
import { scrollEditorToBoundary } from '../utils/editorScrollBoundary'
import { EditorChapterBoundaryNav } from './EditorChapterBoundaryNav'
import { navigableChapterNeighbor } from '../../project/chapterNeighborsQuery'

/**
 * 中央エディタ章境界ナビゲーション（章頭=前章末尾・章末尾 / 章末=章先頭・次章 オーバーレイ）の wiring container。
 *
 * toolbar 前後章 / 右ペイン Book全体Outline と同じ helper / IPC / ナビゲーション flow を流用する。
 */

type LoadFileIntoTab = (
  filePath: string,
  title: string,
  content: string,
  savedStat: { mtimeMs: number; size: number } | null,
) => Promise<string | void>

type EditorChapterBoundaryNavContainerProps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  uiLanguageMode: UiLanguageMode
  writingMode: WritingMode
  getScrollHost: () => HTMLElement | null
  loadIntoActiveTab: LoadFileIntoTab
  openFileInTab: LoadFileIntoTab
  flushImeCompositionSideEffects: (reason: string) => void
  onTabLimit: () => void
  navigationDisabled: boolean
  /** IME composition 判定（EditorCoreHandle.isComposing()）。wheel ナビ gate に使う。 */
  getIsComposing: () => boolean
  projectRefreshNonce?: number
}

export function EditorChapterBoundaryNavContainer({
  getActiveFilePath,
  isInternalDoc,
  uiLanguageMode,
  writingMode,
  getScrollHost,
  loadIntoActiveTab,
  openFileInTab,
  flushImeCompositionSideEffects,
  onTabLimit,
  navigationDisabled,
  getIsComposing,
  projectRefreshNonce = 0,
}: EditorChapterBoundaryNavContainerProps) {
  const { chapterNeighborsState } = useChapterNeighbors({
    getActiveFilePath,
    isInternalDoc,
    refreshNonce: projectRefreshNonce,
  })

  const navigateToChapterFile = useChapterFileNavigator({
    loadIntoActiveTab,
    openFileInTab,
    flushImeCompositionSideEffects,
    onTabLimit,
    flushReason: 'editor-chapter-boundary-open',
  })

  const { scheduleBoundaryScroll } = useScheduleEditorBoundaryScroll({
    getScrollHost,
    getActiveFilePath,
    writingMode,
  })

  const previousChapter = navigableChapterNeighbor(
    chapterNeighborsState.kind === 'ready' ? chapterNeighborsState.previous : null,
  )
  const nextChapter = navigableChapterNeighbor(
    chapterNeighborsState.kind === 'ready' ? chapterNeighborsState.next : null,
  )

  const neighborsReady = chapterNeighborsState.kind === 'ready'
  const enabled = !navigationDisabled && neighborsReady
  const edges = useEditorScrollEdges({
    getScrollHost,
    enabled,
    vertical: writingMode === 'vertical-rl',
    resetKey: getActiveFilePath() ?? '',
  })

  const showChapterStart = edges.atEnd && !edges.atStart
  const showChapterEnd = edges.atStart && !edges.atEnd

  const canShowStartGroup = edges.atStart && Boolean(previousChapter || showChapterEnd)
  const canShowEndGroup = edges.atEnd && Boolean(showChapterStart || nextChapter)

  const {
    startGroupVisible,
    endGroupVisible,
    startGroupHandlers,
    endGroupHandlers,
  } = useEditorChapterBoundaryVisibility({
    getInteractionHost: () =>
      (getScrollHost()?.closest('.editor-panel') as HTMLElement | null) ?? null,
    enabled,
    writingMode,
    edges,
    eligibility: { canShowStartGroup, canShowEndGroup },
    resetKey: getActiveFilePath() ?? '',
  })

  // previous / next の共通 navigation callback。ボタン（通常=same-tab / Shift=new-tab）と
  // wheel（常に same-tab）が同じ flow（navigateToChapterFile + 成功時の boundary scroll 予約）を共有する。
  const goToPreviousChapter = useCallback(
    async (openMode: ChapterOpenMode) => {
      if (navigationDisabled || !previousChapter) return
      const result = await navigateToChapterFile(previousChapter.absolutePath, openMode)
      if (result === 'navigated') {
        scheduleBoundaryScroll({
          boundary: 'end',
          expectedFilePath: previousChapter.absolutePath,
        })
      }
    },
    [navigationDisabled, navigateToChapterFile, previousChapter, scheduleBoundaryScroll],
  )

  const goToNextChapter = useCallback(
    async (openMode: ChapterOpenMode) => {
      if (navigationDisabled || !nextChapter) return
      const result = await navigateToChapterFile(nextChapter.absolutePath, openMode)
      if (result === 'navigated') {
        scheduleBoundaryScroll({
          boundary: 'start',
          expectedFilePath: nextChapter.absolutePath,
        })
      }
    },
    [navigationDisabled, navigateToChapterFile, nextChapter, scheduleBoundaryScroll],
  )

  const handleGoToPreviousChapterEnd = useCallback(
    (openInNewTab: boolean) => {
      void goToPreviousChapter(openInNewTab ? 'new-tab' : 'same-tab')
    },
    [goToPreviousChapter],
  )

  const handleScrollToChapterStart = useCallback(() => {
    if (navigationDisabled) return
    const host = getScrollHost()
    scrollEditorToBoundary(host, writingMode, 'start')
    window.requestAnimationFrame(() => {
      scrollEditorToBoundary(getScrollHost(), writingMode, 'start')
    })
  }, [getScrollHost, navigationDisabled, writingMode])

  const handleScrollToChapterEnd = useCallback(() => {
    if (navigationDisabled) return
    const host = getScrollHost()
    scrollEditorToBoundary(host, writingMode, 'end')
    window.requestAnimationFrame(() => {
      scrollEditorToBoundary(getScrollHost(), writingMode, 'end')
    })
  }, [getScrollHost, navigationDisabled, writingMode])

  const handleGoToNextChapter = useCallback(
    (openInNewTab: boolean) => {
      void goToNextChapter(openInNewTab ? 'new-tab' : 'same-tab')
    },
    [goToNextChapter],
  )

  useEditorChapterBoundaryWheelNavigation({
    getScrollHost,
    getActiveFilePath,
    writingMode,
    navigationDisabled,
    neighborsReady,
    edges,
    hasPrevious: Boolean(previousChapter),
    hasNext: Boolean(nextChapter),
    getIsComposing,
    onNavigatePrevious: () => goToPreviousChapter('same-tab'),
    onNavigateNext: () => goToNextChapter('same-tab'),
  })

  return (
    <EditorChapterBoundaryNav
      uiLanguageMode={uiLanguageMode}
      writingMode={writingMode}
      navigationDisabled={navigationDisabled}
      previousChapter={edges.atStart ? previousChapter : null}
      nextChapter={edges.atEnd ? nextChapter : null}
      showChapterEnd={showChapterEnd}
      showChapterStart={showChapterStart}
      startGroupVisible={startGroupVisible}
      endGroupVisible={endGroupVisible}
      startGroupHandlers={startGroupHandlers}
      endGroupHandlers={endGroupHandlers}
      onGoToPreviousChapterEnd={handleGoToPreviousChapterEnd}
      onScrollToChapterStart={handleScrollToChapterStart}
      onScrollToChapterEnd={handleScrollToChapterEnd}
      onGoToNextChapter={handleGoToNextChapter}
    />
  )
}
