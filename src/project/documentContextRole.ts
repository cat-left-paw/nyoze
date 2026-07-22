/**
 * 左ペイン下部の「書庫 / 作品 / 役割」表示（read-only）用の pure helper。
 *
 * 不変条件:
 * - filesystem / Electron / UI に依存しない（pure）。表示専用で何も書き込まない。
 * - role は `.nyoze/books.json` 正本の `project:resolveProjectBooks` の
 *   payload（`isCurrent`）からのみ導出する。frontmatter `book` / `order` / `role` には
 *   fallback しない。
 * - 書庫外（externalFileActive）では Project / Role を誤表示しない（`none`）。
 */

import type { ProjectAssetRole } from "./projectBooksQuery";
import type { ProjectBooksResult } from "./projectIpcTypes";

/** active file の役割分類（manifest registry 由来）。 */
export type ActiveFileRoleClass =
  | { kind: "body" }
  | { kind: "material"; role: ProjectAssetRole }
  | { kind: "unregistered" };

export type DocumentContextLibrary =
  | { kind: "in"; name: string }
  | { kind: "external" }
  | { kind: "none" };

export type DocumentContextProject =
  | { kind: "in"; name: string }
  | { kind: "out" }
  | { kind: "none" };

export type DocumentContextRole =
  | { kind: "body" }
  | { kind: "material"; role: ProjectAssetRole }
  | { kind: "unregistered" }
  | { kind: "none" };

export type DocumentContextInfo = {
  library: DocumentContextLibrary;
  project: DocumentContextProject;
  role: DocumentContextRole;
};

/** internal doc / untitled など、文脈を出さない既定値（すべて `-` 表示）。 */
export const EMPTY_DOCUMENT_CONTEXT: DocumentContextInfo = {
  library: { kind: "none" },
  project: { kind: "none" },
  role: { kind: "none" },
};

/**
 * Project Books payload（`project:resolveProjectBooks` ready）から active file の役割を分類する。
 * - body item（`books[].items[]`）に `isCurrent` があれば本文。
 * - 資料（`assets[].items[]`）に `isCurrent` があればその role。
 * - どちらにも無ければ Project 内未登録。
 * - ready でない（not-in-project / 失敗 / 未解決）は `null`。
 * frontmatter には一切触れない。
 */
export function classifyActiveFileRole(
  result: ProjectBooksResult | null,
): ActiveFileRoleClass | null {
  if (!result || !result.ok || result.kind !== "ready") return null;
  if (result.manifestSource === "none" && result.manifestWarning) return null;
  for (const book of result.books) {
    if (book.items.some((item) => item.isCurrent)) return { kind: "body" };
  }
  for (const group of result.assets) {
    if (group.items.some((item) => item.isCurrent)) {
      return { kind: "material", role: group.role };
    }
  }
  return { kind: "unregistered" };
}

export type BuildDocumentContextInput = {
  /** active tab が保存済み file path を持つか（untitled は false）。 */
  hasActiveFile: boolean;
  /** internal doc（ショートカット一覧など）。 */
  isInternalDoc: boolean;
  /** 書庫外の保存済みファイルか（App 側の path 包含判定）。 */
  externalFileActive: boolean;
  /** active 書庫名（registry 由来）。書庫内表示に使う。 */
  activeLibraryName: string | null;
  /**
   * `project:resolveProjectBooks` の最新結果。未解決（pending）は `null`。
   * 書庫内のときだけ解決し、書庫外/internal/untitled では呼ばない（常に `null`）。
   */
  booksResult: ProjectBooksResult | null;
};

/**
 * 表示用の文脈モデルを組み立てる。優先順位:
 * - active file なし / internal doc → すべて `none`（`-`）。
 * - 書庫外 → library=external、Project / Role は誤表示しない（`none`）。
 * - 書庫内 → library=in（書庫名）。Project / Role は manifest 解決結果から導出。
 *   - 未解決（pending, booksResult=null）→ Project / Role は `none`（`-`）。
 *   - ready → Project=in（作品名）+ Role（本文 / 資料 role / 未登録）。
 *   - not-in-project / 失敗 → Project=out（作品外）、Role=none。
 */
export function buildDocumentContextInfo(
  input: BuildDocumentContextInput,
): DocumentContextInfo {
  const {
    hasActiveFile,
    isInternalDoc,
    externalFileActive,
    activeLibraryName,
    booksResult,
  } = input;

  if (!hasActiveFile || isInternalDoc) return EMPTY_DOCUMENT_CONTEXT;

  if (externalFileActive) {
    return {
      library: { kind: "external" },
      project: { kind: "none" },
      role: { kind: "none" },
    };
  }

  const library: DocumentContextLibrary = {
    kind: "in",
    name: activeLibraryName ?? "",
  };

  // 書庫内: Project / Role を v3 payload から導出。
  if (booksResult === null) {
    // 未解決（pending）。誤って「作品外」を出さず `-` にする。
    return { library, project: { kind: "none" }, role: { kind: "none" } };
  }
  if (booksResult.ok && booksResult.kind === "ready") {
    if (booksResult.manifestSource === "none" && booksResult.manifestWarning) {
      return {
        library,
        project: { kind: "in", name: booksResult.project.metadata.title },
        role: { kind: "none" },
      };
    }
    const roleClass = classifyActiveFileRole(booksResult) ?? {
      kind: "unregistered" as const,
    };
    return {
      library,
      project: { kind: "in", name: booksResult.project.metadata.title },
      role: roleClass,
    };
  }
  // resolved だが project 未所属 / 失敗 → 作品外。
  return { library, project: { kind: "out" }, role: { kind: "none" } };
}
