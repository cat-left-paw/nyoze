/**
 * File Explorer から Project の未登録ファイルを Book / Material に登録する導線の
 * pure helper（filesystem / Electron / IPC / React 非依存）。
 *
 * 既存の read-only IPC（`project:resolveUnregisteredFilesV3` /
 * `project:resolveProjectBooks`）の結果だけを使って、右クリックしたファイルが
 * 「登録メニューを出せるか」と「登録時に渡す project root 相対 path」を導く。
 *
 * 不変条件:
 * - renderer は projectRoot を持たない。relative path は main 由来の未登録一覧から取る。
 * - v3 `.nyoze/books.json` を正本とする Project（`manifestSource === 'v3'`）だけを対象にする。
 *   books.json 不在 / invalid / unsupported の Project では登録メニューを出さない。
 * - 既に books.json に登録済みのファイルは未登録一覧に現れないため、対象外になる。
 * - `.nyoze` 配下・非テキスト・folder は未登録一覧に現れないため、対象外になる。
 */

import type {
  BookManifestV3UnregisteredFilesIpcResult,
  ProjectBooksResult,
} from "./projectIpcTypes";

/** 「Bookに追加」submenu の 1 件。表示名は registry displayName を流用する。 */
export type FileExplorerRegisterBookOption = {
  bookId: string;
  name: string;
};

export type FileExplorerRegistrationInfo =
  | { kind: "unavailable" }
  | {
      kind: "ready";
      /** updateBookManifestV3 の operation.path に渡す project root 相対 path。 */
      relativePath: string;
      /** v3 registry の Book 一覧（registry 順）。0 件なら「Bookに追加」は disabled。 */
      books: FileExplorerRegisterBookOption[];
    };

/**
 * 絶対 path の比較用正規化。File Explorer 側 `normalizeForCompare` と同じ規則
 * （末尾区切り除去、Windows のみ小文字化）。UI 層へ依存しないよう再実装する。
 */
export function normalizeAbsolutePathForCompare(path: string): string {
  if (path.includes("\\")) {
    return path.replace(/\\+$/g, "").toLowerCase();
  }
  return path.replace(/\/+$/g, "");
}

/**
 * 未登録一覧の中から、対象ファイル（絶対 path）に一致する 1 件を返す。
 * 見つからなければ null（= 登録済み / 非対象 / project 外）。
 */
export function findUnregisteredEntryForFile(
  files: readonly { relativePath: string; absolutePath: string }[],
  filePath: string,
): { relativePath: string } | null {
  const target = normalizeAbsolutePathForCompare(filePath);
  for (const file of files) {
    if (normalizeAbsolutePathForCompare(file.absolutePath) === target) {
      return { relativePath: file.relativePath };
    }
  }
  return null;
}

function isBookManifestV3Source(value: string | undefined): boolean {
  return value === "v3";
}

/**
 * 2 つの read-only IPC 結果から、右クリックしたファイルの登録可否を導く（pure）。
 *
 * `ready` になる条件:
 * - books 解決が v3 manifest（`manifestSource === 'v3'`）で ready。
 * - 未登録一覧が ready で、対象ファイルがその中にいる（= 未登録の `.md` / `.markdown` / `.txt`）。
 * 上記いずれかを満たさなければ `unavailable`。
 */
export function resolveFileExplorerRegistrationInfo(input: {
  filePath: string;
  unregistered: BookManifestV3UnregisteredFilesIpcResult;
  books: ProjectBooksResult;
}): FileExplorerRegistrationInfo {
  const { filePath, unregistered, books } = input;

  if (!books.ok || books.kind !== "ready" || !isBookManifestV3Source(books.manifestSource)) {
    return { kind: "unavailable" };
  }
  if (!unregistered.ok || unregistered.kind !== "ready") {
    return { kind: "unavailable" };
  }

  const match = findUnregisteredEntryForFile(unregistered.files, filePath);
  if (!match) return { kind: "unavailable" };

  return {
    kind: "ready",
    relativePath: match.relativePath,
    books: books.books.map((group) => ({
      bookId: group.bookId,
      name: group.displayName,
    })),
  };
}
