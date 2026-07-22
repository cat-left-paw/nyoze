import type { MouseEvent as ReactMouseEvent } from 'react'
import type { UiLanguageMode } from '../../settings/types'
import { createUiTextGetter } from '../i18n/uiText'
import type { BookOutlineState } from '../hooks/useBookOutline'
import type {
  BookOutlineChapter,
  BookOutlineHeading,
  BookDisplayMeta,
} from '../../project/bookFullOutlineQuery'
import type { BookOutlineItem } from '../../project/bookOutlineTypes'
import { resolveVisibleBookHeadings } from '../utils/bookOutlineVisibility'
import {
  useOutlinePreviewTooltip,
  type UseOutlinePreviewTooltipResult,
} from '../hooks/useOutlinePreviewTooltip'

/**
 * Outline 拡張: Book全体Outline のビュー。
 *
 * 各章ファイルを仮想 root 見出し（章タイトル）として表示し、章内の Markdown 見出しを
 * root 配下にインデント表示する。章 root / 見出しは折りたたみでき（右ペイン表示だけを畳む
 * local fold）、現在開いている章とキャレット位置の見出しを強調する。
 * 章タイトル・見出しは button 化し、クリックで章 open / 見出し best-effort jump を起こす
 * （実処理は container 側）。仮想 root と fold は表示専用で、Markdown / 本文を書き換えない。
 *
 * 章 root / 見出しには、単文書 Outline と同じ操作感の preview 導線を持たせる:
 * 章 root は本文冒頭 excerpt、見出しは直後本文 excerpt を表示する。preview text は
 * model に precompute 済みの read-only 文字列で、ここでは本文を読み直さない。
 */

type BookOutlinePaneProps = {
  state: BookOutlineState
  uiLanguageMode: UiLanguageMode
  /** Source Mode / Paragraph Plain 編集中などナビゲーション不可のときボタンを無効化する。 */
  navigationDisabled: boolean
  /** 同一 Book 内の前章。無ければ null（ボタン無効）。 */
  previousChapter: BookOutlineItem | null
  /** 同一 Book 内の次章。無ければ null（ボタン無効）。 */
  nextChapter: BookOutlineItem | null
  /** 折りたたまれた章 root の relativePath 集合（表示専用）。 */
  foldedChapters: ReadonlySet<string>
  /** 折りたたまれた見出し key の集合（表示専用）。 */
  foldedHeadings: ReadonlySet<string>
  /**
   * 現在章でキャレットが属する見出しの headingIndex（best-effort）。
   * 照合不可なら null（章 root のみ強調）。current chapter 以外には適用しない。
   */
  currentActiveHeadingIndex: number | null
  onRefresh: () => void
  onToggleChapterFold: (relativePath: string) => void
  onToggleHeadingFold: (relativePath: string, headingIndex: number) => void
  /** openInNewTab=true（Shift+クリック）で別タブ、false で同じタブに切り替える。 */
  onOpenChapter: (chapter: BookOutlineChapter, openInNewTab: boolean) => void
  onJumpToHeading: (
    chapter: BookOutlineChapter,
    heading: BookOutlineHeading,
    openInNewTab: boolean,
  ) => void
  onGoToPreviousChapter: (openInNewTab: boolean) => void
  onGoToNextChapter: (openInNewTab: boolean) => void
}

type TextGetter = ReturnType<typeof createUiTextGetter>

/**
 * Book header の補助 tooltip。表示名は `displayName`。
 * manifest で正式 title / 別名が付いた場合だけ、正式 title と元 `book` key を控えめに添える。
 */
function bookHeaderTooltip(book: BookDisplayMeta): string | undefined {
  const lines: string[] = []
  if (book.title && book.title !== book.displayName) lines.push(book.title)
  if (book.book !== book.displayName) lines.push(`book: ${book.book}`)
  return lines.length > 0 ? lines.join('\n') : undefined
}

/** 単文書 Outline と同じ向きの fold chevron（表示専用）。 */
function FoldChevron({ folded }: { folded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {folded ? <path d="M9 6l6 6l-6 6" /> : <path d="M6 9l6 6l6 -6" />}
    </svg>
  )
}

/**
 * 単文書 Outline と同じ吹き出しアイコンの preview ボタン（表示専用）。
 * preview text が空のときは描画せず、無反応なボタンを残さない。
 * preview は read-only 表示なので navigationDisabled でも操作可能。
 */
function PreviewButton({
  previewKey,
  text,
  title,
  preview,
}: {
  previewKey: string
  text: string
  title: string
  preview: UseOutlinePreviewTooltipResult
}) {
  if (!text.trim()) return null
  return (
    <button
      type="button"
      className="outline-preview-btn"
      title={title}
      onMouseEnter={(event) => {
        event.stopPropagation()
        preview.openHover(previewKey, text, event)
      }}
      onMouseLeave={(event) => {
        event.stopPropagation()
        preview.scheduleCloseHover(previewKey)
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 9h8" />
        <path d="M8 13h6" />
        <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12" />
      </svg>
    </button>
  )
}

/** preview tooltip / context 判定で行を識別する安定キー。 */
function chapterPreviewKey(relativePath: string): string {
  return `chapter:${relativePath}`
}
function headingPreviewKey(relativePath: string, headingIndex: number): string {
  return `heading:${relativePath}:${headingIndex}`
}

export function BookOutlinePane({
  state,
  uiLanguageMode,
  navigationDisabled,
  previousChapter,
  nextChapter,
  foldedChapters,
  foldedHeadings,
  currentActiveHeadingIndex,
  onRefresh,
  onToggleChapterFold,
  onToggleHeadingFold,
  onOpenChapter,
  onJumpToHeading,
  onGoToPreviousChapter,
  onGoToNextChapter,
}: BookOutlinePaneProps) {
  const t = createUiTextGetter(uiLanguageMode)
  const preview = useOutlinePreviewTooltip()

  return (
    <div className="book-outline-pane">
      <div className="book-outline-toolbar">
        <span
          className="book-outline-toolbar-title"
          // 表示名は manifest displayName（無ければ `book` key fallback）。
          // 別名 / 正式 title が付いた場合だけ tooltip に補助表示する。
          title={state.kind === 'ready' ? bookHeaderTooltip(state.book) : undefined}
        >
          {state.kind === 'ready'
            ? `${t('bookOutline.bookLabel')}: ${state.book.displayName}`
            : t('bookOutline.title')}
        </span>
        <button
          type="button"
          className="book-outline-refresh"
          onClick={onRefresh}
          disabled={state.kind === 'loading'}
        >
          {t('bookOutline.refresh')}
        </button>
      </div>

      {/* 同一 Book 内の前後章移動。隣接章が無い / Source Mode / Paragraph Plain 中は disabled。 */}
      <div className="book-outline-chapter-nav">
        <button
          type="button"
          className="book-outline-nav-btn"
          onClick={(e) => onGoToPreviousChapter(e.shiftKey)}
          disabled={navigationDisabled || previousChapter === null}
          title={previousChapter ? previousChapter.title : undefined}
        >
          {t('bookOutline.previousChapter')}
        </button>
        <button
          type="button"
          className="book-outline-nav-btn"
          onClick={(e) => onGoToNextChapter(e.shiftKey)}
          disabled={navigationDisabled || nextChapter === null}
          title={nextChapter ? nextChapter.title : undefined}
        >
          {t('bookOutline.nextChapter')}
        </button>
      </div>

      {state.kind === 'loading' ? (
        <p className="pane-placeholder">{t('bookOutline.loading')}</p>
      ) : state.kind === 'unavailable' ? (
        <p className="pane-placeholder">{t('bookOutline.unavailable')}</p>
      ) : state.kind === 'not-in-project' ? (
        <p className="pane-placeholder">{t('bookOutline.notInProject')}</p>
      ) : state.kind === 'no-current-book' ? (
        <p className="pane-placeholder">{t('bookOutline.noCurrentBook')}</p>
      ) : state.kind === 'error' ? (
        <p className="pane-placeholder">{t('bookOutline.error')}</p>
      ) : state.chapters.length === 0 ? (
        <p className="pane-placeholder">{t('bookOutline.chaptersEmpty')}</p>
      ) : (
        <div className="book-outline-list">
          {state.chapters.map((chapter) => (
            <ChapterView
              key={chapter.relativePath}
              chapter={chapter}
              t={t}
              navigationDisabled={navigationDisabled}
              chapterFolded={foldedChapters.has(chapter.relativePath)}
              foldedHeadings={foldedHeadings}
              currentActiveHeadingIndex={chapter.isCurrent ? currentActiveHeadingIndex : null}
              preview={preview}
              onToggleChapterFold={onToggleChapterFold}
              onToggleHeadingFold={onToggleHeadingFold}
              onOpenChapter={onOpenChapter}
              onJumpToHeading={onJumpToHeading}
            />
          ))}
        </div>
      )}

      {preview.tooltip && (
        <div
          ref={preview.tooltipRef}
          className={`heading-fold-preview-tooltip${preview.tooltip.mode === 'context' ? ' outline-preview-tooltip' : ''}`}
          style={{ top: `${preview.tooltip.y}px`, left: `${preview.tooltip.x}px` }}
          onClick={preview.tooltip.mode === 'context' ? preview.handleTooltipClick : undefined}
          onContextMenu={
            preview.tooltip.mode === 'context' ? preview.handleTooltipContextMenu : undefined
          }
        >
          {preview.tooltip.text}
        </div>
      )}
    </div>
  )
}

function ChapterView({
  chapter,
  t,
  navigationDisabled,
  chapterFolded,
  foldedHeadings,
  currentActiveHeadingIndex,
  preview,
  onToggleChapterFold,
  onToggleHeadingFold,
  onOpenChapter,
  onJumpToHeading,
}: {
  chapter: BookOutlineChapter
  t: TextGetter
  navigationDisabled: boolean
  chapterFolded: boolean
  foldedHeadings: ReadonlySet<string>
  currentActiveHeadingIndex: number | null
  preview: UseOutlinePreviewTooltipResult
  onToggleChapterFold: (relativePath: string) => void
  onToggleHeadingFold: (relativePath: string, headingIndex: number) => void
  onOpenChapter: (chapter: BookOutlineChapter, openInNewTab: boolean) => void
  onJumpToHeading: (
    chapter: BookOutlineChapter,
    heading: BookOutlineHeading,
    openInNewTab: boolean,
  ) => void
}) {
  // fold は表示専用（中央本文に影響しない）ため Source Mode / Paragraph Plain 中も操作可能。
  const visibleHeadings = chapterFolded
    ? []
    : resolveVisibleBookHeadings(chapter.headings, chapter.relativePath, foldedHeadings)

  const chapterKey = chapterPreviewKey(chapter.relativePath)

  // 行の右クリックで context preview をトグルする（単文書 Outline と同操作）。
  const handleContextPreview = (
    key: string,
    text: string,
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    event.preventDefault()
    if (!text.trim()) return
    if (preview.isContextOpenFor(key)) {
      preview.close()
      return
    }
    preview.openContext(key, text, event)
  }

  return (
    <section
      className={`book-outline-chapter${chapter.isCurrent ? ' is-current' : ''}${chapter.missing ? ' is-missing' : ''}`}
    >
      <div
        className={`book-outline-chapter-root${chapter.isCurrent ? ' active' : ''}`}
        onContextMenu={(event) => handleContextPreview(chapterKey, chapter.preview, event)}
      >
        <button
          type="button"
          className={`outline-fold-btn${chapterFolded ? ' folded' : ''}`}
          onClick={() => onToggleChapterFold(chapter.relativePath)}
          title={chapterFolded ? t('workspace.outline.expand') : t('workspace.outline.collapse')}
        >
          <FoldChevron folded={chapterFolded} />
        </button>
        <button
          type="button"
          className="book-outline-chapter-title"
          title={chapter.relativePath}
          disabled={navigationDisabled || chapter.missing}
          onClick={(e) => onOpenChapter(chapter, e.shiftKey)}
        >
          {chapter.isCurrent ? (
            <span className="book-outline-current-badge">{t('bookOutline.currentBadge')}</span>
          ) : null}
          {chapter.title}
          {chapter.missing ? (
            <span className="registry-missing-badge">{t('registry.fileNotFound')}</span>
          ) : null}
        </button>
        {!chapter.missing ? (
          <PreviewButton
            previewKey={chapterKey}
            text={chapter.preview}
            title={t('bookOutline.chapterPreview')}
            preview={preview}
          />
        ) : null}
      </div>
      {chapterFolded ? null : chapter.headings.length === 0 ? (
        <p className="book-outline-chapter-empty">{t('bookOutline.noHeadings')}</p>
      ) : (
        <ul className="book-outline-headings">
          {visibleHeadings.map(({ heading, folded }) => {
            const key = headingPreviewKey(chapter.relativePath, heading.headingIndex)
            return (
              <li
                key={heading.headingIndex}
                className={`book-outline-heading-row${heading.headingIndex === currentActiveHeadingIndex ? ' active' : ''}`}
                onContextMenu={(event) => handleContextPreview(key, heading.preview, event)}
              >
                <button
                  type="button"
                  className={`outline-fold-btn${folded ? ' folded' : ''}`}
                  onClick={() => onToggleHeadingFold(chapter.relativePath, heading.headingIndex)}
                  title={folded ? t('workspace.outline.expand') : t('workspace.outline.collapse')}
                >
                  <FoldChevron folded={folded} />
                </button>
                <button
                  type="button"
                  className={`book-outline-heading-btn book-outline-level-${heading.level}`}
                  disabled={navigationDisabled || chapter.missing}
                  onClick={(e) => onJumpToHeading(chapter, heading, e.shiftKey)}
                >
                  {heading.text || `(H${heading.level})`}
                </button>
                <PreviewButton
                  previewKey={key}
                  text={heading.preview}
                  title={t('workspace.outline.preview')}
                  preview={preview}
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
