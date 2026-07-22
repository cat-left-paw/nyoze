/**
 * File Explorer 単一ファイル rename / move の統合 transfer operation（main process 側）。
 *
 * 目的: 同一 Project 内の登録済みファイル 1 件を File Explorer から rename / move したとき、
 * 物理ファイル・`.nyoze/books.json` v3 の登録 path・`.nyoze/notes.json` の `note.file` を
 * 整合した状態で更新する。従来の「物理移動 → renderer callback → notes 追従 → books 追従」という
 * 事後追従だけにはせず、main 側で次の順序を持つ単一 operation にする:
 *
 *  1. source / destination と workspace 境界を検証
 *  2. source / destination の Project 所属を解決
 *  3. books.json v3 と notes.json を読み取る
 *  4. pure helper で更新後候補を生成
 *  5. diagnostics / path 衝突 / Project 間移動を事前検査
 *  6. 物理ファイルを移動
 *  7. books.json v3 と notes.json を既存 atomic write 経路で保存
 *  8. metadata 保存失敗時は、可能な限り物理ファイルと先に保存した metadata を rollback
 *  9. rollback にも失敗した場合は専用エラー（rollback-failed）として可視化
 *
 * 不変条件:
 * - renderer から projectRoot / books.json / notes.json の内容は受け取らない。
 *   source / destination / kind / overwrite だけを受け、project root と相対 path は main で解決する。
 * - Markdown 本文 / frontmatter は読み書きしない（v3 path 追従のため parse / serialize しない）。
 * - books.json v3 が invalid / read-error / diagnostics 付きなら物理移動前に拒否する。
 * - notes.json が invalid なら物理移動前に拒否する。
 * - 別 Project への登録済みファイル / 非 deleted 付箋を持つファイルの移動は拒否する。
 * - 既存の atomic write / overwrite backup / workspace 検証 / project lock を再利用する。
 */

import fs from "node:fs";
import path from "node:path";
import type { ProjectIpcBoundary } from "./projectIpc";
import { validatePathArg, isWithinDirectory } from "./ipcSecurity";
import { resolveProjectRootWithFs } from "./projectStore";
import { loadBookManifestV3ForProject } from "./bookManifestStore";
import {
  hasReadyManifestV3Diagnostics,
  resolveCanonicalManifestV3QueryState,
} from "./bookManifestV3QueryState";
import {
  updateBookManifestV3ForProject,
  relocateRegistryPathsForProject,
} from "./bookManifestV3Store";
import { readNotesStore, relocateNoteFileInProject } from "./noteStore";
import { moveFileWithOverwriteRollback } from "./destructiveFileOps";
import { toProjectRelativeFilePath, noteFilePathComparisonKey } from "../src/project/notePath";
import {
  isPathRegisteredInBookManifestV3,
  relocateRegistryPathsInBookManifestV3,
} from "../src/project/bookManifestV3Relocation";
import type { BookManifestV3Registry } from "../src/project/bookManifestV3";
import type { NyozeNotesStore } from "../src/project/noteStore";
import type {
  ExplorerTransferRequest,
  ExplorerTransferResult,
  ExplorerFolderTransferGuardResult,
} from "../src/project/projectIpcTypes";

export type {
  ExplorerTransferRequest,
  ExplorerTransferResult,
  ExplorerFolderTransferGuardResult,
};

export type ExplorerTransferDeps = {
  /** SEC-9 の overwrite backup。destination が既存ファイルのときだけ呼ばれる。 */
  createBackupBeforeOverwrite: (filePath: string) => Promise<void>;
};

function parseRequest(raw: unknown): ExplorerTransferRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  const sourcePath = record.sourcePath;
  const destinationPath = record.destinationPath;
  const overwrite = record.overwrite;
  if (kind !== "rename" && kind !== "move") return null;
  if (typeof sourcePath !== "string" || typeof destinationPath !== "string") return null;
  if (typeof overwrite !== "boolean") return null;
  return { kind, sourcePath, destinationPath, overwrite };
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

/** 既存の通常ファイルを realpath 解決し、workspace 境界内であることを確認する。 */
function resolveBoundedExistingFile(
  realWorkspaceRoot: string,
  rawPath: string,
): { ok: true; realPath: string } | { ok: false; reason: "invalid-path" | "outside-workspace" } {
  const valid = validatePathArg(rawPath);
  if (!valid) return { ok: false, reason: "invalid-path" };
  let realPath: string;
  try {
    realPath = fs.realpathSync(path.resolve(valid));
    if (!fs.lstatSync(realPath).isFile()) return { ok: false, reason: "invalid-path" };
  } catch {
    return { ok: false, reason: "invalid-path" };
  }
  if (!isWithinDirectory(realPath, realWorkspaceRoot)) {
    return { ok: false, reason: "outside-workspace" };
  }
  return { ok: true, realPath };
}

/**
 * まだ存在しない destination を解決する。親フォルダを realpath 解決し、basename を結合する。
 * 親フォルダが workspace 外なら拒否する。
 */
function resolveBoundedDestination(
  realWorkspaceRoot: string,
  rawPath: string,
): { ok: true; realPath: string } | { ok: false; reason: "invalid-path" | "outside-workspace" } {
  const valid = validatePathArg(rawPath);
  if (!valid) return { ok: false, reason: "invalid-path" };
  const resolved = path.resolve(valid);
  const parentDir = path.dirname(resolved);
  const baseName = path.basename(resolved);
  if (!baseName || baseName === "." || baseName === "..") {
    return { ok: false, reason: "invalid-path" };
  }
  let realParent: string;
  try {
    realParent = fs.realpathSync(parentDir);
    if (!fs.lstatSync(realParent).isDirectory()) return { ok: false, reason: "invalid-path" };
  } catch {
    return { ok: false, reason: "invalid-path" };
  }
  if (!isWithinDirectory(realParent, realWorkspaceRoot)) {
    return { ok: false, reason: "outside-workspace" };
  }
  const realPath = path.join(realParent, baseName);

  // 既存 destination が symlink の場合、target が workspace 外を指していると overwrite backup で
  // 境界外の内容を読みうる。symlink destination は拒否し、実在する通常ファイルは realpath が
  // workspace 内であることを確認する（親が境界内でも、destination 自身が抜ける経路を塞ぐ）。
  let existingStat: fs.Stats | null;
  try {
    existingStat = fs.lstatSync(realPath);
  } catch {
    existingStat = null;
  }
  if (existingStat) {
    if (existingStat.isSymbolicLink()) return { ok: false, reason: "invalid-path" };
    try {
      const realDest = fs.realpathSync(realPath);
      if (!isWithinDirectory(realDest, realWorkspaceRoot)) {
        return { ok: false, reason: "outside-workspace" };
      }
    } catch {
      return { ok: false, reason: "invalid-path" };
    }
  }

  return { ok: true, realPath };
}

function hasNonDeletedNoteForFile(store: NyozeNotesStore, relativeFile: string): boolean {
  const key = noteFilePathComparisonKey(relativeFile);
  for (const note of Object.values(store.notes)) {
    if (note.status === "deleted") continue;
    if (noteFilePathComparisonKey(note.file) === key) return true;
  }
  return false;
}

/** 物理移動を逆方向へ戻す（dest → source）。best-effort。 */
async function rollbackPhysicalMove(
  destPath: string,
  sourcePath: string,
): Promise<boolean> {
  try {
    await fs.promises.rename(destPath, sourcePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 直前に書いた v3 path 追従を逆方向（toRelative → fromRelative）に再適用して戻す。
 * lock 内の current registry へ適用するので、間に入った作品 metadata 編集を保持する。
 */
async function rollbackManifestRelocation(
  projectRoot: string,
  toRelative: string,
  fromRelative: string,
): Promise<boolean> {
  const restored = await updateBookManifestV3ForProject(projectRoot, (current) => {
    const reverted = relocateRegistryPathsInBookManifestV3(current, {
      fromRelativePath: toRelative,
      toRelativePath: fromRelative,
    });
    if (!reverted.ok) return { ok: false, reason: reverted.reason };
    return { ok: true, registry: reverted.registry };
  });
  return restored.ok;
}

/**
 * File Explorer 単一ファイル rename / move を整合した状態で実行する。
 */
export async function runExplorerTransferOperation(
  boundary: ProjectIpcBoundary,
  rawRequest: unknown,
  deps: ExplorerTransferDeps,
): Promise<ExplorerTransferResult> {
  const request = parseRequest(rawRequest);
  if (!request) return { ok: false, reason: "invalid-args" };

  const realWorkspaceRoot = resolveRealWorkspaceRoot(boundary);
  if (!realWorkspaceRoot) return { ok: false, reason: "outside-workspace" };

  const source = resolveBoundedExistingFile(realWorkspaceRoot, request.sourcePath);
  if (!source.ok) return { ok: false, reason: source.reason };
  const dest = resolveBoundedDestination(realWorkspaceRoot, request.destinationPath);
  if (!dest.ok) return { ok: false, reason: dest.reason };

  const sourceReal = source.realPath;
  const destReal = dest.realPath;
  if (sourceReal === destReal) {
    // 実体が同じ（no-op）。物理移動も metadata 更新も不要。
    return { ok: true, notesChanged: false, manifestChanged: false };
  }

  // destination の既存判定（overwrite / rollback 戦略に使う）。
  let destinationPreExisted: boolean;
  try {
    destinationPreExisted = fs.existsSync(destReal);
  } catch {
    destinationPreExisted = false;
  }
  if (destinationPreExisted && !request.overwrite) {
    return { ok: false, reason: "file-operation-failed" };
  }

  // Project 所属を解決（source は移動前、dest は親フォルダ経由）。
  const sourceProject = resolveProjectRootWithFs(sourceReal, boundary.getWorkspaceRoot());
  const destProject = resolveProjectRootWithFs(destReal, boundary.getWorkspaceRoot());
  const sourceRoot = sourceProject?.projectRoot ?? null;
  const destRoot = destProject?.projectRoot ?? null;

  if (sourceRoot !== destRoot) {
    // 所属が変わる移動。登録済み or 非 deleted 付箋を持つファイルは安全側で拒否する。
    if (sourceRoot) {
      const guard = await isSourceRegisteredOrNoted(sourceRoot, sourceReal);
      if (guard.kind === "error") {
        return { ok: false, reason: guard.reason };
      }
      if (guard.registeredOrNoted) {
        return { ok: false, reason: "cross-project-registered-file" };
      }
    }
    // 未登録かつ付箋なしのファイルは物理移動だけ行う（既存挙動の維持）。
    const moved = await moveFileWithOverwriteRollback(
      sourceReal,
      destReal,
      request.overwrite,
      { createBackupBeforeOverwrite: deps.createBackupBeforeOverwrite },
    );
    return moved
      ? { ok: true, notesChanged: false, manifestChanged: false }
      : { ok: false, reason: "file-operation-failed" };
  }

  // ここから先は同一 Project 内（sourceRoot === destRoot）。null 同士（どちらも project 外）は
  // 物理移動だけ行う。
  if (sourceRoot === null) {
    const moved = await moveFileWithOverwriteRollback(
      sourceReal,
      destReal,
      request.overwrite,
      { createBackupBeforeOverwrite: deps.createBackupBeforeOverwrite },
    );
    return moved
      ? { ok: true, notesChanged: false, manifestChanged: false }
      : { ok: false, reason: "file-operation-failed" };
  }

  const projectRoot = sourceRoot;
  const fromRelative = toProjectRelativeFilePath(projectRoot, sourceReal);
  const toRelative = toProjectRelativeFilePath(projectRoot, destReal);
  if (fromRelative === null || toRelative === null) {
    // project 相対へ落とせない（防御的）。metadata 追従できないので物理移動だけ。
    const moved = await moveFileWithOverwriteRollback(
      sourceReal,
      destReal,
      request.overwrite,
      { createBackupBeforeOverwrite: deps.createBackupBeforeOverwrite },
    );
    return moved
      ? { ok: true, notesChanged: false, manifestChanged: false }
      : { ok: false, reason: "file-operation-failed" };
  }

  // --- books.json v3 を preflight 検証する（書込は move 後に current registry へ再適用）---
  // preflight は invalid / diagnostics / 衝突の事前拒否にだけ使う。実際の追従は changed 判定に依存せず
  // move 後に current registry へ relocation を再適用し、preflight 後に同じ fromRelative が登録される
  // TOCTOU 窓を閉じる。
  const load = await loadBookManifestV3ForProject(projectRoot);
  let manifestReadyV3 = false;

  if (load.kind === "absent") {
    // manifest 未初期化: 未登録ファイル扱い。books.json は作らず notes.json 追従だけで移動可能。
  } else if (load.kind === "read-error") {
    return { ok: false, reason: "manifest-invalid" };
  } else if (load.kind === "ready") {
    if (hasReadyManifestV3Diagnostics(load)) {
      return { ok: false, reason: "manifest-diagnostics" };
    }
    const state = resolveCanonicalManifestV3QueryState(load);
    if (state.manifestSource !== "v3") {
      return { ok: false, reason: "manifest-invalid" };
    }
    // 事前検査: preflight 時点で path 衝突が見えていれば、物理移動前に拒否する。
    const relocated = relocateRegistryPathsInBookManifestV3(state.registry, {
      fromRelativePath: fromRelative,
      toRelativePath: toRelative,
    });
    if (!relocated.ok) {
      return { ok: false, reason: "registry-path-conflict" };
    }
    manifestReadyV3 = true;
  } else {
    // unsupported-version / invalid / write-error は安全側で拒否する。
    return { ok: false, reason: "manifest-invalid" };
  }

  // --- notes.json を preflight 検証する（書込は move 後に current store へ再適用）---
  // invalid / read-error はここで拒否する。実際の追従は move 後に current store へ再適用する。
  const notesRead = readNotesStore(projectRoot);
  if (!notesRead.ok) {
    return { ok: false, reason: "notes-invalid" };
  }

  // 同一 Project 内の overwrite（既存 destination 置換）は拒否する。
  // preflight で metadata 追従が無くても、move 後の current 再適用で metadata write が発生しうるため、
  // overwrite だと rollback 不能になる窓が残る。Project 内では保守的に拒否し、別名移動を促す。
  if (destinationPreExisted) {
    return { ok: false, reason: "overwrite-unsupported" };
  }

  // --- 物理移動 ---（ここまでで destinationPreExisted=false が保証され、物理 rollback は安全）
  const moved = await moveFileWithOverwriteRollback(
    sourceReal,
    destReal,
    request.overwrite,
    { createBackupBeforeOverwrite: deps.createBackupBeforeOverwrite },
  );
  if (!moved) {
    return { ok: false, reason: "file-operation-failed" };
  }

  // --- books.json v3 を current registry へ再適用（preflight changed 判定に依存しない）---
  let manifestChanged = false;
  if (manifestReadyV3) {
    const written = await relocateRegistryPathsForProject(projectRoot, fromRelative, toRelative);
    if (!written.ok) {
      const rolledBack = await rollbackPhysicalMove(destReal, sourceReal);
      if (!rolledBack) return { ok: false, reason: "rollback-failed" };
      return {
        ok: false,
        reason: written.reason === "conflict" ? "registry-path-conflict" : "manifest-write-failed",
      };
    }
    manifestChanged = written.changed;
  }

  // --- notes.json を current store へ再適用（preflight changed 判定に依存しない）---
  const notesWritten = await relocateNoteFileInProject(projectRoot, fromRelative, toRelative);
  if (!notesWritten.ok) {
    // notes が書けなかった。manifest（書いていれば）の path 追従を逆適用し、物理移動を戻す。
    let rollbackOk = true;
    if (manifestChanged) {
      rollbackOk =
        (await rollbackManifestRelocation(projectRoot, toRelative, fromRelative)) && rollbackOk;
    }
    rollbackOk = (await rollbackPhysicalMove(destReal, sourceReal)) && rollbackOk;
    return rollbackOk
      ? { ok: false, reason: "notes-write-failed" }
      : { ok: false, reason: "rollback-failed" };
  }
  const notesChanged = notesWritten.changed;

  return { ok: true, notesChanged, manifestChanged };
}

/**
 * source ファイルが v3 manifest に登録済み、または非 deleted 付箋を持つかを返す。
 * cross-project 移動の安全側拒否判定。manifest / notes の read 失敗は error として伝える
 * （安全側で拒否させる）。
 */
async function isSourceRegisteredOrNoted(
  projectRoot: string,
  sourceReal: string,
): Promise<
  | { kind: "ok"; registeredOrNoted: boolean }
  | { kind: "error"; reason: "manifest-invalid" | "notes-invalid" }
> {
  const relative = toProjectRelativeFilePath(projectRoot, sourceReal);
  if (relative === null) return { kind: "ok", registeredOrNoted: false };

  const load = await loadBookManifestV3ForProject(projectRoot);
  if (load.kind === "read-error") return { kind: "error", reason: "manifest-invalid" };
  if (load.kind === "ready") {
    if (hasReadyManifestV3Diagnostics(load)) {
      return { kind: "error", reason: "manifest-invalid" };
    }
    const state = resolveCanonicalManifestV3QueryState(load);
    if (state.manifestSource === "v3" && isPathRegisteredInBookManifestV3(state.registry, relative)) {
      return { kind: "ok", registeredOrNoted: true };
    }
  } else if (load.kind !== "absent") {
    return { kind: "error", reason: "manifest-invalid" };
  }

  const notesRead = readNotesStore(projectRoot);
  if (!notesRead.ok) return { kind: "error", reason: "notes-invalid" };
  if (hasNonDeletedNoteForFile(notesRead.store, relative)) {
    return { kind: "ok", registeredOrNoted: true };
  }
  return { kind: "ok", registeredOrNoted: false };
}

/** `relativePath` が `folderRelative/` 配下か（segment 境界一致 + NFC 比較）。 */
function isRelativePathUnderFolder(relativePath: string, folderRelative: string): boolean {
  const segs = relativePath.replace(/\\/g, "/").split("/").map(noteFilePathComparisonKey);
  const folderSegs = folderRelative.replace(/\\/g, "/").split("/").map(noteFilePathComparisonKey);
  if (segs.length <= folderSegs.length) return false;
  return folderSegs.every((key, index) => segs[index] === key);
}

function collectRegistryPaths(registry: BookManifestV3Registry): string[] {
  const paths: string[] = [];
  for (const book of registry.books) {
    for (const item of book.items) paths.push(item.path);
  }
  for (const material of registry.materials) paths.push(material.path);
  for (const ignored of registry.ignored) paths.push(ignored);
  return paths;
}

/**
 * フォルダ rename / move の安全ガード（フォルダ配下の v3 path 一括追従は未実装のため）。
 *
 * 指定フォルダ配下に v3 登録済み path、または非 deleted 付箋が紐づくファイルがある場合は
 * `blocked: true` を返し、renderer 側でフォルダ rename を拒否させる。manifest / notes が
 * 壊れていて判定できない場合も安全側で `blocked: true` を返す（古い v3 path を残さない）。
 *
 * renderer は folder 絶対 path だけを渡し、project root と相対 path は main 側で解決する。
 */
export async function checkExplorerFolderTransferGuard(
  boundary: ProjectIpcBoundary,
  rawFolderPath: unknown,
): Promise<ExplorerFolderTransferGuardResult> {
  if (typeof rawFolderPath !== "string") return { ok: false, reason: "invalid-path" };
  const realWorkspaceRoot = resolveRealWorkspaceRoot(boundary);
  if (!realWorkspaceRoot) return { ok: false, reason: "outside-workspace" };

  const valid = validatePathArg(rawFolderPath);
  if (!valid) return { ok: false, reason: "invalid-path" };
  let folderReal: string;
  try {
    folderReal = fs.realpathSync(path.resolve(valid));
    if (!fs.lstatSync(folderReal).isDirectory()) return { ok: false, reason: "invalid-path" };
  } catch {
    return { ok: false, reason: "invalid-path" };
  }
  if (!isWithinDirectory(folderReal, realWorkspaceRoot)) {
    return { ok: false, reason: "outside-workspace" };
  }

  const resolved = resolveProjectRootWithFs(folderReal, boundary.getWorkspaceRoot());
  if (!resolved) return { ok: true, blocked: false };
  const projectRoot = resolved.projectRoot;

  // project root 自体（または相対へ落とせない）は、配下登録の相対 path が変わらないので blocked:false。
  const folderRelative = toProjectRelativeFilePath(projectRoot, folderReal);
  if (folderRelative === null) return { ok: true, blocked: false };

  const load = await loadBookManifestV3ForProject(projectRoot);
  if (load.kind === "absent") {
    // 登録なし。notes だけ確認する。
  } else if (load.kind === "ready" && !hasReadyManifestV3Diagnostics(load)) {
    const state = resolveCanonicalManifestV3QueryState(load);
    if (state.manifestSource === "v3") {
      for (const registeredPath of collectRegistryPaths(state.registry)) {
        if (isRelativePathUnderFolder(registeredPath, folderRelative)) {
          return { ok: true, blocked: true };
        }
      }
    }
  } else {
    // diagnostics / invalid / unsupported-version / read-error は判定不能。安全側で block。
    return { ok: true, blocked: true };
  }

  const notesRead = readNotesStore(projectRoot);
  if (!notesRead.ok) return { ok: true, blocked: true };
  for (const note of Object.values(notesRead.store.notes)) {
    if (note.status === "deleted") continue;
    if (isRelativePathUnderFolder(note.file, folderRelative)) {
      return { ok: true, blocked: true };
    }
  }

  return { ok: true, blocked: false };
}
