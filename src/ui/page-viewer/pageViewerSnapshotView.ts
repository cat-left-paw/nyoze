/**
 * `PageViewerSnapshotPayload` (window 間で受け渡した serializable な Markdown
 * snapshot) から、viewer window 自身が `parseMarkdown → PageModel →
 * PageViewModel` を組み立てる pure helper。
 *
 * `PMNode` / `PageViewModel` は window 間 IPC で直接渡さない、という設計制約の
 * 実体がここにある: main は `markdown` 文字列だけを渡し、viewer window 側 (この
 * module) が自分の schema で parse し直す。
 *
 * React / DOM CSS には依存しない (`PageViewerWindowRoot.tsx` から import して使う
 * ロジックだけを切り出してあるので、unit test からも直接呼べる)。
 */

import { getSchema } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { buildExtensions } from '../../editor-core/extensions/buildExtensions'
import { splitLeadingFrontmatter } from '../../editor-core/io/frontmatter'
import { parseMarkdown } from '../../editor-core/io/parseMarkdown'
import { buildPageModelFromBookChapters, buildPageModelFromTopLevelBlocksWithOptions } from '../../editor-core/io/pageModel'
import { buildPageModelChapterInputsFromSources } from '../../editor-core/io/pageModelBookInput'
import { buildPageViewModel, type PageViewModel } from '../../editor-core/io/pageModelView'
import type { PageViewerBookSnapshotRequest, PageViewerSnapshotPayload } from './pageViewerTypes'
import {
  buildPageViewerChapterInfoDisplay,
  resolvePageViewerMetadataDisplay,
  shouldIncludePageViewerChapterInfo,
} from './pageViewerMetadataDisplay'
import { resolvePageViewerSimpleCover } from './pageViewerSimpleCover'

// PageModel 組み立てには schema だけが必要 (TipTap Editor インスタンスは不要)。
// モジュール読み込み時に一度だけ作る (viewer window は 1 snapshot につき 1 回しか
// 使わないが、schema 構築自体は毎回行うほど軽くはないため使い回す)。
const pageViewerSchema = getSchema(buildExtensions())

function topLevelBlocksFromMarkdown(markdown: string): PMNode[] {
  // エディタ本体 (EditorCore.loadMarkdown 等) は leading YAML frontmatter を
  // 本文から分離してから parse する前提。snapshot の `markdown` はエディタの
  // 生 markdown (frontmatter 込み) をそのまま渡してくる想定なので、ここでも
  // 同じ分離を行ってから parse する。省略すると `title:` / `author:` 等の
  // frontmatter 行がそのまま本文段落として表示されてしまう。
  const { body } = splitLeadingFrontmatter(markdown)
  const doc = parseMarkdown(pageViewerSchema, body, 'obsidian-paragraph')
  const blocks: PMNode[] = []
  doc.forEach((child) => blocks.push(child))
  return blocks
}

function buildBookPageViewModelFromSnapshot(
  payload: PageViewerSnapshotPayload & PageViewerBookSnapshotRequest,
): PageViewModel {
  const metadataDisplay = resolvePageViewerMetadataDisplay(payload)
  const coverResolution = resolvePageViewerSimpleCover({
    enabled: payload.pageViewerReadingSimpleCoverEnabled === true,
    info: payload.bookInfo,
    metadataDisplay,
  })
  // canonical chapter input（v3 title / authors / translators）は filter しない。
  // chapterInfo の表示値だけを別経路で組み立て、anchor label を守る。
  const chapterInputs = buildPageModelChapterInputsFromSources(payload.chapters, pageViewerSchema)
  if (chapterInputs.kind !== 'ok') {
    throw new Error('Book Page Viewer snapshot contains missing chapters')
  }

  const includeBookInfo = metadataDisplay.frontmatterVisible && !coverResolution.simpleCover
  const includeChapterInfo = shouldIncludePageViewerChapterInfo(metadataDisplay)
  const chapterInfos = includeChapterInfo
    ? payload.chapters.map((chapter) => buildPageViewerChapterInfoDisplay(chapter, metadataDisplay))
    : undefined

  const model = buildPageModelFromBookChapters(chapterInputs.chapters, pageViewerSchema, {
    includeBookInfo,
    bookInfo: includeBookInfo ? coverResolution.documentInfo : undefined,
    simpleCover: coverResolution.simpleCover,
    includeChapterInfo,
    chapterInfos,
    includeTableOfContents: true,
    tableOfContentsMaxLevel: payload.tableOfContentsMaxLevel,
    // PV-SET-4A: 通常 Book Viewer にも読書用 heading pagination default を適用する
    // (Book Composer の章間改ページ・章扉とは無関係。既存の章境界 page-break
    // semantics は変更しない)。
    pageBreakBeforeHeading: payload.pageViewerBreakBeforeHeading === true,
    pageBreakBeforeHeadingMaxLevel: payload.pageViewerBreakBeforeHeadingMaxLevel,
  })
  return buildPageViewModel(model)
}

/**
 * snapshot payload の `markdown` から leading frontmatter を除いた本文を parse し、
 * `documentInfo` / TOC の synthetic section を添えて `PageViewModel` を組み立てる。
 *
 * `includeTableOfContents` は Page Viewer snapshot 専用。export options とは混ぜない。
 * 省略時 / `false` のときは TOC section を出さない (PageModel 既定と同じ)。
 *
 * PV-SET-2: metadata field visibility は PageModel 組み立て前に filter する。
 * role labels は renderer 側で扱う（ここでは触らない）。
 * Project-file 3 key は Book chapterInfo にだけ効き、documentInfo には影響しない。
 *
 * PV-SET-4A: `payload.pageViewerBreakBeforeHeading` / `pageViewerBreakBeforeHeadingMaxLevel`
 * は active document / Book 全体の両方で `PageModel` の見出し前改ページ option へ
 * そのまま渡す。省略時 / `false` のときは既存の断片化ルール (`:::page-break` /
 * 章境界) だけが残る。
 */
export function buildPageViewModelFromSnapshot(payload: PageViewerSnapshotPayload): PageViewModel {
  if (payload.kind === 'book') {
    return buildBookPageViewModelFromSnapshot(payload)
  }

  const metadataDisplay = resolvePageViewerMetadataDisplay(payload)
  const coverResolution = resolvePageViewerSimpleCover({
    enabled: payload.pageViewerReadingSimpleCoverEnabled === true,
    info: payload.documentInfo,
    metadataDisplay,
  })
  const blocks = topLevelBlocksFromMarkdown(payload.markdown)
  const model = buildPageModelFromTopLevelBlocksWithOptions(blocks, {
    documentInfo: coverResolution.documentInfo,
    simpleCover: coverResolution.simpleCover,
    includeTableOfContents: payload.includeTableOfContents === true,
    tableOfContentsMaxLevel: payload.tableOfContentsMaxLevel,
    // PV-SET-4A: 通常 Page Viewer の読書用 heading pagination default。
    pageBreakBeforeHeading: payload.pageViewerBreakBeforeHeading === true,
    pageBreakBeforeHeadingMaxLevel: payload.pageViewerBreakBeforeHeadingMaxLevel,
  })
  return buildPageViewModel(model)
}
