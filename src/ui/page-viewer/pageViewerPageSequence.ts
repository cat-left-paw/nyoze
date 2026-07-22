/**
 * Page Viewer の global page sequence adapter (pure)。
 *
 * PV-COL-4 / PV-COL-5 設計メモ:
 * - `PageViewModel.items` のうち `flow` / `synthetic` は CSS columns で実測される
 *   flow section、`fixedBlankPage` は `count` 枚の固定空白ページ slot として扱う。
 * - synthetic (`documentInfo` / `bookInfo` / `chapterInfo` / `toc`) も flow と同じ
 *   sequence kind (`'flow'`) で pageCount に参加する。専用 fixed page にはしない。
 * - 各 flow/synthetic section は `usePageViewerColumnLayout` が section ごとに測った
 *   pageCount を持つ。未計測時は 1 page として仮置きし、計測完了後に global
 *   pageCount を合算し直す。
 * - scrubber / keyboard は global page index だけを扱う。表示側は
 *   `resolvePageViewerPageLocation()` で `{ itemIndex, localPageIndex }` へ変換し、
 *   flow/synthetic なら local page transform、fixed blank なら local blank slot を表示する。
 * - `fixedBlankPage.count` は合算・分割せず、1 section = 1 sequence entry のまま
 *   pageCount=count として保持する。連続 blank-page も個別 entry のまま並ぶ。
 */

import type { PageViewItem } from '../../editor-core/io/pageModelView'

export type PageViewerSequenceEntryKind = 'flow' | 'fixedBlankPage' | 'fixedSyntheticPage'

export type PageViewerPageSequenceEntry = {
  kind: PageViewerSequenceEntryKind
  itemIndex: number
  sectionId: string
  startPageIndex: number
  pageCount: number
  endPageIndexExclusive: number
}

export type PageViewerPageSequence = {
  entries: readonly PageViewerPageSequenceEntry[]
  pageCount: number
}

export type PageViewerPageLocation = PageViewerPageSequenceEntry & {
  localPageIndex: number
}

export type PageViewerFlowPageCounts = Readonly<Record<string, number>>

function normalizePageCount(value: number | undefined, fallback = 1): number {
  if (!Number.isFinite(value) || value === undefined) return fallback
  return Math.max(1, Math.floor(value))
}

function pageCountForItem(item: PageViewItem, flowPageCounts: PageViewerFlowPageCounts): number {
  if (item.kind === 'fixedBlankPage') return normalizePageCount(item.count)
  if (item.kind === 'fixedSyntheticPage') return 1
  return normalizePageCount(flowPageCounts[item.sectionId])
}

function sequenceKindForItem(item: PageViewItem): PageViewerSequenceEntryKind {
  // synthetic (documentInfo / bookInfo / chapterInfo / toc) は CSS columns で
  // 測る flow と同じ kind。fixedBlankPage だけが専用 slot。
  if (item.kind === 'fixedBlankPage') return 'fixedBlankPage'
  if (item.kind === 'fixedSyntheticPage') return 'fixedSyntheticPage'
  return 'flow'
}

export function buildPageViewerPageSequence(
  items: readonly PageViewItem[],
  flowPageCounts: PageViewerFlowPageCounts = {},
): PageViewerPageSequence {
  const entries: PageViewerPageSequenceEntry[] = []
  let cursor = 0
  items.forEach((item, itemIndex) => {
    const pageCount = pageCountForItem(item, flowPageCounts)
    const entry: PageViewerPageSequenceEntry = {
      kind: sequenceKindForItem(item),
      itemIndex,
      sectionId: item.sectionId,
      startPageIndex: cursor,
      pageCount,
      endPageIndexExclusive: cursor + pageCount,
    }
    entries.push(entry)
    cursor += pageCount
  })
  return { entries, pageCount: Math.max(1, cursor) }
}

export function resolvePageViewerPageLocation(
  sequence: PageViewerPageSequence,
  globalPageIndex: number,
): PageViewerPageLocation | null {
  if (sequence.entries.length === 0) return null
  const clamped = Math.min(
    Math.max(Number.isFinite(globalPageIndex) ? Math.floor(globalPageIndex) : 0, 0),
    sequence.pageCount - 1,
  )
  const entry =
    sequence.entries.find(
      (candidate) =>
        clamped >= candidate.startPageIndex && clamped < candidate.endPageIndexExclusive,
    ) ?? sequence.entries[sequence.entries.length - 1]
  return {
    ...entry,
    localPageIndex: Math.min(Math.max(clamped - entry.startPageIndex, 0), entry.pageCount - 1),
  }
}
