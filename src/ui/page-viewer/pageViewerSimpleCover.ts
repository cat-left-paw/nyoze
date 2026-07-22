/**
 * PV-READ-3B: Page Viewer簡易表紙のmetadata resolve。
 *
 * documentInfo / bookInfoの既存visibility filterを先に通し、そのうちtitle/author
 * だけを固定synthetic pageへ渡す。translator・chapterInfo・native window titleは
 * この層に入力しない。表紙が成立しないときだけ通常情報をそのまま返すため、
 * translator-only metadataを表紙設定ONで消さない。
 */

import type { PageSimpleCoverEntry } from '../../editor-core/io/pageModel'
import type { PageViewerDocumentInfo } from './pageViewerTypes'
import type { ResolvedPageViewerMetadataDisplay } from './pageViewerMetadataDisplay'
import { filterPageViewerDocumentInfo } from './pageViewerMetadataDisplay'

export type PageViewerSimpleCoverResolution = {
  simpleCover?: PageSimpleCoverEntry
  documentInfo?: PageViewerDocumentInfo
}

function nonBlank(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined
}

export function resolvePageViewerSimpleCover(input: {
  enabled: boolean
  info?: PageViewerDocumentInfo
  metadataDisplay: ResolvedPageViewerMetadataDisplay
}): PageViewerSimpleCoverResolution {
  const documentInfo = filterPageViewerDocumentInfo(input.info, input.metadataDisplay)
  if (!input.enabled || !documentInfo) return { documentInfo }

  const title = nonBlank(documentInfo.title)
  const author = nonBlank(documentInfo.author)
  if (!title && !author) return { documentInfo }

  return {
    simpleCover: {
      kind: 'simpleCover',
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
    },
  }
}
