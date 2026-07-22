/**
 * project / notes IPC handler 本体 (Task 3A-2 仕上げ)。
 *
 * main.ts には薄い ipcMain.handle 登録だけを置き、検証とロジックはここに集約する。
 * boundary state (activeWorkspaceRoot / allowedDocumentPaths) は注入し、
 * Electron 起動なしで unit / integration テストできるようにする。
 *
 * セキュリティ方針:
 * - renderer 申告の filePath / folderPath / store は一切信用しない。
 *   path は validatePathArg → realpath → document 境界検査
 *   (workspace root 配下 or allowedDocumentPaths) を通ったものだけ使う。
 * - projectRoot は renderer から受け取らず、必ず main 側で
 *   resolveProjectRootWithFs により filePath から解決する。
 * - project 作成は workspace root 配下のフォルダのみ許可 (安全側)。
 *   単独ファイル親フォルダからの作成導線はこのスライスでは設けない。
 * - notes store は main 側でも normalizeNotesStore で再検証する。
 */

import fs from "node:fs";
import path from "node:path";
import { validatePathArg, isWithinDirectory } from "./ipcSecurity";
import {
  createProjectWithInitialBookAt,
  DEFAULT_INITIAL_BOOK_NAME,
  hasProjectMarker,
  readProjectMetadata,
  resolveProjectRootWithFs,
  scanForDescendantProjectRoot,
  scanWorkspaceProjectRoots,
  updateProjectTitleAt,
} from "./projectStore";
import { readNotesStore, writeNotesStore } from "./noteStore";
import { readChapterOutline } from "./bookFullOutlineStore";
import {
  BOOK_MANIFEST_FILENAME,
  loadBookManifestV3ForProject,
} from "./bookManifestStore";
import { updateBookManifestV3ForProject } from "./bookManifestV3Store";
import { readRegistrationFileMetadata } from "./bookManifestV3FileMetadataRead";
import { readUnregisteredProjectFilesForV3 } from "./bookManifestV3UnregisteredStore";
import { resolveV3RegistrationMetadata } from "../src/project/bookManifestV3FrontmatterMetadata";
import {
  KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES,
  type BookManifestV3MaterialRole,
  type BookManifestV3Registry,
} from "../src/project/bookManifestV3";
import {
  addBodyItemToV3Registry,
  addMaterialToV3Registry,
  createBookInV3Registry,
  moveBodyItemInV3Registry,
  moveMaterialInV3Registry,
  removeBodyItemFromV3Registry,
  removeBookFromV3Registry,
  removeMaterialFromV3Registry,
  updateBodyItemMetadataInV3Registry,
  updateBookInV3Registry,
  updateMaterialInV3Registry,
} from "../src/project/bookManifestV3Writer";
import {
  emptyBookManifestV3Registry,
  hasReadyManifestV3Diagnostics,
  resolveCanonicalManifestV3QueryState,
} from "./bookManifestV3QueryState";
import { detectProjectTextFileExtension } from "../src/project/projectTextFileScan";
import { resolveFileExplorerRoleFromManifestV3 } from "../src/project/fileExplorerRoles";
import { normalizeNotesStore } from "../src/project/noteStore";
import { MAX_PROJECT_TITLE_LENGTH, NYOZE_DIR_NAME } from "../src/project/projectMetadata";
import { projectBooksPayloadFromManifestV3 } from "../src/project/bookManifestV3ProjectBooks";
import {
  bookFullOutlinePayloadFromManifestV3,
  chapterNeighborsPayloadFromManifestV3,
} from "../src/project/bookManifestV3BookOutline";
import { createRegistryDiskResolver } from "./bookManifestPathResolver";
import { resolveBookExportTargetForProject } from "./bookExportChapterLoader";
import {
  scanMissingFileNotes,
  toMissingFileNoteViews,
} from "../src/project/missingFileNotesQuery";
import { isProjectRelativeFilePresentOnDisk } from "./projectFilePresence";
import type {
  ProjectResolveResult,
  ProjectCreateResult,
  ProjectReadNotesResult,
  ProjectWriteNotesResult,
  ProjectMissingFileNotesResult,
  BookFullOutlineResult,
  ChapterNeighborsResult,
  BookExportTargetResult,
  ProjectBooksResult,
  FileRoleEntry,
  ProjectUpdateTitleResult,
  ProjectUnregisterResult,
  BookManifestV3UpdateOperation,
  UpdateBookManifestV3Result,
  BookManifestV3UnregisteredFilesIpcResult,
  ProjectListEntry,
  ProjectListResult,
  ProjectPanelContextIpcRequest,
  ProjectPanelContextResult,
  ProjectPanelWriteAnchor,
} from "../src/project/projectIpcTypes";
import type { ResolvedProjectRoot } from "../src/project/projectRoot";
import type { ProjectBookGroup, ProjectAssetItem } from "../src/project/projectBooksQuery";
import { unregisterProjectAt } from "./projectUnregisterStore";
import { scanProjectTextFiles } from "./projectTextFileScan";

/** main.ts の SEC-1/SEC-2 boundary state への読み取り口。 */
export type ProjectIpcBoundary = {
  getWorkspaceRoot: () => string | null;
  isAllowedDocumentPath: (realPath: string) => boolean;
};

/**
 * renderer 申告の document path を realpath 解決し、document 境界
 * (workspace root 配下 or allowedDocumentPaths) 内のものだけ返す。
 * main.ts の checkDocumentPath と同じ規則の同期版。
 */
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

function resolveRealWorkspaceRoot(boundary: ProjectIpcBoundary): string | null {
  const workspaceRoot = boundary.getWorkspaceRoot();
  if (!workspaceRoot) return null;
  try {
    return fs.realpathSync(path.resolve(workspaceRoot));
  } catch {
    return null;
  }
}

function computeNotInProjectCreateTarget(
  boundary: ProjectIpcBoundary,
  folderPath: string,
): { createTargetFolder: string | null; createTargetName: string | null } {
  const realWorkspaceRoot = resolveRealWorkspaceRoot(boundary);
  if (!realWorkspaceRoot) {
    return { createTargetFolder: null, createTargetName: null };
  }
  if (folderPath === realWorkspaceRoot) {
    return { createTargetFolder: null, createTargetName: null };
  }
  return {
    createTargetFolder: folderPath,
    createTargetName: path.basename(folderPath),
  };
}

function parseProjectPanelContextRequest(raw: unknown): ProjectPanelContextIpcRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  const source = record.source;
  const selectedPath = record.selectedPath;
  if (
    (kind !== "file" && kind !== "directory" && kind !== "project-root") ||
    (source !== "file-explorer-selection" && source !== "project-switcher") ||
    typeof selectedPath !== "string" ||
    !selectedPath.trim()
  ) {
    return null;
  }
  return { kind, source, selectedPath };
}

function parseProjectPanelWriteAnchor(raw: unknown): ProjectPanelWriteAnchor | null {
  if (typeof raw === "string") return raw;
  return parseProjectPanelContextRequest(raw);
}

function isWorkspaceRootPath(boundary: ProjectIpcBoundary, folderPath: string): boolean {
  const realWorkspaceRoot = resolveRealWorkspaceRoot(boundary);
  if (!realWorkspaceRoot) return false;
  return folderPath === realWorkspaceRoot;
}

export type ProjectWriteAnchorResolveResult =
  | { ok: true; resolved: ResolvedProjectRoot }
  | { ok: false; reason: "invalid-path" | "invalid-request" | "not-in-project" };

/** manifest write / context read で共有する project root 解決。 */
export function resolveProjectRootFromWriteAnchor(
  boundary: ProjectIpcBoundary,
  rawAnchor: unknown,
): ProjectWriteAnchorResolveResult {
  const anchor = parseProjectPanelWriteAnchor(rawAnchor);
  if (anchor === null) return { ok: false, reason: "invalid-request" };

  if (typeof anchor === "string") {
    const realPath = resolveBoundedDocumentPath(boundary, anchor);
    if (!realPath) return { ok: false, reason: "invalid-path" };
    const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
    if (!resolved) return { ok: false, reason: "not-in-project" };
    return { ok: true, resolved };
  }

  const realPath = resolveBoundedDocumentPath(boundary, anchor.selectedPath);
  if (!realPath) return { ok: false, reason: "invalid-path" };

  let stat: fs.Stats;
  try {
    stat = fs.statSync(realPath);
  } catch {
    return { ok: false, reason: "invalid-path" };
  }

  if (anchor.kind === "file") {
    if (!stat.isFile()) return { ok: false, reason: "invalid-path" };
    const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
    if (!resolved) return { ok: false, reason: "not-in-project" };
    return { ok: true, resolved };
  }

  if (!stat.isDirectory()) return { ok: false, reason: "invalid-path" };
  if (isWorkspaceRootPath(boundary, realPath)) {
    return { ok: false, reason: "invalid-path" };
  }

  const probePath = path.join(realPath, ".nyoze-panel-probe.md");
  const resolved = resolveProjectRootWithFs(probePath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: false, reason: "not-in-project" };
  return { ok: true, resolved };
}

function pickQueryAnchorFilePath(
  projectRoot: string,
  books: ProjectBookGroup[],
  materialsFlat?: ProjectAssetItem[],
): string | null {
  for (const group of books) {
    if (group.items.length > 0 && group.items[0]?.absolutePath) {
      return group.items[0].absolutePath;
    }
  }
  if (materialsFlat && materialsFlat.length > 0 && materialsFlat[0]?.absolutePath) {
    return materialsFlat[0].absolutePath;
  }
  try {
    const files = scanProjectTextFiles(projectRoot);
    if (files[0]?.absolutePath) return files[0].absolutePath;
  } catch {
    // scan failure → no anchor
  }
  return null;
}

async function buildProjectBooksReadyPayload(
  resolved: ResolvedProjectRoot,
  currentRelativePath: string | null,
): Promise<ProjectBooksResult> {
  const load = await loadBookManifestV3ForProject(resolved.projectRoot);
  const manifestState = resolveCanonicalManifestV3QueryState(load);
  const { isPathPresent, resolveAbsolutePath } = createRegistryDiskResolver(
    resolved.projectRoot,
  );
  const payload = projectBooksPayloadFromManifestV3({
    registry: manifestState.registry,
    projectRoot: resolved.projectRoot,
    currentRelativePath,
    isPathPresent,
    resolveAbsolutePath,
  });
  const result: ProjectBooksResult = {
    ok: true,
    kind: "ready",
    project: { projectRoot: resolved.projectRoot, metadata: resolved.metadata },
    books: payload.books,
    assets: payload.assets,
    materialsFlat: payload.materialsFlat,
    currentRelativePath,
    manifestSource: manifestState.manifestSource,
  };
  const warning = manifestState.manifestWarning;
  if (warning) result.manifestWarning = warning;
  return result;
}

/**
 * `project:resolvePanelContext`（Project タブ context 接続）
 * renderer は bounded selectedPath + kind + source だけを渡す。read-only。
 */
export async function resolvePanelContextIpc(
  boundary: ProjectIpcBoundary,
  rawRequest: unknown,
): Promise<ProjectPanelContextResult> {
  const request = parseProjectPanelContextRequest(rawRequest);
  if (!request) return { ok: false, reason: "invalid-request" };

  const realPath = resolveBoundedDocumentPath(boundary, request.selectedPath);
  if (!realPath) return { ok: false, reason: "invalid-path" };

  let stat: fs.Stats;
  try {
    stat = fs.statSync(realPath);
  } catch {
    return { ok: false, reason: "invalid-path" };
  }

  if (request.kind === "file") {
    if (!stat.isFile()) return { ok: false, reason: "invalid-path" };

    const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
    if (!resolved) {
      const parentDir = path.dirname(realPath);
      return { ok: true, kind: "not-in-project", ...computeNotInProjectCreateTarget(boundary, parentDir) };
    }

    const currentRelativePath = path
      .relative(resolved.projectRoot, realPath)
      .split(path.sep)
      .join("/");
    const payload = await buildProjectBooksReadyPayload(resolved, currentRelativePath);
    if (!payload.ok) return payload;
    if (payload.kind !== "ready") return { ok: false, reason: "scan-failed" };

    return {
      ...payload,
      queryAnchorFilePath: realPath,
    };
  }

  if (!stat.isDirectory()) return { ok: false, reason: "invalid-path" };

  const probePath = path.join(realPath, ".nyoze-panel-probe.md");
  const resolved = resolveProjectRootWithFs(probePath, boundary.getWorkspaceRoot());
  if (!resolved) {
    return { ok: true, kind: "not-in-project", ...computeNotInProjectCreateTarget(boundary, realPath) };
  }

  const payload = await buildProjectBooksReadyPayload(resolved, null);
  if (!payload.ok) return payload;
  if (payload.kind !== "ready") return { ok: false, reason: "scan-failed" };

  return {
    ...payload,
    queryAnchorFilePath: pickQueryAnchorFilePath(
      resolved.projectRoot,
      payload.books,
      payload.materialsFlat,
    ),
  };
}

/**
 * `project:resolveForFile`
 * project 未所属 (invalid project.json による解決停止を含む) は project: null。
 */
export function resolveProjectForFileIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): ProjectResolveResult {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };
  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: true, project: null };
  return {
    ok: true,
    project: { projectRoot: resolved.projectRoot, metadata: resolved.metadata },
  };
}

/**
 * `project:resolveBookFullOutline`（Outline 拡張 / Book全体Outline）
 * active file path だけを起点に project root を解決し、同じ Book の body 章を章順に並べ、
 * 各章の Markdown 見出しを read-only で返す。renderer から projectRoot は受け取らない。
 */
export async function resolveBookFullOutlineIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): Promise<BookFullOutlineResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };

  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: true, kind: "not-in-project" };

  const currentRelativePath = path
    .relative(resolved.projectRoot, realPath)
    .split(path.sep)
    .join("/");

  const load = await loadBookManifestV3ForProject(resolved.projectRoot);
  const manifestState = resolveCanonicalManifestV3QueryState(load);
  if (manifestState.manifestSource === "v3") {
    const { isPathPresent, resolveAbsolutePath } = createRegistryDiskResolver(
      resolved.projectRoot,
    );
    const computed = bookFullOutlinePayloadFromManifestV3({
      registry: manifestState.registry,
      projectRoot: resolved.projectRoot,
      currentRelativePath,
      isPathPresent,
      resolveAbsolutePath,
      getChapterOutline: (chapter) => readChapterOutline(chapter.absolutePath),
    });
    if (computed.kind === "no-current-book") {
      return { ok: true, kind: "no-current-book" };
    }
    return {
      ok: true,
      kind: "ready",
      project: { projectRoot: resolved.projectRoot, metadata: resolved.metadata },
      currentBook: computed.currentBook,
      book: computed.book,
      chapters: computed.chapters,
      currentRelativePath,
      manifestSource: manifestState.manifestSource,
    };
  }

  // v3-only: absent / invalid / unsupported version でも frontmatter へ fallback しない。
  // diagnostics 付き ready も canonical v3 とみなさず no-current-book へ畳む。
  const warning = manifestState.manifestWarning;
  return warning
    ? { ok: true, kind: "no-current-book", manifestSource: "none", manifestWarning: warning }
    : { ok: true, kind: "no-current-book" };
}

/**
 * `project:resolveChapterNeighbors`（Outline 拡張 / 前後章ナビゲーション）
 * active file path だけを起点に project root を解決し、同一 Book 内の前後章を返す。
 * 見出し読み取りは伴わない軽量 scan（frontmatter のみ）。renderer から projectRoot は受け取らない。
 */
export async function resolveChapterNeighborsIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): Promise<ChapterNeighborsResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };

  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: true, kind: "not-in-project" };

  const currentRelativePath = path
    .relative(resolved.projectRoot, realPath)
    .split(path.sep)
    .join("/");

  const load = await loadBookManifestV3ForProject(resolved.projectRoot);
  const manifestState = resolveCanonicalManifestV3QueryState(load);
  if (manifestState.manifestSource === "v3") {
    const { isPathPresent, resolveAbsolutePath } = createRegistryDiskResolver(
      resolved.projectRoot,
    );
    const computed = chapterNeighborsPayloadFromManifestV3({
      registry: manifestState.registry,
      projectRoot: resolved.projectRoot,
      currentRelativePath,
      isPathPresent,
      resolveAbsolutePath,
    });
    if (computed.kind === "no-current-book") {
      return { ok: true, kind: "no-current-book" };
    }
    return {
      ok: true,
      kind: "ready",
      project: { projectRoot: resolved.projectRoot, metadata: resolved.metadata },
      current: computed.current,
      previous: computed.previous,
      next: computed.next,
      currentRelativePath,
      manifestSource: manifestState.manifestSource,
    };
  }

  const warning = manifestState.manifestWarning;
  return warning
    ? { ok: true, kind: "no-current-book", manifestSource: "none", manifestWarning: warning }
    : { ok: true, kind: "no-current-book" };
}

/**
 * `project:resolveBookExportTarget`（Book 全体 export UI）
 * active file path だけを起点に project root を解決し、read-only v3 manifest から
 * 対象 Book を返す。renderer から projectRoot は受け取らない。
 */
export function resolveBookExportTargetIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): BookExportTargetResult {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };

  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: true, kind: "not-in-project" };

  const currentRelativePath = path
    .relative(resolved.projectRoot, realPath)
    .split(path.sep)
    .join("/");

  const target = resolveBookExportTargetForProject(
    resolved.projectRoot,
    currentRelativePath,
  );
  if (target.kind === "ready") {
    return {
      ok: true,
      kind: "ready",
      bookId: target.bookId,
      bookDisplayName: target.bookDisplayName,
    };
  }
  if (target.kind === "no-current-book") {
    return { ok: true, kind: "no-current-book" };
  }
  return { ok: true, kind: "loader-failed", failure: target };
}

/**
 * `project:resolveProjectBooks`（Slice B3 / Project タブ）
 * active file path だけを起点に project root を解決し、同一 Project 内の全 Book group と
 * role 別資料を返す。renderer から projectRoot は受け取らない。
 */
export async function resolveProjectBooksIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): Promise<ProjectBooksResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };

  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: true, kind: "not-in-project" };

  const currentRelativePath = path
    .relative(resolved.projectRoot, realPath)
    .split(path.sep)
    .join("/");

  return buildProjectBooksReadyPayload(resolved, currentRelativePath);
}

/**
 * `project:resolveUnregisteredFilesV3`（Book manifest v3: 未登録テキスト系ファイル query）
 *
 * renderer は write anchor または bounded file path だけを渡し、main 側で project root を解決して
 * `.nyoze/books.json` v3 registry を正本に未登録 `.md` / `.markdown` / `.txt` を列挙する。
 * scan 自体は version 非依存で、registry filter だけが v3 を見る。ファイル内容は読まず、
 * `.nyoze/books.json` / Markdown / frontmatter は書き換えない。
 *
 */
export async function resolveUnregisteredFilesV3Ipc(
  boundary: ProjectIpcBoundary,
  rawFilePathOrAnchor: unknown,
): Promise<BookManifestV3UnregisteredFilesIpcResult> {
  const resolveResult = resolveProjectRootFromWriteAnchor(boundary, rawFilePathOrAnchor);
  if (!resolveResult.ok) {
    if (resolveResult.reason === "invalid-request") {
      return { ok: false, reason: "invalid-args" };
    }
    if (resolveResult.reason === "not-in-project") {
      return { ok: true, kind: "not-in-project" };
    }
    return { ok: false, reason: "invalid-path" };
  }
  const resolved = resolveResult.resolved;

  const load = await loadBookManifestV3ForProject(resolved.projectRoot);

  let registry: BookManifestV3Registry;
  if (load.kind === "read-error") {
    return { ok: false, reason: "manifest-read-error" };
  } else if (load.kind === "ready") {
    // ready-with-diagnostics は registry が部分的に失われ得るため、未登録判定の正本にしない。
    if (hasReadyManifestV3Diagnostics(load)) {
      return { ok: false, reason: "manifest-invalid" };
    }
    registry = load.registry;
  } else if (load.kind === "absent") {
    // books.json absent は空 v3 registry として扱い、Project 内テキスト系ファイルを未登録として返す。
    registry = emptyBookManifestV3Registry();
  } else {
    // unsupported-version / invalid は破損扱い（空 v3 で上書きしない）。
    return { ok: false, reason: "manifest-invalid" };
  }

  const scanResult = readUnregisteredProjectFilesForV3(resolved.projectRoot, registry);
  if (!scanResult.ok) {
    return { ok: false, reason: "scan-failed" };
  }

  return {
    ok: true,
    kind: "ready",
    project: { projectRoot: resolved.projectRoot, metadata: resolved.metadata },
    files: scanResult.files,
  };
}

/**
 * `project:detectProjectRoots`（File Explorer: project root folder 表示）
 *
 * 現在 File Explorer に表示中のフォルダ候補パス配列を受け取り、
 * workspace root 配下かつ `.nyoze/project.json` を持つものだけを
 * 「入力された文字列のまま」返す（renderer 側の visible entry と突き合わせるため）。
 *
 * 表示専用:
 * - `.nyoze/project.json` を作成しない（存在確認のみ）。
 * - frontmatter は読まない（role 別判定は別スライス）。
 * - renderer から解決済み projectRoot は受け取らない（候補ディレクトリパスのみ）。
 *   各パスは main 側で realpath 解決 + workspace 境界検査してから判定する。
 */
export function detectProjectRootsIpc(
  boundary: ProjectIpcBoundary,
  rawDirPaths: unknown,
): string[] {
  if (!Array.isArray(rawDirPaths)) return [];
  const workspaceRoot = boundary.getWorkspaceRoot();
  if (!workspaceRoot) return [];

  const roots: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawDirPaths) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    seen.add(raw);
    const validPath = validatePathArg(raw);
    if (!validPath) continue;
    let realPath: string;
    try {
      realPath = fs.realpathSync(path.resolve(validPath));
      if (!fs.statSync(realPath).isDirectory()) continue;
    } catch {
      continue;
    }
    // 表示対象は workspace root 配下のフォルダだけ
    // （allowedDocumentPaths は単独ファイル用なので project root 表示には使わない）。
    if (!isWithinDirectory(realPath, workspaceRoot)) continue;
    if (hasProjectMarker(realPath)) roots.push(raw);
  }
  return roots;
}

/** path が通常ファイル（regular file、symlink でない）として存在するか。read-only。 */
function isRegularFile(filePath: string): boolean {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * `project:listProjects`（Project 一覧 read-only query）
 *
 * workspace root（書庫）配下にある Project root（`.nyoze/project.json` 保有フォルダ）を
 * 列挙する。renderer は projectRoot を送らず、main 側 boundary の workspace root を正本にする。
 *
 * read-only:
 * - `.nyoze/project.json` / `books.json` / Markdown / notes.json を一切変更しない。
 * - title は `.nyoze/project.json` から読み、空 / 不正ならフォルダ名 fallback。
 * - `hasBooksManifest` は `.nyoze/books.json` の通常ファイル存在確認のみ（中身は読まない）。
 *
 * 走査の境界（symlink 非追従 / workspace root 自身は非対象 / Project 配下は非再帰 /
 * `.nyoze` 非降下 / entry 上限）は {@link scanWorkspaceProjectRoots} に委ねる。
 *
 * 第 2 引数は将来の filter 用に予約（現状は未使用）。第 3 引数はテスト用の走査上限注入。
 */
export function listProjectsIpc(
  boundary: ProjectIpcBoundary,
  _filter?: unknown,
  options?: { maxEntries?: number },
): ProjectListResult {
  const workspaceRoot = boundary.getWorkspaceRoot();
  if (!workspaceRoot) return { ok: true, kind: "unavailable" };

  let realWorkspaceRoot: string;
  try {
    realWorkspaceRoot = fs.realpathSync(path.resolve(workspaceRoot));
    if (!fs.statSync(realWorkspaceRoot).isDirectory()) {
      return { ok: false, reason: "scan-failed" };
    }
  } catch {
    return { ok: false, reason: "scan-failed" };
  }

  const scan = scanWorkspaceProjectRoots(realWorkspaceRoot, options);
  if (scan.kind === "limit-exceeded") {
    return { ok: false, reason: "scan-limit-exceeded" };
  }

  const projects: ProjectListEntry[] = scan.projectRoots.map((projectRoot) => {
    const relativePath = path
      .relative(realWorkspaceRoot, projectRoot)
      .split(path.sep)
      .join("/");
    const metadata = readProjectMetadata(projectRoot);
    const rawTitle = metadata?.title?.trim() ?? "";
    const title = rawTitle.length > 0 ? rawTitle : path.basename(projectRoot);
    const hasBooksManifest = isRegularFile(
      path.join(projectRoot, NYOZE_DIR_NAME, BOOK_MANIFEST_FILENAME),
    );
    return { projectRoot, relativePath, title, hasBooksManifest };
  });

  // 並び順は相対 path 昇順（決定的に並べる）。
  projects.sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  return { ok: true, kind: "ready", projects };
}

/**
 * `project:detectFileRoles`（Slice B16 / File Explorer role アイコン）
 *
 * 現在 File Explorer に表示中のテキスト系ファイル候補パス配列を受け取り、
 * 作品内かつ books.json v3 registry に登録済みのものだけを
 * 「入力文字列 + role」で返す（表示専用）。
 *
 * 不変条件:
 * - books.json v3 を正本とする。frontmatter `role` へ fallback しない。
 * - renderer から解決済み projectRoot は受け取らない（候補ファイルパスのみ）。
 *   各パスは main 側で realpath 解決 + document 境界検査 + project 解決してから判定する。
 * - 対象は `.md` / `.markdown` / `.txt`（v3 登録対象と一致）。
 * - manifest absent / invalid / diagnostics ありの作品は role アイコンなし。
 * - 同一作品の manifest loader は作品ごとに 1 回だけ呼ぶ。
 */
type FileRoleDetectionCandidate = {
  rawPath: string;
  relativePath: string;
};

export async function detectFileRolesIpc(
  boundary: ProjectIpcBoundary,
  rawFilePaths: unknown,
): Promise<FileRoleEntry[]> {
  if (!Array.isArray(rawFilePaths)) return [];
  const workspaceRoot = boundary.getWorkspaceRoot();

  const byProjectRoot = new Map<string, FileRoleDetectionCandidate[]>();
  const seen = new Set<string>();
  for (const raw of rawFilePaths) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    seen.add(raw);
    const realPath = resolveBoundedDocumentPath(boundary, raw);
    if (!realPath) continue;
    if (!detectProjectTextFileExtension(path.basename(realPath))) continue;
    const resolved = resolveProjectRootWithFs(realPath, workspaceRoot);
    if (!resolved) continue;
    const relativePath = path.relative(resolved.projectRoot, realPath).split(path.sep).join("/");
    const group = byProjectRoot.get(resolved.projectRoot) ?? [];
    group.push({ rawPath: raw, relativePath });
    byProjectRoot.set(resolved.projectRoot, group);
  }

  const result: FileRoleEntry[] = [];
  for (const [projectRoot, candidates] of byProjectRoot) {
    const load = await loadBookManifestV3ForProject(projectRoot);
    const manifestState = resolveCanonicalManifestV3QueryState(load);
    if (manifestState.manifestSource !== "v3") continue;
    for (const candidate of candidates) {
      const role = resolveFileExplorerRoleFromManifestV3(
        manifestState.registry,
        candidate.relativePath,
      );
      if (role) result.push({ path: candidate.rawPath, role });
    }
  }
  return result;
}

/** project:create の作成オプション（renderer から渡る形）。projectRoot は含めない。 */
type ParsedCreateProjectOptions =
  | { ok: true; projectTitle: string | undefined; initialBookName: string }
  | { ok: false };

/** 表示文字列の NUL 除去 + 長さ cap。空白 trim は呼び出し側のフォールバックに委ねる。 */
function sanitizeCreateString(value: string): string {
  return value.replace(/\0/g, "").slice(0, MAX_PROJECT_TITLE_LENGTH);
}

/**
 * `project:create` の第 2 引数を解釈する。
 *
 * - `undefined`: projectTitle 未指定（folder 名で補う）/ initialBookName は既定 `本編`。
 * - `string`（後方互換）: 旧 title 引数。projectTitle として採用、initialBookName は既定。
 * - object `{ projectTitle?, initialBookName? }`: モーダル入力。型が違えば不正。
 * - それ以外（number / boolean / null）: 不正。
 */
function parseCreateProjectOptions(raw: unknown): ParsedCreateProjectOptions {
  if (raw === undefined) {
    return { ok: true, projectTitle: undefined, initialBookName: DEFAULT_INITIAL_BOOK_NAME };
  }
  if (typeof raw === "string") {
    return { ok: true, projectTitle: sanitizeCreateString(raw), initialBookName: DEFAULT_INITIAL_BOOK_NAME };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.projectTitle !== undefined && typeof obj.projectTitle !== "string") return { ok: false };
  if (obj.initialBookName !== undefined && typeof obj.initialBookName !== "string") return { ok: false };

  const projectTitleRaw =
    obj.projectTitle === undefined ? undefined : sanitizeCreateString(obj.projectTitle);
  // 空白 trim 後に空なら folder 名で補う（main 側フォールバック。UI でも空入力は防ぐ）。
  const projectTitle =
    projectTitleRaw !== undefined && projectTitleRaw.trim().length > 0 ? projectTitleRaw : undefined;

  const bookNameRaw =
    obj.initialBookName === undefined ? "" : sanitizeCreateString(obj.initialBookName);
  const initialBookName =
    bookNameRaw.trim().length > 0 ? bookNameRaw : DEFAULT_INITIAL_BOOK_NAME;

  return { ok: true, projectTitle, initialBookName };
}

/**
 * `project:create`
 * workspace root 配下の実在フォルダのみ。`.nyoze/project.json` と v3 `.nyoze/books.json`
 * （最初の Book を 1 件持つ）を初期作成する。renderer から projectRoot は受け取らない。
 *
 * 拒否境界（workspace root / 親フォルダ / サブフォルダ）:
 * - workspace 未設定 / workspace 配下でない → `outside-workspace`
 * - 対象が workspace root 自体 → `workspace-root-not-allowed`（書庫ルートは作品にしない）
 * - 対象が既存 project root → `already-exists`
 * - 対象が既存 project の内側 → `inside-existing-project`
 * - 対象フォルダの子孫に既存 project root がある → `contains-existing-project`
 * - 対象が directory でない → `not-a-directory`
 */
export async function createProjectIpc(
  boundary: ProjectIpcBoundary,
  rawFolderPath: unknown,
  rawOptions: unknown,
): Promise<ProjectCreateResult> {
  const validPath = validatePathArg(rawFolderPath);
  if (!validPath) return { ok: false, reason: "invalid-path" };

  const parsedOptions = parseCreateProjectOptions(rawOptions);
  if (!parsedOptions.ok) return { ok: false, reason: "invalid-args" };

  let realFolder: string;
  try {
    realFolder = fs.realpathSync(path.resolve(validPath));
  } catch {
    return { ok: false, reason: "invalid-path" };
  }

  try {
    if (!fs.statSync(realFolder).isDirectory()) {
      return { ok: false, reason: "not-a-directory" };
    }
  } catch {
    return { ok: false, reason: "invalid-path" };
  }

  const workspaceRoot = boundary.getWorkspaceRoot();
  if (!workspaceRoot) return { ok: false, reason: "outside-workspace" };

  // workspace root 自体は「書庫」相当のため project root にしない。
  let realWorkspaceRoot = workspaceRoot;
  try {
    realWorkspaceRoot = fs.realpathSync(path.resolve(workspaceRoot));
  } catch {
    // workspace root が解決できない場合は安全側で outside-workspace。
    return { ok: false, reason: "outside-workspace" };
  }
  if (realFolder === realWorkspaceRoot) {
    return { ok: false, reason: "workspace-root-not-allowed" };
  }
  if (!isWithinDirectory(realFolder, realWorkspaceRoot)) {
    return { ok: false, reason: "outside-workspace" };
  }

  // 祖先方向: 対象が既存 project の内側か（自身が project root の場合は別途 already-exists）。
  const probePath = path.join(realFolder, ".nyoze-create-probe.md");
  const enclosing = resolveProjectRootWithFs(probePath, realWorkspaceRoot);
  if (enclosing && enclosing.projectRoot !== realFolder) {
    return { ok: false, reason: "inside-existing-project" };
  }
  // 対象自身が既に project root。createProjectWithInitialBookAt も再確認するが、
  // 子孫 scan より優先して already-exists を返したいので先に弾く。
  if (hasProjectMarker(realFolder)) {
    return { ok: false, reason: "already-exists" };
  }

  // 子孫方向: 対象フォルダの内部に既存 project root があれば親を作品化させない。
  const descendant = scanForDescendantProjectRoot(realFolder);
  if (descendant.kind !== "none") {
    // found / limit-exceeded（巨大フォルダで確証が取れない）はどちらも安全側で拒否する。
    return { ok: false, reason: "contains-existing-project" };
  }

  const created = await createProjectWithInitialBookAt(realFolder, {
    projectTitle: parsedOptions.projectTitle ?? path.basename(realFolder),
    initialBookName: parsedOptions.initialBookName,
  });
  if (!created.ok) return { ok: false, reason: created.reason };
  return { ok: true, projectRoot: created.projectRoot, metadata: created.metadata };
}

/**
 * `project:updateTitle`
 * bounded file path または context write anchor を起点に project root を解決し、
 * `.nyoze/project.json` の `title` だけを更新する。renderer から projectRoot は受け取らない。
 */
export async function updateProjectTitleIpc(
  boundary: ProjectIpcBoundary,
  rawFilePathOrAnchor: unknown,
  rawTitle: unknown,
): Promise<ProjectUpdateTitleResult> {
  if (typeof rawTitle !== "string") return { ok: false, reason: "invalid-args" };

  const resolveResult = resolveProjectRootFromWriteAnchor(boundary, rawFilePathOrAnchor);
  if (!resolveResult.ok) {
    if (resolveResult.reason === "invalid-request") {
      return { ok: false, reason: "invalid-args" };
    }
    return { ok: false, reason: resolveResult.reason };
  }

  const updated = await updateProjectTitleAt(resolveResult.resolved.projectRoot, rawTitle);
  if (!updated.ok) return { ok: false, reason: updated.reason };
  return { ok: true, metadata: updated.metadata };
}

/**
 * `project:unregister`
 * bounded file path または context write anchor を起点に project root を解決し、
 * `.nyoze/project.json` と `.nyoze/books.json` だけを削除する。renderer から projectRoot は受け取らない。
 * notes.json が存在する場合は notes-exist で拒否し、管理ファイルは触らない。
 */
export async function unregisterProjectIpc(
  boundary: ProjectIpcBoundary,
  rawFilePathOrAnchor: unknown,
): Promise<ProjectUnregisterResult> {
  const resolveResult = resolveProjectRootFromWriteAnchor(boundary, rawFilePathOrAnchor);
  if (!resolveResult.ok) {
    if (resolveResult.reason === "invalid-request") {
      return { ok: false, reason: "invalid-path" };
    }
    return { ok: false, reason: resolveResult.reason };
  }

  const result = await unregisterProjectAt(resolveResult.resolved.projectRoot);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true };
}

/** 非空 string array だけを受理（要素が非 string なら null）。authors 検証用。 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((element) => typeof element === "string");
}

/** toIndex は finite integer のみ受理。小数 / NaN / Infinity / 非 number は不可。 */
function isIntegerIndexArg(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

const FORBIDDEN_V3_REGISTRATION_FIELDS = [
  "title",
  "authors",
  "translators",
  "projectRoot",
  "rootPath",
] as const;

function hasForbiddenV3RegistrationFields(obj: Record<string, unknown>): boolean {
  return FORBIDDEN_V3_REGISTRATION_FIELDS.some((key) => obj[key] !== undefined);
}

/**
 * renderer 申告の v3 operation payload を discriminant ごとに型検証する。
 *
 * ここでは **型** だけを見る（string / array / enum の shape）。空文字 / 未知 role /
 * registry path の妥当性などの意味検証は pure helper（writer）が担い、結果は `invalid-input`
 * に畳む。型が違うものは `invalid-args`（null を返す）。
 */
function coerceBookManifestV3Operation(raw: unknown): BookManifestV3UpdateOperation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  switch (obj.type) {
    case "create-book": {
      if (typeof obj.name !== "string") return null;
      if (obj.authors !== undefined && !isStringArray(obj.authors)) return null;
      if (obj.language !== undefined && obj.language !== null && typeof obj.language !== "string") {
        return null;
      }
      if (
        obj.writingMode !== undefined &&
        obj.writingMode !== null &&
        obj.writingMode !== "vertical-rl" &&
        obj.writingMode !== "horizontal-tb"
      ) {
        return null;
      }
      const op: BookManifestV3UpdateOperation = { type: "create-book", name: obj.name };
      if (obj.authors !== undefined) op.authors = obj.authors as string[];
      if (obj.language !== undefined) op.language = obj.language as string | null;
      if (obj.writingMode !== undefined) {
        op.writingMode = obj.writingMode as "vertical-rl" | "horizontal-tb" | null;
      }
      return op;
    }
    case "update-book": {
      if (typeof obj.bookId !== "string") return null;
      if (obj.name !== undefined && typeof obj.name !== "string") return null;
      if (obj.authors !== undefined && !isStringArray(obj.authors)) return null;
      if (obj.language !== undefined && obj.language !== null && typeof obj.language !== "string") {
        return null;
      }
      if (
        obj.writingMode !== undefined &&
        obj.writingMode !== null &&
        obj.writingMode !== "vertical-rl" &&
        obj.writingMode !== "horizontal-tb"
      ) {
        return null;
      }
      const op: BookManifestV3UpdateOperation = { type: "update-book", bookId: obj.bookId };
      if (obj.name !== undefined) op.name = obj.name;
      if (obj.authors !== undefined) op.authors = obj.authors as string[];
      if (obj.language !== undefined) op.language = obj.language as string | null;
      if (obj.writingMode !== undefined) {
        op.writingMode = obj.writingMode as "vertical-rl" | "horizontal-tb" | null;
      }
      return op;
    }
    case "remove-book": {
      if (typeof obj.bookId !== "string") return null;
      return { type: "remove-book", bookId: obj.bookId };
    }
    case "update-body-item-metadata": {
      if (typeof obj.bookId !== "string" || typeof obj.itemId !== "string") return null;
      if (obj.title !== undefined && typeof obj.title !== "string") return null;
      if (obj.authors !== undefined && !isStringArray(obj.authors)) return null;
      if (obj.translators !== undefined && !isStringArray(obj.translators)) return null;
      const op: BookManifestV3UpdateOperation = {
        type: "update-body-item-metadata",
        bookId: obj.bookId,
        itemId: obj.itemId,
      };
      if (obj.title !== undefined) op.title = obj.title;
      if (obj.authors !== undefined) op.authors = obj.authors as string[];
      if (obj.translators !== undefined) op.translators = obj.translators as string[];
      return op;
    }
    case "move-body-item": {
      if (typeof obj.bookId !== "string" || typeof obj.itemId !== "string") return null;
      if (!isIntegerIndexArg(obj.toIndex)) return null;
      return {
        type: "move-body-item",
        bookId: obj.bookId,
        itemId: obj.itemId,
        toIndex: obj.toIndex,
      };
    }
    case "remove-body-item": {
      if (typeof obj.bookId !== "string" || typeof obj.itemId !== "string") return null;
      return { type: "remove-body-item", bookId: obj.bookId, itemId: obj.itemId };
    }
    case "add-body-item": {
      if (hasForbiddenV3RegistrationFields(obj)) return null;
      if (typeof obj.bookId !== "string" || typeof obj.path !== "string") return null;
      return { type: "add-body-item", bookId: obj.bookId, path: obj.path };
    }
    case "add-material": {
      if (hasForbiddenV3RegistrationFields(obj)) return null;
      if (typeof obj.path !== "string") return null;
      if (
        !(KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES as readonly string[]).includes(obj.role as string)
      ) {
        return null;
      }
      return {
        type: "add-material",
        path: obj.path,
        role: obj.role as BookManifestV3MaterialRole,
      };
    }
    case "update-material": {
      if (typeof obj.materialId !== "string") return null;
      if (obj.title !== undefined && typeof obj.title !== "string") return null;
      if (obj.authors !== undefined && !isStringArray(obj.authors)) return null;
      if (obj.translators !== undefined && !isStringArray(obj.translators)) return null;
      if (
        obj.role !== undefined &&
        !(KNOWN_BOOK_MANIFEST_V3_MATERIAL_ROLES as readonly string[]).includes(obj.role as string)
      ) {
        return null;
      }
      const op: BookManifestV3UpdateOperation = {
        type: "update-material",
        materialId: obj.materialId,
      };
      if (obj.title !== undefined) op.title = obj.title;
      if (obj.authors !== undefined) op.authors = obj.authors as string[];
      if (obj.translators !== undefined) op.translators = obj.translators as string[];
      if (obj.role !== undefined) op.role = obj.role as BookManifestV3MaterialRole;
      return op;
    }
    case "move-material": {
      if (typeof obj.materialId !== "string") return null;
      if (!isIntegerIndexArg(obj.toIndex)) return null;
      return { type: "move-material", materialId: obj.materialId, toIndex: obj.toIndex };
    }
    case "remove-material": {
      if (typeof obj.materialId !== "string") return null;
      return { type: "remove-material", materialId: obj.materialId };
    }
    default:
      return null;
  }
}

async function applyBookManifestV3RegistrationOperation(
  projectRoot: string,
  registry: BookManifestV3Registry,
  operation: Extract<
    BookManifestV3UpdateOperation,
    { type: "add-body-item" } | { type: "add-material" }
  >,
  makeId: (taken: ReadonlySet<string>) => string,
): Promise<{ ok: true; registry: BookManifestV3Registry } | { ok: false; reason: string }> {
  const read = readRegistrationFileMetadata(projectRoot, operation.path);
  if (read.status === "invalid-path") {
    return { ok: false, reason: "invalid-path" };
  }
  if (read.status === "missing-file") {
    return { ok: false, reason: "missing-file" };
  }
  if (read.status === "read-error") {
    return { ok: false, reason: "read-error" };
  }

  const metadata = resolveV3RegistrationMetadata(operation.path, read.fields);
  if (!metadata.ok) {
    return { ok: false, reason: metadata.detail };
  }

  if (operation.type === "add-body-item") {
    const result = addBodyItemToV3Registry(
      registry,
      operation.bookId,
      {
        path: operation.path,
        title: metadata.title,
        authors: metadata.authors,
        translators: metadata.translators,
      },
      makeId,
    );
    return result.ok
      ? { ok: true, registry: result.registry }
      : { ok: false, reason: result.reason };
  }

  const result = addMaterialToV3Registry(
    registry,
    {
      path: operation.path,
      role: operation.role,
      title: metadata.title,
      authors: metadata.authors,
      translators: metadata.translators,
    },
    makeId,
  );
  return result.ok ? { ok: true, registry: result.registry } : { ok: false, reason: result.reason };
}

function applyBookManifestV3Operation(
  registry: BookManifestV3Registry,
  operation: Exclude<
    BookManifestV3UpdateOperation,
    { type: "add-body-item" } | { type: "add-material" }
  >,
  makeId: (taken: ReadonlySet<string>) => string,
): { ok: true; registry: BookManifestV3Registry } | { ok: false; reason: string } {
  switch (operation.type) {
    case "create-book": {
      const result = createBookInV3Registry(
        registry,
        {
          name: operation.name,
          authors: operation.authors,
          language: operation.language,
          writingMode: operation.writingMode,
        },
        makeId,
      );
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "update-book": {
      const result = updateBookInV3Registry(registry, operation.bookId, {
        name: operation.name,
        authors: operation.authors,
        language: operation.language,
        writingMode: operation.writingMode,
      });
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "remove-book": {
      const result = removeBookFromV3Registry(registry, operation.bookId);
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "update-body-item-metadata": {
      const result = updateBodyItemMetadataInV3Registry(
        registry,
        operation.bookId,
        operation.itemId,
        {
          title: operation.title,
          authors: operation.authors,
          translators: operation.translators,
        },
      );
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "move-body-item": {
      const result = moveBodyItemInV3Registry(
        registry,
        operation.bookId,
        operation.itemId,
        operation.toIndex,
      );
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "remove-body-item": {
      const result = removeBodyItemFromV3Registry(registry, operation.bookId, operation.itemId);
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "update-material": {
      const result = updateMaterialInV3Registry(registry, operation.materialId, {
        title: operation.title,
        authors: operation.authors,
        translators: operation.translators,
        role: operation.role,
      });
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "move-material": {
      const result = moveMaterialInV3Registry(registry, operation.materialId, operation.toIndex);
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
    case "remove-material": {
      const result = removeMaterialFromV3Registry(registry, operation.materialId);
      return result.ok
        ? { ok: true, registry: result.registry }
        : { ok: false, reason: result.reason };
    }
  }
}

/**
 * `project:updateBookManifestV3`
 * write anchor から project root を解決し、`.nyoze/books.json` v3 を atomic に更新する。
 * renderer から projectRoot は受け取らない。`add-body-item` / `add-material` は lock 内で
 * frontmatter を一度だけ読み、metadata 初期値を books.json に書き込む。
 */
export async function updateBookManifestV3Ipc(
  boundary: ProjectIpcBoundary,
  rawFilePathOrAnchor: unknown,
  rawOperation: unknown,
): Promise<UpdateBookManifestV3Result> {
  const resolveResult = resolveProjectRootFromWriteAnchor(boundary, rawFilePathOrAnchor);
  if (!resolveResult.ok) {
    if (resolveResult.reason === "invalid-request") {
      return { ok: false, reason: "invalid-args" };
    }
    return { ok: false, reason: resolveResult.reason };
  }

  const operation = coerceBookManifestV3Operation(rawOperation);
  if (!operation) return { ok: false, reason: "invalid-args" };

  const projectRoot = resolveResult.resolved.projectRoot;
  const updated =
    operation.type === "add-body-item" || operation.type === "add-material"
      ? await updateBookManifestV3ForProject(projectRoot, (registry, makeId) =>
          applyBookManifestV3RegistrationOperation(projectRoot, registry, operation, makeId),
        )
      : await updateBookManifestV3ForProject(projectRoot, (registry, makeId) =>
          applyBookManifestV3Operation(registry, operation, makeId),
        );
  if (!updated.ok) {
    return {
      ok: false,
      reason: updated.error,
      detail: updated.reason,
    };
  }
  return { ok: true };
}

/**
 * `project:readNotes`
 * notes.json 欠損は空 store (ファイルは作らない)。invalid は自動修復しない。
 */
export function readNotesIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): ProjectReadNotesResult {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };
  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: false, reason: "not-in-project" };

  const result = readNotesStore(resolved.projectRoot);
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, store: result.store, fileExists: result.fileExists };
}

/**
 * `project:resolveMissingFileNotes`
 * open note のうち参照先ファイルが project 内に存在しないものを返す。
 * renderer は active file path だけを渡し、project root は main 側で解決する。
 * 参照先の存在確認は read-time disk resolution（NFC/NFD 差分の吸収・projectRoot 境界 /
 * 中間 symlink ガード）で行い、`.nyoze/notes.json` の stored path は書き換えない。
 */
export async function resolveMissingFileNotesIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
): Promise<ProjectMissingFileNotesResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };
  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: false, reason: "not-in-project" };

  const read = readNotesStore(resolved.projectRoot);
  if (!read.ok) return { ok: false, reason: "read-failed" };

  const missing = await scanMissingFileNotes(read.store, async (relativeFile) =>
    isProjectRelativeFilePresentOnDisk(resolved.projectRoot, relativeFile),
  );
  return { ok: true, notes: toMissingFileNoteViews(missing) };
}

/**
 * `project:writeNotes`
 * store は main 側でも normalize / validate し、project root にだけ atomic write する。
 */
export async function writeNotesIpc(
  boundary: ProjectIpcBoundary,
  rawFilePath: unknown,
  rawStore: unknown,
): Promise<ProjectWriteNotesResult> {
  const realPath = resolveBoundedDocumentPath(boundary, rawFilePath);
  if (!realPath) return { ok: false, reason: "invalid-path" };
  const resolved = resolveProjectRootWithFs(realPath, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: false, reason: "not-in-project" };

  const store = normalizeNotesStore(rawStore);
  if (store === null) return { ok: false, reason: "invalid-store" };

  const result = await writeNotesStore(resolved.projectRoot, store);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    reason: result.reason === "not-a-project" ? "not-in-project" : result.reason,
  };
}
