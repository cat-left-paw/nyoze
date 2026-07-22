/**
 * 軽量ページビューア向けの pure PageModel builder。
 *
 * 正本: `docs/page-model-design-2026-07.md`, `docs/page-break-render-model-spec-2026-07.md`
 *
 * `normalizeTopLevelPageBreaks()` が返す `PageBreakRenderBlock[]`
 * (`{ kind: 'content'; ...; breakBefore }` / `{ kind: 'blankPage'; count }`) を、
 * Page Viewer が読む `PageSection[]` へ束ねる。`content` block は連続する限り
 * 1 つの `flow` section にまとめ、`blankPage` は flow に混ぜず独立した
 * `fixedBlankPage` section として維持する。
 *
 * active document (`buildPageModelFromDocument` / `buildPageModelFromTopLevelBlocks`)
 * に加え、Book chapter 列から 1 つの PageModel を組み立てる
 * `buildPageModelFromBookChapters()` も提供する。Book 側は
 * `bookExportAssembly.ts` / `bookExportConversion.ts` と同じく、章境界に
 * `nyozePageBreak` marker を差し込んでから既存 normalize 経路
 * (`normalizeTopLevelPageBreaks()`) へ一括で通す方式を再利用する。これにより
 * 「章境界の page-break が章内の明示 page-break / 先頭 blank-page と重複しない」
 * という既存 export と同じ意味論を、normalize 側のロジックを複製せずに得られる。
 *
 * 文書情報 / 作品情報 / 章ファイル情報 / TOC は `synthetic` section として表す
 * (`PageSyntheticSection`)。PM doc に node を挿入するのではなく、呼び出し側が
 * 渡した plain data (`PageModelDocumentInfo` / `PageModelBookInfo` /
 * `PageModelChapterInput.title` 等) や、heading から抽出した TOC entry を
 * そのまま保持するだけの、UI / HTML markup / CSS に依存しない中立なモデルに
 * する。実際の見た目・class 名は `htmlExportSemantic.ts` / Web Book 等アダプタ側の責務。
 *
 * `PageModel.anchors` は、viewer の進捗バー (0〜100%) やジャンプ導線が読む
 * `PageAnchor[]` を提供する。正確なページ番号は算出せず、section / block の
 * 出現順から近似した `progressHint` (0〜1) だけを持つ (詳細は
 * `buildPositionIndex()` / `progressHintFor()` のコメント参照)。
 *
 * fs / Electron / React / DOM には依存しない pure helper。UI・進捗バー本体・
 * 正確なページ番号算出・Vivliostyle adapter への接続は後続スライスの責務で
 * あり、この最小スライスでは扱わない。
 */

import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import { NYOZE_PAGE_BREAK_NODE_NAME } from './customBlockDirective'
import {
  isEmptyTopLevelParagraphNode,
  normalizeTopLevelPageBreaks,
  type PageBreakRenderBlock,
} from './pageBreakRenderModel'

export type PageContentBlock = {
  kind: 'content'
  node: PMNode
  /** この block の直前に改ページを挟むか。`normalizeTopLevelPageBreaks()` 由来。 */
  breakBefore: boolean
  /**
   * `buildPageModelFromBookChapters()` 経由のときだけ設定される、呼び出し側が
   * 渡した章 id。active document (`buildPageModelFromTopLevelBlocks` /
   * `buildPageModelFromDocument`) 由来のときは常に `undefined`。
   */
  chapterId?: string
  /** `chapterId` と同時に設定される、`chapters` 配列内の 0-based index。 */
  chapterIndex?: number
}

export type FlowPageSection = {
  kind: 'flow'
  id: string
  blocks: PageContentBlock[]
  /**
   * `buildPageModelFromBookChapters()` 経由のときだけ設定される。この section 内の
   * `blocks` は (chapter 境界で必ず section が分かれるため) すべて同じ章に属する。
   * active document 由来のときは常に `undefined`。
   */
  chapterId?: string
  chapterIndex?: number
}

/** `:::blank-page` / `:::blank-page-N` 由来の固定ページ枠。flow には混ぜない。 */
export type FixedBlankPageSection = {
  kind: 'fixedBlankPage'
  id: string
  count: number
  /**
   * `buildPageModelFromBookChapters()` 経由で、この blank-page がどの章の
   * markdown 由来かが分かるときだけ設定される。`FlowPageSection.chapterId` と
   * 同じ役割で、章が blank-page から始まる場合に chapterInfo / chapter anchor の
   * 挿入・参照先 (`insertChapterInfoSections` / `buildChapterAnchors`) を
   * 決めるのに使う。
   */
  chapterId?: string
  chapterIndex?: number
}

/**
 * PV-READ-3B: 冒頭の表示専用簡易表紙。
 *
 * CSS Columnsで計測する既存 `synthetic` とは異なり、常に1 logical pageを占める。
 * 書字方向・配置・長文clipは Page Viewer固有の表示設定なので、この中立モデルへは
 * 入れない。PM doc / Markdown / exportには一切書き込まない。
 */
export type PageSimpleCoverEntry = {
  kind: 'simpleCover'
  title?: string
  author?: string
}

export type FixedSyntheticPageSection = {
  kind: 'fixedSyntheticPage'
  id: string
  role: 'simpleCover'
  entry: PageSimpleCoverEntry
}

/** 本文冒頭の文書情報 (active document 単体)。`htmlExportSemantic.ts` の `HtmlDocumentInfo` と shape は同じだが、PageModel は独立した中立の型として持つ。 */
export type PageDocumentInfoEntry = {
  kind: 'documentInfo'
  title?: string
  author?: string
  translator?: string
}

/** Book 全体の作品情報 (Book 冒頭に一度だけ)。 */
export type PageBookInfoEntry = {
  kind: 'bookInfo'
  title?: string
  author?: string
  translator?: string
}

/** 章ファイル情報 (各章の最初の section の前)。 */
export type PageChapterInfoEntry = {
  kind: 'chapterInfo'
  chapterId: string
  chapterIndex: number
  title?: string
  authors?: readonly string[]
  translators?: readonly string[]
}

/** heading から抽出した TOC の 1 エントリ。 */
export type PageTocEntry = {
  kind: 'tocEntry'
  level: number
  text: string
  /** `<a href="#...">` 相当の anchor id。HTML export の `heading-` prefix とは別の `toc-` prefix を使う (命名衝突を避ける)。heading anchor (`PageAnchor.kind === 'heading'`) の `id` と同じ値になる。 */
  anchorId: string
}

/**
 * 文書情報 / 作品情報 / 章ファイル情報 / TOC を表す synthetic section。
 * PM doc に node を挿入せず、plain data (`entries`) だけを保持する。
 * `role` ごとに `entries` の要素型が決まる (discriminated union)。
 */
export type PageSyntheticSection =
  | { kind: 'synthetic'; id: string; role: 'documentInfo'; entries: readonly PageDocumentInfoEntry[] }
  | { kind: 'synthetic'; id: string; role: 'bookInfo'; entries: readonly PageBookInfoEntry[] }
  | { kind: 'synthetic'; id: string; role: 'chapterInfo'; entries: readonly PageChapterInfoEntry[] }
  | { kind: 'synthetic'; id: string; role: 'toc'; entries: readonly PageTocEntry[] }

export type PageSection =
  | FlowPageSection
  | FixedBlankPageSection
  | FixedSyntheticPageSection
  | PageSyntheticSection

/**
 * viewer の進捗バー / ジャンプ導線が読む近似的な目印。
 *
 * - `documentStart` / `bookStart`: 文書 (または Book) の先頭。
 * - `chapter`: Book chapter の開始位置 (`buildPageModelFromBookChapters()` のみ)。
 * - `heading`: top-level heading block の位置。`id` は対応する `PageTocEntry.anchorId`
 *   と同じ値になる (`collectPageModelHeadingTocData()` を両者が共有するため)。
 * - `fixedPage`: `fixedBlankPage` section の位置。
 *
 * `progressHint` は 0〜1 の近似値で、正確なページ番号ではない
 * (`buildPositionIndex()` / `progressHintFor()` 参照)。
 *
 * `level` (1〜6) は `kind: 'heading'` のときだけ設定される、見出しレベル
 * (`clampPageModelHeadingLevel()` でクランプ済み)。Page Viewer のアウトライン
 * サイドパネル (PV-COL-9) が字下げに使う、TOC 表示専用ではない最小限の
 * metadata。他の `kind` では常に `undefined`。
 */
export type PageAnchor = {
  id: string
  kind: 'documentStart' | 'bookStart' | 'chapter' | 'heading' | 'fixedPage'
  label: string
  sectionId: string
  blockIndex?: number
  chapterId?: string
  chapterIndex?: number
  level?: number
  progressHint: number
}

export type PageModel = {
  kind: 'document'
  sections: PageSection[]
  anchors: PageAnchor[]
}

type BaseSection = FlowPageSection | FixedBlankPageSection

/** node identity で章 metadata を引く resolver。`buildPageModelFromBookChapters()` だけが使う。 */
type ChapterAttributionResolver = (
  node: PMNode,
) => { chapterId: string; chapterIndex: number } | undefined

// --- PV-SET-4A: viewer-only heading pagination (見出し前で改ページ) ---

const DEFAULT_HEADING_PAGE_BREAK_MAX_LEVEL = 6
const HEADING_PAGE_BREAK_MAX_LEVEL_MIN = 1
const HEADING_PAGE_BREAK_MAX_LEVEL_MAX = 6

type HeadingPageBreakOptions = {
  enabled: boolean
  maxLevel: number
}

/** `pageBreakBeforeHeadingMaxLevel` を 1〜6 に正規化する。非数値・非有限値は既定 `6` へ (省略時は全レベル対象、既存 export option と同じ既定方針)。 */
function resolveHeadingPageBreakMaxLevel(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_HEADING_PAGE_BREAK_MAX_LEVEL
  }
  const rounded = Math.round(value)
  return Math.min(Math.max(rounded, HEADING_PAGE_BREAK_MAX_LEVEL_MIN), HEADING_PAGE_BREAK_MAX_LEVEL_MAX)
}

function resolveHeadingPageBreakOptions(options?: {
  pageBreakBeforeHeading?: boolean
  pageBreakBeforeHeadingMaxLevel?: number
}): HeadingPageBreakOptions {
  return {
    enabled: options?.pageBreakBeforeHeading === true,
    maxLevel: resolveHeadingPageBreakMaxLevel(options?.pageBreakBeforeHeadingMaxLevel),
  }
}

/**
 * PV-SET-4A (`docs/page-viewer-settings-design-2026-07.md`): 見出し前改ページを
 * `normalizeTopLevelPageBreaks()` の結果へ viewer-only の後段ルールとして OR で
 * 合成する。Markdown / `:::page-break` の意味論自体は変更しない。
 *
 * - 既に `breakBefore: true` (明示 `:::page-break` または章境界の
 *   `nyozePageBreak` marker 由来) な block はそのまま変更しない
 *   (`false → true` の一方向 OR のみなので二重適用は起きない)。
 * - 配列先頭の block (`index === 0`) には適用しない。文書 / Book 全体の
 *   最初の有効 content block に不要な先頭空白ページを作らないため、
 *   `normalizeTopLevelPageBreaks()` 自身の「文書先頭の page-break は無視する」
 *   ルールと同じ考え方 (§6 rule 6)。`blankPage` が先頭のときは、続く最初の
 *   content block は `index > 0` になるため対象になり得るが、これは既存の
 *   「blank-page の直後に明示 page-break が続く」場合と同じ扱いであり、
 *   新しい空白ページを作らない (blank-page 自体が既に独立した固定ページ)。
 * - `enabled: false` のときは入力をそのまま返す (toggle OFF では明示
 *   directive と章境界の break だけが残る)。
 */
function applyHeadingPageBreaks(
  renderBlocks: readonly PageBreakRenderBlock[],
  options: HeadingPageBreakOptions | undefined,
): PageBreakRenderBlock[] {
  if (!options?.enabled) return renderBlocks as PageBreakRenderBlock[]
  return renderBlocks.map((block, index) => {
    if (block.kind !== 'content' || block.breakBefore || index === 0) return block
    if (block.node.type.name !== 'heading') return block
    const level = clampPageModelHeadingLevel((block.node.attrs.level as number) ?? 1)
    if (level > options.maxLevel) return block
    return { ...block, breakBefore: true }
  })
}

/**
 * `buildPageModelFromTopLevelBlocks()` / `buildPageModelFromBookChapters()` が
 * 共有する内部 builder。synthetic section はここでは組み立てない
 * (`flow` / `fixedBlankPage` だけを返す)。
 *
 * `resolveChapter` が渡されたとき (= Book 呼び出し) は、章 metadata を
 * `content` block / `fixedBlankPage` section へ付与するだけでなく、**章が
 * 変わるたびに新しい `flow` section を強制的に開始する** (直前 section が
 * 同じ章のまま続いていても関係ない)。これは `breakBefore` (「改ページを
 * 強制するか」) とは独立した軸で、chapter は常にそれ自身の section 境界を
 * 持つ、という構造的な事実を表す。`insertPageBreakBetweenChapters: false` で
 * 章境界に `nyozePageBreak` marker が無い場合でも、2 章目は新しい section
 * として独立するが `breakBefore` は `false` のままになる (「構造上は別章だが、
 * 強制改ページはしない」)。
 *
 * `resolveChapter` を渡さない (= active document 呼び出し) 場合は、この判定が
 * 常に false になるため、既存の「`blankPage` のときだけ section を区切る」
 * 挙動から変化しない。
 *
 * `headingPageBreakOptions` (PV-SET-4A) は `normalizeTopLevelPageBreaks()` の
 * 結果に対する後段の OR 合成 (`applyHeadingPageBreaks()`) にのみ使う。
 * 省略時は完全に無効 (既存の出力と一致する)。
 */
function buildBaseSections(
  blocks: readonly PMNode[],
  resolveChapter?: ChapterAttributionResolver,
  headingPageBreakOptions?: HeadingPageBreakOptions,
): BaseSection[] {
  const renderBlocks = applyHeadingPageBreaks(normalizeTopLevelPageBreaks(blocks), headingPageBreakOptions)
  const sections: BaseSection[] = []
  let currentFlow: FlowPageSection | null = null
  let currentFlowChapterIndex: number | undefined
  let sectionIndex = 0

  for (const block of renderBlocks) {
    if (block.kind === 'blankPage') {
      currentFlow = null
      currentFlowChapterIndex = undefined
      const chapter = resolveChapter?.(block.node)
      sections.push({
        kind: 'fixedBlankPage',
        id: `page-section-${sectionIndex++}`,
        count: block.count,
        ...(chapter ? { chapterId: chapter.chapterId, chapterIndex: chapter.chapterIndex } : {}),
      })
      continue
    }

    const chapter = resolveChapter?.(block.node)
    const crossesChapterBoundary =
      currentFlow !== null && chapter !== undefined && chapter.chapterIndex !== currentFlowChapterIndex

    if (!currentFlow || crossesChapterBoundary) {
      currentFlow = {
        kind: 'flow',
        id: `page-section-${sectionIndex++}`,
        blocks: [],
        ...(chapter ? { chapterId: chapter.chapterId, chapterIndex: chapter.chapterIndex } : {}),
      }
      sections.push(currentFlow)
      currentFlowChapterIndex = chapter?.chapterIndex
    }

    currentFlow.blocks.push({
      kind: 'content',
      node: block.node,
      breakBefore: block.breakBefore,
      ...(chapter ? { chapterId: chapter.chapterId, chapterIndex: chapter.chapterIndex } : {}),
    })
  }

  return sections.filter((section) => !isInvisibleFlowSection(section))
}

/** `flow` section の中身が top-level 空 paragraph だけかどうか。 */
function isInvisibleFlowSection(section: BaseSection): boolean {
  return (
    section.kind === 'flow' &&
    section.blocks.every((block) => isEmptyTopLevelParagraphNode(block.node))
  )
}

// --- anchors: 位置表 (position index) と progressHint ---

type PositionSlot = { sectionId: string; blockIndex?: number }

function slotKey(slot: PositionSlot): string {
  return slot.blockIndex === undefined ? slot.sectionId : `${slot.sectionId}:${slot.blockIndex}`
}

/**
 * `sections` (synthetic を含む最終配列) を出現順に走査し、各「単位」に
 * 0-based の連番を振る。単位の数え方 (実装判断、over-engineering を避けるため
 * この slice ではこの粒度に固定する):
 *
 * - `flow` section: 中の `blocks` 1 つにつき 1 単位 (block 数ぶん)。
 * - `fixedBlankPage` section: `count` に関わらず section 全体で 1 単位。
 * - `synthetic` section (documentInfo / bookInfo / chapterInfo / toc): 中の
 *   `entries` 数に関わらず section 全体で 1 単位。
 *
 * つまり `flow` block だけが細かい重みを持ち、blank-page の枚数や synthetic
 * section の entries 数では重み付けしない。将来 DOM 実測や層数を使った、より
 * 正確な重み付けに差し替える場合もこの関数の責務のまま拡張できる。
 */
function buildPositionIndex(sections: readonly PageSection[]): {
  indexBySlotKey: Map<string, number>
  total: number
} {
  const indexBySlotKey = new Map<string, number>()
  let i = 0
  for (const section of sections) {
    if (section.kind === 'flow') {
      section.blocks.forEach((_, blockIndex) => {
        indexBySlotKey.set(slotKey({ sectionId: section.id, blockIndex }), i)
        i += 1
      })
      continue
    }
    indexBySlotKey.set(slotKey({ sectionId: section.id }), i)
    i += 1
  }
  return { indexBySlotKey, total: i }
}

/**
 * 位置表上の index を 0〜1 の `progressHint` へ変換する。先頭は必ず `0`。
 * 単位が 1 つ以下 (`total <= 1`) のときは `0` を返し、`0/0` による `NaN` を
 * 避ける。正確なページ番号ではなく、あくまで近似値。
 */
function progressHintFor(index: number, total: number): number {
  if (total <= 1) return 0
  return index / (total - 1)
}

/** `sections[0]` を指す `documentStart` / `bookStart` anchor を作る。`sections` が空なら `undefined`。 */
function buildStartAnchor(
  sections: readonly PageSection[],
  kind: 'documentStart' | 'bookStart',
  id: string,
  label: string,
  indexBySlotKey: ReadonlyMap<string, number>,
  total: number,
): PageAnchor | undefined {
  const first = sections[0]
  if (!first) return undefined
  const blockIndex = first.kind === 'flow' ? 0 : undefined
  const index = indexBySlotKey.get(slotKey({ sectionId: first.id, blockIndex }))
  if (index === undefined) return undefined
  return { id, kind, label, sectionId: first.id, blockIndex, progressHint: progressHintFor(index, total) }
}

/** `fixedBlankPage` anchor の label。count=1 は「空白ページ」、count>1 は「空白ページ x N」(Editor 表示と同じ命名方針)。 */
function buildFixedPageAnchorLabel(count: number): string {
  return count > 1 ? `空白ページ x ${count}` : '空白ページ'
}

/**
 * `sections` を出現順に走査し、`heading` anchor (top-level heading block) と
 * `fixedPage` anchor (`fixedBlankPage` section) を集める。`chapterId` /
 * `chapterIndex` は block / section 自身が持つ値をそのまま anchor へ引き継ぐ
 * (active document 由来なら常に `undefined`)。
 *
 * nested heading (blockquote / directive block の中の heading 等) はこの
 * 関数の対象外 (`PageContentBlock.node` が直接 `heading` のときだけ扱う)。
 * `normalizeTopLevelPageBreaks()` 等この module の他の処理と同じく、top-level
 * のみを対象にする既存方針に合わせている。
 */
function collectHeadingAndFixedPageAnchors(
  sections: readonly PageSection[],
  anchorIdByNode: ReadonlyMap<PMNode, string>,
  indexBySlotKey: ReadonlyMap<string, number>,
  total: number,
): PageAnchor[] {
  const anchors: PageAnchor[] = []
  for (const section of sections) {
    if (section.kind === 'flow') {
      section.blocks.forEach((block, blockIndex) => {
        if (block.node.type.name !== 'heading') return
        const anchorId = anchorIdByNode.get(block.node)
        if (!anchorId) return
        const index = indexBySlotKey.get(slotKey({ sectionId: section.id, blockIndex }))
        if (index === undefined) return
        anchors.push({
          id: anchorId,
          kind: 'heading',
          label: block.node.textContent.trim(),
          sectionId: section.id,
          blockIndex,
          chapterId: block.chapterId,
          chapterIndex: block.chapterIndex,
          level: clampPageModelHeadingLevel((block.node.attrs.level as number) ?? 1),
          progressHint: progressHintFor(index, total),
        })
      })
      continue
    }
    if (section.kind === 'fixedBlankPage') {
      const index = indexBySlotKey.get(slotKey({ sectionId: section.id }))
      if (index === undefined) continue
      anchors.push({
        id: `anchor-fixed-page-${section.id}`,
        kind: 'fixedPage',
        label: buildFixedPageAnchorLabel(section.count),
        sectionId: section.id,
        chapterId: section.chapterId,
        chapterIndex: section.chapterIndex,
        progressHint: progressHintFor(index, total),
      })
    }
  }
  return anchors
}

/**
 * active document の anchors (`documentStart` → `heading` / `fixedPage`) を
 * 組み立て、`progressHint` 昇順にソートして返す (`Array.prototype.sort` は
 * stable なので、同じ `progressHint` の anchor は元の並び順を保つ。例えば
 * 先頭 block 自体が heading の場合、`documentStart` が同じ位置の `heading`
 * より前に来る)。
 */
function buildActiveDocumentAnchorsFromHeadingData(
  sections: readonly PageSection[],
  anchorIdByNode: ReadonlyMap<PMNode, string>,
): PageAnchor[] {
  const { indexBySlotKey, total } = buildPositionIndex(sections)
  const anchors: PageAnchor[] = []
  const start = buildStartAnchor(sections, 'documentStart', 'anchor-document-start', '文書先頭', indexBySlotKey, total)
  if (start) anchors.push(start)
  anchors.push(...collectHeadingAndFixedPageAnchors(sections, anchorIdByNode, indexBySlotKey, total))
  anchors.sort((a, b) => a.progressHint - b.progressHint)
  return anchors
}

/**
 * top-level block 列 (PM doc から `doc.forEach` 相当で取り出したもの) から
 * PageModel を作る。
 *
 * - `normalizeTopLevelPageBreaks()` を再利用し、`page-break` は次 content block の
 *   `breakBefore` へ、`blank-page` は fixed page slot へ正規化する。
 * - 連続する `content` block は 1 つの `flow` section へまとめる。
 * - `blankPage` エントリが現れるたびに独立した `fixedBlankPage` section を作る
 *   (連続する blank-page も個別 section のまま維持し、指定枚数ぶんを失わない)。
 * - 空の `flow` section は作らない (先頭 / 末尾 / 連続する blank-page の間では
 *   content が無ければ section 自体を作らない)。
 * - `flow` section の中身が top-level 空 paragraph だけの場合、その section 自体を
 *   捨てる。`blank-page` に挟まれた空 paragraph 由来の flow はこれに該当し、
 *   viewer が独立 section を素朴にページ描画した場合の意図しない追加空白ページを
 *   防ぐ (仕様上、実際に空白ページを増やす正本は `nyozeBlankPage.count` だけとする)。
 *   保存 Markdown / RenderModel の内容は変更しない。PageModel からの除外のみ。
 * - `anchors` には `documentStart` anchor と、heading / `fixedBlankPage` から
 *   作った anchor が入る (`buildActiveDocumentAnchorsFromHeadingData()` 参照)。
 *
 * synthetic section (documentInfo / TOC) を含めたい場合は
 * `buildPageModelFromTopLevelBlocksWithOptions()` を使うこと。この関数自身の
 * シグネチャ・`sections` の出力は変更しない (`anchors` は新規追加フィールド)。
 */
export function buildPageModelFromTopLevelBlocks(blocks: readonly PMNode[]): PageModel {
  const sections = buildBaseSections(blocks)
  const { anchorIdByNode } = collectPageModelHeadingTocData(blocks)
  return { kind: 'document', sections, anchors: buildActiveDocumentAnchorsFromHeadingData(sections, anchorIdByNode) }
}

/** PM doc (active document 1 件) から PageModel を作る便宜 helper。 */
export function buildPageModelFromDocument(doc: PMNode): PageModel {
  const blocks: PMNode[] = []
  doc.forEach((child) => blocks.push(child))
  return buildPageModelFromTopLevelBlocks(blocks)
}

// --- synthetic section: 文書情報 / 作品情報 / 章ファイル情報 (共通の空判定) ---

/** title / author / translator の 3 項目とも trim 後に空かどうか (`info` が `undefined` のときも空扱い)。 */
function isBlankTitleAuthorTranslator(
  info: { title?: string; author?: string; translator?: string } | undefined,
): boolean {
  if (!info) return true
  return !(info.title ?? '').trim() && !(info.author ?? '').trim() && !(info.translator ?? '').trim()
}

/** `simpleCover` はtitle / authorのどちらかが実際に表示可能なときだけ固定ページ化する。 */
function buildSimpleCoverFixedSection(
  entry: PageSimpleCoverEntry | undefined,
): FixedSyntheticPageSection | undefined {
  if (!entry) return undefined
  const title = (entry.title ?? '').trim()
  const author = (entry.author ?? '').trim()
  if (!title && !author) return undefined
  return {
    kind: 'fixedSyntheticPage',
    id: 'fixed-synthetic-simple-cover',
    role: 'simpleCover',
    entry: {
      kind: 'simpleCover',
      ...(title ? { title: entry.title } : {}),
      ...(author ? { author: entry.author } : {}),
    },
  }
}

/** 本文冒頭の文書情報 (active document 単体)。呼び出し側が frontmatter 等から読み取った値をそのまま渡す。 */
export type PageModelDocumentInfo = {
  title?: string
  author?: string
  translator?: string
}

function buildDocumentInfoSyntheticSection(
  info: PageModelDocumentInfo | undefined,
): PageSyntheticSection | undefined {
  if (isBlankTitleAuthorTranslator(info)) return undefined
  return {
    kind: 'synthetic',
    id: 'synthetic-document-info',
    role: 'documentInfo',
    entries: [{ kind: 'documentInfo', title: info?.title, author: info?.author, translator: info?.translator }],
  }
}

/** Book 全体の作品情報。呼び出し側が Book manifest 等から読み取った値をそのまま渡す。 */
export type PageModelBookInfo = {
  title?: string
  author?: string
  translator?: string
}

function buildBookInfoSyntheticSection(info: PageModelBookInfo | undefined): PageSyntheticSection | undefined {
  if (isBlankTitleAuthorTranslator(info)) return undefined
  return {
    kind: 'synthetic',
    id: 'synthetic-book-info',
    role: 'bookInfo',
    entries: [{ kind: 'bookInfo', title: info?.title, author: info?.author, translator: info?.translator }],
  }
}

// --- synthetic section: TOC ---

const DEFAULT_PAGE_MODEL_TOC_MAX_LEVEL = 6
const PAGE_MODEL_TOC_MAX_LEVEL_MIN = 1
const PAGE_MODEL_TOC_MAX_LEVEL_MAX = 6

/** `maxLevel` を 1〜6 に正規化する。非数値・非有限値は既定 `6` へ。 */
function resolvePageModelTocMaxLevel(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PAGE_MODEL_TOC_MAX_LEVEL
  }
  const rounded = Math.round(value)
  return Math.min(Math.max(rounded, PAGE_MODEL_TOC_MAX_LEVEL_MIN), PAGE_MODEL_TOC_MAX_LEVEL_MAX)
}

function clampPageModelHeadingLevel(level: number): number {
  return Math.min(Math.max(level, 1), 6)
}

/**
 * heading テキストから anchor id を組み立てる。空白は `-` へ、id / href の
 * round-trip を壊しうる文字 (`"` `'` `<` `>` `&` `#`) は取り除く。結果が
 * 空文字列になる場合は `section` にフォールバックする。`toc-` を前置する
 * (`htmlExportSemantic.ts` の TOC が使う `heading-` prefix とは意図的に別の prefix にし、
 * 同一出力内で両方の TOC を使っても id が衝突しないようにする)。
 */
function slugifyPageModelHeadingText(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, '-').replace(/["'<>&#]/g, '')
  return cleaned || 'section'
}

/** 同名 (同一 slug) の heading が複数あるとき、2 件目以降に `-2` `-3` ... の suffix を付けて id の重複を避ける。 */
function generatePageModelTocAnchorId(text: string, usedCounts: Map<string, number>): string {
  const base = `toc-${slugifyPageModelHeadingText(text)}`
  const count = usedCounts.get(base) ?? 0
  usedCounts.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

/**
 * top-level block 列から heading (h1〜h6) を出現順に抽出し、TOC entry
 * (`level` / `text` / `anchorId`) を作ると同時に、heading の PMNode 参照 →
 * 割り当てた anchor id の対応も返す pure helper。
 *
 * `collectPageModelTocEntries()` (公開 API、TOC entry だけを返す) と、
 * heading anchor 構築 (`collectHeadingAndFixedPageAnchors()`) の両方から
 * 同じ 1 回の走査結果を共有するために切り出してある。これにより
 * `PageTocEntry.anchorId` と heading `PageAnchor.id` は常に同じ値になる
 * (どちらも同じ `anchorIdByNode` 由来)。
 *
 * - top-level heading のみを対象にする。blockquote / directive block /
 *   list item などに nested した heading はこの関数の対象外
 *   (`normalizeTopLevelPageBreaks()` や `PageContentBlock` が top-level のみを
 *   扱う既存方針と合わせている)。仮に子孫まで再帰的に拾うと、TOC entry には
 *   出るのに対応する heading anchor が存在しない nested heading が発生し、
 *   `PageTocEntry.anchorId` と heading `PageAnchor.id` の対応が崩れるため、
 *   意図的に top-level のみへ絞ってある。
 * - 空 heading (trim 後のテキストが空) は除外する。
 * - `maxLevel` (省略時 6 = h1〜h6 すべて) を超える heading も除外する。
 * - `htmlExportSemantic.ts` の `collectHeadingTocEntries()` (`doc.descendants` で
 *   nested heading も拾う) とは独立した実装。PageModel は semantic HTML 層の
 *   内部実装に依存しない中立モデルにするため、あえて共有しない。
 */
function collectPageModelHeadingTocData(
  blocks: readonly PMNode[],
  maxLevel?: number,
): { entries: PageTocEntry[]; anchorIdByNode: Map<PMNode, string> } {
  const resolvedMaxLevel = resolvePageModelTocMaxLevel(maxLevel)
  const entries: PageTocEntry[] = []
  const anchorIdByNode = new Map<PMNode, string>()
  const usedCounts = new Map<string, number>()

  for (const block of blocks) {
    if (block.type.name !== 'heading') continue
    const text = block.textContent.trim()
    if (!text) continue
    const level = clampPageModelHeadingLevel((block.attrs.level as number) ?? 1)
    if (level > resolvedMaxLevel) continue
    const anchorId = generatePageModelTocAnchorId(text, usedCounts)
    entries.push({ kind: 'tocEntry', level, text, anchorId })
    anchorIdByNode.set(block, anchorId)
  }

  return { entries, anchorIdByNode }
}

/**
 * top-level block 列から heading (h1〜h6) を出現順に抽出し、TOC entry
 * (`level` / `text` / `anchorId`) へ変換する pure helper。
 *
 * - top-level heading のみが対象 (nested heading は対象外)。
 * - 空 heading (trim 後のテキストが空) は除外する。
 * - `maxLevel` (省略時 6 = h1〜h6 すべて) を超える heading も除外する。
 * - 同名 heading は anchor id の重複を避ける (`collectPageModelHeadingTocData()` 参照)。
 */
export function collectPageModelTocEntries(
  blocks: readonly PMNode[],
  maxLevel?: number,
): PageTocEntry[] {
  return collectPageModelHeadingTocData(blocks, maxLevel).entries
}

function buildTocSyntheticSectionFromEntries(entries: readonly PageTocEntry[]): PageSyntheticSection | undefined {
  if (entries.length === 0) return undefined
  return { kind: 'synthetic', id: 'synthetic-toc', role: 'toc', entries }
}

// --- active document: options 付き helper (documentInfo / TOC) ---

export type PageModelDocumentOptions = {
  /** 本文冒頭の文書情報。3 項目とも空 (または省略) なら synthetic section を出さない。 */
  documentInfo?: PageModelDocumentInfo
  /**
   * PV-READ-3B: `documentInfo` を置換する固定1ページの簡易表紙。
   * metadata hard gateと通常情報へのfallbackは呼び出し側が解決して渡す。
   */
  simpleCover?: PageSimpleCoverEntry
  /** heading から TOC synthetic section を作るか。既定 `false`。 */
  includeTableOfContents?: boolean
  /** `includeTableOfContents: true` のときの見出し最大レベル (1〜6、既定 6)。 */
  tableOfContentsMaxLevel?: number
  /**
   * PV-SET-4A: 見出しの前で改ページするか (Page Viewer 専用の読書用
   * pagination default、既定 `false`)。`ExternalExportOptions.pageBreakBeforeHeading`
   * とは独立した viewer-only option。
   */
  pageBreakBeforeHeading?: boolean
  /** `pageBreakBeforeHeading: true` のときの対象見出し最大レベル (1〜6、既定 6)。 */
  pageBreakBeforeHeadingMaxLevel?: number
}

/**
 * `buildPageModelFromTopLevelBlocks()` に、documentInfo / TOC の synthetic
 * section を追加できる options 付き版。section 順序は
 * `documentInfo → toc → flow/fixedBlankPage` (`docs/page-model-design-2026-07.md`)。
 * `options` を省略した場合の出力 (`sections` / `anchors` とも) は
 * `buildPageModelFromTopLevelBlocks(blocks)` と完全に一致する。
 *
 * `includeTableOfContents: true` のときは、heading anchor も同じ
 * `tableOfContentsMaxLevel` を共有して作るため、TOC entry と heading anchor の
 * id が必ず一致する。`includeTableOfContents: false` のときも heading anchor
 * 自体は作られる (TOC 表示の有無と anchor 生成は独立) が、`tableOfContentsMaxLevel`
 * は TOC 用の option であって heading anchor 用の一般的なレベル制限ではないため、
 * このときは無視し、既定の全レベル (h1〜h6) を対象に heading anchor を作る。
 */
export function buildPageModelFromTopLevelBlocksWithOptions(
  blocks: readonly PMNode[],
  options?: PageModelDocumentOptions,
): PageModel {
  const headingPageBreakOptions = resolveHeadingPageBreakOptions(options)
  const baseSections = buildBaseSections(blocks, undefined, headingPageBreakOptions)
  const simpleCoverSection = buildSimpleCoverFixedSection(options?.simpleCover)
  const documentInfoSection = simpleCoverSection ? undefined : buildDocumentInfoSyntheticSection(options?.documentInfo)
  const includeToc = options?.includeTableOfContents === true
  // `tableOfContentsMaxLevel` は TOC 表示専用の option。TOC 自体を出さないときに
  // 適用すると、heading anchor まで意図せず絞られてしまうため、TOC 有効時だけ渡す。
  const headingData = collectPageModelHeadingTocData(blocks, includeToc ? options?.tableOfContentsMaxLevel : undefined)
  const tocSection = includeToc ? buildTocSyntheticSectionFromEntries(headingData.entries) : undefined

  const sections: PageSection[] = [
    ...(simpleCoverSection ? [simpleCoverSection] : []),
    ...(documentInfoSection ? [documentInfoSection] : []),
    ...(tocSection ? [tocSection] : []),
    ...baseSections,
  ]
  const anchors = buildActiveDocumentAnchorsFromHeadingData(sections, headingData.anchorIdByNode)
  return { kind: 'document', sections, anchors }
}

/** `buildPageModelFromDocument()` の options 付き版。`buildPageModelFromTopLevelBlocksWithOptions()` 参照。 */
export function buildPageModelFromDocumentWithOptions(
  doc: PMNode,
  options?: PageModelDocumentOptions,
): PageModel {
  const blocks: PMNode[] = []
  doc.forEach((child) => blocks.push(child))
  return buildPageModelFromTopLevelBlocksWithOptions(blocks, options)
}

// --- Book ---

/**
 * Book 用 PageModel builder への入力 1 章分。renderer / fs / IPC には依存しない
 * plain data。`blocks` は既に `parseMarkdown` 済みの top-level PM node 列
 * (`bookExportConversion.ts` の `parseMarkdown(schema, chapter.markdown!, ...)`
 * の結果を `doc.forEach` で取り出したもの相当) を想定する。この関数自身は
 * Markdown を parse しない。
 *
 * `title` / `authors` / `translators` は `includeChapterInfo: true` のときに
 * chapterInfo synthetic section を作るための表示 metadata。`BookExportChapterInput`
 * (`bookExportAssembly.ts`) と同じ shape。3 項目とも空 (または省略) の章には
 * chapterInfo section を出さない。`title` は chapter anchor の label にも使う
 * (省略時は `chapterId` を label にフォールバックする)。
 */
export type PageModelChapterInput = {
  /** 章を一意に識別する呼び出し側の id (`.nyoze/books.json` v3 item の path 等)。 */
  chapterId: string
  /** 章本文の top-level block 列。空配列も許容する (空 chapter)。 */
  blocks: readonly PMNode[]
  title?: string
  authors?: readonly string[]
  translators?: readonly string[]
}

/**
 * chapterInfo synthetic section 用の表示専用 metadata。
 * `PageModelChapterInput.title`（chapter anchor / Outline label の正本）とは分離する。
 */
export type PageModelChapterInfo = {
  title?: string
  authors?: readonly string[]
  translators?: readonly string[]
}

export type PageModelBookOptions = {
  /**
   * 先頭章を除く章の直前に `nyozePageBreak` marker を差し込むか。既定は `true`
   * (`bookExportAssembly.ts` の `insertPageBreakBetweenChapters` 既定と同じ)。
   *
   * 章内の明示 `:::page-break` や、章冒頭の `:::blank-page` との重複回避は
   * `bookExportAssembly.ts` のような専用フラグを持たず、`normalizeTopLevelPageBreaks()`
   * の既存ルール (連続 page-break の畳み込み / blankPage による pending break 吸収)
   * にそのまま委ねる。marker を差し込んだ結果、章冒頭が既に page-break だったり
   * blank-page だったりしても、余計な breakBefore や空白ページは発生しない。
   */
  insertPageBreakBetweenChapters?: boolean
  /** Book 全体の先頭に一度だけ bookInfo synthetic section を出すか。既定 `false`。 */
  includeBookInfo?: boolean
  /** `includeBookInfo: true` のときに使う Book 全体の title / author。3 項目とも空なら出さない。 */
  bookInfo?: PageModelBookInfo
  /** PV-READ-3B: `bookInfo` を置換する固定1ページの簡易表紙。 */
  simpleCover?: PageSimpleCoverEntry
  /** 各章の最初の section の前に chapterInfo synthetic section を出すか。既定 `false`。 */
  includeChapterInfo?: boolean
  /**
   * chapter index ごとの chapterInfo 表示値。指定時は `buildChapterInfoSectionsByChapterIndex`
   * だけがこれを使い、chapter input の title/authors/translators は使わない。
   * 未指定時は既存どおり chapter input から組み立てる（後方互換）。
   * `buildChapterAnchors()` は常に chapter input の canonical title を使う。
   */
  chapterInfos?: readonly (PageModelChapterInfo | undefined)[]
  /** 全 chapter を連結した内容から heading を集め、TOC synthetic section を作るか。既定 `false`。 */
  includeTableOfContents?: boolean
  /** `includeTableOfContents: true` のときの見出し最大レベル (1〜6、既定 6)。 */
  tableOfContentsMaxLevel?: number
  /**
   * PV-SET-4A: 見出しの前で改ページするか (Page Viewer 専用の読書用
   * pagination default、既定 `false`)。章境界の `insertPageBreakBetweenChapters`
   * とは独立した軸 (章境界の break と重複してもここでは何も二重にしない、
   * `applyHeadingPageBreaks()` 参照)。Book Composer の章間改ページ・章扉とは
   * 無関係。
   */
  pageBreakBeforeHeading?: boolean
  /** `pageBreakBeforeHeading: true` のときの対象見出し最大レベル (1〜6、既定 6)。 */
  pageBreakBeforeHeadingMaxLevel?: number
}

/** 章の title / authors / translators が (trim 後) すべて空かどうか。空なら chapterInfo section を出さない。 */
function isBlankChapterInfo(info: PageModelChapterInfo): boolean {
  const title = (info.title ?? '').trim()
  const hasAuthor = (info.authors ?? []).some((author) => author.trim().length > 0)
  const hasTranslator = (info.translators ?? []).some((translator) => translator.trim().length > 0)
  return !title && !hasAuthor && !hasTranslator
}

function resolveChapterInfoDisplay(
  chapter: PageModelChapterInput,
  chapterIndex: number,
  chapterInfos: readonly (PageModelChapterInfo | undefined)[] | undefined,
): PageModelChapterInfo {
  if (chapterInfos) {
    return chapterInfos[chapterIndex] ?? {}
  }
  return {
    title: chapter.title,
    authors: chapter.authors,
    translators: chapter.translators,
  }
}

/** chapterIndex → chapterInfo synthetic section。空な章 (`isBlankChapterInfo`) には entry を作らない。 */
function buildChapterInfoSectionsByChapterIndex(
  chapters: readonly PageModelChapterInput[],
  chapterInfos?: readonly (PageModelChapterInfo | undefined)[],
): Map<number, PageSyntheticSection> {
  const map = new Map<number, PageSyntheticSection>()
  chapters.forEach((chapter, chapterIndex) => {
    const display = resolveChapterInfoDisplay(chapter, chapterIndex, chapterInfos)
    if (isBlankChapterInfo(display)) return
    map.set(chapterIndex, {
      kind: 'synthetic',
      id: `synthetic-chapter-info-${chapterIndex}`,
      role: 'chapterInfo',
      entries: [
        {
          kind: 'chapterInfo',
          chapterId: chapter.chapterId,
          chapterIndex,
          title: display.title,
          authors: display.authors,
          translators: display.translators,
        },
      ],
    })
  })
  return map
}

/**
 * `baseSections` (`flow` / `fixedBlankPage`、chapter 属性つき) を走査し、
 * chapterIndex が前の section と変わるたびに、その章の chapterInfo section
 * (存在すれば) を直前に挿む。`flow` だけでなく `fixedBlankPage` も
 * `chapterIndex` を持つため、章が blank-page から始まる場合でも
 * chapterInfo → fixedBlankPage → flow の順になる。
 */
function insertChapterInfoSections(
  sections: readonly BaseSection[],
  chapterInfoByChapterIndex: ReadonlyMap<number, PageSyntheticSection>,
): PageSection[] {
  const result: PageSection[] = []
  let lastChapterIndex: number | undefined
  for (const section of sections) {
    if (section.chapterIndex !== undefined && section.chapterIndex !== lastChapterIndex) {
      const info = chapterInfoByChapterIndex.get(section.chapterIndex)
      if (info) result.push(info)
      lastChapterIndex = section.chapterIndex
    }
    result.push(section)
  }
  return result
}

/**
 * chapter ごとの `chapter` anchor を組み立てる。
 *
 * 参照先の優先順位:
 * 1. `includeChapterInfo: true` でその章の chapterInfo section が実際に
 *    作られていれば、その section を指す。
 * 2. なければ、`baseSections` の中でその章 (`chapterIndex`) に属する最初の
 *    section (`flow` または `fixedBlankPage`、章が blank-page から始まる
 *    場合は `fixedBlankPage`) を指す。
 * 3. どちらも無ければ (空 chapter / page-break だけの chapter など、対応する
 *    section が 1 つも生成されない章) その章の anchor は作らない。
 */
function buildChapterAnchors(
  chapters: readonly PageModelChapterInput[],
  baseSections: readonly BaseSection[],
  chapterInfoByChapterIndex: ReadonlyMap<number, PageSyntheticSection>,
  indexBySlotKey: ReadonlyMap<string, number>,
  total: number,
): PageAnchor[] {
  const anchors: PageAnchor[] = []
  chapters.forEach((chapterInput, chapterIndex) => {
    const chapterInfoSection = chapterInfoByChapterIndex.get(chapterIndex)
    const targetSection: PageSyntheticSection | BaseSection | undefined =
      chapterInfoSection ?? baseSections.find((section) => section.chapterIndex === chapterIndex)
    if (!targetSection) return

    const blockIndex = targetSection.kind === 'flow' ? 0 : undefined
    const index = indexBySlotKey.get(slotKey({ sectionId: targetSection.id, blockIndex }))
    if (index === undefined) return

    const label = (chapterInput.title ?? '').trim() || chapterInput.chapterId
    anchors.push({
      id: `anchor-chapter-${chapterInput.chapterId}`,
      kind: 'chapter',
      label,
      sectionId: targetSection.id,
      blockIndex,
      chapterId: chapterInput.chapterId,
      chapterIndex,
      progressHint: progressHintFor(index, total),
    })
  })
  return anchors
}

/**
 * Book の anchors (`bookStart` → `chapter` → `heading` / `fixedPage`) を
 * 組み立て、`progressHint` 昇順にソートして返す。並び替えの安定性は
 * `buildActiveDocumentAnchorsFromHeadingData()` と同じ。
 */
function buildBookAnchors(
  sections: readonly PageSection[],
  baseSections: readonly BaseSection[],
  chapters: readonly PageModelChapterInput[],
  chapterInfoByChapterIndex: ReadonlyMap<number, PageSyntheticSection>,
  anchorIdByNode: ReadonlyMap<PMNode, string>,
): PageAnchor[] {
  const { indexBySlotKey, total } = buildPositionIndex(sections)
  const anchors: PageAnchor[] = []
  const start = buildStartAnchor(sections, 'bookStart', 'anchor-book-start', '作品先頭', indexBySlotKey, total)
  if (start) anchors.push(start)
  anchors.push(...buildChapterAnchors(chapters, baseSections, chapterInfoByChapterIndex, indexBySlotKey, total))
  anchors.push(...collectHeadingAndFixedPageAnchors(sections, anchorIdByNode, indexBySlotKey, total))
  anchors.sort((a, b) => a.progressHint - b.progressHint)
  return anchors
}

/**
 * Book chapter 列 (`.nyoze/books.json` v3 の `items` 順) から 1 つの PageModel を
 * 組み立てる。
 *
 * - 章境界には (先頭章を除き、`insertPageBreakBetweenChapters !== false` のとき)
 *   `nyozePageBreak` marker を挿入してから、全章の block をまとめて 1 回だけ
 *   `normalizeTopLevelPageBreaks()` へ通す。`bookExportAssembly.ts` /
 *   `bookExportConversion.ts` が Markdown 連結後に同じ normalize 経路を通すのと
 *   同じ意味論になる (章内の明示 `:::page-break` / 章冒頭の `:::blank-page` との
 *   重複回避も、専用フラグではなく `normalizeTopLevelPageBreaks()` 既存ルールに
 *   委ねる)。
 * - 章が変わるたびに新しい `flow` section を必ず開始する
 *   (`buildBaseSections()` 参照)。`insertPageBreakBetweenChapters: false`
 *   でも「別 section になる」こと自体は変わらず、変わるのは 2 章目最初の
 *   content block の `breakBefore` が `false` のままになる点だけ
 *   (構造上は別章のまま、強制改ページだけしない)。
 * - 各 `content` block / `flow` section / `fixedBlankPage` section には、どの
 *   章から来たか (`chapterId` / `chapterIndex`) を PMNode の参照 identity で
 *   引き直して付与する。`normalizeTopLevelPageBreaks()` は node をコピーしない
 *   ため、参照の同一性がそのまま使える。
 * - `includeBookInfo` / `includeChapterInfo` / `includeTableOfContents` が
 *   `true` のときだけ、それぞれ bookInfo / chapterInfo / toc synthetic section を
 *   組み立てる。section 順序は `bookInfo → toc → chapterInfo/flow/fixed` で、
 *   chapterInfo は該当章の最初の section (`flow` または `fixedBlankPage`) の
 *   直前に置く (`insertChapterInfoSections()`)。すべての option を省略した
 *   場合の `sections` 出力は既存 (options 追加前) の
 *   `buildPageModelFromBookChapters()` と完全に一致する (`anchors` は新規
 *   追加フィールドのため、常に `bookStart` / `chapter` / heading /
 *   `fixedBlankPage` の anchor が入る)。
 * - 空 chapter・page-break だけの chapter は、そもそも `content` render block も
 *   `blankPage` render block も生まないため、対応する section 自体が存在しない。
 *   そのような章に chapterInfo を渡していても挿入されない (挿入先が無いため)。
 *   同じ理由で chapter anchor も作られない (`buildChapterAnchors()` 参照)。
 *   `buildBaseSections()` 側の空 flow section 除去 (`isInvisibleFlowSection`) とも
 *   ここでの特別扱いなしに両立する。
 * - blank-page だけの chapter は、`fixedBlankPage` section 自体は生成され、
 *   `chapterId` / `chapterIndex` も付与される。そのため chapterInfo を渡して
 *   いれば、その章の chapterInfo は (`flow` section が無くても)
 *   `fixedBlankPage` section の直前に挿入され、chapter anchor も同じ
 *   `fixedBlankPage` section (chapterInfo が無ければ) を指す。
 * - `.nyoze/books.json` v3 / frontmatter の SoT 境界には触れない。呼び出し側が
 *   v3 metadata から `chapterId` / `blocks` / `title` / `authors` / `translators`
 *   / `bookInfo` を用意する。
 */
export function buildPageModelFromBookChapters(
  chapters: readonly PageModelChapterInput[],
  schema: Schema,
  options?: PageModelBookOptions,
): PageModel {
  const insertPageBreakBetweenChapters = options?.insertPageBreakBetweenChapters ?? true
  const pageBreakType = schema.nodes[NYOZE_PAGE_BREAK_NODE_NAME]
  if (insertPageBreakBetweenChapters && !pageBreakType) {
    throw new Error(
      'buildPageModelFromBookChapters requires schema support for nyozePageBreak when insertPageBreakBetweenChapters is enabled',
    )
  }

  const combinedBlocks: PMNode[] = []
  const chapterByNode = new Map<PMNode, { chapterId: string; chapterIndex: number }>()

  chapters.forEach((chapter, chapterIndex) => {
    if (insertPageBreakBetweenChapters && chapterIndex > 0 && pageBreakType) {
      combinedBlocks.push(pageBreakType.create())
    }
    for (const block of chapter.blocks) {
      combinedBlocks.push(block)
      chapterByNode.set(block, { chapterId: chapter.chapterId, chapterIndex })
    }
  })

  const headingPageBreakOptions = resolveHeadingPageBreakOptions(options)
  const baseSections = buildBaseSections(
    combinedBlocks,
    (node) => chapterByNode.get(node),
    headingPageBreakOptions,
  )

  const includeChapterInfo = options?.includeChapterInfo === true
  const chapterInfoByChapterIndex = includeChapterInfo
    ? buildChapterInfoSectionsByChapterIndex(chapters, options?.chapterInfos)
    : new Map<number, PageSyntheticSection>()
  const sectionsWithChapterInfo = insertChapterInfoSections(baseSections, chapterInfoByChapterIndex)

  const includeBookInfo = options?.includeBookInfo === true
  const simpleCoverSection = buildSimpleCoverFixedSection(options?.simpleCover)
  const bookInfoSection =
    !simpleCoverSection && includeBookInfo ? buildBookInfoSyntheticSection(options?.bookInfo) : undefined

  const includeToc = options?.includeTableOfContents === true
  // `tableOfContentsMaxLevel` は TOC 表示専用の option。TOC 自体を出さないときに
  // 適用すると、heading anchor まで意図せず絞られてしまうため、TOC 有効時だけ渡す
  // (active document 側の `buildPageModelFromTopLevelBlocksWithOptions()` と同じ方針)。
  const headingData = collectPageModelHeadingTocData(
    combinedBlocks,
    includeToc ? options?.tableOfContentsMaxLevel : undefined,
  )
  const tocSection = includeToc ? buildTocSyntheticSectionFromEntries(headingData.entries) : undefined

  const sections: PageSection[] = [
    ...(simpleCoverSection ? [simpleCoverSection] : []),
    ...(bookInfoSection ? [bookInfoSection] : []),
    ...(tocSection ? [tocSection] : []),
    ...sectionsWithChapterInfo,
  ]

  const anchors = buildBookAnchors(
    sections,
    baseSections,
    chapters,
    chapterInfoByChapterIndex,
    headingData.anchorIdByNode,
  )

  return { kind: 'document', sections, anchors }
}
