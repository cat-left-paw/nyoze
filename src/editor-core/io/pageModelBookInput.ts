/**
 * Book manifest v3 / chapter loader 相当の plain data から
 * `PageModelChapterInput[]`（`pageModel.ts`）を組み立てる pure adapter。
 *
 * 正本: `docs/page-model-design-2026-07.md`
 *
 * main/fs 側の `electron/bookExportChapterLoader.ts` が読み込む
 * `BookExportChapterInput`（`src/editor-core/export/bookExportAssembly.ts`）と
 * 構造的に同じ shape (`PageModelBookChapterSource`) を、この module 自身の
 * 独立した型として定義する。`io/` 層が `export/` 層へ依存しないようにする
 * ためで、呼び出し側は既存の `BookExportChapterInput[]` をそのまま渡せる
 * (TypeScript の構造的型付けにより変換なしで互換)。
 *
 * 目的は、将来の Light Page Viewer が `.nyoze/books.json` v3 由来の
 * title / authors / translators を `buildPageModelFromBookChapters()` へ渡せる
 * ようにすること。main / fs / IPC / renderer への接続はこの slice では行わない
 * (pure adapter とテストのみ)。
 *
 * 不変条件:
 * - Markdown を parse するだけで、frontmatter や Markdown 本文から title /
 *   author 等の表示 metadata を再取得しない。`title` / `authors` /
 *   `translators` は呼び出し側 (`.nyoze/books.json` v3 item 由来) の値を
 *   そのまま `PageModelChapterInput` へ渡す。
 * - `.nyoze/books.json` v3 writer / frontmatter / notes.json には一切触れない
 *   (読むことも含めて行わない。呼び出し側がすでに読み込んだ結果を渡す想定)。
 * - Book export (`bookExportAssembly.ts` の `planBookExportChapters` /
 *   `bookExportPlanHasMissingChapters`) と同じ方針で、missing chapter
 *   (`markdown: null`) が 1 件でもあれば部分的な `PageModelChapterInput[]` を
 *   返さず、まとめて失敗にする。
 * - 空 (trim 後に空文字列) markdown は空 chapter (`blocks: []`) にする。
 *   `parseMarkdown('')` は本文の無い 1 個の空 paragraph を返すが、これを
 *   そのまま `blocks` に含めると「空 chapter は空配列」という契約が曖昧に
 *   なるため、意図的に parse をスキップする
 *   (`buildPageModelFromBookChapters()` 側の空 flow section 除去
 *   `isInvisibleFlowSection` に頼らず、この adapter 自身で保証する)。
 */

import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { LineBreakPolicy } from '../types'
import { parseMarkdown, type ParseMarkdownOptions } from './parseMarkdown'
import type { PageModelChapterInput } from './pageModel'

/**
 * `PageModelChapterInput[]` を組み立てる入力 1 章分。
 * `BookExportChapterInput` (`bookExportAssembly.ts`) と構造的に同じ shape。
 */
export type PageModelBookChapterSource = {
  /**
   * 章を一意に識別する安定文字列。`.nyoze/books.json` v3 item の `path` 相当で、
   * そのまま `PageModelChapterInput.chapterId` になる。
   */
  path: string
  /** `.nyoze/books.json` v3 body item の title。 */
  title: string
  /** v3 body item の authors / translators。省略時は空扱い。 */
  authors?: readonly string[]
  translators?: readonly string[]
  /**
   * 読み込み済み Markdown 本文。frontmatter は呼び出し側で除去済みを想定する
   * (`electron/bookExportChapterLoader.ts` の `loadChapter()` と同じ契約)。
   * 読み込み失敗 / ファイル欠損は `null`。
   */
  markdown: string | null
}

export type PageModelBookChapterInputOptions = {
  /** 各 chapter の `parseMarkdown` 改行ポリシー。既定は `obsidian-paragraph` (`bookExportConversion.ts` と同じ)。 */
  lineBreakPolicy?: LineBreakPolicy
  /** 各 chapter の `parseMarkdown` 追加 option。 */
  parse?: ParseMarkdownOptions
}

/** 1 件以上の chapter が `markdown: null` (欠損 / 読み込み失敗) のため中断。 */
export type PageModelBookChapterInputFailure = {
  kind: 'missing-chapters'
  /** `markdown: null` だった chapter の `path` (章順)。 */
  missingPaths: readonly string[]
}

export type PageModelBookChapterInputSuccess = {
  kind: 'ok'
  chapters: PageModelChapterInput[]
}

export type PageModelBookChapterInputResult =
  | PageModelBookChapterInputSuccess
  | PageModelBookChapterInputFailure

/** trim 後に空文字列かどうか。空 chapter (`blocks: []`) 判定に使う。 */
function isEmptyChapterMarkdown(markdown: string): boolean {
  return markdown.trim().length === 0
}

function parseChapterBlocks(
  schema: Schema,
  markdown: string,
  lineBreakPolicy: LineBreakPolicy,
  parseOptions: ParseMarkdownOptions | undefined,
): PMNode[] {
  if (isEmptyChapterMarkdown(markdown)) return []
  const doc = parseMarkdown(schema, markdown, lineBreakPolicy, parseOptions)
  const blocks: PMNode[] = []
  doc.forEach((child) => blocks.push(child))
  return blocks
}

/**
 * `PageModelBookChapterSource[]` (`BookExportChapterInput[]` と互換) から
 * `PageModelChapterInput[]` を組み立てる。
 *
 * - `markdown: null` の chapter が 1 件でもあれば `missing-chapters` で失敗し、
 *   部分的な配列を返さない (`bookExportAssembly.ts` の
 *   `bookExportPlanHasMissingChapters` と同じ方針。Book export と同様、
 *   欠損章を skip して残りだけ組み立てることはしない)。
 * - 章順 (`sources` の配列順) をそのまま保持する。
 * - `chapterId` は `source.path` をそのまま使う。
 * - `title` / `authors` / `translators` は `source` の値をそのまま渡す
 *   (Markdown / frontmatter からは再取得しない)。
 */
export function buildPageModelChapterInputsFromSources(
  sources: readonly PageModelBookChapterSource[],
  schema: Schema,
  options?: PageModelBookChapterInputOptions,
): PageModelBookChapterInputResult {
  const missingPaths = sources.filter((source) => source.markdown === null).map((source) => source.path)
  if (missingPaths.length > 0) {
    return { kind: 'missing-chapters', missingPaths }
  }

  const lineBreakPolicy = options?.lineBreakPolicy ?? 'obsidian-paragraph'
  const parseOptions = options?.parse

  const chapters: PageModelChapterInput[] = sources.map((source) => ({
    chapterId: source.path,
    blocks: parseChapterBlocks(schema, source.markdown as string, lineBreakPolicy, parseOptions),
    title: source.title,
    authors: source.authors,
    translators: source.translators,
  }))

  return { kind: 'ok', chapters }
}
