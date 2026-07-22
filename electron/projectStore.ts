/**
 * Project store I/O (main process 側, Task 3A-2 前段)。
 *
 * `.nyoze/project.json` の作成・読み取りを担当する。
 * 検証・正規化は src/project/projectMetadata.ts の pure helper に委譲し、
 * 書き込みは SEC-9 の atomicWriteFile (temp → fsync → rename) を使う。
 *
 * このスライスでは `notes.json` を一切作成しない。
 * `notes.json` は最初の付箋作成時に別 handler が作成する (Task 3A-2 本体)。
 *
 * ---- IPC bridge 設計メモ (配線は Task 3A-2 本体 / 3A-3 で行う) ----
 *
 * - `project:create` (ipcMain.handle)
 *   - renderer から渡される folderPath は信用せず、main 側で
 *     `fs.realpathSync` で解決した上で workspace root 配下のディレクトリのみ
 *     許可する (ipcSecurity.isWithinDirectory と同等の境界検査)。
 *     これにより compromised renderer が任意パスへ `.nyoze` を作ることを防ぐ。
 *   - 既存 project.json がある場合は上書きせず 'already-exists' を返す。
 * - `project:resolveRoot` (ipcMain.handle)
 *   - workspaceRoot は renderer 申告ではなく main 側 state
 *     (workspace open 時に保持している値) を使う。
 *   - 単独ファイル (workspace 外) は SEC-5 の allowedDocumentPaths に
 *     登録済みのパスに限り祖先探索を許可する。
 * - 単独ファイルの親フォルダを自動的に project root とみなして
 *   `.nyoze` を作る導線は設けない (ユーザー明示操作のみ)。
 */

import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { atomicWriteFile } from "./atomicSave";
import {
  NYOZE_DIR_NAME,
  PROJECT_METADATA_FILENAME,
  createProjectMetadata,
  parseProjectMetadata,
  serializeProjectMetadata,
  validateProjectTitle,
} from "../src/project/projectMetadata";
import type { ProjectMetadata } from "../src/project/projectMetadata";
import { resolveProjectRootForPath } from "../src/project/projectRoot";
import type {
  ProjectRootResolverDeps,
  ResolvedProjectRoot,
} from "../src/project/projectRoot";
import { BOOK_MANIFEST_FILENAME } from "./bookManifestStore";
import {
  createBookInV3Registry,
  createEmptyBookManifestV3Registry,
} from "../src/project/bookManifestV3Writer";
import { normalizeBookManifestV3 } from "../src/project/bookManifestV3";

/** 実 fs を使う resolver deps。読めないパスは null (= 存在しない扱い)。 */
export const nodeFsProjectRootDeps: ProjectRootResolverDeps = {
  readTextFile: (filePath: string): string | null => {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  },
};

/** 実 fs で project root を解決する。見つからなければ null。 */
export function resolveProjectRootWithFs(
  filePath: string,
  workspaceRoot?: string | null,
): ResolvedProjectRoot | null {
  return resolveProjectRootForPath({
    filePath,
    workspaceRoot,
    deps: nodeFsProjectRootDeps,
  });
}

export type CreateProjectErrorReason =
  | "not-a-directory"
  | "already-exists"
  | "write-failed";

export type CreateProjectResult =
  | { ok: true; projectRoot: string; metadata: ProjectMetadata }
  | { ok: false; reason: CreateProjectErrorReason };

/**
 * 指定フォルダを Nyoze project にする:
 * `folderPath/.nyoze/project.json` だけを作成する。
 *
 * - 既存 project.json は上書きしない ('already-exists')。
 * - title 省略時はフォルダ名を初期タイトルにする。
 * - 呼び出し側 (将来の IPC handler) が workspace 境界検査を済ませている前提。
 */
export async function createProjectAt(
  folderPath: string,
  title?: string,
): Promise<CreateProjectResult> {
  let projectRoot: string;
  try {
    projectRoot = fs.realpathSync(path.resolve(folderPath));
    if (!fs.statSync(projectRoot).isDirectory()) {
      return { ok: false, reason: "not-a-directory" };
    }
  } catch {
    return { ok: false, reason: "not-a-directory" };
  }

  const nyozeDir = path.join(projectRoot, NYOZE_DIR_NAME);
  const metadataPath = path.join(nyozeDir, PROJECT_METADATA_FILENAME);
  if (fs.existsSync(metadataPath)) {
    return { ok: false, reason: "already-exists" };
  }

  const metadata = createProjectMetadata(title ?? path.basename(projectRoot));
  try {
    fs.mkdirSync(nyozeDir, { recursive: true });
    await atomicWriteFile(metadataPath, serializeProjectMetadata(metadata));
  } catch {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true, projectRoot, metadata };
}

/** 最初の Book の既定名（モーダル初期値 / title-only create で使う）。 */
export const DEFAULT_INITIAL_BOOK_NAME = "本編";

export type CreateProjectWithInitialBookOptions = {
  /** `.nyoze/project.json` の title。空文字でもそのまま採用する（呼び出し側で fallback 済み前提）。 */
  projectTitle: string;
  /** `.nyoze/books.json` の最初の Book name。空白のみなら {@link DEFAULT_INITIAL_BOOK_NAME}。 */
  initialBookName: string;
};

function pathEntryExists(filePath: string): boolean {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

/** books.json の canonical JSON 形式（2-space indent + 末尾改行）。 */
function serializeInitialBookManifest(
  registry: ReturnType<typeof createEmptyBookManifestV3Registry>,
): string {
  return JSON.stringify(registry, null, 2) + "\n";
}

/**
 * 指定フォルダを Nyoze project にし、`.nyoze/project.json` と v3 `.nyoze/books.json` を
 * 初期作成する。
 *
 * - `project.json` は {@link createProjectMetadata}、`books.json` は最初の Book を 1 件だけ持つ
 *   v3 registry（items は空 / materials・ignored は空）。
 * - 既存 `project.json` または `books.json` がある場合は何も書かず 'already-exists'。
 * - `books.json` → `project.json` の順に atomic write し、2件目が失敗した場合は先に作った
 *   `books.json` を除去して半端な metadata を残さない。
 * - Markdown / frontmatter / `notes.json` には一切触れない。Book item / material は作らない。
 * - 呼び出し側（IPC handler）が workspace 境界検査・既存 project 検査を済ませている前提。
 */
export async function createProjectWithInitialBookAt(
  folderPath: string,
  options: CreateProjectWithInitialBookOptions,
): Promise<CreateProjectResult> {
  let projectRoot: string;
  try {
    projectRoot = fs.realpathSync(path.resolve(folderPath));
    if (!fs.statSync(projectRoot).isDirectory()) {
      return { ok: false, reason: "not-a-directory" };
    }
  } catch {
    return { ok: false, reason: "not-a-directory" };
  }

  const nyozeDir = path.join(projectRoot, NYOZE_DIR_NAME);
  const metadataPath = path.join(nyozeDir, PROJECT_METADATA_FILENAME);
  const manifestPath = path.join(nyozeDir, BOOK_MANIFEST_FILENAME);
  if (pathEntryExists(metadataPath) || pathEntryExists(manifestPath)) {
    return { ok: false, reason: "already-exists" };
  }
  try {
    const nyozeStat = fs.lstatSync(nyozeDir);
    if (nyozeStat.isSymbolicLink() || !nyozeStat.isDirectory()) {
      return { ok: false, reason: "already-exists" };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, reason: "write-failed" };
    }
  }

  const bookName =
    options.initialBookName.trim().length > 0
      ? options.initialBookName
      : DEFAULT_INITIAL_BOOK_NAME;
  const built = createBookInV3Registry(
    createEmptyBookManifestV3Registry(),
    { name: bookName },
    () => randomUUID(),
  );
  // 既定 / sanitize 済みの name なので通常失敗しないが、想定外は安全側で write-failed。
  if (!built.ok) return { ok: false, reason: "write-failed" };

  const manifestText = serializeInitialBookManifest(built.registry);
  const manifestCheck = normalizeBookManifestV3(JSON.parse(manifestText) as unknown);
  if (
    manifestCheck.kind !== "ok" ||
    manifestCheck.dropped.length > 0 ||
    manifestCheck.warnings.length > 0
  ) {
    return { ok: false, reason: "write-failed" };
  }

  const metadata = createProjectMetadata(options.projectTitle);
  let manifestCreated = false;
  try {
    fs.mkdirSync(nyozeDir, { recursive: true });
    await atomicWriteFile(manifestPath, manifestText);
    manifestCreated = true;
    await atomicWriteFile(metadataPath, serializeProjectMetadata(metadata));
  } catch {
    if (manifestCreated) {
      try {
        fs.unlinkSync(manifestPath);
      } catch {
        // rollback 不能でも project marker は作られていない。次回 create は既存 manifest を保護して拒否する。
      }
    }
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true, projectRoot, metadata };
}

export type DescendantProjectScanResult =
  | { kind: "none" }
  | { kind: "found" }
  | { kind: "limit-exceeded" };

/**
 * 対象フォルダ配下（子孫方向）に `.nyoze/project.json` を持つ既存 project root があるか走査する。
 *
 * `resolveProjectRootWithFs` は祖先方向しか見ないため、親フォルダを project 化しようとした際に
 * 内部の既存 project を覆い隠してしまう問題を防ぐためのチェック。
 *
 * 走査方針:
 * - 対象フォルダ自身の `.nyoze/project.json` は対象外（呼び出し側が already-exists で扱う）。
 *   子孫ディレクトリの marker のみ 'found' とする。
 * - symlink は辿らない（ディレクトリ symlink は無視）。子孫だけを見るので workspace 境界外へ出ない。
 * - `.nyoze` ディレクトリの中身へは再帰しない（marker 存在確認だけ）。
 * - エントリ走査数が `maxEntries` を超えたら 'limit-exceeded'（巨大フォルダ対策。呼び出し側で安全側に倒す）。
 */
export function scanForDescendantProjectRoot(
  rootFolder: string,
  options?: { maxEntries?: number },
): DescendantProjectScanResult {
  const maxEntries = options?.maxEntries ?? 50000;
  let visited = 0;
  const stack: string[] = [rootFolder];

  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // 読めないディレクトリは飛ばす（権限など）。
    }

    for (const entry of entries) {
      visited += 1;
      if (visited > maxEntries) return { kind: "limit-exceeded" };
      // symlink は辿らない（ループ / workspace 外脱出防止）。通常ディレクトリのみ降りる。
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      if (entry.name === NYOZE_DIR_NAME) {
        // 子孫ディレクトリが project marker を持つなら、内部に既存 project があるということ。
        if (dir !== rootFolder && hasProjectMarker(dir)) return { kind: "found" };
        continue; // `.nyoze` の中へは降りない。
      }
      stack.push(path.join(dir, entry.name));
    }
  }
  return { kind: "none" };
}

/**
 * 指定フォルダが `.nyoze/project.json` を持つ project root か判定する（表示専用の軽量チェック）。
 *
 * - File Explorer で project root folder を視覚的に示すためだけに使う。
 * - frontmatter は読まない。`.nyoze/project.json` を作成しない（存在確認のみ）。
 * - 呼び出し側（IPC handler）が workspace 境界検査を済ませている前提。
 */
export function hasProjectMarker(dirPath: string): boolean {
  try {
    return fs
      .statSync(path.join(dirPath, NYOZE_DIR_NAME, PROJECT_METADATA_FILENAME))
      .isFile();
  } catch {
    return false;
  }
}

export type WorkspaceProjectScanResult =
  | { kind: "ok"; projectRoots: string[] }
  | { kind: "limit-exceeded" };

/**
 * workspace root 配下にある Project root（`.nyoze/project.json` 保有フォルダ）を列挙する。
 *
 * 走査方針:
 * - workspace root 自身は Project 扱いしない（子孫の marker だけを集める）。
 * - Project root を見つけたら、その配下は再帰探索しない（nested Project の二重検出回避）。
 * - symlink は辿らない（ディレクトリ symlink は無視。workspace 外脱出 / ループ防止）。
 * - `.nyoze` ディレクトリの中身へは降りない。
 * - エントリ走査数が `maxEntries` を超えたら 'limit-exceeded'（巨大書庫対策。呼び出し側で
 *   read error に畳む）。
 *
 * 書き込みは一切しない（read-only）。返す path は走査で組み立てた絶対 path
 * （symlink を辿らないので workspace root 配下に留まる）。
 */
export function scanWorkspaceProjectRoots(
  workspaceRoot: string,
  options?: { maxEntries?: number },
): WorkspaceProjectScanResult {
  const maxEntries = options?.maxEntries ?? 50000;
  let visited = 0;
  const projectRoots: string[] = [];
  const stack: string[] = [workspaceRoot];

  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // 読めないディレクトリは飛ばす（権限など）。
    }

    for (const entry of entries) {
      visited += 1;
      if (visited > maxEntries) return { kind: "limit-exceeded" };
      // symlink は辿らない（ループ / workspace 外脱出防止）。通常ディレクトリのみ降りる。
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      if (entry.name === NYOZE_DIR_NAME) continue; // `.nyoze` の中へは降りない。
      const childDir = path.join(dir, entry.name);
      if (hasProjectMarker(childDir)) {
        // Project root を見つけたら配下は探索しない（nested Project を二重検出しない）。
        projectRoots.push(childDir);
        continue;
      }
      stack.push(childDir);
    }
  }

  return { kind: "ok", projectRoots };
}

/** project root の metadata を読む。欠損 / invalid は null。 */
export function readProjectMetadata(projectRoot: string): ProjectMetadata | null {
  const text = nodeFsProjectRootDeps.readTextFile(
    path.join(projectRoot, NYOZE_DIR_NAME, PROJECT_METADATA_FILENAME),
  );
  return text === null ? null : parseProjectMetadata(text);
}

export type UpdateProjectTitleErrorReason =
  | "invalid-metadata"
  | "empty-title"
  | "title-too-long"
  | "write-failed";

/**
 * `.nyoze/project.json` の `title` だけを更新する。
 * - `id` / `version` と、将来追加される未知フィールドは既存 JSON から保持する。
 * - 破損 JSON / invalid shape は更新しない（invalid-metadata）。
 * - atomicWriteFile で書き込む。
 */
export async function updateProjectTitleAt(
  projectRoot: string,
  rawTitle: string,
): Promise<
  | { ok: true; metadata: ProjectMetadata }
  | { ok: false; reason: UpdateProjectTitleErrorReason }
> {
  const validated = validateProjectTitle(rawTitle);
  if (!validated.ok) {
    return {
      ok: false,
      reason: validated.reason === "empty" ? "empty-title" : "title-too-long",
    };
  }

  const metadataPath = path.join(projectRoot, NYOZE_DIR_NAME, PROJECT_METADATA_FILENAME);
  const text = nodeFsProjectRootDeps.readTextFile(metadataPath);
  if (text === null) return { ok: false, reason: "invalid-metadata" };

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-metadata" };
  }

  const existing = parseProjectMetadata(text);
  if (!existing) return { ok: false, reason: "invalid-metadata" };
  if (
    typeof rawMetadata !== "object" ||
    rawMetadata === null ||
    Array.isArray(rawMetadata)
  ) {
    return { ok: false, reason: "invalid-metadata" };
  }

  const metadata: ProjectMetadata = { ...existing, title: validated.title };
  const preservedMetadata = {
    ...(rawMetadata as Record<string, unknown>),
    title: validated.title,
  };
  try {
    await atomicWriteFile(
      metadataPath,
      JSON.stringify(preservedMetadata, null, 2) + "\n",
    );
  } catch {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true, metadata };
}
