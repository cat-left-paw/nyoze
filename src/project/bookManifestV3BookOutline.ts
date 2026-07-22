/**
 * Book manifest v3 → Book全体Outline / 前後章ナビ IPC model 変換（pure）。
 *
 * v3 registry を Book 全体 Outline / Chapter Neighbors の read-only payload へ変換する。
 * frontmatter scan / filesystem / Electron / IPC には依存しない。
 */

import { bookManifestRegistryPathComparisonKey } from "./bookManifestPath";
import {
  bookManifestV3BasenameTitle,
  type BookManifestV3Book,
  type BookManifestV3Registry,
} from "./bookManifestV3";
import {
  buildBookOutlineChapter,
  type BookFullOutlineComputation,
} from "./bookFullOutlineQuery";
import type { BookOutlineItem } from "./bookOutlineTypes";
import type { ChapterNeighborsComputation } from "./chapterNeighborsQuery";
import type { OutlineExtraction } from "../editor-core/io/markdownHeadings";

const EMPTY_OUTLINE: OutlineExtraction = { headings: [], intro: "", headingPreviews: [] };

function joinProjectAbsolute(projectRoot: string, relativePath: string): string {
  const root = projectRoot.replace(/[/\\]+$/, "");
  return `${root}/${relativePath}`;
}

function normalizeComparePath(relativePath: string): string {
  return bookManifestRegistryPathComparisonKey(relativePath);
}

function resolveDisplayTitle(title: string, relativePath: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : bookManifestV3BasenameTitle(relativePath);
}

function copyCredits(values: readonly string[]): string[] {
  return [...values];
}

function buildBodyOutlineItem(input: {
  item: BookManifestV3Book["items"][number];
  currentKey: string;
  resolveAbsolutePath: (relativePath: string) => string;
  isPathPresent?: (relativePath: string) => boolean;
}): BookOutlineItem {
  const { item, currentKey, resolveAbsolutePath, isPathPresent } = input;
  const path = item.path;
  return {
    relativePath: path,
    absolutePath: resolveAbsolutePath(path),
    title: resolveDisplayTitle(item.title, path),
    authors: copyCredits(item.authors),
    translators: copyCredits(item.translators),
    order: null,
    isCurrent: normalizeComparePath(path) === currentKey,
    registryId: item.id,
    ...(isPathPresent !== undefined ? { missing: !isPathPresent(path) } : {}),
  };
}

function resolveCurrentBook(input: {
  registry: BookManifestV3Registry;
  currentRelativePath: string;
  resolveAbsolutePath: (relativePath: string) => string;
  isPathPresent?: (relativePath: string) => boolean;
}):
  | { kind: "body"; book: BookManifestV3Book; items: BookOutlineItem[] }
  | { kind: "material" | "unregistered" } {
  const { registry, currentRelativePath, resolveAbsolutePath, isPathPresent } = input;
  const currentKey = normalizeComparePath(currentRelativePath);

  for (const book of registry.books) {
    const items = book.items.map((item) =>
      buildBodyOutlineItem({ item, currentKey, resolveAbsolutePath, isPathPresent }),
    );
    if (items.some((item) => item.isCurrent)) {
      return { kind: "body", book, items };
    }
  }

  if (
    registry.materials.some(
      (material) => normalizeComparePath(material.path) === currentKey,
    )
  ) {
    return { kind: "material" };
  }

  return { kind: "unregistered" };
}

export type BookExportTargetFromManifestV3 =
  | { kind: "ready"; bookId: string; bookDisplayName: string }
  | { kind: "no-current-book" };

/**
 * v3 registry から active file が属する Book export 対象を path 照合だけで解決する（pure）。
 * 見出し scan / disk I/O / write は行わない。
 */
export function resolveBookExportTargetFromManifestV3(input: {
  registry: BookManifestV3Registry;
  currentRelativePath: string;
}): BookExportTargetFromManifestV3 {
  const currentKey = normalizeComparePath(input.currentRelativePath);

  for (const book of input.registry.books) {
    const isBody = book.items.some(
      (item) => normalizeComparePath(item.path) === currentKey,
    );
    if (isBody) {
      return {
        kind: "ready",
        bookId: book.id,
        bookDisplayName: book.name,
      };
    }
  }

  if (
    input.registry.materials.some(
      (material) => normalizeComparePath(material.path) === currentKey,
    )
  ) {
    return { kind: "no-current-book" };
  }

  return { kind: "no-current-book" };
}

/**
 * v3 registry を Book全体Outline 用 payload へ変換する（pure）。
 *
 * - current body item が属する Book を v3 registry から特定する。
 * - 章順は `book.items[]` 配列順。
 * - missing 章は構造を残しつつ見出し read を skip する。
 */
export function bookFullOutlinePayloadFromManifestV3(input: {
  registry: BookManifestV3Registry;
  projectRoot: string;
  currentRelativePath: string;
  isPathPresent?: (relativePath: string) => boolean;
  resolveAbsolutePath?: (relativePath: string) => string;
  getChapterOutline: (chapter: {
    relativePath: string;
    absolutePath: string;
  }) => OutlineExtraction;
}): BookFullOutlineComputation {
  const { registry, projectRoot, currentRelativePath, isPathPresent, getChapterOutline } = input;
  const resolveAbsolutePath =
    input.resolveAbsolutePath ??
    ((relativePath: string) => joinProjectAbsolute(projectRoot, relativePath));

  const current = resolveCurrentBook({
    registry,
    currentRelativePath,
    resolveAbsolutePath,
    isPathPresent,
  });
  if (current.kind !== "body") return { kind: "no-current-book" };

  return {
    kind: "ready",
    currentBook: current.book.id,
    book: {
      book: current.book.id,
      bookId: current.book.id,
      displayName: current.book.name,
      title: current.book.name,
      source: "manifest",
    },
    chapters: current.items.map((item) =>
      buildBookOutlineChapter(
        {
          relativePath: item.relativePath,
          absolutePath: item.absolutePath,
          title: item.title,
          isCurrent: item.isCurrent,
          missing: item.missing,
        },
        item.missing
          ? EMPTY_OUTLINE
          : getChapterOutline({
              relativePath: item.relativePath,
              absolutePath: item.absolutePath,
            }),
      ),
    ),
  };
}

/**
 * v3 registry を前後章ナビ用 payload へ変換する（pure）。
 *
 * - previous / current / next は `book.items[]` 配列順。
 * - material / unregistered は `no-current-book`。
 * - missing 章も構造上は返す。
 */
export function chapterNeighborsPayloadFromManifestV3(input: {
  registry: BookManifestV3Registry;
  projectRoot: string;
  currentRelativePath: string;
  isPathPresent?: (relativePath: string) => boolean;
  resolveAbsolutePath?: (relativePath: string) => string;
}): ChapterNeighborsComputation {
  const { registry, projectRoot, currentRelativePath, isPathPresent } = input;
  const resolveAbsolutePath =
    input.resolveAbsolutePath ??
    ((relativePath: string) => joinProjectAbsolute(projectRoot, relativePath));

  const current = resolveCurrentBook({
    registry,
    currentRelativePath,
    resolveAbsolutePath,
    isPathPresent,
  });
  if (current.kind !== "body") return { kind: "no-current-book" };

  const currentIndex = current.items.findIndex((item) => item.isCurrent);
  if (currentIndex < 0) {
    return { kind: "ready", current: null, previous: null, next: null };
  }

  return {
    kind: "ready",
    current: current.items[currentIndex],
    previous: currentIndex > 0 ? current.items[currentIndex - 1] : null,
    next: currentIndex < current.items.length - 1 ? current.items[currentIndex + 1] : null,
  };
}
