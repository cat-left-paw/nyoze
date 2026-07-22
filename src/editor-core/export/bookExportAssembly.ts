/**
 * Book 全体 export の pure assembly 境界（設計整理 + 最小 helper）。
 *
 * 詳しい設計メモは `docs/book-export-design-2026-07.md` を参照。
 *
 * 責務分離:
 * - main / fs 側（`electron/bookExportChapterLoader.ts`）:
 *   - `.nyoze/books.json` v3 manifest の読み込み・検証（invalid / diagnostics は
 *     部分使用しない）
 *   - Book body item の disk 解決（存在確認・絶対 path 解決）
 *   - Markdown ファイルの読み込み（成功/失敗を `markdown: string | null` として
 *     このモジュールへ渡す形に整形する）
 *   - read-only 経路のため writer は呼ばない。
 * - pure 側:
 *   - 計画（このモジュール）: chapter 順序の保持、章境界 page-break policy のメタデータ計算
 *   - 組み立て（`bookExportConversion.ts`）: `parseMarkdown` / PM doc 連結 / converter 接続
 * - UI 側（未実装。後続スライス）:
 *   - Book export 実行 UI / IPC / 進捗表示 / warning 一覧
 *
 * このモジュール自体は fs / electron / React / IPC に依存しない。
 */

import { splitDirectiveSegments } from '../io/customBlockDirective'

/** main 側で既に読み込み済みの 1 chapter 分の入力。 */
export type BookExportChapterInput = {
  /** project root 相対 path（表示・診断用。disk 解決はこの pure module では行わない）。 */
  path: string
  /** `.nyoze/books.json` v3 body item の title。 */
  title: string
  /**
   * `.nyoze/books.json` v3 body item の authors / translators。chapter Markdown
   * frontmatter ではなく v3 metadata が正本（HTML export の章ファイル情報表示
   * option で使う。§`docs/html-export-design-2026-07.md`）。省略時は空配列扱い。
   */
  authors?: readonly string[]
  translators?: readonly string[]
  /**
   * 読み込み済み Markdown 本文。
   * - 通常のファイル: 文字列（空文字列も許容し、その場合は `isEmpty: true` になる）。
   * - 読み込み失敗 / ファイル欠損: `null`（`missing: true` になる）。
   */
  markdown: string | null
}

/**
 * 章間 page-break policy の option。`ExternalExportOptions` とは別軸の設定だが、
 * `pageBreakEnabled` は呼び出し側が `ExternalExportOptions.pageBreak` をそのまま
 * 渡す想定にしている（優先関係は下記 `insertPageBreakBefore` のコメント参照）。
 */
export type BookExportChapterBoundaryOptions = {
  /**
   * chapter 間（先頭章を除く）に自動で page-break を挿入するか。既定は `true`
   * （Book export の基本方針の候補値。UI からの変更は今回対象外）。
   */
  insertPageBreakBetweenChapters?: boolean
  /**
   * 出力全体としての page-break 出力可否。呼び出し側が
   * `ExternalExportOptions.pageBreak` をそのまま渡す想定。省略時は `true`
   * （現行 active document export の既定と同じ）。
   */
  pageBreakEnabled?: boolean
}

export type ResolvedBookExportChapterBoundaryOptions =
  Required<BookExportChapterBoundaryOptions>

export const DEFAULT_BOOK_EXPORT_CHAPTER_BOUNDARY_OPTIONS: ResolvedBookExportChapterBoundaryOptions =
  {
    insertPageBreakBetweenChapters: true,
    pageBreakEnabled: true,
  }

/** 呼び出し側が省略したフィールドを既定値で埋める。 */
export function resolveBookExportChapterBoundaryOptions(
  options?: BookExportChapterBoundaryOptions,
): ResolvedBookExportChapterBoundaryOptions {
  return { ...DEFAULT_BOOK_EXPORT_CHAPTER_BOUNDARY_OPTIONS, ...options }
}

/** chapter 境界 policy を適用した後の 1 chapter 分の計画データ。 */
export type BookExportChapterPlan = {
  /** 元の `BookExportChapterInput` 配列内の index（章順そのもの）。 */
  index: number
  path: string
  title: string
  markdown: string | null
  /** `markdown === null`（読み込み失敗 / 欠損）。 */
  missing: boolean
  /** `markdown` が存在し、trim 後も空文字列。`missing` とは区別する。 */
  isEmpty: boolean
  /** Book 内で最初の chapter か（`index === 0`）。 */
  isFirstChapter: boolean
  /**
   * chapter 本文の先頭が、既に canonical な空 `:::page-break` directive
   * （`:::page-break` / `:::`）で始まっているか。空行のみの plain segment は
   * 透過的にスキップして判定する。`splitDirectiveSegments`
   * （`io/customBlockDirective.ts`）をそのまま再利用し、fenced directive の
   * 判定ロジックを重複実装しない。
   */
  startsWithExplicitPageBreak: boolean
  /**
   * この chapter の直前に、自動で page-break を挿入するべきか。
   *
   * 優先順位:
   * 1. `pageBreakEnabled: false`（`ExternalExportOptions.pageBreak` 由来）が
   *    最優先。true でも常に `false` になる。
   * 2. `insertPageBreakBetweenChapters: false` も常に `false` にする。
   * 3. 先頭 chapter（`isFirstChapter`）には常に `false`。
   * 4. `missing` chapter の直前には `false`（本文が無い箇所への挿入はしない。
   *    `bookExportConversion.ts` は missing が 1 件でもあれば部分 export せず失敗する）。
   * 5. `startsWithExplicitPageBreak` が `true` の chapter には `false`
   *    （chapter 本文側の明示 `:::page-break` と重複させない）。
   *
   * `ExternalExportOptions.pageBreakBeforeHeading` とは独立した軸である
   * （chapter 境界の page-break はここで決め、chapter 内部の見出し直前
   * page-break は各 converter の既存実装が担う）。`bookExportConversion.ts` が
   * 章境界で `nyozePageBreak` を挿入した直後の見出しでは、converter 側の
   * 「直前 sibling が `nyozePageBreak` なら見出し前自動改ページを挿入しない」
   * 挙動により二重化しない（`docs/book-export-design-2026-07.md` §4.2 参照）。
   */
  insertPageBreakBefore: boolean
}

/**
 * chapter 本文の先頭が canonical な空 `:::page-break` directive で始まって
 * いるかを判定する。空行のみの先頭 plain segment は無視し、最初に意味のある
 * segment が `page-break` かどうかで判定する。
 */
function chapterStartsWithExplicitPageBreak(markdown: string): boolean {
  const segments = splitDirectiveSegments(markdown.split('\n'))
  const firstMeaningfulSegment = segments.find(
    (segment) => segment.type !== 'plain' || segment.lines.some((line) => line.trim().length > 0),
  )
  return firstMeaningfulSegment?.type === 'page-break'
}

/**
 * Book の chapter 列（`.nyoze/books.json` v3 の `items` 配列順）に章境界
 * page-break policy を適用し、各 chapter の「直前に page-break を挿む必要が
 * あるか」をメタデータとして計算する。
 *
 * 入力の chapter 順序をそのまま保持する（並べ替え・フィルタリングをしない）。
 * 実際に Markdown を連結しない・`parseMarkdown` を呼ばない・各 export
 * converter を呼ばない。組み立てと converter 接続は `bookExportConversion.ts`
 * が担う。
 */
export function planBookExportChapters(
  chapters: readonly BookExportChapterInput[],
  options?: BookExportChapterBoundaryOptions,
): BookExportChapterPlan[] {
  const resolved = resolveBookExportChapterBoundaryOptions(options)

  return chapters.map((chapter, index) => {
    const missing = chapter.markdown === null
    const isEmpty = !missing && chapter.markdown!.trim().length === 0
    const isFirstChapter = index === 0
    const startsWithExplicitPageBreak =
      !missing && !isEmpty && chapterStartsWithExplicitPageBreak(chapter.markdown!)

    const insertPageBreakBefore =
      resolved.pageBreakEnabled &&
      resolved.insertPageBreakBetweenChapters &&
      !isFirstChapter &&
      !missing &&
      !startsWithExplicitPageBreak

    return {
      index,
      path: chapter.path,
      title: chapter.title,
      markdown: chapter.markdown,
      missing,
      isEmpty,
      isFirstChapter,
      startsWithExplicitPageBreak,
      insertPageBreakBefore,
    }
  })
}

/** plan 内に読み込み失敗 / 欠損 chapter が1件でもあるか。main 側の事前警告判定に使う。 */
export function bookExportPlanHasMissingChapters(
  plan: readonly BookExportChapterPlan[],
): boolean {
  return plan.some((chapter) => chapter.missing)
}
