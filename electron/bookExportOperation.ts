/**
 * Book 全体 export の main 側 operation（loader + conversion + Save dialog + write）。
 *
 * 設計の正本: `docs/book-export-design-2026-07.md`
 *
 * 不変条件:
 * - Book export は **disk 上の chapter Markdown を read-only** に読む。WYSIWYG の dirty /
 *   未保存 editor state は扱わない（active document export とは別経路）。
 * - `.nyoze/books.json` / `notes.json` / chapter Markdown / frontmatter は読むだけで
 *   書き換えない。v3 read-only loader だけを使う。
 * - renderer から projectRoot を受け取らない。active file path から main 側で解決する。
 * - export 先ファイルへの write 以外の project metadata は変更しない。
 * - `trackDocumentPath` は呼ばない（active document export と同様）。
 */

import path from "node:path";
import fs from "node:fs";
import type { IpcMainInvokeEvent } from "electron";
import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { buildExtensions } from "../src/editor-core/extensions/buildExtensions";
import type { BookExportChapterPlan } from "../src/editor-core/export/bookExportAssembly";
import type { BookExportConversionOptions } from "../src/editor-core/export/bookExportConversion";
import {
  exportBookExportChaptersToAozora,
  exportBookExportChaptersToDenden,
  exportBookExportChaptersToLeME,
  exportBookExportChaptersToWebBook,
} from "../src/editor-core/export/bookExportConversion";
import type { AozoraTextExportWarning } from "../src/editor-core/export/aozoraTextExport";
import type { DendenMarkdownExportWarning } from "../src/editor-core/export/dendenMarkdownExport";
import type { LeMEMarkdownExportWarning } from "../src/editor-core/export/lemeMarkdownExport";
import {
  type HtmlDocumentInfo,
  type HtmlExportWarning,
} from "../src/editor-core/export/htmlExportSemantic";
import { resolveTableOfContentsMaxLevel } from "../src/editor-core/export/htmlExportSemantic";
import type { WebBookExportOptions } from "../src/editor-core/export/webBookExport";
import {
  normalizeWebBookPaletteSnapshot,
  type WebBookPaletteSnapshot,
} from "../src/editor-core/export/webBookPaletteSnapshot";
import {
  normalizeWebBookTypographySnapshot,
  type WebBookTypographySnapshot,
} from "../src/editor-core/export/webBookTypographySnapshot";
import {
  normalizeWebBookAutoTcySnapshot,
  type WebBookAutoTcySnapshot,
} from "../src/editor-core/export/webBookAutoTcySnapshot";
import type { ExternalExportOptions } from "../src/editor-core/export/externalExportOptions";
import type { LineBreakPolicy } from "../src/editor-core/types";
import { validatePathArg, isWithinDirectory } from "./ipcSecurity";
import { classifySaveError, type SaveErrorKind } from "./atomicSave";
import { writeAozoraTextExportFile } from "./aozoraTextExportWrite";
import { writeLeMEMarkdownExportFile } from "./lemeMarkdownExportWrite";
import { writeDendenMarkdownExportFile } from "./dendenMarkdownExportWrite";
import { writeHtmlExportFile } from "./htmlExportWrite";
import {
  loadBookExportChaptersForProject,
  type BookExportBookSelector,
  type BookExportBookSummary,
  type BookExportChapterLoadFailure,
  type BookExportChapterLoadWarning,
} from "./bookExportChapterLoader";
import type { ProjectIpcBoundary } from "./projectIpc";
import { resolveProjectRootWithFs } from "./projectStore";
import { createRegistryDiskResolver } from "./bookManifestPathResolver";
import {
  materializeWebBookDataUrls,
  resolveWebBookAssets,
  type ResolvedWebBookAssetRegistry,
  type ResolveWebBookAssetOriginContext,
  type WebBookResolvedLargeImageWarning,
} from "./webBookAssetResolution";
import {
  evaluateWebBookCapacity,
  isSingleHtmlHardCapExceeded,
  type WebBookCapacityReport,
} from "./webBookCapacity";
import { DEFAULT_WEB_BOOK_OUTPUT_PROFILE, materializeWebBookTemplate } from "../src/editor-core/export/webBookAssetPlan";
import type { WebBookAssetFailure } from "../src/editor-core/export/webBookAssetPlan";
import { packageAssetUrlByRefId, webBookPackageWriteErrorMessage, writeWebBookPackage } from "./webBookPackageWrite";

export type BookExportFormat = "leme" | "denden" | "aozora" | "webBook";

export type BookExportSelector = BookExportBookSelector;

/**
 * `includeBookInfo` / `includeChapterInfo` / `showRoleLabels` は LeME / でんでん /
 * 青空文庫風の Book 全体 export 専用 option（2026-07-09、UI / IPC 接続）。
 * on/off の boolean だけを受け取り、実際の作品情報 (`bookInfo`) は
 * `prepareBookExportContent` が `loaded.book`（Book metadata）から一意に
 * 組み立てる（renderer からは受け取らない。§`mapBookSummaryToHtmlDocumentInfo`）。
 * 章ファイル情報 (`chapterInfos`) も同様に `bookExportConversion.ts` が
 * `loaded.chapters`（v3 body item 由来）から組み立てる。
 *
 * `options.webBook` は Web Book format 専用。`documentInfo` はここでは指定できない
 * （renderer からは渡させず、`prepareBookExportContent` が `loaded.book`
 * — Book metadata — から一意に組み立てる。§ `mapBookSummaryToHtmlDocumentInfo`）。
 * `title` も同様に、renderer から届いた値があっても常に Book title で上書きする。
 */
export type BookExportRequest = {
  selector: BookExportSelector;
  format: BookExportFormat;
  options?: BookExportConversionOptions & {
    includeBookInfo?: boolean;
    includeChapterInfo?: boolean;
    showRoleLabels?: boolean;
    webBook?: WebBookExportOptions;
    authorPaletteSnapshot?: WebBookPaletteSnapshot;
    typographySnapshot?: WebBookTypographySnapshot;
    autoTcySnapshot?: WebBookAutoTcySnapshot;
    /** WB-IMG-3A: UX-only soft capacity ack for this attempt. Never bypasses hard limits. */
    capacityWarningsAcknowledged?: boolean;
  };
};

export type BookExportConversionWarning =
  | LeMEMarkdownExportWarning
  | DendenMarkdownExportWarning
  | AozoraTextExportWarning
  | HtmlExportWarning;

export type BookExportPrepareSuccess = {
  kind: "ok";
  book: BookExportBookSummary;
  text: string;
  conversionWarnings: BookExportConversionWarning[];
  chapterLoadWarnings: BookExportChapterLoadWarning[];
  assetRegistry?: ResolvedWebBookAssetRegistry;
};

export type BookExportConversionFailed = {
  kind: "conversion-failed";
  reason: "missing-chapters";
  plan: readonly BookExportChapterPlan[];
  chapterLoadWarnings: BookExportChapterLoadWarning[];
};

/**
 * WB-IMG-1: one or more `nyoze_image` references in the Book failed asset
 * validation (bad scheme, outside allowed root, missing, wrong format, too
 * large, ...). The whole Web Book export aborts before any Save dialog /
 * write — see `docs/web-book-assets-design-2026-07.md` §8.
 */
export type BookExportAssetError = {
  kind: "asset-error";
  failures: readonly WebBookAssetFailure[];
  chapterLoadWarnings: BookExportChapterLoadWarning[];
};

/** WB-IMG-1: materialized single HTML exceeded the 100 MiB hard cap. */
export type BookExportHtmlTooLarge = {
  kind: "html-too-large";
  chapterLoadWarnings: BookExportChapterLoadWarning[];
};

/** WB-IMG-3A: soft capacity warnings require user confirmation before dialog/write. */
export type BookExportNeedsCapacityConfirm = {
  kind: "needs-capacity-confirm";
  capacity: WebBookCapacityReport;
  chapterLoadWarnings: BookExportChapterLoadWarning[];
};

export type BookExportPrepareResult =
  | BookExportPrepareSuccess
  | { kind: "loader-failed"; failure: BookExportChapterLoadFailure }
  | BookExportConversionFailed
  | BookExportAssetError
  | BookExportHtmlTooLarge
  | BookExportNeedsCapacityConfirm;

export type BookExportIpcResult =
  | {
      kind: "saved";
      filePath: string;
      backupWarning?: string;
      conversionWarnings: BookExportConversionWarning[];
      chapterLoadWarnings: BookExportChapterLoadWarning[];
    }
  | { kind: "canceled" }
  | {
      kind: "write-failed";
      errorKind: SaveErrorKind;
      errorMessage: string;
      backupWarning?: string;
    }
  | { kind: "loader-failed"; failure: BookExportChapterLoadFailure }
  | BookExportConversionFailed
  | BookExportAssetError
  | BookExportHtmlTooLarge
  | BookExportNeedsCapacityConfirm
  | { kind: "validation-failed"; errorMessage: string }
  | { kind: "not-in-project" };

export type BookExportOperationDeps = {
  createBackupBeforeOverwrite: (filePath: string) => Promise<void>;
  showSaveDialog: (
    opts: Electron.SaveDialogOptions,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog?: (opts: Electron.OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
};

export type ParsedBookExportIpcPayload = {
  filePath: string;
  request: BookExportRequest;
};

let cachedBookExportSchema: Schema | null = null;

function getBookExportSchema(): Schema {
  if (!cachedBookExportSchema) {
    cachedBookExportSchema = getSchema(buildExtensions());
  }
  return cachedBookExportSchema;
}

/** Book 名をファイル名に使えるよう最小限サニタイズする。 */
export function sanitizeBookExportNameSegment(bookName: string): string {
  return bookName
    .trim()
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

const FORMAT_FALLBACK_BASENAME: Record<BookExportFormat, string> = {
  leme: "nyoze-book-export-leme.md",
  denden: "nyoze-book-export-denden.md",
  aozora: "nyoze-book-export-aozora.txt",
  webBook: "nyoze-book-export-web-book.html",
};

const FORMAT_SUFFIX: Record<BookExportFormat, string> = {
  aozora: "-aozora.txt",
  denden: "-denden.md",
  leme: "-leme.md",
  webBook: "-web-book.html",
};

/**
 * Book 名ベースの Save dialog 既定 path。parentDir があればその配下に置く。
 */
export function suggestBookExportDefaultPath(
  bookName: string,
  format: BookExportFormat,
  parentDir?: string | null,
): string {
  const sanitized = sanitizeBookExportNameSegment(bookName);
  const suffix = FORMAT_SUFFIX[format];
  const filename =
    sanitized.length > 0 ? `${sanitized}${suffix}` : FORMAT_FALLBACK_BASENAME[format];
  if (!parentDir) return filename;
  return path.join(parentDir, filename);
}

export function resolveBoundedDocumentPath(
  boundary: ProjectIpcBoundary,
  rawPath: unknown,
): string | null {
  const validPath = validatePathArg(rawPath);
  if (!validPath) return null;
  let realPath: string;
  try {
    realPath = fs.realpathSync(path.resolve(validPath));
  } catch {
    return null;
  }
  const workspaceRoot = boundary.getWorkspaceRoot();
  if (workspaceRoot && isWithinDirectory(realPath, workspaceRoot)) return realPath;
  if (boundary.isAllowedDocumentPath(realPath)) return realPath;
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBookExportSelector(raw: unknown): BookExportSelector | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.bookId === "string" && raw.bookId.length > 0) {
    return { bookId: raw.bookId };
  }
  if (typeof raw.bookName === "string" && raw.bookName.length > 0) {
    return { bookName: raw.bookName };
  }
  return null;
}

function parseBookExportFormat(raw: unknown): BookExportFormat | null {
  if (raw === "leme" || raw === "denden" || raw === "aozora" || raw === "webBook") return raw;
  return null;
}

function parseExternalExportOptions(raw: unknown): ExternalExportOptions | undefined {
  if (!isPlainObject(raw)) return undefined;
  const options: ExternalExportOptions = {};
  if (typeof raw.autoTcy === "boolean") options.autoTcy = raw.autoTcy;
  if (typeof raw.tcyMinDigits === "number") options.tcyMinDigits = raw.tcyMinDigits;
  if (typeof raw.tcyMaxDigits === "number") options.tcyMaxDigits = raw.tcyMaxDigits;
  if (typeof raw.tcyNumbersOnly === "boolean") options.tcyNumbersOnly = raw.tcyNumbersOnly;
  if (typeof raw.headingAlignment === "boolean") options.headingAlignment = raw.headingAlignment;
  if (typeof raw.pageBreakBeforeHeading === "boolean") {
    options.pageBreakBeforeHeading = raw.pageBreakBeforeHeading;
  }
  if (typeof raw.pageBreakBeforeHeadingMaxLevel === "number") {
    options.pageBreakBeforeHeadingMaxLevel = raw.pageBreakBeforeHeadingMaxLevel;
  }
  if (typeof raw.pageBreak === "boolean") options.pageBreak = raw.pageBreak;
  return options;
}

function parseBookExportBoundaryOptions(
  raw: unknown,
): BookExportConversionOptions["boundary"] | undefined {
  if (!isPlainObject(raw)) return undefined;
  const boundary: NonNullable<BookExportConversionOptions["boundary"]> = {};
  if (typeof raw.insertPageBreakBetweenChapters === "boolean") {
    boundary.insertPageBreakBetweenChapters = raw.insertPageBreakBetweenChapters;
  }
  if (typeof raw.pageBreakEnabled === "boolean") {
    boundary.pageBreakEnabled = raw.pageBreakEnabled;
  }
  return boundary;
}

function parseLineBreakPolicy(raw: unknown): LineBreakPolicy | undefined {
  if (raw === "obsidian-paragraph" || raw === "commonmark-strict") return raw;
  return undefined;
}

/** Web Book 固有の純粋semantic option。Reader session stateやraw CSSは受け取らない。 */
function parseWebBookExportOptions(raw: unknown): WebBookExportOptions | undefined {
  if (!isPlainObject(raw)) return undefined;
  const options: WebBookExportOptions = {};
  if (typeof raw.includeDocumentInfo === "boolean") {
    options.includeDocumentInfo = raw.includeDocumentInfo;
  }
  if (typeof raw.includeTableOfContents === "boolean") {
    options.includeTableOfContents = raw.includeTableOfContents;
  }
  if (raw.tableOfContentsMaxLevel !== undefined) {
    options.tableOfContentsMaxLevel = resolveTableOfContentsMaxLevel(
      typeof raw.tableOfContentsMaxLevel === "number"
        ? raw.tableOfContentsMaxLevel
        : undefined,
    );
  }
  if (typeof raw.showRoleLabels === "boolean") {
    options.showRoleLabels = raw.showRoleLabels;
  }
  if (typeof raw.includeChapterInfo === "boolean") {
    options.includeChapterInfo = raw.includeChapterInfo;
  }
  if (typeof raw.breakAfterDocumentInfo === "boolean") {
    options.breakAfterDocumentInfo = raw.breakAfterDocumentInfo;
  }
  // WB-R9: 簡易表紙 option。boolean / 列挙値だけを厳密に受理し、それ以外
  // （文字列 boolean、未知の書字方向・レイアウト、raw CSS、旧 temporary の
  // documentInfoTitlePagePlacement 等）は黙って落とす（既定値で export される）。
  // Book info だけに適用され、chapterInfo へは semantic serializer が構造的に
  // 適用しない。
  if (typeof raw.documentInfoTitlePage === "boolean") {
    options.documentInfoTitlePage = raw.documentInfoTitlePage;
  }
  if (
    raw.documentInfoTitlePageWritingMode === "inherit" ||
    raw.documentInfoTitlePageWritingMode === "vertical-rl" ||
    raw.documentInfoTitlePageWritingMode === "horizontal-tb"
  ) {
    options.documentInfoTitlePageWritingMode = raw.documentInfoTitlePageWritingMode;
  }
  if (
    raw.documentInfoTitlePageLayout === "normal" ||
    raw.documentInfoTitlePageLayout === "center"
  ) {
    options.documentInfoTitlePageLayout = raw.documentInfoTitlePageLayout;
  }
  if (raw.writingMode === "vertical-rl" || raw.writingMode === "horizontal-tb") {
    options.writingMode = raw.writingMode;
  }
  if (raw.outputProfile === "package" || raw.outputProfile === "singleHtml") {
    options.outputProfile = raw.outputProfile;
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function parseWebBookPaletteSnapshot(raw: unknown): WebBookPaletteSnapshot | null {
  try {
    return normalizeWebBookPaletteSnapshot(raw)
  } catch {
    return null
  }
}

function parseWebBookTypographySnapshot(raw: unknown): WebBookTypographySnapshot | null {
  try {
    return normalizeWebBookTypographySnapshot(raw)
  } catch {
    return null
  }
}

function parseWebBookAutoTcySnapshot(raw: unknown): WebBookAutoTcySnapshot | null {
  try {
    return normalizeWebBookAutoTcySnapshot(raw)
  } catch {
    return null
  }
}

/**
 * LeME / でんでん / 青空文庫風の Book 全体 export 専用 option。on/off の boolean
 * だけを受け取り、`bookInfo` / `chapterInfos` 本体は受け取らない
 * （`BookExportRequest` の doc comment参照）。
 */
function parseBookExportMetadataOptions(raw: unknown): {
  includeBookInfo?: boolean;
  includeChapterInfo?: boolean;
  showRoleLabels?: boolean;
} | undefined {
  if (!isPlainObject(raw)) return undefined;
  const options: {
    includeBookInfo?: boolean;
    includeChapterInfo?: boolean;
    showRoleLabels?: boolean;
  } = {};
  if (typeof raw.includeBookInfo === "boolean") options.includeBookInfo = raw.includeBookInfo;
  if (typeof raw.includeChapterInfo === "boolean") options.includeChapterInfo = raw.includeChapterInfo;
  if (typeof raw.showRoleLabels === "boolean") options.showRoleLabels = raw.showRoleLabels;
  return Object.keys(options).length > 0 ? options : undefined;
}

function parseBookExportConversionOptions(
  raw: unknown,
  format: BookExportFormat,
): BookExportRequest["options"] {
  if (!isPlainObject(raw)) return undefined;
  const options: NonNullable<BookExportRequest["options"]> = {};
  const boundary = parseBookExportBoundaryOptions(raw.boundary);
  const exportOptions = parseExternalExportOptions(raw.export);
  const lineBreakPolicy = parseLineBreakPolicy(raw.lineBreakPolicy);
  const webBook = parseWebBookExportOptions(raw.webBook);
  const metadata = parseBookExportMetadataOptions(raw);
  if (boundary) options.boundary = boundary;
  if (exportOptions) options.export = exportOptions;
  if (lineBreakPolicy) options.lineBreakPolicy = lineBreakPolicy;
  if (webBook) options.webBook = webBook;
  if (raw.capacityWarningsAcknowledged === true) {
    options.capacityWarningsAcknowledged = true;
  }
  if (format === "webBook") {
    const paletteSnapshot = parseWebBookPaletteSnapshot(raw.authorPaletteSnapshot);
    if (!paletteSnapshot) return undefined;
    options.authorPaletteSnapshot = paletteSnapshot;
    const typographySnapshot = parseWebBookTypographySnapshot(raw.typographySnapshot);
    if (!typographySnapshot) return undefined;
    options.typographySnapshot = typographySnapshot;
    const autoTcySnapshot = parseWebBookAutoTcySnapshot(raw.autoTcySnapshot);
    if (!autoTcySnapshot) return undefined;
    options.autoTcySnapshot = autoTcySnapshot;
  }
  if (metadata) Object.assign(options, metadata);
  return Object.keys(options).length > 0 ? options : undefined;
}

export function parseBookExportIpcPayload(raw: unknown): ParsedBookExportIpcPayload | null {
  if (!isPlainObject(raw)) return null;
  const filePath = validatePathArg(raw.filePath);
  if (!filePath) return null;
  const selector = parseBookExportSelector(raw.selector);
  const format = parseBookExportFormat(raw.format);
  if (!selector || !format) return null;
  const options = parseBookExportConversionOptions(raw.options, format);
  if (
    format === "webBook" &&
    (!options?.authorPaletteSnapshot || !options?.typographySnapshot || !options?.autoTcySnapshot)
  ) {
    return null;
  }
  return {
    filePath,
    request: { selector, format, options },
  };
}

function saveDialogOptionsForFormat(
  format: BookExportFormat,
  defaultPath?: string,
): Electron.SaveDialogOptions {
  if (format === "aozora") {
    return {
      defaultPath,
      filters: [
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
  }
  if (format === "webBook") {
    return {
      defaultPath,
      filters: [
        { name: "HTML", extensions: ["html"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
  }
  return {
    defaultPath,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
}

/**
 * `.nyoze/books.json` v3 の Book metadata（`BookExportBookSummary`）から
 * HTML export の文書情報表示用 `HtmlDocumentInfo` を組み立てる。
 * frontmatter は読まない（単独文書 HTML export とは別の入力経路）。
 *
 * - `title`: Book title（`book.name`）。
 * - `author`: `book.authors`（配列）を `、` で連結する。0 件なら `undefined`。
 * - `translator`: v3 registry に Book 単位の translator 相当 field が無いため、
 *   無理に作らず常に `undefined`（chapter body item 単位の `translators` は
 *   ここでは参照しない）。
 */
export function mapBookSummaryToHtmlDocumentInfo(book: BookExportBookSummary): HtmlDocumentInfo {
  return {
    title: book.name,
    author: book.authors.length > 0 ? book.authors.join("、") : undefined,
    translator: undefined,
  };
}

/**
 * loader + conversion まで。Save dialog / write は行わない。
 * missing chapter や loader failure では部分 export しない。
 */
export async function prepareBookExportContent(
  projectRoot: string,
  request: BookExportRequest,
): Promise<BookExportPrepareResult> {
  const loaded = await loadBookExportChaptersForProject(projectRoot, request.selector);
  if (loaded.kind !== "ok") {
    return { kind: "loader-failed", failure: loaded };
  }

  const schema = getBookExportSchema();
  const chapters = loaded.chapters;

  switch (request.format) {
    case "leme": {
      const converted = exportBookExportChaptersToLeME(chapters, schema, {
        ...request.options,
        bookInfo: mapBookSummaryToHtmlDocumentInfo(loaded.book),
      });
      if (converted.kind !== "ok") {
        return {
          kind: "conversion-failed",
          reason: "missing-chapters",
          plan: converted.plan,
          chapterLoadWarnings: loaded.warnings,
        };
      }
      return {
        kind: "ok",
        book: loaded.book,
        text: converted.result.text,
        conversionWarnings: converted.result.warnings,
        chapterLoadWarnings: loaded.warnings,
      };
    }
    case "denden": {
      const converted = exportBookExportChaptersToDenden(chapters, schema, {
        ...request.options,
        bookInfo: mapBookSummaryToHtmlDocumentInfo(loaded.book),
      });
      if (converted.kind !== "ok") {
        return {
          kind: "conversion-failed",
          reason: "missing-chapters",
          plan: converted.plan,
          chapterLoadWarnings: loaded.warnings,
        };
      }
      return {
        kind: "ok",
        book: loaded.book,
        text: converted.result.text,
        conversionWarnings: converted.result.warnings,
        chapterLoadWarnings: loaded.warnings,
      };
    }
    case "aozora": {
      const converted = exportBookExportChaptersToAozora(chapters, schema, {
        ...request.options,
        bookInfo: mapBookSummaryToHtmlDocumentInfo(loaded.book),
      });
      if (converted.kind !== "ok") {
        return {
          kind: "conversion-failed",
          reason: "missing-chapters",
          plan: converted.plan,
          chapterLoadWarnings: loaded.warnings,
        };
      }
      return {
        kind: "ok",
        book: loaded.book,
        text: converted.result.text,
        conversionWarnings: converted.result.warnings,
        chapterLoadWarnings: loaded.warnings,
      };
    }
    case "webBook": {
      const webBookOptions: WebBookExportOptions = {
        ...request.options?.webBook,
        title: loaded.book.name,
      };
      const converted = exportBookExportChaptersToWebBook(chapters, schema, {
        ...request.options,
        webBook: webBookOptions,
        bookInfo: mapBookSummaryToHtmlDocumentInfo(loaded.book),
      });
      if (converted.kind !== "ok") {
        return {
          kind: "conversion-failed",
          reason: "missing-chapters",
          plan: converted.plan,
          chapterLoadWarnings: loaded.warnings,
        };
      }

      // WB-IMG-1: each chapter's own real file parent is the asset resolution
      // base dir; the Project root (already resolved by the caller) is the
      // containment boundary. renderer never supplies these — main derives
      // them from the already-loaded, read-only chapter list.
      let registry: ResolvedWebBookAssetRegistry = { assetByRefId: new Map(), assets: [] };
      let largeImageWarnings: readonly WebBookResolvedLargeImageWarning[] = [];
      if (converted.result.assetRequests.length > 0) {
        const diskResolver = createRegistryDiskResolver(projectRoot);
        const chapterBaseDirs = new Map<string, string | null>();
        const resolveOrigin: ResolveWebBookAssetOriginContext = (origin) => {
          if (origin.kind !== "book-chapter") return null;
          const idx = Number(origin.chapterId);
          if (!Number.isInteger(idx) || idx < 0 || idx >= chapters.length) return null;
          let baseDir = chapterBaseDirs.get(origin.chapterId);
          if (baseDir === undefined) {
            try {
              const absolutePath = diskResolver.resolveAbsolutePath(chapters[idx].path);
              baseDir = fs.realpathSync(path.dirname(absolutePath));
            } catch {
              baseDir = null;
            }
            chapterBaseDirs.set(origin.chapterId, baseDir);
          }
          if (baseDir === null) return null;
          return {
            baseDir,
            allowedRoot: projectRoot,
            originLabel: chapters[idx].title || `第${idx + 1}章`,
          };
        };

        const resolved = resolveWebBookAssets(converted.result.assetRequests, resolveOrigin);
        if (!resolved.ok) {
          return {
            kind: "asset-error",
            failures: resolved.failures,
            chapterLoadWarnings: loaded.warnings,
          };
        }
        registry = resolved.registry;
        largeImageWarnings = resolved.largeImageWarnings;
      }

      const outputProfile = request.options?.webBook?.outputProfile ?? DEFAULT_WEB_BOOK_OUTPUT_PROFILE;
      const html = materializeWebBookTemplate(
        converted.result.template,
        outputProfile === "package" ? packageAssetUrlByRefId(registry) : materializeWebBookDataUrls(registry),
      );
      const htmlByteLength = Buffer.byteLength(html, "utf8");
      if (isSingleHtmlHardCapExceeded(outputProfile, htmlByteLength)) {
        return { kind: "html-too-large", chapterLoadWarnings: loaded.warnings };
      }

      const capacity = evaluateWebBookCapacity({
        profile: outputProfile,
        htmlByteLength,
        registry,
        largeImages: largeImageWarnings,
      });
      if (capacity.needsSoftConfirm && request.options?.capacityWarningsAcknowledged !== true) {
        return {
          kind: "needs-capacity-confirm",
          capacity,
          chapterLoadWarnings: loaded.warnings,
        };
      }

      return {
        kind: "ok",
        book: loaded.book,
        text: html,
        conversionWarnings: converted.result.warnings,
        chapterLoadWarnings: loaded.warnings,
        assetRegistry: registry,
      };
    }
  }
}

export async function writeBookExportContent(
  format: BookExportFormat,
  filePath: string,
  text: string,
): Promise<void> {
  switch (format) {
    case "leme":
      await writeLeMEMarkdownExportFile(filePath, text);
      return;
    case "denden":
      await writeDendenMarkdownExportFile(filePath, text);
      return;
    case "aozora":
      await writeAozoraTextExportFile(filePath, text);
      return;
    case "webBook":
      await writeHtmlExportFile(filePath, text);
      return;
  }
}

export async function runBookExportOperation(
  deps: BookExportOperationDeps,
  boundary: ProjectIpcBoundary,
  _event: IpcMainInvokeEvent,
  rawFilePath: unknown,
  request: BookExportRequest,
): Promise<BookExportIpcResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) {
    return { kind: "validation-failed", errorMessage: "書き出し元のファイルパスが不正です。" };
  }

  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) {
    return { kind: "not-in-project" };
  }

  const prepared = await prepareBookExportContent(resolved.projectRoot, request);
  if (prepared.kind === "loader-failed") {
    return { kind: "loader-failed", failure: prepared.failure };
  }
  if (prepared.kind === "conversion-failed") {
    return {
      kind: "conversion-failed",
      reason: prepared.reason,
      plan: prepared.plan,
      chapterLoadWarnings: prepared.chapterLoadWarnings,
    };
  }
  if (prepared.kind === "asset-error") {
    return {
      kind: "asset-error",
      failures: prepared.failures,
      chapterLoadWarnings: prepared.chapterLoadWarnings,
    };
  }
  if (prepared.kind === "html-too-large") {
    return { kind: "html-too-large", chapterLoadWarnings: prepared.chapterLoadWarnings };
  }
  if (prepared.kind === "needs-capacity-confirm") {
    return {
      kind: "needs-capacity-confirm",
      capacity: prepared.capacity,
      chapterLoadWarnings: prepared.chapterLoadWarnings,
    };
  }

  const parentDir = path.dirname(realPath);
  const suggestedPath = suggestBookExportDefaultPath(
    prepared.book.name,
    request.format,
    parentDir,
  );
  if (request.format === "webBook" && request.options?.webBook?.outputProfile === "package") {
    if (!deps.showOpenDialog) return { kind: "write-failed", errorKind: "write-failed", errorMessage: "Web 公開用パッケージを書き出せませんでした。" };
    const directoryResult = await deps.showOpenDialog({
      defaultPath: suggestedPath.replace(/\.html$/i, ""),
      properties: ["openDirectory", "createDirectory"],
    });
    if (directoryResult.canceled || directoryResult.filePaths.length !== 1) return { kind: "canceled" };
    try {
      await writeWebBookPackage(
        directoryResult.filePaths[0],
        prepared.text,
        prepared.assetRegistry ?? { assetByRefId: new Map(), assets: [] },
      );
      return {
        kind: "saved", filePath: directoryResult.filePaths[0],
        conversionWarnings: prepared.conversionWarnings, chapterLoadWarnings: prepared.chapterLoadWarnings,
      };
    } catch (error) {
      return { kind: "write-failed", errorKind: "write-failed", errorMessage: webBookPackageWriteErrorMessage(error) };
    }
  }
  const dialogResult = await deps.showSaveDialog(
    saveDialogOptionsForFormat(request.format, suggestedPath),
  );
  if (dialogResult.canceled || !dialogResult.filePath) {
    return { kind: "canceled" };
  }

  let backupWarning: string | undefined;
  try {
    await deps.createBackupBeforeOverwrite(dialogResult.filePath);
  } catch (error) {
    backupWarning =
      `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
    console.warn("[Nyoze]", backupWarning);
  }

  try {
    await writeBookExportContent(request.format, dialogResult.filePath, prepared.text);
    return {
      kind: "saved",
      filePath: dialogResult.filePath,
      backupWarning,
      conversionWarnings: prepared.conversionWarnings,
      chapterLoadWarnings: prepared.chapterLoadWarnings,
    };
  } catch (error) {
    const { errorKind, errorMessage } = classifySaveError(error);
    return { kind: "write-failed", errorKind, errorMessage, backupWarning };
  }
}
