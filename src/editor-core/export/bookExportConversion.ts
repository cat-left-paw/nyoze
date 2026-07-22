/**
 * Book 全体 export の assembly + 既存 converter 接続 pure helper。
 *
 * main / fs 側 loader（`electron/bookExportChapterLoader.ts`）が返す
 * `BookExportChapterInput[]` を受け取り、章境界 page-break policy に従って
 * 1 つの ProseMirror `doc` に組み立て、既存の LeME / でんでん / 青空文庫風 /
 * Web Book pure converter へ渡す。
 *
 * fs / electron / React / IPC には依存しない。LeME / でんでん / 青空文庫風 /
 * Web Book すべて main operation（`electron/bookExportOperation.ts`）経由で
 * IPC / Save dialog / File メニューに接続済み。
 *
 * 設計の正本: `docs/book-export-design-2026-07.md`、Web Book 部分は
 * `docs/html-export-design-2026-07.md` §11 / §12 も参照。
 */

import type { Schema, Node as PMNode } from '@tiptap/pm/model'
import type { LineBreakPolicy } from '../types'
import { NYOZE_PAGE_BREAK_NODE_NAME } from '../io/customBlockDirective'
import { parseMarkdown, type ParseMarkdownOptions } from '../io/parseMarkdown'
import {
  bookExportPlanHasMissingChapters,
  planBookExportChapters,
  resolveBookExportChapterBoundaryOptions,
  type BookExportChapterBoundaryOptions,
  type BookExportChapterInput,
  type BookExportChapterPlan,
  type ResolvedBookExportChapterBoundaryOptions,
} from './bookExportAssembly'
import {
  exportAozoraTextFromDoc,
  type AozoraTextExportOptions,
  type AozoraTextExportResult,
} from './aozoraTextExport'
import type { BookExportBookInfo, BookExportChapterInfo } from './bookExportMetadata'
import {
  exportDendenCompatibleMarkdownFromDoc,
  type DendenMarkdownExportOptions,
  type DendenMarkdownExportResult,
} from './dendenMarkdownExport'
import {
  resolveExternalExportOptions,
  type ExternalExportOptions,
} from './externalExportOptions'
import type { HtmlDocumentInfo } from './htmlExportSemantic'
import {
  exportLeMECompatibleMarkdownFromDoc,
  type LeMEMarkdownExportOptions,
  type LeMEMarkdownExportResult,
} from './lemeMarkdownExport'
import {
  exportWebBookFromDoc,
  type WebBookExportOptions,
  type WebBookExportResult,
} from './webBookExport'
import type { WebBookPaletteSnapshotInput } from './webBookPaletteSnapshot'
import type { WebBookTypographySnapshotInput } from './webBookTypographySnapshot'
import type { WebBookAutoTcySnapshotInput } from './webBookAutoTcySnapshot'

/** assembly / export 共通の呼び出し option。 */
export type BookExportConversionOptions = {
  /** 章境界 page-break policy。`pageBreakEnabled` 省略時は `export.pageBreak` を反映する。 */
  boundary?: BookExportChapterBoundaryOptions
  /** 各 converter へ渡す `ExternalExportOptions`。 */
  export?: ExternalExportOptions
  /** 各 chapter の `parseMarkdown` 改行ポリシー。既定は `obsidian-paragraph`。 */
  lineBreakPolicy?: LineBreakPolicy
  /** 各 chapter の `parseMarkdown` 追加 option。 */
  parse?: ParseMarkdownOptions
}

/**
 * LeME / でんでん / 青空文庫風の 3 converter で共有する、Book 全体 export 専用の
 * 作品情報 / 章ファイル情報表示 option（2026-07-08、pure conversion のみ。
 * UI / IPC は未接続）。名前・shape は既存の Book 全体 Web Book export の
 * `includeDocumentInfo` / `includeChapterInfo` / `bookInfo` / `chapterInfos`
 * と揃えてあるが、Web Book は引き続き `options.webBook` 配下の既存 field
 * （`includeDocumentInfo` 等）を使う（この型を経由しない）。metadata 本体の型は
 * `./bookExportMetadata`（`BookExportBookInfo` / `BookExportChapterInfo`）を
 * 使う。Web Book 用の `HtmlDocumentInfo`（`htmlExportSemantic.ts`）とは
 * shape が完全に一致するため、この関数自身は変換せず構造的にそのまま渡す。
 *
 * `chapterInfos` はここに含めない — `includeChapterInfo: true` のときに
 * `chapters`（呼び出し側が Book manifest から組み立てて渡す
 * `BookExportChapterInput[]`）と `chapterStartIndices` から、この関数自身が
 * `buildChapterInfos()` で組み立てる。呼び出し側（renderer）は on/off の
 * boolean だけを渡し、章ごとの metadata 本体を渡すことはない
 * （Web Book の `includeChapterInfo` と同じ境界）。
 */
export type BookExportMetadataOptions = {
  /** Book 全体の先頭に一度だけ作品情報を表示するか。既定 `false`。 */
  includeBookInfo?: boolean
  /**
   * `includeBookInfo: true` のときに使う、Book 全体の title / author。
   * 単独 chapter の metadata ではなく、呼び出し側が Book 全体の metadata から
   * 組み立てて渡す想定（Web Book の `bookInfo` と同じ入力経路）。
   */
  bookInfo?: BookExportBookInfo
  /** 各章ファイルの先頭に章ファイル情報を表示するか。既定 `false`。 */
  includeChapterInfo?: boolean
  /** 著者・訳者行に「著: 」「訳: 」の役割ラベルを表示するか。既定 `true`。 */
  showRoleLabels?: boolean
}

export type BookExportLeMEConversionOptions = BookExportConversionOptions & BookExportMetadataOptions
export type BookExportDendenConversionOptions = BookExportConversionOptions & BookExportMetadataOptions
export type BookExportAozoraConversionOptions = BookExportConversionOptions & BookExportMetadataOptions

export type BookExportConversionFailure = {
  kind: 'missing-chapters'
  plan: readonly BookExportChapterPlan[]
}

export type BookExportAssemblySuccess = {
  kind: 'ok'
  doc: PMNode
  plan: readonly BookExportChapterPlan[]
}

export type BookExportAssemblyResult =
  | BookExportAssemblySuccess
  | BookExportConversionFailure

export type BookExportLeMEConversionResult =
  | { kind: 'ok'; result: LeMEMarkdownExportResult; plan: readonly BookExportChapterPlan[] }
  | BookExportConversionFailure

export type BookExportDendenConversionResult =
  | { kind: 'ok'; result: DendenMarkdownExportResult; plan: readonly BookExportChapterPlan[] }
  | BookExportConversionFailure

export type BookExportAozoraConversionResult =
  | { kind: 'ok'; result: AozoraTextExportResult; plan: readonly BookExportChapterPlan[] }
  | BookExportConversionFailure

/**
 * `ExternalExportOptions.pageBreak` を章境界 policy の `pageBreakEnabled` にも
 * 反映しつつ、boundary 側の明示指定があればそちらを優先する。
 */
export function resolveBookExportConversionBoundaryOptions(
  options?: BookExportConversionOptions,
): ResolvedBookExportChapterBoundaryOptions {
  const exportResolved = resolveExternalExportOptions(options?.export)
  return resolveBookExportChapterBoundaryOptions({
    ...options?.boundary,
    pageBreakEnabled:
      options?.boundary?.pageBreakEnabled ?? exportResolved.pageBreak,
  })
}

type AssembledBookExportDoc = {
  doc: PMNode
  plan: readonly BookExportChapterPlan[]
  /**
   * `plan` と同じ順序・同じ長さ。各要素は、その章「自身」の最初の top-level
   * node が `doc.content` 内で最初に出現する位置（0-based）。章境界の
   * `nyozePageBreak` marker を挿入した場合はその直後の位置を指す。
   * `BookExportChapterInfo.index` はこの値をそのまま使う（`buildChapterInfos`
   * 参照）。`includeChapterInfo: true` を使わない converter 呼び出しでは
   * この配列を使わない。
   */
  chapterStartIndices: readonly number[]
}

/**
 * chapter 列を章境界 policy に従って 1 つの PM `doc` に組み立てる内部 helper。
 * `assembleBookExportDoc()`（公開 API）と各 `exportBookExportChaptersTo*()`
 * が共有する。`markdown === null` の chapter が 1 件でもあれば部分 export せず
 * 失敗する。
 */
function assembleBookExportDocInternal(
  chapters: readonly BookExportChapterInput[],
  schema: Schema,
  options?: BookExportConversionOptions,
): { kind: 'ok'; result: AssembledBookExportDoc } | BookExportConversionFailure {
  const boundary = resolveBookExportConversionBoundaryOptions(options)
  const plan = planBookExportChapters(chapters, boundary)

  if (bookExportPlanHasMissingChapters(plan)) {
    return { kind: 'missing-chapters', plan }
  }

  const lineBreakPolicy = options?.lineBreakPolicy ?? 'obsidian-paragraph'
  const parseOptions = options?.parse
  const pageBreakType = schema.nodes[NYOZE_PAGE_BREAK_NODE_NAME]
  if (!pageBreakType) {
    throw new Error('assembleBookExportDoc requires schema support for nyozePageBreak')
  }

  const children: PMNode[] = []
  const chapterStartIndices: number[] = []

  for (const chapter of plan) {
    if (chapter.insertPageBreakBefore) {
      children.push(pageBreakType.create())
    }

    chapterStartIndices.push(children.length)

    const chapterDoc = parseMarkdown(
      schema,
      chapter.markdown!,
      lineBreakPolicy,
      parseOptions,
    )
    chapterDoc.forEach((child) => {
      children.push(child)
    })
  }

  return {
    kind: 'ok',
    result: {
      doc: schema.nodes.doc.create(null, children),
      plan,
      chapterStartIndices,
    },
  }
}

/**
 * chapter 列を章境界 policy に従って 1 つの PM `doc` に組み立てる。
 * `markdown === null` の chapter が 1 件でもあれば部分 export せず失敗する。
 */
export function assembleBookExportDoc(
  chapters: readonly BookExportChapterInput[],
  schema: Schema,
  options?: BookExportConversionOptions,
): BookExportAssemblyResult {
  const assembled = assembleBookExportDocInternal(chapters, schema, options)
  if (assembled.kind !== 'ok') return assembled
  return { kind: 'ok', doc: assembled.result.doc, plan: assembled.result.plan }
}

/**
 * `chapters`（`BookExportChapterInput[]`。v3 body item 由来の `title` /
 * `authors` / `translators` を持つ）と、`assembleBookExportDocInternal()` が
 * 計算した `chapterStartIndices`（同じ順序・同じ長さ）から
 * `BookExportChapterInfo[]`（`./bookExportMetadata`）を組み立てる。chapter
 * Markdown 本文（frontmatter を含む）は一切参照しない（`BookExportChapterInput`
 * 自体が v3 metadata だけの入力のため）。Web Book export（`HtmlChapterInfo` と
 * shape が完全に一致するため構造的にそのまま渡せる）に加え、LeME / でんでん /
 * 青空文庫風の Book 全体 export の章ファイル情報表示でも共有する
 * （§`BookExportMetadataOptions`）。
 */
function buildChapterInfos(
  chapters: readonly BookExportChapterInput[],
  chapterStartIndices: readonly number[],
): BookExportChapterInfo[] {
  return chapters.map((chapter, i) => ({
    index: chapterStartIndices[i],
    title: chapter.title,
    authors: chapter.authors,
    translators: chapter.translators,
  }))
}

/** Book chapter 列を LeME 互換 Markdown へ export する。 */
export function exportBookExportChaptersToLeME(
  chapters: readonly BookExportChapterInput[],
  schema: Schema,
  options?: BookExportLeMEConversionOptions,
): BookExportLeMEConversionResult {
  const assembled = assembleBookExportDocInternal(chapters, schema, options)
  if (assembled.kind !== 'ok') return assembled

  const includeChapterInfo = options?.includeChapterInfo === true
  const chapterInfos = includeChapterInfo
    ? buildChapterInfos(chapters, assembled.result.chapterStartIndices)
    : undefined

  const lemeOptions: LeMEMarkdownExportOptions = {
    ...options?.export,
    includeBookInfo: options?.includeBookInfo === true,
    bookInfo: options?.bookInfo,
    includeChapterInfo,
    chapterInfos,
    showRoleLabels: options?.showRoleLabels ?? true,
  }

  return {
    kind: 'ok',
    result: exportLeMECompatibleMarkdownFromDoc(assembled.result.doc, lemeOptions),
    plan: assembled.result.plan,
  }
}

/** Book chapter 列を でんでん向け Markdown へ export する。 */
export function exportBookExportChaptersToDenden(
  chapters: readonly BookExportChapterInput[],
  schema: Schema,
  options?: BookExportDendenConversionOptions,
): BookExportDendenConversionResult {
  const assembled = assembleBookExportDocInternal(chapters, schema, options)
  if (assembled.kind !== 'ok') return assembled

  const includeChapterInfo = options?.includeChapterInfo === true
  const chapterInfos = includeChapterInfo
    ? buildChapterInfos(chapters, assembled.result.chapterStartIndices)
    : undefined

  const dendenOptions: DendenMarkdownExportOptions = {
    ...options?.export,
    includeBookInfo: options?.includeBookInfo === true,
    bookInfo: options?.bookInfo,
    includeChapterInfo,
    chapterInfos,
    showRoleLabels: options?.showRoleLabels ?? true,
  }

  return {
    kind: 'ok',
    result: exportDendenCompatibleMarkdownFromDoc(assembled.result.doc, dendenOptions),
    plan: assembled.result.plan,
  }
}

/** Book chapter 列を青空文庫風テキストへ export する。 */
export function exportBookExportChaptersToAozora(
  chapters: readonly BookExportChapterInput[],
  schema: Schema,
  options?: BookExportAozoraConversionOptions,
): BookExportAozoraConversionResult {
  const assembled = assembleBookExportDocInternal(chapters, schema, options)
  if (assembled.kind !== 'ok') return assembled

  const includeChapterInfo = options?.includeChapterInfo === true
  const chapterInfos = includeChapterInfo
    ? buildChapterInfos(chapters, assembled.result.chapterStartIndices)
    : undefined

  const aozoraOptions: AozoraTextExportOptions = {
    ...options?.export,
    includeBookInfo: options?.includeBookInfo === true,
    bookInfo: options?.bookInfo,
    includeChapterInfo,
    chapterInfos,
    showRoleLabels: options?.showRoleLabels ?? true,
  }

  return {
    kind: 'ok',
    result: exportAozoraTextFromDoc(assembled.result.doc, aozoraOptions),
    plan: assembled.result.plan,
  }
}

/**
 * Book 全体 → Web Book のpure conversion。assembly / missing-chapter 契約は他 converter と同一。
 * `chapterStartIndices` を Web Book heading namespace に渡す。IPC / UI はこのpure境界の外側に置く。
 */
export type BookExportWebBookConversionOptions = BookExportConversionOptions & {
  /** Web Book 専用 semantic option。 */
  webBook?: WebBookExportOptions
  /**
   * Book 全体の文書情報として使う metadata。Book manifest 由来の値を main 側が
   * 渡し、単独文書 export の option とは共有しない。
   */
  bookInfo?: HtmlDocumentInfo
  /**
   * Export 開始時点の active document から解決した Web Book Author snapshot。
   * Book Theme は未導入のため、指定時は Book 全章へ同一 snapshot を一度だけ埋め込む。
   */
  authorPaletteSnapshot?: WebBookPaletteSnapshotInput
  /**
   * Export 開始時点の Display Settings 由来見出し appearance。
   * palette と同様、Book 全章へ同一 snapshot を一度だけ渡す。
   */
  typographySnapshot?: WebBookTypographySnapshotInput
  /**
   * Export 開始時点の Display Settings 由来 auto TCY。
   * palette / typography と同様、Book 全章へ同一 snapshot を一度だけ渡す。
   */
  autoTcySnapshot?: WebBookAutoTcySnapshotInput
}

export type BookExportWebBookConversionResult =
  | { kind: 'ok'; result: WebBookExportResult; plan: readonly BookExportChapterPlan[] }
  | BookExportConversionFailure

export function exportBookExportChaptersToWebBook(
  chapters: readonly BookExportChapterInput[],
  schema: Schema,
  options?: BookExportWebBookConversionOptions,
): BookExportWebBookConversionResult {
  const assembled = assembleBookExportDocInternal(chapters, schema, options)
  if (assembled.kind !== 'ok') return assembled

  const includeChapterInfo = options?.webBook?.includeChapterInfo === true
  const chapterInfos = includeChapterInfo
    ? buildChapterInfos(chapters, assembled.result.chapterStartIndices)
    : undefined

  const outlineChapters = chapters.map((chapter, index) => ({
    chapter: index + 1,
    title: chapter.title,
  }))

  const webBookOptions: WebBookExportOptions = {
    ...options?.export,
    ...options?.webBook,
    documentInfo: options?.bookInfo,
    chapterInfos,
    chapterStartIndices: assembled.result.chapterStartIndices,
    outlineChapters,
    authorPaletteSnapshot: options?.authorPaletteSnapshot,
    typographySnapshot: options?.typographySnapshot,
    autoTcySnapshot: options?.autoTcySnapshot,
  }

  return {
    kind: 'ok',
    result: exportWebBookFromDoc(assembled.result.doc, webBookOptions),
    plan: assembled.result.plan,
  }
}
