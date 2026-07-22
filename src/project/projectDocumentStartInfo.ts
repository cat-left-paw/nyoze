/**
 * Project 内 body file の「文書冒頭」表示モデル（v3 / pure / read-only）。
 *
 * source of truth:
 * - v3 ready payload（`manifestSource: "v3"`）の Book / body item metadata のみ。
 * - frontmatter `title` / `author` / `translator` へ fallback しない。
 * - Materials / 未登録 / Project 外 / invalid / none manifest は `{ kind: "none" }`。
 *
 * 境界:
 * - filesystem / Electron / IPC / UI / React に依存しない。
 * - frontmatter / Markdown parser を import しない。
 * - 何も書き込まない。
 */

import { resolveCurrentRegistrationFromProjectBooksPayload } from "./bookManifestV3ProjectBooks";
import type { BookOutlineItem } from "./bookOutlineTypes";
import type { ProjectBooksResult } from "./projectIpcTypes";

export type ProjectDocumentStartFile = {
  itemId: string;
  title: string;
  authors: string[];
  translators: string[];
};

export type ProjectDocumentStartBook = {
  bookId: string;
  title: string;
  authors: string[];
};

export type ProjectDocumentStartInfo =
  | {
      kind: "first-body";
      book: ProjectDocumentStartBook;
      file: ProjectDocumentStartFile;
    }
  | {
      kind: "body";
      file: ProjectDocumentStartFile;
    }
  | { kind: "none" };

function copyCredits(values: readonly string[] | undefined): string[] {
  return [...(values ?? [])];
}

function buildFilePayload(item: BookOutlineItem): ProjectDocumentStartFile | null {
  const itemId = item.registryId;
  if (!itemId) return null;
  return {
    itemId,
    title: item.title,
    authors: copyCredits(item.authors),
    translators: copyCredits(item.translators),
  };
}

/**
 * renderer が受け取る `project:resolveProjectBooks` payload から
 * 現在ファイルの文書冒頭表示 model を導出する（pure）。
 *
 * - `ok && kind === "ready" && manifestSource === "v3"` のみ対象。
 * - Book 先頭 body item → `first-body`（Book + file metadata）。
 * - 2件目以降の current body → `body`（file metadata のみ）。
 * - Materials / 未登録 / 失敗 / none / diagnostics（`manifestWarning`）→ `{ kind: "none" }`。
 */
export function resolveProjectDocumentStartInfoFromBooksResult(
  result: ProjectBooksResult | null,
): ProjectDocumentStartInfo {
  if (!result || !result.ok || result.kind !== "ready") {
    return { kind: "none" };
  }
  if (result.manifestSource !== "v3") {
    return { kind: "none" };
  }
  if (result.manifestWarning !== undefined) {
    return { kind: "none" };
  }

  const registration = resolveCurrentRegistrationFromProjectBooksPayload({
    books: result.books,
    materialsFlat: result.materialsFlat ?? [],
  });
  if (registration.kind !== "body") {
    return { kind: "none" };
  }

  const { book, item } = registration;
  const file = buildFilePayload(item);
  if (!file) {
    return { kind: "none" };
  }

  const currentIndex = book.items.findIndex((candidate) => candidate.isCurrent);
  if (currentIndex === 0) {
    return {
      kind: "first-body",
      book: {
        bookId: book.bookId,
        title: book.displayName,
        authors: copyCredits(book.authors),
      },
      file,
    };
  }

  if (currentIndex > 0) {
    return { kind: "body", file };
  }

  return { kind: "none" };
}
