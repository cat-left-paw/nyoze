/**
 * PV-SET-2: Page Viewer 向け metadata field visibility の resolve / filter。
 *
 * 正本は settings.json の既存 frontmatter* key。
 * - 共有 4 key: documentInfo / bookInfo / credit prefix
 * - Project-file 3 key: Book Viewer の chapterInfo 表示可否と章タイトル / 著者だけ
 *   （bookInfo / 単独 documentInfo には流用しない）
 * role labels は PageModel ではなく renderer 側で prefix を切替える。
 */

import type { PageModelChapterInfo } from '../../editor-core/io/pageModel'
import {
  DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS,
  DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE,
  DEFAULT_FRONTMATTER_SHOW_AUTHORS,
  DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES,
  DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS,
  DEFAULT_FRONTMATTER_SHOW_TRANSLATORS,
  DEFAULT_FRONTMATTER_VISIBLE,
} from '../../settings/defaults'
import type {
  PageViewerBookChapterSnapshot,
  PageViewerDocumentInfo,
  PageViewerMetadataDisplaySnapshot,
} from './pageViewerTypes'

/** 省略時 fallback 済みの metadata display（すべて boolean）。 */
export type ResolvedPageViewerMetadataDisplay = {
  frontmatterVisible: boolean
  frontmatterShowAuthors: boolean
  frontmatterShowTranslators: boolean
  frontmatterShowRoleLabels: boolean
  frontmatterShowInProjectFiles: boolean
  frontmatterProjectShowTitle: boolean
  frontmatterProjectShowAuthors: boolean
}

function resolveOptionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * payload / partial snapshot から Display Settings と同じ既定値へ解決する。
 * IPC validator 通過後の省略 field もここで埋める。
 */
export function resolvePageViewerMetadataDisplay(
  input?: PageViewerMetadataDisplaySnapshot | null,
): ResolvedPageViewerMetadataDisplay {
  return {
    frontmatterVisible: resolveOptionalBoolean(input?.frontmatterVisible, DEFAULT_FRONTMATTER_VISIBLE),
    frontmatterShowAuthors: resolveOptionalBoolean(
      input?.frontmatterShowAuthors,
      DEFAULT_FRONTMATTER_SHOW_AUTHORS,
    ),
    frontmatterShowTranslators: resolveOptionalBoolean(
      input?.frontmatterShowTranslators,
      DEFAULT_FRONTMATTER_SHOW_TRANSLATORS,
    ),
    frontmatterShowRoleLabels: resolveOptionalBoolean(
      input?.frontmatterShowRoleLabels,
      DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS,
    ),
    frontmatterShowInProjectFiles: resolveOptionalBoolean(
      input?.frontmatterShowInProjectFiles,
      DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES,
    ),
    frontmatterProjectShowTitle: resolveOptionalBoolean(
      input?.frontmatterProjectShowTitle,
      DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE,
    ),
    frontmatterProjectShowAuthors: resolveOptionalBoolean(
      input?.frontmatterProjectShowAuthors,
      DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS,
    ),
  }
}

/**
 * documentInfo / bookInfo 用。master off なら `undefined`（synthetic section を作らない）。
 * authors / translators off は該当 field を落とす（空なら後段 blank 判定で section 無し）。
 * Project-file 3 key はここでは見ない。
 */
export function filterPageViewerDocumentInfo(
  info: PageViewerDocumentInfo | undefined,
  display: ResolvedPageViewerMetadataDisplay,
): PageViewerDocumentInfo | undefined {
  if (!display.frontmatterVisible) return undefined
  if (!info) return undefined

  const next: PageViewerDocumentInfo = {}
  if (info.title !== undefined) next.title = info.title
  if (display.frontmatterShowAuthors && info.author !== undefined) {
    next.author = info.author
  }
  if (display.frontmatterShowTranslators && info.translator !== undefined) {
    next.translator = info.translator
  }
  return next
}

/** Book Viewer で chapterInfo synthetic section を出すか。 */
export function shouldIncludePageViewerChapterInfo(
  display: ResolvedPageViewerMetadataDisplay,
): boolean {
  return display.frontmatterVisible && display.frontmatterShowInProjectFiles
}

/**
 * Book chapterInfo 用の表示専用 metadata。
 * canonical な `PageModelChapterInput`（anchor label）は書き換えない。
 *
 * - title: `frontmatterProjectShowTitle`
 * - authors: `frontmatterShowAuthors && frontmatterProjectShowAuthors`
 * - translators: `frontmatterShowTranslators`
 */
export function buildPageViewerChapterInfoDisplay(
  chapter: Pick<PageViewerBookChapterSnapshot, 'title' | 'authors' | 'translators'>,
  display: ResolvedPageViewerMetadataDisplay,
): PageModelChapterInfo {
  const info: PageModelChapterInfo = {}
  if (display.frontmatterProjectShowTitle && chapter.title !== undefined) {
    info.title = chapter.title
  }
  if (
    display.frontmatterShowAuthors &&
    display.frontmatterProjectShowAuthors &&
    chapter.authors !== undefined
  ) {
    info.authors = chapter.authors
  }
  if (display.frontmatterShowTranslators && chapter.translators !== undefined) {
    info.translators = chapter.translators
  }
  return info
}

/**
 * @deprecated Prefer `buildPageViewerChapterInfoDisplay` for chapterInfo display
 * without mutating canonical chapter snapshot / PageModelChapterInput.
 * authors / translators だけを strip する（title は触らない — anchor label 保護）。
 */
export function filterPageViewerBookChapterMeta(
  chapter: PageViewerBookChapterSnapshot,
  display: ResolvedPageViewerMetadataDisplay,
): PageViewerBookChapterSnapshot {
  const displayInfo = buildPageViewerChapterInfoDisplay(chapter, display)
  return {
    ...chapter,
    authors: displayInfo.authors,
    translators: displayInfo.translators,
  }
}

/** open-time snapshot 組み立て用（launcher → payload / Book request）。 */
export function buildPageViewerMetadataDisplaySnapshot(input: {
  frontmatterVisible: boolean
  frontmatterShowAuthors: boolean
  frontmatterShowTranslators: boolean
  frontmatterShowRoleLabels: boolean
  /** Book launcher が渡す。active document は省略可（Viewer 側 default fallback）。 */
  frontmatterShowInProjectFiles?: boolean
  frontmatterProjectShowTitle?: boolean
  frontmatterProjectShowAuthors?: boolean
}): PageViewerMetadataDisplaySnapshot {
  const snapshot: PageViewerMetadataDisplaySnapshot = {
    frontmatterVisible: input.frontmatterVisible,
    frontmatterShowAuthors: input.frontmatterShowAuthors,
    frontmatterShowTranslators: input.frontmatterShowTranslators,
    frontmatterShowRoleLabels: input.frontmatterShowRoleLabels,
  }
  if (typeof input.frontmatterShowInProjectFiles === 'boolean') {
    snapshot.frontmatterShowInProjectFiles = input.frontmatterShowInProjectFiles
  }
  if (typeof input.frontmatterProjectShowTitle === 'boolean') {
    snapshot.frontmatterProjectShowTitle = input.frontmatterProjectShowTitle
  }
  if (typeof input.frontmatterProjectShowAuthors === 'boolean') {
    snapshot.frontmatterProjectShowAuthors = input.frontmatterProjectShowAuthors
  }
  return snapshot
}
