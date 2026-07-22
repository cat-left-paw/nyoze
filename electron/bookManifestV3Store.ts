/**
 * Book manifest v3 update store: `.nyoze/books.json` v3 の atomic update（main process 側）。
 *
 * v3 loader（{@link readBookManifestV3ForProject}）と共有 lock で直列化し、
 * pure writer（`src/project/bookManifestV3Writer.ts`）が返した registry を永続化する。
 *
 * 不変条件:
 * - 触るのは `projectRoot/.nyoze/books.json` の 1 ファイルだけ。
 * - Markdown / frontmatter / project.json / notes.json は読み書きしない。
 * - v3 parser diagnostics（drop / warning）がある既存 v3 は暗黙修復せず拒否する。
 * - v3 以外の version / invalid manifest は上書きせず拒否する。
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteFile } from "./atomicSave";
import { NYOZE_DIR_NAME } from "../src/project/projectMetadata";
import {
  BOOK_MANIFEST_V3_VERSION,
  normalizeBookManifestV3,
  type BookManifestV3Registry,
} from "../src/project/bookManifestV3";
import { createEmptyBookManifestV3Registry } from "../src/project/bookManifestV3Writer";
import { relocateRegistryPathsInBookManifestV3 } from "../src/project/bookManifestV3Relocation";
import {
  BOOK_MANIFEST_FILENAME,
  readBookManifestV3ForProject,
} from "./bookManifestStore";
import { runExclusiveForBookManifestV3 } from "./bookManifestV3ProjectLock";

export type BookManifestV3MutationResult =
  | { ok: true; registry: BookManifestV3Registry }
  | { ok: false; reason: string };

export type BookManifestV3Mutator = (
  registry: BookManifestV3Registry,
  makeId: (taken: ReadonlySet<string>) => string,
) => BookManifestV3MutationResult | Promise<BookManifestV3MutationResult>;

export type UpdateBookManifestV3Result =
  | { ok: true }
  | {
      ok: false;
      error: "invalid-input" | "invalid-manifest" | "read-error" | "write-error" | "invalid-path";
      reason?: string;
    };

function serializeBookManifestV3(registry: BookManifestV3Registry): string {
  return JSON.stringify(registry, null, 2) + "\n";
}

function hasParseDiagnostics(diagnostics: {
  dropped: readonly unknown[];
  warnings: readonly unknown[];
}): boolean {
  return diagnostics.dropped.length > 0 || diagnostics.warnings.length > 0;
}

function isSymlinkManifest(manifestPath: string): boolean {
  try {
    return fs.lstatSync(manifestPath).isSymbolicLink();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return false;
    return true;
  }
}

/**
 * project root 配下の `.nyoze/books.json` v3 registry を atomic に更新する。
 * 全体を project lock で包み、read-only loader を呼ぶ（二重 lock しない）。
 */
export async function updateBookManifestV3ForProject(
  projectRoot: string,
  mutate: BookManifestV3Mutator,
): Promise<UpdateBookManifestV3Result> {
  return runExclusiveForBookManifestV3(projectRoot, async () => {
    const resolvedRoot = path.resolve(projectRoot);
    const nyozeDir = path.join(resolvedRoot, NYOZE_DIR_NAME);
    const manifestPath = path.join(nyozeDir, BOOK_MANIFEST_FILENAME);

    if (isSymlinkManifest(manifestPath)) {
      return { ok: false, error: "read-error" };
    }

    const loaded = readBookManifestV3ForProject(resolvedRoot);

    let current: BookManifestV3Registry;
    let manifestWasAbsent = false;

    if (loaded.kind === "ready") {
      if (hasParseDiagnostics(loaded.diagnostics)) {
        return { ok: false, error: "invalid-manifest" };
      }
      current = loaded.registry;
    } else if (loaded.kind === "absent") {
      current = createEmptyBookManifestV3Registry();
      manifestWasAbsent = true;
    } else if (loaded.kind === "read-error") {
      return { ok: false, error: "read-error" };
    } else {
      return { ok: false, error: "invalid-manifest" };
    }

    let mutated: BookManifestV3MutationResult;
    try {
      mutated = await Promise.resolve(mutate(current, () => randomUUID()));
    } catch {
      return { ok: false, error: "invalid-input" };
    }

    if (!mutated.ok) {
      if (mutated.reason === "missing-file" || mutated.reason === "read-error") {
        return { ok: false, error: "read-error", reason: mutated.reason };
      }
      if (mutated.reason === "invalid-path") {
        return { ok: false, error: "invalid-path" };
      }
      return { ok: false, error: "invalid-input", reason: mutated.reason };
    }

    if (mutated.registry.version !== BOOK_MANIFEST_V3_VERSION) {
      return { ok: false, error: "invalid-input", reason: "non-v3-registry" };
    }

    const serialized = serializeBookManifestV3(mutated.registry);
    const precheck = normalizeBookManifestV3(JSON.parse(serialized) as unknown);
    if (precheck.kind !== "ok" || precheck.dropped.length > 0 || precheck.warnings.length > 0) {
      return { ok: false, error: "invalid-input" };
    }

    try {
      if (manifestWasAbsent) {
        fs.mkdirSync(nyozeDir, { recursive: true });
      }
      await atomicWriteFile(manifestPath, serialized);
    } catch {
      return { ok: false, error: "write-error" };
    }

    let written: string;
    try {
      written = fs.readFileSync(manifestPath, "utf-8");
    } catch {
      return { ok: false, error: "write-error" };
    }
    if (written !== serialized) {
      return { ok: false, error: "write-error" };
    }
    const postcheck = normalizeBookManifestV3(JSON.parse(written) as unknown);
    if (postcheck.kind !== "ok" || postcheck.dropped.length > 0 || postcheck.warnings.length > 0) {
      return { ok: false, error: "write-error" };
    }

    return { ok: true };
  });
}

export type RelocateBookManifestV3PathsResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "conflict" | "invalid-manifest" | "read-error" | "write-error" };

/**
 * project lock 内で **current** な `.nyoze/books.json` v3 registry へ単一ファイルの path 追従を
 * 再適用する（File Explorer rename / move 用）。
 *
 * preflight の changed 判定に依存せず、物理移動の後に current registry を読み直して relocation を
 * かけ直すことで、「物理移動後〜operation 完了前に同じ fromRelative が登録される」TOCTOU 窓を閉じる。
 *
 * - manifest absent: 「Book 未初期化」を維持し、新規 books.json を作らず no-op 成功（changed=false）。
 * - 対象 path が current registry に無ければ no-op 成功（write しない）。
 * - relocation で path 衝突 → `conflict`。
 * - invalid / diagnostics 付き / read-error → 上書きせず error。
 * - 触るのは `.nyoze/books.json` の 1 ファイルだけ。Markdown / frontmatter / notes.json は読み書きしない。
 */
export async function relocateRegistryPathsForProject(
  projectRoot: string,
  fromRelativePath: string,
  toRelativePath: string,
): Promise<RelocateBookManifestV3PathsResult> {
  return runExclusiveForBookManifestV3(projectRoot, async () => {
    const resolvedRoot = path.resolve(projectRoot);
    const nyozeDir = path.join(resolvedRoot, NYOZE_DIR_NAME);
    const manifestPath = path.join(nyozeDir, BOOK_MANIFEST_FILENAME);

    if (isSymlinkManifest(manifestPath)) {
      return { ok: false, reason: "read-error" };
    }

    const loaded = readBookManifestV3ForProject(resolvedRoot);
    if (loaded.kind === "absent") {
      // Book 未初期化。transfer は books.json を新規作成しない。
      return { ok: true, changed: false };
    }
    if (loaded.kind === "read-error") return { ok: false, reason: "read-error" };
    if (loaded.kind !== "ready") return { ok: false, reason: "invalid-manifest" };
    if (hasParseDiagnostics(loaded.diagnostics)) return { ok: false, reason: "invalid-manifest" };

    const relocated = relocateRegistryPathsInBookManifestV3(loaded.registry, {
      fromRelativePath,
      toRelativePath,
    });
    if (!relocated.ok) return { ok: false, reason: "conflict" };
    if (!relocated.changed) return { ok: true, changed: false };

    const serialized = serializeBookManifestV3(relocated.registry);
    const precheck = normalizeBookManifestV3(JSON.parse(serialized) as unknown);
    if (precheck.kind !== "ok" || precheck.dropped.length > 0 || precheck.warnings.length > 0) {
      return { ok: false, reason: "write-error" };
    }

    try {
      await atomicWriteFile(manifestPath, serialized);
    } catch {
      return { ok: false, reason: "write-error" };
    }

    let written: string;
    try {
      written = fs.readFileSync(manifestPath, "utf-8");
    } catch {
      return { ok: false, reason: "write-error" };
    }
    if (written !== serialized) return { ok: false, reason: "write-error" };
    const postcheck = normalizeBookManifestV3(JSON.parse(written) as unknown);
    if (postcheck.kind !== "ok" || postcheck.dropped.length > 0 || postcheck.warnings.length > 0) {
      return { ok: false, reason: "write-error" };
    }

    return { ok: true, changed: true };
  });
}
