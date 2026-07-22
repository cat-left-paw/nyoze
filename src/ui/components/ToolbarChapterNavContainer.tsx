import { useCallback } from 'react'
import type { UiLanguageMode, WritingMode } from '../../settings/types'
import { useChapterNeighbors } from '../hooks/useChapterNeighbors'
import { useChapterFileNavigator } from '../hooks/useChapterFileNavigator'
import { ToolbarChapterNav } from './ToolbarChapterNav'
import type { BookOutlineItem } from '../../project/bookOutlineTypes'
import { navigableChapterNeighbor } from '../../project/chapterNeighborsQuery'

/**
 * エディタ上部 toolbar 前後章ナビゲーションの wiring container。
 *
 * 右ペイン Book全体Outline の前後章（{@link BookOutlinePaneContainer}）と同じ
 * helper / IPC / ナビゲーション flow を流用する:
 * - 前後章の判定: {@link useChapterNeighbors}（IPC `project:resolveChapterNeighbors`、
 *   見出し読み取りを伴わない軽量 frontmatter scan）。
 * - 章移動: {@link useChapterFileNavigator}（通常クリック=`loadIntoActiveTab` で同じタブ、
 *   Shift+クリック=`openFileInTab` で別タブ）。
 *
 * 境界:
 * - renderer から解決済み project root を渡さない（hook が active file path だけ送る）。
 * - dirty guard / save-before-close / Source Mode draft guard / paragraph-plain commit は
 *   loadIntoActiveTab / openFileInTab 側に委ねる（迂回しない）。tab-limit / cancelled 時は移動しない。
 * - Source Mode / Paragraph Plain 編集中（navigationDisabled）は移動を無効化する。
 * - read-only。保存 / frontmatter 書き込みをしない。
 */

type LoadFileIntoTab = (
  filePath: string,
  title: string,
  content: string,
  savedStat: { mtimeMs: number; size: number } | null,
) => Promise<string | void>

type ToolbarChapterNavContainerProps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  uiLanguageMode: UiLanguageMode
  writingMode: WritingMode
  /** 通常クリック: 同じタブへ章を読み込む。 */
  loadIntoActiveTab: LoadFileIntoTab
  /** Shift+クリック: 別タブで章を開く。 */
  openFileInTab: LoadFileIntoTab
  flushImeCompositionSideEffects: (reason: string) => void
  onTabLimit: () => void
  /** Source Mode / Paragraph Plain 編集中はナビゲーションを無効化する。 */
  navigationDisabled: boolean
  /** Project Books v3 metadata 編集の保存後など、前後章を再取得する nonce。 */
  projectRefreshNonce?: number
}

export function ToolbarChapterNavContainer({
  getActiveFilePath,
  isInternalDoc,
  uiLanguageMode,
  writingMode,
  loadIntoActiveTab,
  openFileInTab,
  flushImeCompositionSideEffects,
  onTabLimit,
  navigationDisabled,
  projectRefreshNonce = 0,
}: ToolbarChapterNavContainerProps) {
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
    flushReason: 'toolbar-chapter-nav-open',
  })

  const previousChapter = navigableChapterNeighbor(
    chapterNeighborsState.kind === 'ready' ? chapterNeighborsState.previous : null,
  )
  const nextChapter = navigableChapterNeighbor(
    chapterNeighborsState.kind === 'ready' ? chapterNeighborsState.next : null,
  )

  const handleGoToChapter = useCallback(
    (chapter: BookOutlineItem | null, openInNewTab: boolean) => {
      if (navigationDisabled || !chapter) return
      void navigateToChapterFile(chapter.absolutePath, openInNewTab ? 'new-tab' : 'same-tab')
    },
    [navigationDisabled, navigateToChapterFile],
  )

  return (
    <ToolbarChapterNav
      uiLanguageMode={uiLanguageMode}
      writingMode={writingMode}
      previousChapter={previousChapter}
      nextChapter={nextChapter}
      navigationDisabled={navigationDisabled}
      onGoToPreviousChapter={(openInNewTab) => handleGoToChapter(previousChapter, openInNewTab)}
      onGoToNextChapter={(openInNewTab) => handleGoToChapter(nextChapter, openInNewTab)}
    />
  )
}
