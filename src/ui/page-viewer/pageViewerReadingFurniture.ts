/**
 * PV-READ-2: Page Viewer 読書面 header/footer の表示内容 resolve。
 * CSS Columns metrics / reflow には触れない。正本: settings design §9.4。
 */

import {
  resolvePageViewerMetadataDisplay,
  type ResolvedPageViewerMetadataDisplay,
} from './pageViewerMetadataDisplay'
import type {
  PageViewerDocumentInfo,
  PageViewerMetadataDisplaySnapshot,
  PageViewerSnapshotPayload,
} from './pageViewerTypes'
import type { PageViewerReadingHeaderContent } from '../../settings/pageViewerReadingSurfaceSettings'

export type PageViewerReadingFurnitureHeaderSource = {
  title: string | null
  author: string | null
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * header に出す title / author を hard gate 付きで解決する。
 * - document: raw `documentInfo` のみ
 * - book: raw `bookInfo` のみ（chapterInfo / native window title は使わない）
 * - translator はいかなる条件でも出さない
 */
export function resolvePageViewerReadingFurnitureHeader(input: {
  kind: 'document' | 'book'
  documentInfo?: PageViewerDocumentInfo | null
  bookInfo?: PageViewerDocumentInfo | null
  metadataDisplay?: PageViewerMetadataDisplaySnapshot | null
  headerContent: PageViewerReadingHeaderContent
}): PageViewerReadingFurnitureHeaderSource {
  const display = resolvePageViewerMetadataDisplay(input.metadataDisplay)
  return resolveFurnitureHeaderFromDisplay({
    kind: input.kind,
    documentInfo: input.documentInfo,
    bookInfo: input.bookInfo,
    display,
    headerContent: input.headerContent,
  })
}

/** payload 全体から header source を取る便利 wrapper。 */
export function resolvePageViewerReadingFurnitureHeaderFromPayload(
  payload: {
    kind?: PageViewerSnapshotPayload['kind']
    documentInfo?: PageViewerDocumentInfo | null
    bookInfo?: PageViewerDocumentInfo | null
  } & PageViewerMetadataDisplaySnapshot,
  headerContent: PageViewerReadingHeaderContent,
): PageViewerReadingFurnitureHeaderSource {
  const kind = payload.kind === 'book' ? 'book' : 'document'
  return resolvePageViewerReadingFurnitureHeader({
    kind,
    documentInfo: payload.documentInfo,
    bookInfo: payload.bookInfo,
    metadataDisplay: {
      frontmatterVisible: payload.frontmatterVisible,
      frontmatterShowAuthors: payload.frontmatterShowAuthors,
      frontmatterShowTranslators: payload.frontmatterShowTranslators,
      frontmatterShowRoleLabels: payload.frontmatterShowRoleLabels,
      frontmatterShowInProjectFiles: payload.frontmatterShowInProjectFiles,
      frontmatterProjectShowTitle: payload.frontmatterProjectShowTitle,
      frontmatterProjectShowAuthors: payload.frontmatterProjectShowAuthors,
    },
    headerContent,
  })
}

function resolveFurnitureHeaderFromDisplay(input: {
  kind: 'document' | 'book'
  documentInfo?: PageViewerDocumentInfo | null
  bookInfo?: PageViewerDocumentInfo | null
  display: ResolvedPageViewerMetadataDisplay
  headerContent: PageViewerReadingHeaderContent
}): PageViewerReadingFurnitureHeaderSource {
  if (!input.display.frontmatterVisible) {
    return { title: null, author: null }
  }

  const info = input.kind === 'book' ? input.bookInfo : input.documentInfo
  const title = nonEmptyString(info?.title)
  const authorAllowed =
    input.headerContent === 'title-author' &&
    input.display.frontmatterShowAuthors
  const author = authorAllowed ? nonEmptyString(info?.author) : null
  return { title, author }
}

/**
 * footer の `現在 / 総ページ数`（1始まり）。metadata 非依存。
 * 不正値は安全側で `1 / 1`。
 */
export function formatPageViewerReadingFurnitureFooter(
  pageIndex: number,
  pageCount: number,
): string {
  const count =
    typeof pageCount === 'number' && Number.isFinite(pageCount) && pageCount > 0
      ? Math.floor(pageCount)
      : 1
  const maxIndex = Math.max(0, count - 1)
  const index =
    typeof pageIndex === 'number' && Number.isFinite(pageIndex)
      ? Math.min(Math.max(Math.floor(pageIndex), 0), maxIndex)
      : 0
  return `${index + 1} / ${count}`
}
