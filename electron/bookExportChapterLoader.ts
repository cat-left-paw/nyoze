/**
 * Book 全体 export の main / fs 側 chapter loader。
 *
 * 設計の正本は `docs/book-export-design-2026-07.md`。
 *
 * 役割: `.nyoze/books.json` v3 の対象 Book の body items を読み、disk 上の
 * Markdown chapter ファイルを read-only で読み込んで、pure 層
 * （`src/editor-core/export/bookExportAssembly.ts`）へ渡せる
 * `BookExportChapterInput[]` へ変換する。
 *
 * 不変条件:
 * - `.nyoze/books.json` / notes.json / frontmatter / Markdown 本文はすべて
 *   読むだけで書き換えない。writer は一切呼ばない。
 * - v3 SoT のみを使い、version 不一致は unsupported として安全に拒否する。
 * - invalid / 未対応 version / read-error、および「読めたが parser diagnostics
 *   （drop / warning）付き」の v3 は **部分利用しない**。
 * - body item の disk 解決は既存 `bookManifestPathResolver.ts` の
 *   `createRegistryDiskResolver`（exact → segment 単位 NFC 一意一致、
 *   project root 外 symlink は拒否）をそのまま再利用する。stored path
 *   文字列は書き換えない。
 * - chapter title / authors / translators は v3 body item の同名 field
 *   （`title` は正規化済みなので常に非空、`authors` / `translators` は空配列も
 *   許容）を使う。chapter Markdown frontmatter は一切読まない
 *   （HTML export の章ファイル情報表示 option もこの v3 metadata が正本）。
 * - 読み込んだ Markdown はそのまま返すのではなく、先頭 frontmatter を
 *   `splitLeadingFrontmatter`（`src/editor-core/io/frontmatter.ts`。pure /
 *   read-only）で除いた本文だけを `markdown` に入れる。通常の文書読み込み
 *   （`EditorCore.ts`）が `parseMarkdown` へ渡す前に同じ split を行っている
 *   ことに合わせ、`bookExportAssembly.ts` の明示 `:::page-break` 判定
 *   （chapter 本文の先頭ブロック判定）が frontmatter に邪魔されないようにする。
 * - renderer から呼ばれる IPC は持たない（単なる関数呼び出し）。
 * - UI / EditorCore handle / 実 export converter（LeME / Denden / Aozora）
 *   への接続はまだ行わない。
 */

import fs from "node:fs";
import type { WritingMode } from "../src/settings/types";
import {
  planBookExportChapters,
  type BookExportChapterBoundaryOptions,
  type BookExportChapterInput,
  type BookExportChapterPlan,
} from "../src/editor-core/export/bookExportAssembly";
import { splitLeadingFrontmatter } from "../src/editor-core/io/frontmatter";
import { createRegistryDiskResolver } from "./bookManifestPathResolver";
import {
  type BookManifestV3Book,
  type BookManifestV3Registry,
} from "../src/project/bookManifestV3";
import { resolveBookExportTargetFromManifestV3 } from "../src/project/bookManifestV3BookOutline";
import { readBookManifestV3ForProject } from "./bookManifestStore";

/** 対象 Book の選択方法。`bookId` を優先し、無ければ `bookName` で一致させる。 */
export type BookExportBookSelector = { bookId: string } | { bookName: string };

/** Book export に必要な範囲だけの Book summary（v3 registry から抜粋）。 */
export type BookExportBookSummary = {
  id: string;
  name: string;
  authors: string[];
  language: string | null;
  writingMode: WritingMode | null;
};

/**
 * chapter 単位の読み込み警告。読み込みは継続するが、`markdown: null` になった
 * 理由を呼び出し側（将来の UI / 事前警告表示）が判別できるようにする。
 */
export type BookExportChapterLoadWarning =
  | { kind: "chapter-missing"; path: string; title: string }
  | { kind: "chapter-read-error"; path: string; title: string; detail?: string };

export type BookExportChapterLoadSuccess = {
  kind: "ok";
  book: BookExportBookSummary;
  chapters: BookExportChapterInput[];
  warnings: BookExportChapterLoadWarning[];
};

/**
 * Book export 全体を続行できない失敗理由。
 * - `manifest-absent`: `.nyoze/books.json` が無い（Book 未初期化）。
 * - `manifest-invalid`: v3 として正しく解釈できない（JSON parse 失敗 / 非 object /
 *   v3 normalize 失敗 / 非対応 version など）。`detail` に
 *   内部判定の識別子を残す。
 * - `manifest-read-error`: `.nyoze/books.json` の read / symlink 判定で
 *   安全に扱えなかった。
 * - `manifest-diagnostics`: v3 として読めたが、parser が drop / fallback
 *   warning を出している（壊れた entry を含む）。壊れた registry を部分的に
 *   使って一部の章だけ export しない。
 * - `book-not-found`: 指定した `bookId` / `bookName` に一致する Book が無い。
 * - `book-has-no-body-items`: 対象 Book に body item が 1 件も無い。
 */
export type BookExportChapterLoadFailure =
  | { kind: "manifest-absent" }
  | { kind: "manifest-invalid"; detail?: string }
  | { kind: "manifest-read-error"; detail?: string }
  | { kind: "manifest-diagnostics" }
  | { kind: "book-not-found"; bookId?: string; bookName?: string }
  | { kind: "book-has-no-body-items"; bookId: string };

export type BookExportChapterLoadResult =
  | BookExportChapterLoadSuccess
  | BookExportChapterLoadFailure;

function findBook(
  books: readonly BookManifestV3Book[],
  selector: BookExportBookSelector,
): BookManifestV3Book | null {
  if ("bookId" in selector) {
    return books.find((book) => book.id === selector.bookId) ?? null;
  }
  return books.find((book) => book.name === selector.bookName) ?? null;
}

/**
 * `.nyoze/books.json` を「Book export で使える v3 registry」へ絞り込む。
 * v3 として安全に読めた場合だけ利用可能とする。
 */
function resolveManifestForExport(
  projectRoot: string,
): { ok: true; registry: BookManifestV3Registry } | { ok: false; failure: BookExportChapterLoadFailure } {
  const read = readBookManifestV3ForProject(projectRoot);
  switch (read.kind) {
    case "absent":
      return { ok: false, failure: { kind: "manifest-absent" } };
    case "unsupported-version":
      return { ok: false, failure: { kind: "manifest-invalid", detail: read.detail } };
    case "invalid":
      return { ok: false, failure: { kind: "manifest-invalid", detail: read.detail } };
    case "read-error":
      return { ok: false, failure: { kind: "manifest-read-error", detail: read.detail } };
    case "ready":
      if (read.diagnostics.dropped.length > 0 || read.diagnostics.warnings.length > 0) {
        return { ok: false, failure: { kind: "manifest-diagnostics" } };
      }
      return { ok: true, registry: read.registry };
  }
}

function toBookSummary(book: BookManifestV3Book): BookExportBookSummary {
  return {
    id: book.id,
    name: book.name,
    authors: [...book.authors],
    language: book.language,
    writingMode: book.writingMode,
  };
}

/**
 * 1 body item を read-only で読み込み、`BookExportChapterInput` へ変換する。
 * disk 未解決 / 非ファイルは `missing`、read 失敗は `read-error` の警告になり、
 * どちらも `markdown: null` を返す（呼び出し側の pure 層がそのまま扱える形）。
 */
function loadChapter(
  item: BookManifestV3Book["items"][number],
  resolver: ReturnType<typeof createRegistryDiskResolver>,
): { chapter: BookExportChapterInput; warning: BookExportChapterLoadWarning | null } {
  // v3 body item の authors / translators（chapter Markdown frontmatter ではなく
  // .nyoze/books.json v3 metadata が正本）。HTML export の章ファイル情報表示
  // option だけが使う。missing / read-error でも値自体は保持するが、その場合は
  // どのみち Book export 全体が missing-chapters で中断するため参照されない。
  if (!resolver.isPathPresent(item.path)) {
    return {
      chapter: {
        path: item.path,
        title: item.title,
        authors: item.authors,
        translators: item.translators,
        markdown: null,
      },
      warning: { kind: "chapter-missing", path: item.path, title: item.title },
    };
  }

  const absolutePath = resolver.resolveAbsolutePath(item.path);
  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, "utf-8");
  } catch (error) {
    const detail = (error as NodeJS.ErrnoException).code ?? "read-failed";
    return {
      chapter: {
        path: item.path,
        title: item.title,
        authors: item.authors,
        translators: item.translators,
        markdown: null,
      },
      warning: { kind: "chapter-read-error", path: item.path, title: item.title, detail },
    };
  }

  // frontmatter は読むだけで書き換えない。`parseMarkdown` に渡す前提の本文
  // だけを保持し、pure 層の明示 page-break 判定が frontmatter に惑わされない
  // ようにする（`EditorCore.ts` の通常読み込みと同じ split）。
  const { body } = splitLeadingFrontmatter(raw);
  return {
    chapter: {
      path: item.path,
      title: item.title,
      authors: item.authors,
      translators: item.translators,
      markdown: body,
    },
    warning: null,
  };
}

export type BookExportTargetResolution =
  | { kind: "ready"; bookId: string; bookDisplayName: string }
  | { kind: "no-current-book" }
  | BookExportChapterLoadFailure;

/**
 * active file の project 相対 path から Book export 対象 Book を read-only に解決する。
 * `.nyoze/books.json` は export chapter loader と同じ v3-only 境界を使う。
 */
export function resolveBookExportTargetForProject(
  projectRoot: string,
  currentRelativePath: string,
): BookExportTargetResolution {
  const resolved = resolveManifestForExport(projectRoot);
  if (!resolved.ok) return resolved.failure;

  const target = resolveBookExportTargetFromManifestV3({
    registry: resolved.registry,
    currentRelativePath,
  });
  if (target.kind === "no-current-book") return { kind: "no-current-book" };
  return target;
}

/**
 * 対象 Project / Book の body items を v3 manifest 順に読み込み、
 * `BookExportChapterInput[]` を組み立てる。read-only で一切書き込まない。
 *
 * - `.nyoze/books.json` は {@link readBookManifestV3ForProject} で読む。
 *   v3 registry だけを対象にし、version 不一致は安全に拒否する。
 * - invalid / read-error / diagnostics 付き v3 は部分利用せず、理由付きで
 *   失敗を返す。
 * - 指定した Book が見つからない、または body item が 0 件の場合も失敗を返す。
 * - 各 chapter の disk 解決は `bookManifestPathResolver.ts` の
 *   `createRegistryDiskResolver` を再利用する（exact → NFC 一意一致、
 *   project root 外 symlink 拒否、stored path は書き換えない）。
 */
export async function loadBookExportChaptersForProject(
  projectRoot: string,
  selector: BookExportBookSelector,
): Promise<BookExportChapterLoadResult> {
  const resolved = resolveManifestForExport(projectRoot);
  if (!resolved.ok) return resolved.failure;

  const book = findBook(resolved.registry.books, selector);
  if (!book) {
    return {
      kind: "book-not-found",
      ...("bookId" in selector ? { bookId: selector.bookId } : { bookName: selector.bookName }),
    };
  }
  if (book.items.length === 0) {
    return { kind: "book-has-no-body-items", bookId: book.id };
  }

  const resolver = createRegistryDiskResolver(projectRoot);
  const chapters: BookExportChapterInput[] = [];
  const warnings: BookExportChapterLoadWarning[] = [];

  // 章順（= v3 items 配列順）をそのまま保持する。
  for (const item of book.items) {
    const { chapter, warning } = loadChapter(item, resolver);
    chapters.push(chapter);
    if (warning) warnings.push(warning);
  }

  return {
    kind: "ok",
    book: toBookSummary(book),
    chapters,
    warnings,
  };
}

/**
 * `loadBookExportChaptersForProject` の成功結果を、そのまま pure 層の
 * `planBookExportChapters`（`src/editor-core/export/bookExportAssembly.ts`）へ
 * 接続する薄い便利関数。章順を保持したまま章境界メタデータを計算するだけで、
 * 実際の Markdown 連結・`parseMarkdown` / 各 export converter は
 * `bookExportConversion.ts` が担う（この loader からは呼ばない）。
 */
export function planLoadedBookExportChapters(
  loaded: BookExportChapterLoadSuccess,
  options?: BookExportChapterBoundaryOptions,
): BookExportChapterPlan[] {
  return planBookExportChapters(loaded.chapters, options);
}
