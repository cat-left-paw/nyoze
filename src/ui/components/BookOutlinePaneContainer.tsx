import { useCallback, useEffect, useRef } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { useBookOutline } from '../hooks/useBookOutline'
import { useChapterNeighbors } from '../hooks/useChapterNeighbors'
import { useChapterFileNavigator } from '../hooks/useChapterFileNavigator'
import { useBookOutlineFold } from '../hooks/useBookOutlineFold'
import {
  resolveActiveBookHeadingIndex,
  resolveHeadingTargetPos,
  type DocumentHeading,
} from '../utils/bookOutlineNavigation'
import { BookOutlinePane } from './BookOutlinePane'
import type { BookOutlineChapter, BookOutlineHeading } from '../../project/bookFullOutlineQuery'
import type { BookOutlineItem } from '../../project/bookOutlineTypes'
import { navigableChapterNeighbor } from '../../project/chapterNeighborsQuery'

/**
 * Outline 拡張: Book全体Outline の wiring container（章 / 見出しナビゲーション付き）。
 *
 * App.tsx を薄く保つため、state hook と navigation flow をここへ閉じ込める。
 *
 * 境界:
 * - 通常クリックは同じタブへ読み込み（`loadIntoActiveTab`）、Shift+クリックは別タブで開く
 *   （`openFileInTab`）。dirty guard / save-before-close / Source Mode draft guard /
 *   paragraph-plain commit はどちらの既存経路にも委ねる（迂回しない）。
 * - 見出し位置の解決は read-only な best-effort（{@link resolveHeadingTargetPos}）。対象
 *   ファイルを書き換えない。解決済み project root は renderer から渡さない（hook が active file path だけ送る）。
 * - 同一ファイルなら開き直さず、見出しは core の scrollToPos で jump する。
 */
type LoadFileIntoTab = (
  filePath: string,
  title: string,
  content: string,
  savedStat: { mtimeMs: number; size: number } | null,
) => Promise<string | void>

type BookOutlinePaneContainerProps = {
  getActiveFilePath: () => string | null
  isInternalDoc: () => boolean
  uiLanguageMode: UiLanguageMode
  /** 通常クリック: 同じタブへ章を読み込む。 */
  loadIntoActiveTab: LoadFileIntoTab
  /** Shift+クリック: 別タブで章を開く。 */
  openFileInTab: LoadFileIntoTab
  flushImeCompositionSideEffects: (reason: string) => void
  onTabLimit: () => void
  /** 現在 doc の見出し（PM doc 由来）。open 直後の jump 解決・現在位置照合に使う。 */
  getDocumentHeadings: () => DocumentHeading[]
  /** 現在 doc でキャレットが属する見出しの index（PM doc 順）。現在位置ハイライトに使う。 */
  activeHeadingIndex: number
  /** 現在 doc 内の PM pos へ移動する（既存 outline と同じ経路）。 */
  scrollToPos: (pos: number) => void
  /** Paragraph Plain 編集中はナビゲーションを無効化（既存 document outline と同方針）。 */
  navigationDisabled: boolean
  /** Project Books v3 metadata 編集の保存後など、Outline / 前後章を再取得する nonce。 */
  projectRefreshNonce?: number
}

/** 開いた直後に見出しがまだ計算されていない場合の bounded retry。無限監視はしない。 */
const HEADING_JUMP_RETRY_MS = 60
const HEADING_JUMP_MAX_ATTEMPTS = 5

export function BookOutlinePaneContainer({
  getActiveFilePath,
  isInternalDoc,
  uiLanguageMode,
  loadIntoActiveTab,
  openFileInTab,
  flushImeCompositionSideEffects,
  onTabLimit,
  getDocumentHeadings,
  activeHeadingIndex,
  scrollToPos,
  navigationDisabled,
  projectRefreshNonce = 0,
}: BookOutlinePaneContainerProps) {
  const { bookOutlineState, refreshBookOutline } = useBookOutline({
    getActiveFilePath,
    isInternalDoc,
    refreshNonce: projectRefreshNonce,
  })
  // 前後章は見出し読み取りを伴わない軽量 query で別に取得する。
  const { chapterNeighborsState, refreshChapterNeighbors } = useChapterNeighbors({
    getActiveFilePath,
    isInternalDoc,
    refreshNonce: projectRefreshNonce,
  })
  // Book全体Outline の local fold state（右ペイン表示だけを畳む。保存しない）。
  const { foldedChapters, foldedHeadings, toggleChapterFold, toggleHeadingFold } =
    useBookOutlineFold()

  // 章ファイル移動は toolbar 前後章ボタンと同一の共有 navigator を使う。
  // 通常クリック=同じタブ、Shift+クリック=別タブ。
  const navigateToChapterFile = useChapterFileNavigator({
    loadIntoActiveTab,
    openFileInTab,
    flushImeCompositionSideEffects,
    onTabLimit,
    flushReason: 'book-outline-open-file',
  })

  const pendingJumpRef = useRef<number | null>(null)
  const cancelPendingJump = useCallback(() => {
    if (pendingJumpRef.current !== null) {
      window.clearTimeout(pendingJumpRef.current)
      pendingJumpRef.current = null
    }
  }, [])
  useEffect(() => cancelPendingJump, [cancelPendingJump])

  // open 直後など、見出しがまだ無いときは短い bounded retry で best-effort に jump する。
  const tryScrollToHeading = useCallback(
    (target: BookOutlineHeading, attemptsLeft: number) => {
      const headings = getDocumentHeadings()
      const pos = resolveHeadingTargetPos(headings, target)
      if (pos !== null) {
        scrollToPos(pos)
        return
      }
      if (attemptsLeft <= 0) return
      pendingJumpRef.current = window.setTimeout(() => {
        pendingJumpRef.current = null
        tryScrollToHeading(target, attemptsLeft - 1)
      }, HEADING_JUMP_RETRY_MS)
    },
    [getDocumentHeadings, scrollToPos],
  )

  // 別ファイルを共有 navigator で開き、target があれば移動成功後に best-effort jump する。
  // openInNewTab=false: 同じタブへ読み込み / true: 別タブで open。
  const openChapterFile = useCallback(
    async (absolutePath: string, target: BookOutlineHeading | null, openInNewTab: boolean) => {
      cancelPendingJump()
      const result = await navigateToChapterFile(
        absolutePath,
        openInNewTab ? 'new-tab' : 'same-tab',
      )
      // cancelled / tab-limit / 読込失敗時は jump しない。navigated のときだけ jump する。
      if (result !== 'navigated') return
      if (target) tryScrollToHeading(target, HEADING_JUMP_MAX_ATTEMPTS)
    },
    [cancelPendingJump, navigateToChapterFile, tryScrollToHeading],
  )

  const isSameFile = useCallback(
    (absolutePath: string) => getActiveFilePath() === absolutePath,
    [getActiveFilePath],
  )

  // 章タイトルクリック: 同一ファイルなら章先頭付近へ、別ファイルは通常=同タブ / Shift=別タブで開く。
  const handleOpenChapter = useCallback(
    (chapter: BookOutlineChapter, openInNewTab: boolean) => {
      if (navigationDisabled || chapter.missing) return
      if (isSameFile(chapter.absolutePath)) {
        cancelPendingJump()
        scrollToPos(0)
        return
      }
      void openChapterFile(chapter.absolutePath, null, openInNewTab)
    },
    [navigationDisabled, isSameFile, cancelPendingJump, scrollToPos, openChapterFile],
  )

  // 見出しクリック: 同一ファイルなら即 jump、別ファイルは通常=同タブ / Shift=別タブで開いてから best-effort jump。
  const handleJumpToHeading = useCallback(
    (chapter: BookOutlineChapter, heading: BookOutlineHeading, openInNewTab: boolean) => {
      if (navigationDisabled || chapter.missing) return
      if (isSameFile(chapter.absolutePath)) {
        cancelPendingJump()
        const pos = resolveHeadingTargetPos(getDocumentHeadings(), heading)
        if (pos !== null) scrollToPos(pos)
        return
      }
      void openChapterFile(chapter.absolutePath, heading, openInNewTab)
    },
    [
      navigationDisabled,
      isSameFile,
      cancelPendingJump,
      getDocumentHeadings,
      scrollToPos,
      openChapterFile,
    ],
  )

  // 前後章: 必ず別ファイル（current は隣接に出てこない）。通常=同タブ / Shift=別タブ。
  const previousChapter = navigableChapterNeighbor(
    chapterNeighborsState.kind === 'ready' ? chapterNeighborsState.previous : null,
  )
  const nextChapter = navigableChapterNeighbor(
    chapterNeighborsState.kind === 'ready' ? chapterNeighborsState.next : null,
  )

  const handleGoToChapter = useCallback(
    (chapter: BookOutlineItem | null, openInNewTab: boolean) => {
      if (navigationDisabled || !chapter) return
      void openChapterFile(chapter.absolutePath, null, openInNewTab)
    },
    [navigationDisabled, openChapterFile],
  )

  const handleRefresh = useCallback(() => {
    void refreshBookOutline()
    void refreshChapterNeighbors()
  }, [refreshBookOutline, refreshChapterNeighbors])

  // 現在位置ハイライト: 現在開いている章内だけで、キャレットが属する見出しを best-effort 照合する。
  // 別章の見出しを誤って active にしないよう、current chapter の見出し配列にのみ適用する。
  const currentChapter =
    bookOutlineState.kind === 'ready'
      ? bookOutlineState.chapters.find((chapter) => chapter.isCurrent) ?? null
      : null
  const currentActiveHeadingIndex = currentChapter
    ? resolveActiveBookHeadingIndex(
        getDocumentHeadings(),
        activeHeadingIndex,
        currentChapter.headings,
      )
    : null

  return (
    <BookOutlinePane
      state={bookOutlineState}
      uiLanguageMode={uiLanguageMode}
      navigationDisabled={navigationDisabled}
      previousChapter={previousChapter}
      nextChapter={nextChapter}
      foldedChapters={foldedChapters}
      foldedHeadings={foldedHeadings}
      currentActiveHeadingIndex={currentActiveHeadingIndex}
      onRefresh={handleRefresh}
      onToggleChapterFold={toggleChapterFold}
      onToggleHeadingFold={toggleHeadingFold}
      onOpenChapter={handleOpenChapter}
      onJumpToHeading={handleJumpToHeading}
      onGoToPreviousChapter={(openInNewTab) => handleGoToChapter(previousChapter, openInNewTab)}
      onGoToNextChapter={(openInNewTab) => handleGoToChapter(nextChapter, openInNewTab)}
    />
  )
}
