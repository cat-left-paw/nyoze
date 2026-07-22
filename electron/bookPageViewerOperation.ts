/**
 * Book 全体 Page Viewer の main 側 operation。
 *
 * Book export と同じ read-only v3 loader を使い、viewer window へ渡す
 * JSON-serializable snapshot だけを組み立てる。PMNode / PageViewModel は
 * viewer window 側で parse / build し直すため、ここでは作らない。
 */

import fs from "node:fs";
import path from "node:path";
import {
  type BookExportBookSelector,
  type BookExportChapterLoadFailure,
  type BookExportChapterLoadWarning,
  loadBookExportChaptersForProject,
} from "./bookExportChapterLoader";
import { createRegistryDiskResolver } from "./bookManifestPathResolver";
import { mapBookSummaryToHtmlDocumentInfo } from "./bookExportOperation";
import { isWithinDirectory, validatePathArg } from "./ipcSecurity";
import type { ProjectIpcBoundary } from "./projectIpc";
import { resolveProjectRootWithFs } from "./projectStore";
import type { HeadingAlign, HeadingDividerLevels, WritingMode } from "../src/settings/types";
import type { PageViewerSnapshotRequest, PageViewerMetadataDisplaySnapshot } from "../src/ui/page-viewer/pageViewerTypes";
import {
  validatePageViewerUiThemeSnapshot,
  type PageViewerUiThemeSnapshot,
} from "../src/ui/page-viewer/pageViewerUiTheme";

export type BookPageViewerAppearanceSnapshot = {
  tableOfContentsMaxLevel?: number;
  writingMode?: WritingMode;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  pageColor?: string;
  textColor?: string;
  headingColor?: string;
  /** PV-SET-1A: 見出し / ルビの見た目 snapshot (§ pageViewerTypes.ts と同じ意味論)。 */
  headingFontFamily?: string;
  headingMarginAfter?: number;
  headingDividerLevels?: HeadingDividerLevels;
  headingAlignHorizontal?: HeadingAlign;
  headingAlignVertical?: HeadingAlign;
  rubySize?: number;
  /** PV-SET-1B: display-only auto TCY (§ pageViewerTypes.ts / DisplaySettings と同じ意味)。 */
  autoTcyEnabled?: boolean;
  autoTcyNumbersOnly?: boolean;
  autoTcyMinDigits?: number;
  autoTcyMaxDigits?: number;
  /** PV-COL-15: active document viewer と同じ UI theme snapshot (§ pageViewerTypes.ts)。 */
  uiTheme?: PageViewerUiThemeSnapshot;
};

/**
 * PV-SET-4A / PV-READ-1: Page Viewer（active document / Book Viewer 共通）の
 * 読書用 settings。appearance / metadataDisplay とは別グループにする
 * (色・フォント等の見た目でも metadata 表示可否でもなく、page composition /
 * reading surface の設定であるため)。Book Composer の章間改ページ・章扉とは無関係。
 */
export type BookPageViewerReadingSettingsSnapshot = {
  pageViewerBreakBeforeHeading?: boolean;
  pageViewerBreakBeforeHeadingMaxLevel?: number;
  pageViewerReadingMarginTop?: number;
  pageViewerReadingMarginBottom?: number;
  pageViewerReadingMarginInline?: number;
  pageViewerReadingPaperFrame?: boolean;
  pageViewerReadingHeaderEnabled?: boolean;
  pageViewerReadingHeaderAlign?: "start" | "center" | "end";
  pageViewerReadingHeaderContent?: "title" | "title-author";
  pageViewerReadingFooterEnabled?: boolean;
  pageViewerReadingFooterAlign?: "start" | "center" | "end";
  pageViewerReadingSimpleCoverEnabled?: boolean;
  pageViewerReadingSimpleCoverWritingMode?: "inherit" | "vertical-rl" | "horizontal-tb";
  pageViewerReadingSimpleCoverLayout?: "normal" | "center";
};

export type BookPageViewerRequest = {
  selector: BookExportBookSelector;
  appearance?: BookPageViewerAppearanceSnapshot;
  /** PV-SET-2: appearance とは分離した metadata visibility snapshot。 */
  metadataDisplay?: PageViewerMetadataDisplaySnapshot;
  /** PV-SET-4A: 見出し前改ページの読書用 pagination default snapshot。 */
  readingSettings?: BookPageViewerReadingSettingsSnapshot;
};

export type BookPageViewerPrepareResult =
  | {
      kind: "ok";
      snapshot: PageViewerSnapshotRequest;
      /** main 側 scope store だけが消費する chapter path -> trusted real base directory。 */
      chapterImageBaseDirectories: Readonly<Record<string, string>>;
      chapterLoadWarnings: BookExportChapterLoadWarning[];
    }
  | { kind: "validation-failed"; errorMessage: string }
  | { kind: "not-in-project" }
  | { kind: "loader-failed"; failure: BookExportChapterLoadFailure }
  | {
      kind: "missing-chapters";
      chapterLoadWarnings: BookExportChapterLoadWarning[];
    };

export type BookPageViewerIpcResult =
  | {
      kind: "opened";
      payloadId: string;
      chapterLoadWarnings: BookExportChapterLoadWarning[];
    }
  | Exclude<BookPageViewerPrepareResult, { kind: "ok" }>;

function resolveBoundedDocumentPath(
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

function parseBookPageViewerSelector(raw: unknown): BookExportBookSelector | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.bookId === "string" && raw.bookId.length > 0) {
    return { bookId: raw.bookId };
  }
  if (typeof raw.bookName === "string" && raw.bookName.length > 0) {
    return { bookName: raw.bookName };
  }
  return null;
}

function parseBookPageViewerAppearance(raw: unknown): BookPageViewerAppearanceSnapshot | undefined {
  if (!isPlainObject(raw)) return undefined;
  const appearance: BookPageViewerAppearanceSnapshot = {};
  if (typeof raw.tableOfContentsMaxLevel === "number") {
    appearance.tableOfContentsMaxLevel = raw.tableOfContentsMaxLevel;
  }
  if (raw.writingMode === "vertical-rl" || raw.writingMode === "horizontal-tb") {
    appearance.writingMode = raw.writingMode;
  }
  if (typeof raw.fontSize === "number") appearance.fontSize = raw.fontSize;
  if (typeof raw.fontFamily === "string") appearance.fontFamily = raw.fontFamily;
  if (typeof raw.lineHeight === "number") appearance.lineHeight = raw.lineHeight;
  if (typeof raw.pageColor === "string") appearance.pageColor = raw.pageColor;
  if (typeof raw.textColor === "string") appearance.textColor = raw.textColor;
  if (typeof raw.headingColor === "string") appearance.headingColor = raw.headingColor;
  if (typeof raw.headingFontFamily === "string") appearance.headingFontFamily = raw.headingFontFamily;
  if (typeof raw.headingMarginAfter === "number") appearance.headingMarginAfter = raw.headingMarginAfter;
  if (isPlainObject(raw.headingDividerLevels)) {
    appearance.headingDividerLevels = raw.headingDividerLevels as HeadingDividerLevels;
  }
  if (raw.headingAlignHorizontal === "start" || raw.headingAlignHorizontal === "center" || raw.headingAlignHorizontal === "end") {
    appearance.headingAlignHorizontal = raw.headingAlignHorizontal;
  }
  if (raw.headingAlignVertical === "start" || raw.headingAlignVertical === "center" || raw.headingAlignVertical === "end") {
    appearance.headingAlignVertical = raw.headingAlignVertical;
  }
  if (typeof raw.rubySize === "number") appearance.rubySize = raw.rubySize;
  if (typeof raw.autoTcyEnabled === "boolean") appearance.autoTcyEnabled = raw.autoTcyEnabled;
  if (typeof raw.autoTcyNumbersOnly === "boolean") appearance.autoTcyNumbersOnly = raw.autoTcyNumbersOnly;
  if (typeof raw.autoTcyMinDigits === "number") appearance.autoTcyMinDigits = raw.autoTcyMinDigits;
  if (typeof raw.autoTcyMaxDigits === "number") appearance.autoTcyMaxDigits = raw.autoTcyMaxDigits;
  // Lenient here (matches the other fields' typeof-only narrowing) — the
  // authoritative, strict validation happens once more when the constructed
  // `PageViewerSnapshotRequest` is re-checked by `validatePageViewerSnapshotRequest`
  // in main.ts (`pageViewer:openBook`). A malformed `uiTheme` here just fails
  // to survive that later validation and the viewer falls back to its
  // existing chrome tokens — it never bypasses the shared validator.
  const validUiTheme = validatePageViewerUiThemeSnapshot(raw.uiTheme);
  if (validUiTheme) appearance.uiTheme = validUiTheme;
  return Object.keys(appearance).length > 0 ? appearance : undefined;
}

function parseBookPageViewerMetadataDisplay(raw: unknown): PageViewerMetadataDisplaySnapshot | undefined {
  if (!isPlainObject(raw)) return undefined;
  const metadataDisplay: PageViewerMetadataDisplaySnapshot = {};
  // Lenient typeof-only narrowing (same as appearance booleans). Strict
  // validation is `validatePageViewerSnapshotRequest` in main.ts.
  if (typeof raw.frontmatterVisible === "boolean") {
    metadataDisplay.frontmatterVisible = raw.frontmatterVisible;
  }
  if (typeof raw.frontmatterShowAuthors === "boolean") {
    metadataDisplay.frontmatterShowAuthors = raw.frontmatterShowAuthors;
  }
  if (typeof raw.frontmatterShowTranslators === "boolean") {
    metadataDisplay.frontmatterShowTranslators = raw.frontmatterShowTranslators;
  }
  if (typeof raw.frontmatterShowRoleLabels === "boolean") {
    metadataDisplay.frontmatterShowRoleLabels = raw.frontmatterShowRoleLabels;
  }
  if (typeof raw.frontmatterShowInProjectFiles === "boolean") {
    metadataDisplay.frontmatterShowInProjectFiles = raw.frontmatterShowInProjectFiles;
  }
  if (typeof raw.frontmatterProjectShowTitle === "boolean") {
    metadataDisplay.frontmatterProjectShowTitle = raw.frontmatterProjectShowTitle;
  }
  if (typeof raw.frontmatterProjectShowAuthors === "boolean") {
    metadataDisplay.frontmatterProjectShowAuthors = raw.frontmatterProjectShowAuthors;
  }
  return Object.keys(metadataDisplay).length > 0 ? metadataDisplay : undefined;
}

/**
 * Lenient typeof-only narrowing (同上の appearance / metadataDisplay と同じ
 * 方針)。厳密な検証は main.ts で再構成後の `PageViewerSnapshotRequest` に対して
 * `validatePageViewerSnapshotRequest` が行う。
 */
function parseBookPageViewerReadingSettings(raw: unknown): BookPageViewerReadingSettingsSnapshot | undefined {
  if (!isPlainObject(raw)) return undefined;
  const readingSettings: BookPageViewerReadingSettingsSnapshot = {};
  if (typeof raw.pageViewerBreakBeforeHeading === "boolean") {
    readingSettings.pageViewerBreakBeforeHeading = raw.pageViewerBreakBeforeHeading;
  }
  if (typeof raw.pageViewerBreakBeforeHeadingMaxLevel === "number") {
    readingSettings.pageViewerBreakBeforeHeadingMaxLevel = raw.pageViewerBreakBeforeHeadingMaxLevel;
  }
  if (typeof raw.pageViewerReadingMarginTop === "number") {
    readingSettings.pageViewerReadingMarginTop = raw.pageViewerReadingMarginTop;
  }
  if (typeof raw.pageViewerReadingMarginBottom === "number") {
    readingSettings.pageViewerReadingMarginBottom = raw.pageViewerReadingMarginBottom;
  }
  if (typeof raw.pageViewerReadingMarginInline === "number") {
    readingSettings.pageViewerReadingMarginInline = raw.pageViewerReadingMarginInline;
  }
  if (typeof raw.pageViewerReadingPaperFrame === "boolean") {
    readingSettings.pageViewerReadingPaperFrame = raw.pageViewerReadingPaperFrame;
  }
  if (typeof raw.pageViewerReadingHeaderEnabled === "boolean") {
    readingSettings.pageViewerReadingHeaderEnabled = raw.pageViewerReadingHeaderEnabled;
  }
  if (raw.pageViewerReadingHeaderAlign === "start" || raw.pageViewerReadingHeaderAlign === "center" || raw.pageViewerReadingHeaderAlign === "end") {
    readingSettings.pageViewerReadingHeaderAlign = raw.pageViewerReadingHeaderAlign;
  }
  if (raw.pageViewerReadingHeaderContent === "title" || raw.pageViewerReadingHeaderContent === "title-author") {
    readingSettings.pageViewerReadingHeaderContent = raw.pageViewerReadingHeaderContent;
  }
  if (typeof raw.pageViewerReadingFooterEnabled === "boolean") {
    readingSettings.pageViewerReadingFooterEnabled = raw.pageViewerReadingFooterEnabled;
  }
  if (raw.pageViewerReadingFooterAlign === "start" || raw.pageViewerReadingFooterAlign === "center" || raw.pageViewerReadingFooterAlign === "end") {
    readingSettings.pageViewerReadingFooterAlign = raw.pageViewerReadingFooterAlign;
  }
  if (typeof raw.pageViewerReadingSimpleCoverEnabled === "boolean") {
    readingSettings.pageViewerReadingSimpleCoverEnabled = raw.pageViewerReadingSimpleCoverEnabled;
  }
  if (raw.pageViewerReadingSimpleCoverWritingMode === "inherit" || raw.pageViewerReadingSimpleCoverWritingMode === "vertical-rl" || raw.pageViewerReadingSimpleCoverWritingMode === "horizontal-tb") {
    readingSettings.pageViewerReadingSimpleCoverWritingMode = raw.pageViewerReadingSimpleCoverWritingMode;
  }
  if (raw.pageViewerReadingSimpleCoverLayout === "normal" || raw.pageViewerReadingSimpleCoverLayout === "center") {
    readingSettings.pageViewerReadingSimpleCoverLayout = raw.pageViewerReadingSimpleCoverLayout;
  }
  return Object.keys(readingSettings).length > 0 ? readingSettings : undefined;
}

export function parseBookPageViewerRequest(raw: unknown): BookPageViewerRequest | null {
  if (!isPlainObject(raw)) return null;
  const selector = parseBookPageViewerSelector(raw.selector);
  if (!selector) return null;
  const metadataDisplay = parseBookPageViewerMetadataDisplay(raw.metadataDisplay);
  const readingSettings = parseBookPageViewerReadingSettings(raw.readingSettings);
  return {
    selector,
    appearance: parseBookPageViewerAppearance(raw.appearance),
    ...(metadataDisplay ? { metadataDisplay } : {}),
    ...(readingSettings ? { readingSettings } : {}),
  };
}

export async function runBookPageViewerOperation(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
  request: BookPageViewerRequest,
): Promise<BookPageViewerPrepareResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) {
    return { kind: "validation-failed", errorMessage: "表示元のファイルパスが不正です。" };
  }

  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { kind: "not-in-project" };

  const loaded = await loadBookExportChaptersForProject(resolved.projectRoot, request.selector);
  if (loaded.kind !== "ok") {
    return { kind: "loader-failed", failure: loaded };
  }

  if (loaded.chapters.some((chapter) => chapter.markdown === null)) {
    return {
      kind: "missing-chapters",
      chapterLoadWarnings: loaded.warnings,
    };
  }

  // Book loader と同じ v3 registry disk resolver で chapter file をもう一度解決し、
  // Markdown と同じ「実 chapter file の parent」を image base にする。ここで得る
  // absolute directory は main 内部の scope store 専用で、snapshot へは渡さない。
  const imageResolver = createRegistryDiskResolver(resolved.projectRoot);
  const chapterImageBaseDirectories: Record<string, string> = {};
  for (const chapter of loaded.chapters) {
    try {
      const realChapterPath = fs.realpathSync(imageResolver.resolveAbsolutePath(chapter.path));
      const stat = fs.statSync(realChapterPath);
      if (stat.isFile()) {
        chapterImageBaseDirectories[chapter.path] = path.dirname(realChapterPath);
      }
    } catch {
      // Chapter Markdown has already loaded successfully. A concurrent delete/
      // replacement only suppresses images for this chapter; it never widens a
      // base directory or creates a partial Book viewer payload.
    }
  }

  const bookInfo = mapBookSummaryToHtmlDocumentInfo(loaded.book);
  const snapshot: PageViewerSnapshotRequest = {
    kind: "book",
    title: loaded.book.name,
    bookInfo,
    chapters: loaded.chapters.map((chapter) => ({
      path: chapter.path,
      title: chapter.title,
      authors: chapter.authors,
      translators: chapter.translators,
      markdown: chapter.markdown as string,
    })),
    includeTableOfContents: true,
    tableOfContentsMaxLevel: request.appearance?.tableOfContentsMaxLevel,
    writingMode: loaded.book.writingMode ?? request.appearance?.writingMode,
    fontSize: request.appearance?.fontSize,
    fontFamily: request.appearance?.fontFamily,
    lineHeight: request.appearance?.lineHeight,
    pageColor: request.appearance?.pageColor,
    textColor: request.appearance?.textColor,
    headingColor: request.appearance?.headingColor,
    headingFontFamily: request.appearance?.headingFontFamily,
    headingMarginAfter: request.appearance?.headingMarginAfter,
    headingDividerLevels: request.appearance?.headingDividerLevels,
    headingAlignHorizontal: request.appearance?.headingAlignHorizontal,
    headingAlignVertical: request.appearance?.headingAlignVertical,
    rubySize: request.appearance?.rubySize,
    autoTcyEnabled: request.appearance?.autoTcyEnabled,
    autoTcyNumbersOnly: request.appearance?.autoTcyNumbersOnly,
    autoTcyMinDigits: request.appearance?.autoTcyMinDigits,
    autoTcyMaxDigits: request.appearance?.autoTcyMaxDigits,
    frontmatterVisible: request.metadataDisplay?.frontmatterVisible,
    frontmatterShowAuthors: request.metadataDisplay?.frontmatterShowAuthors,
    frontmatterShowTranslators: request.metadataDisplay?.frontmatterShowTranslators,
    frontmatterShowRoleLabels: request.metadataDisplay?.frontmatterShowRoleLabels,
    frontmatterShowInProjectFiles: request.metadataDisplay?.frontmatterShowInProjectFiles,
    frontmatterProjectShowTitle: request.metadataDisplay?.frontmatterProjectShowTitle,
    frontmatterProjectShowAuthors: request.metadataDisplay?.frontmatterProjectShowAuthors,
    pageViewerBreakBeforeHeading: request.readingSettings?.pageViewerBreakBeforeHeading,
    pageViewerBreakBeforeHeadingMaxLevel: request.readingSettings?.pageViewerBreakBeforeHeadingMaxLevel,
    pageViewerReadingMarginTop: request.readingSettings?.pageViewerReadingMarginTop,
    pageViewerReadingMarginBottom: request.readingSettings?.pageViewerReadingMarginBottom,
    pageViewerReadingMarginInline: request.readingSettings?.pageViewerReadingMarginInline,
    pageViewerReadingPaperFrame: request.readingSettings?.pageViewerReadingPaperFrame,
    pageViewerReadingHeaderEnabled: request.readingSettings?.pageViewerReadingHeaderEnabled,
    pageViewerReadingHeaderAlign: request.readingSettings?.pageViewerReadingHeaderAlign,
    pageViewerReadingHeaderContent: request.readingSettings?.pageViewerReadingHeaderContent,
    pageViewerReadingFooterEnabled: request.readingSettings?.pageViewerReadingFooterEnabled,
    pageViewerReadingFooterAlign: request.readingSettings?.pageViewerReadingFooterAlign,
    pageViewerReadingSimpleCoverEnabled: request.readingSettings?.pageViewerReadingSimpleCoverEnabled,
    pageViewerReadingSimpleCoverWritingMode: request.readingSettings?.pageViewerReadingSimpleCoverWritingMode,
    pageViewerReadingSimpleCoverLayout: request.readingSettings?.pageViewerReadingSimpleCoverLayout,
    uiTheme: request.appearance?.uiTheme,
  };

  return {
    kind: "ok",
    snapshot,
    chapterImageBaseDirectories,
    chapterLoadWarnings: loaded.warnings,
  };
}
