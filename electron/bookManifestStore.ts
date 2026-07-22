/** `.nyoze/books.json` v3 専用 read-only loader（main process）。 */

import fs from "node:fs";
import path from "node:path";
import { NYOZE_DIR_NAME } from "../src/project/projectMetadata";
import {
  BOOK_MANIFEST_V3_VERSION,
  normalizeBookManifestV3,
  type BookManifestV3Drop,
  type BookManifestV3Registry,
  type BookManifestV3Warning,
} from "../src/project/bookManifestV3";
import { runExclusiveForBookManifestV3 } from "./bookManifestV3ProjectLock";

export const BOOK_MANIFEST_FILENAME = "books.json";

export type BookManifestV3ParseDiagnostics = {
  dropped: BookManifestV3Drop[];
  warnings: BookManifestV3Warning[];
};

export type BookManifestV3LoadResult =
  | {
      kind: "ready";
      registry: BookManifestV3Registry;
      diagnostics: BookManifestV3ParseDiagnostics;
    }
  | { kind: "absent" }
  | { kind: "unsupported-version"; detail?: string }
  | { kind: "invalid"; detail?: string }
  | { kind: "read-error"; detail?: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * books.json を一切変更せず v3 として読む。
 * v3 以外の version は unsupported、構文・shape 不正は invalid として元 bytes を保持する。
 */
export function readBookManifestV3ForProject(projectRoot: string): BookManifestV3LoadResult {
  const manifestPath = path.join(projectRoot, NYOZE_DIR_NAME, BOOK_MANIFEST_FILENAME);

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(manifestPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "absent" };
    return { kind: "read-error", detail: code ?? "lstat-failed" };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { kind: "read-error", detail: "non-regular-file" };
  }

  let text: string;
  try {
    text = fs.readFileSync(manifestPath, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "absent" };
    return { kind: "read-error", detail: code ?? "read-failed" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "invalid", detail: "json-parse-error" };
  }
  if (!isPlainObject(parsed)) return { kind: "invalid", detail: "not-object" };

  if (parsed.version !== BOOK_MANIFEST_V3_VERSION) {
    if (Object.prototype.hasOwnProperty.call(parsed, "version")) {
      return {
        kind: "unsupported-version",
        detail: `version-${String(parsed.version)}`,
      };
    }
    return { kind: "invalid", detail: "missing-version" };
  }

  const normalized = normalizeBookManifestV3(parsed);
  if (normalized.kind !== "ok") {
    return { kind: "invalid", detail: "v3-normalize-failed" };
  }
  return {
    kind: "ready",
    registry: normalized.registry,
    diagnostics: {
      dropped: normalized.dropped,
      warnings: normalized.warnings,
    },
  };
}

/** writer と共有する project lock 内で v3 を read-only に読む。 */
export function loadBookManifestV3ForProject(
  projectRoot: string,
): Promise<BookManifestV3LoadResult> {
  const resolvedRoot = path.resolve(projectRoot);
  return runExclusiveForBookManifestV3(resolvedRoot, () =>
    Promise.resolve(readBookManifestV3ForProject(resolvedRoot)),
  );
}
