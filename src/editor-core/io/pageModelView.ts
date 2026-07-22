/**
 * `PageModel`（`pageModel.ts`）を、React / UI がそのまま描画しやすい
 * renderer-neutral な ViewModel へ変換する pure adapter。
 *
 * 正本: `docs/page-model-design-2026-07.md`
 *
 * `PageModel.sections` は `flow` / `fixedBlankPage` / `synthetic` の
 * discriminated union で、`flow` block は PMNode 参照を持つなど、そのまま
 * React へ渡すには section ごとに分岐が必要な形をしている。この module は
 * その分岐を 1 箇所に集約し、`PageViewItem`（`flow` / `fixedBlankPage` /
 * `synthetic` それぞれの view item）と `PageViewAnchor`（progress bar /
 * ジャンプ導線用）から成る `PageViewModel` を組み立てる。
 *
 * 設計方針:
 * - `PageModel` の意味論 (`sections` の順序、`blockBefore` / `count` /
 *   `entries` の中身、`anchors` の `progressHint`) は一切変更しない。
 *   「同じ情報を、消費側が扱いやすい形に並べ替えるだけ」の adapter。
 * - `fixedBlankPage` section は `count` を保持したまま、viewer が `count` 枚を
 *   個別に描画できるよう `pages`（0-based `pageIndex` を持つ slot の配列）を
 *   追加する。`blank-page` section 自体を分割・統合しない (連続する
 *   `blank-page` は `PageModel` 側で既に独立 section のまま保たれているため、
 *   この adapter でも 1 section = 1 `PageViewFixedBlankPageItem` のまま扱う)。
 * - `synthetic` section は PM doc に node を挿入しない plain data のままで、
 *   `entries` の並び順もそのまま維持する。
 * - `flow` section の block は PMNode 参照 (`node`) を保持したまま、
 *   `id` / `blockIndex` / `breakBefore` / `chapterId` / `chapterIndex` を
 *   フラットに持たせる (実際の描画・シリアライズは呼び出し側の責務)。
 * - `PageAnchor` はそのまま `PageViewAnchor` として再利用し (both は plain
 *   data で shape も一致するため変換不要)、`progressHint` 昇順であることを
 *   この adapter の境界でも保証する (`PageModel.anchors` は既に昇順だが、
 *   将来の呼び出し元が未整列の `PageModel` を渡してきても壊れないよう、
 *   ここでも防御的に再ソートする)。
 * - CSS columns / 実 DOM 測定 / 正確なページ番号算出 / React コンポーネントは
 *   このモジュールの責務外 (後続の Light Page Viewer UI スライス)。
 *
 * fs / Electron / React / DOM には依存しない pure module。
 */

import type { Node as PMNode } from '@tiptap/pm/model'
import type {
  FixedBlankPageSection,
  FixedSyntheticPageSection,
  FlowPageSection,
  PageAnchor,
  PageBookInfoEntry,
  PageChapterInfoEntry,
  PageDocumentInfoEntry,
  PageModel,
  PageSection,
  PageSyntheticSection,
  PageSimpleCoverEntry,
  PageTocEntry,
} from './pageModel'

/** `flow` section 内の 1 top-level block。`node` は元の PMNode 参照 (viewer / adapter 側が描画・シリアライズに使う)。 */
export type PageViewFlowBlock = {
  /** section 内で一意な id (`${sectionId}:${blockIndex}`)。 */
  id: string
  blockIndex: number
  node: PMNode
  breakBefore: boolean
  chapterId?: string
  chapterIndex?: number
}

export type PageViewFlowItem = {
  kind: 'flow'
  sectionId: string
  chapterId?: string
  chapterIndex?: number
  blocks: readonly PageViewFlowBlock[]
}

/** `fixedBlankPage` 1 section 内の空白ページ 1 枚ぶんの slot。`pageIndex` は section 内 0-based。 */
export type PageViewBlankPageSlot = {
  /** section 内で一意な id (`${sectionId}:blank:${pageIndex}`)。 */
  id: string
  pageIndex: number
}

export type PageViewFixedBlankPageItem = {
  kind: 'fixedBlankPage'
  sectionId: string
  /** `nyozeBlankPage.count` そのまま。`pages.length` と常に一致する。 */
  count: number
  chapterId?: string
  chapterIndex?: number
  /** `count` 枚ぶんの slot。viewer はこれを `.map()` するだけで N 枚の空白ページを描画できる。 */
  pages: readonly PageViewBlankPageSlot[]
}

/** PV-READ-3B: CSS Columnsへ入れない、常に1 logical pageの表示専用表紙。 */
export type PageViewFixedSyntheticPageItem = {
  kind: 'fixedSyntheticPage'
  sectionId: string
  role: 'simpleCover'
  entry: PageSimpleCoverEntry
}

/**
 * `synthetic` section の view item。`PageSyntheticSection` と同じ
 * discriminated union (`role` ごとに `entries` の型が決まる) をそのまま保つ。
 * PM doc には一切 node を挿入しない plain data。
 */
export type PageViewSyntheticItem =
  | { kind: 'synthetic'; sectionId: string; role: 'documentInfo'; entries: readonly PageDocumentInfoEntry[] }
  | { kind: 'synthetic'; sectionId: string; role: 'bookInfo'; entries: readonly PageBookInfoEntry[] }
  | { kind: 'synthetic'; sectionId: string; role: 'chapterInfo'; entries: readonly PageChapterInfoEntry[] }
  | { kind: 'synthetic'; sectionId: string; role: 'toc'; entries: readonly PageTocEntry[] }

export type PageViewItem =
  | PageViewFlowItem
  | PageViewFixedBlankPageItem
  | PageViewFixedSyntheticPageItem
  | PageViewSyntheticItem

/**
 * progress bar / click jump 用の anchor。`PageModel.anchors`
 * (`PageAnchor`、`pageModel.ts`) と shape は完全に同じ (`sectionId` が
 * 対応する `PageViewItem.sectionId` を指す)。この module 自身の型として
 * re-export し、viewer 側が `pageModel.ts` を直接 import しなくても
 * `pageModelView.ts` だけで完結できるようにする。
 */
export type PageViewAnchor = PageAnchor

export type PageViewModel = {
  kind: 'document'
  items: readonly PageViewItem[]
  anchors: readonly PageViewAnchor[]
}

function toFlowViewItem(section: FlowPageSection): PageViewFlowItem {
  return {
    kind: 'flow',
    sectionId: section.id,
    chapterId: section.chapterId,
    chapterIndex: section.chapterIndex,
    blocks: section.blocks.map((block, blockIndex) => ({
      id: `${section.id}:${blockIndex}`,
      blockIndex,
      node: block.node,
      breakBefore: block.breakBefore,
      chapterId: block.chapterId,
      chapterIndex: block.chapterIndex,
    })),
  }
}

function toFixedBlankPageViewItem(section: FixedBlankPageSection): PageViewFixedBlankPageItem {
  const pages: PageViewBlankPageSlot[] = []
  for (let pageIndex = 0; pageIndex < section.count; pageIndex += 1) {
    pages.push({ id: `${section.id}:blank:${pageIndex}`, pageIndex })
  }
  return {
    kind: 'fixedBlankPage',
    sectionId: section.id,
    count: section.count,
    chapterId: section.chapterId,
    chapterIndex: section.chapterIndex,
    pages,
  }
}

function toFixedSyntheticPageViewItem(section: FixedSyntheticPageSection): PageViewFixedSyntheticPageItem {
  return {
    kind: 'fixedSyntheticPage',
    sectionId: section.id,
    role: section.role,
    entry: { ...section.entry },
  }
}

/** `role` ごとに `entries` の型を保ったまま `PageViewSyntheticItem` へ変換する (`entries` の順序は変更しない)。 */
function toSyntheticViewItem(section: PageSyntheticSection): PageViewSyntheticItem {
  switch (section.role) {
    case 'documentInfo':
      return { kind: 'synthetic', sectionId: section.id, role: 'documentInfo', entries: section.entries }
    case 'bookInfo':
      return { kind: 'synthetic', sectionId: section.id, role: 'bookInfo', entries: section.entries }
    case 'chapterInfo':
      return { kind: 'synthetic', sectionId: section.id, role: 'chapterInfo', entries: section.entries }
    case 'toc':
      return { kind: 'synthetic', sectionId: section.id, role: 'toc', entries: section.entries }
  }
}

function toPageViewItem(section: PageSection): PageViewItem {
  if (section.kind === 'flow') return toFlowViewItem(section)
  if (section.kind === 'fixedBlankPage') return toFixedBlankPageViewItem(section)
  if (section.kind === 'fixedSyntheticPage') return toFixedSyntheticPageViewItem(section)
  return toSyntheticViewItem(section)
}

/**
 * `PageModel` を `PageViewModel` へ変換する。
 *
 * - `model.sections` の順序・個数をそのまま `items` へ 1:1 で写す (空 flow
 *   section 除去などは `pageModel.ts` 側で既に確定済みのため、ここで
 *   section を足したり消したりしない)。
 * - `model.sections` / `model.anchors` 自体は読むだけで変更しない
 *   (`items` / `anchors` は新しい配列・新しいオブジェクトとして作る)。
 * - `anchors` は `progressHint` 昇順に整列させて返す
 *   (`PageModel.anchors` は既に昇順だが、この境界でも防御的に保証する)。
 */
export function buildPageViewModel(model: PageModel): PageViewModel {
  const items = model.sections.map(toPageViewItem)
  const anchors = [...model.anchors].sort((a, b) => a.progressHint - b.progressHint)
  return { kind: 'document', items, anchors }
}
