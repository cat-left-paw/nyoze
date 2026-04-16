/**
 * IPC security utilities for SEC-1 (path normalization / traversal prevention)
 * and SEC-2 (IPC boundary input validation).
 *
 * All functions in this module are pure (no side effects) except the async
 * realpath helpers which read the filesystem.
 */

import path from "node:path";
import fs from "node:fs";

// ---- Size limits ----

const MAX_PATH_LENGTH = 4096;
/** 50 MB – generous upper bound for document content */
export const MAX_CONTENT_LENGTH = 50 * 1024 * 1024;
export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_NAME_LENGTH = 255;
/** 512 KB – settings JSON should never approach this */
const MAX_SETTINGS_JSON_LENGTH = 512 * 1024;
const MAX_URL_LENGTH = 2048;
const WINDOWS_RESERVED_BASENAME_PATTERN =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..+)?$/i;

// ---- SEC-2: IPC argument validation ----

/**
 * Validate a path argument arriving via IPC.
 * Rejects: non-string, empty, too long, or containing null bytes.
 * Returns the validated string, or null.
 */
export function validatePathArg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_PATH_LENGTH) return null;
  if (value.includes("\0")) return null;
  return value;
}

/**
 * Validate a file/directory name segment arriving via IPC.
 * Rejects: non-string, empty, too long, path separators, ".", "..", null bytes.
 * Returns the trimmed name, or null.
 */
export function validateNameArg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  if (trimmed.includes("\0")) return null;
  if (trimmed === "." || trimmed === "..") return null;
  if (/[\\/]/.test(trimmed)) return null;
  // Reject dotfile names — Explorer hides them, so creating/renaming to a
  // dotfile name would make the entry appear deleted.
  if (trimmed.startsWith(".")) return null;
  if (WINDOWS_RESERVED_BASENAME_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate a file content string arriving via IPC.
 * Rejects: non-string or exceeds size limit.
 */
export function validateContentArg(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length > MAX_CONTENT_LENGTH) return null;
  return value;
}

/**
 * Validate a boolean IPC argument.
 */
export function validateBooleanArg(value: unknown): boolean | null {
  if (typeof value !== "boolean") return null;
  return value;
}

export type ExpectedFileStat = {
  mtimeMs: number;
  size: number;
};

export type WriteFileOptions = {
  expectedStat: ExpectedFileStat | null;
  allowConflictOverwrite: boolean;
};

/**
 * Validate optional write-file options arriving via IPC.
 *
 * expectedStat uses the BETA-IO1 minimum conflict model: mtimeMs + size.
 * Missing/null options are accepted and normalized to safe defaults.
 */
export function validateWriteFileOptionsArg(
  value: unknown,
): WriteFileOptions | null {
  if (value === undefined || value === null) {
    return { expectedStat: null, allowConflictOverwrite: false };
  }
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as {
    expectedStat?: unknown;
    allowConflictOverwrite?: unknown;
  };

  const allowConflictOverwriteRaw = record.allowConflictOverwrite;
  const allowConflictOverwrite =
    allowConflictOverwriteRaw === undefined
      ? false
      : validateBooleanArg(allowConflictOverwriteRaw);
  if (allowConflictOverwrite === null) return null;

  const expectedStatRaw = record.expectedStat;
  if (expectedStatRaw === undefined || expectedStatRaw === null) {
    return { expectedStat: null, allowConflictOverwrite };
  }
  if (typeof expectedStatRaw !== "object" || Array.isArray(expectedStatRaw)) {
    return null;
  }

  const statRecord = expectedStatRaw as {
    mtimeMs?: unknown;
    size?: unknown;
  };
  if (
    typeof statRecord.mtimeMs !== "number" ||
    !Number.isFinite(statRecord.mtimeMs) ||
    statRecord.mtimeMs < 0
  ) {
    return null;
  }
  if (
    typeof statRecord.size !== "number" ||
    !Number.isInteger(statRecord.size) ||
    statRecord.size < 0
  ) {
    return null;
  }

  return {
    expectedStat: {
      mtimeMs: statRecord.mtimeMs,
      size: statRecord.size,
    },
    allowConflictOverwrite,
  };
}

/**
 * Validate a settings data object arriving via IPC.
 * Rejects: non-plain-object, array, or serialized size exceeds limit.
 */
export function validateSettingsDataArg(
  value: unknown,
): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_SETTINGS_JSON_LENGTH) return null;
  } catch {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Validate a URL for shell.openExternal arriving via IPC.
 * Only https:// is permitted from the renderer.
 * Rejects: non-string, empty, too long, null bytes, non-https protocol.
 */
export function validateExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  if (value.includes("\0")) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return value;
}

const UPDATE_RELEASE_URL_PATH_PREFIX = "/cat-left-paw/nyoze/releases/tag/";

/**
 * Validate release URLs supplied by latest.json.
 * Update checks may only point users to the official GitHub Releases tag page.
 */
export function validateUpdateReleaseUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  if (value.includes("\0")) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "github.com") return null;
    if (url.port || url.username || url.password) return null;
    if (url.search || url.hash) return null;
    if (!url.pathname.startsWith(UPDATE_RELEASE_URL_PATH_PREFIX)) return null;
    const tag = url.pathname.slice(UPDATE_RELEASE_URL_PATH_PREFIX.length);
    if (!tag || tag.includes("/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * SEC-3: Check whether a navigation URL should be allowed.
 *
 * @param url - The URL the renderer is trying to navigate to.
 * @param devServerUrl - The Vite dev server base URL (undefined in production).
 * @param prodRendererUrl - The exact file:// URL of the production index.html.
 * @returns true if the navigation should be permitted.
 */
export function isAllowedNavigationUrl(
  url: string,
  devServerUrl: string | undefined,
  prodRendererUrl: string,
): boolean {
  if (devServerUrl) {
    return url.startsWith(devServerUrl);
  }
  return url === prodRendererUrl;
}

/**
 * File rename must preserve the current file extension.
 * This still allows dots in the basename, while preventing a rename that
 * would change the actual file extension.
 */
export function hasPreservedFileExtension(
  sourcePath: string,
  newName: string,
): boolean {
  return (
    path.extname(sourcePath).toLowerCase() === path.extname(newName).toLowerCase()
  );
}

// ---- SEC-5: Document boundary check for active file path ----

/**
 * Check whether a realpath-resolved path falls within a known document boundary.
 *
 * The renderer's `document:setActiveFilePath` claim is only accepted if the
 * path is within the workspace root OR is an explicitly allowed document path.
 * This prevents a compromised renderer from setting an arbitrary image base dir.
 *
 * Pure function — no I/O. Both `realPath` and `workspaceRoot` must be
 * realpath-resolved absolute paths.
 */
export function isPathInDocumentBoundary(
  realPath: string,
  workspaceRoot: string | null,
  allowedDocumentPaths: ReadonlySet<string>,
): boolean {
  if (workspaceRoot && isWithinDirectory(realPath, workspaceRoot)) return true;
  if (allowedDocumentPaths.has(realPath)) return true;
  return false;
}

/**
 * Resolve a renderer-provided active file hint to the document directory main
 * may trust for SEC-5 image lookup.
 *
 * Accepts only existing regular files within the current document boundary.
 * Directories, missing/inaccessible paths, and out-of-bound paths are rejected.
 */
export function resolveActiveDocumentDir(
  inputPath: string,
  workspaceRoot: string | null,
  allowedDocumentPaths: ReadonlySet<string>,
): string | null {
  try {
    const realPath = fs.realpathSync(path.resolve(inputPath));
    const stat = fs.statSync(realPath);
    if (!stat.isFile()) return null;
    if (!isPathInDocumentBoundary(realPath, workspaceRoot, allowedDocumentPaths)) {
      return null;
    }
    return path.dirname(realPath);
  } catch {
    return null;
  }
}

// ---- SEC-5: Image protocol boundary validation ----

/** Extensions allowed for image display via nyoze-img:// protocol. */
const ALLOWED_IMAGE_EXTENSIONS_SEC5 = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
]);

/**
 * Validate an image protocol request from the renderer.
 *
 * Returns the resolved absolute path if all checks pass, or null to reject.
 *
 * Enforces:
 * 1. `src` must be a relative path (no scheme, not absolute).
 * 2. Extension must be in the allowed set.
 * 3. The resolved path must stay within `dir` (no traversal escape).
 *
 * Pure function (no I/O) — uses path.resolve and path.normalize only.
 * Does NOT check file existence; the protocol handler should catch ENOENT.
 */
export function validateImageProtocolRequest(
  src: string | null,
  dir: string | null,
): string | null {
  if (!src || !dir) return null;

  // Reject null bytes
  if (src.includes("\0") || dir.includes("\0")) return null;

  // Reject absolute src paths (e.g. /Users/.../private.png, C:\...)
  if (path.isAbsolute(src)) return null;

  // Reject src that looks like a URL scheme
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null;

  // Resolve and normalize
  const resolved = path.resolve(dir, src);

  // Validate extension
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS_SEC5.has(ext)) return null;

  // Boundary check: resolved path must be within dir
  if (!isWithinDirectory(resolved, path.resolve(dir))) return null;

  return resolved;
}

/**
 * Resolve an image request to its real filesystem target and verify the final
 * path still remains inside the active document directory.
 *
 * This closes the symlink escape gap where `path.resolve()` alone would accept
 * `dir/linked.png` even if that symlink points outside `dir`.
 */
export async function resolveImageProtocolPath(
  src: string | null,
  dir: string | null,
): Promise<string | null> {
  const resolved = validateImageProtocolRequest(src, dir);
  if (!resolved || !dir) return null;

  const [realImagePath, realDocumentDir] = await Promise.all([
    realpathExisting(resolved),
    realpathExisting(dir),
  ]);
  if (!realImagePath || !realDocumentDir) return null;
  if (!isWithinDirectory(realImagePath, realDocumentDir)) return null;
  return realImagePath;
}

/**
 * Enforce the same content-size ceiling for file reads that already applies to
 * file writes. Reject oversized or non-file targets instead of reading them.
 */
export type Utf8FileReadErrorKind =
  | "not-file"
  | "too-large"
  | "decode-failed"
  | "read-failed";

export type Utf8FileReadResult =
  | { ok: true; content: string; size: number }
  | { ok: false; errorKind: Utf8FileReadErrorKind };

export async function readUtf8FileWithinLimitDetailed(
  inputPath: string,
  maxBytes = MAX_CONTENT_LENGTH,
): Promise<Utf8FileReadResult> {
  try {
    const stat = await fs.promises.stat(inputPath);
    if (!stat.isFile()) return { ok: false, errorKind: "not-file" };
    if (stat.size > maxBytes) return { ok: false, errorKind: "too-large" };

    const bytes = await fs.promises.readFile(inputPath);
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return { ok: true, content: decoder.decode(bytes), size: stat.size };
    } catch {
      return { ok: false, errorKind: "decode-failed" };
    }
  } catch {
    return { ok: false, errorKind: "read-failed" };
  }
}

export async function readUtf8FileWithinLimit(
  inputPath: string,
  maxBytes = MAX_CONTENT_LENGTH,
): Promise<string | null> {
  const result = await readUtf8FileWithinLimitDetailed(inputPath, maxBytes);
  return result.ok ? result.content : null;
}

/**
 * Save-before-close acknowledgements accept only a strict boolean payload.
 * Anything else is treated as failure on the safe side.
 */
export function coerceSaveBeforeCloseOk(
  payload: { ok?: unknown } | null | undefined,
): boolean {
  return typeof payload?.ok === "boolean" ? payload.ok : false;
}

// ---- SEC-1: Path normalization and boundary checking ----

/**
 * Resolve symlinks for an existing path (equivalent to realpath).
 * Returns the canonical real path, or null if the path does not exist.
 */
export async function realpathExisting(
  inputPath: string,
): Promise<string | null> {
  try {
    return await fs.promises.realpath(inputPath);
  } catch {
    return null;
  }
}

/**
 * Resolve the path for a file that may not yet exist by resolving the parent
 * directory's realpath.  Required by SEC-1 §6: "未作成ファイルを扱う保存先では
 * 親ディレクトリを realpath して検証する".
 * Returns null if the parent directory does not exist.
 */
export async function realpathForNewFile(
  inputPath: string,
): Promise<string | null> {
  try {
    const absPath = path.resolve(inputPath);
    const parentDir = path.dirname(absPath);
    const realParent = await fs.promises.realpath(parentDir);
    return path.join(realParent, path.basename(absPath));
  } catch {
    return null;
  }
}

/**
 * Resolve a path for use in boundary checks.
 * Tries realpath first (for existing paths); falls back to parent-realpath
 * (for new files that do not yet exist).
 * Returns null if resolution fails entirely.
 */
export async function resolvePathForCheck(
  inputPath: string,
): Promise<string | null> {
  const real = await realpathExisting(inputPath);
  if (real !== null) return real;
  return realpathForNewFile(inputPath);
}

/**
 * Check whether resolvedPath is within (or equal to) boundaryDir.
 *
 * SEC-1 §2: must NOT use startsWith alone — we append path.sep to the boundary
 * before the prefix check so that /workspace does not match /workspace-other.
 *
 * Both arguments must already be absolute, normalised, and symlink-resolved.
 * On Windows, comparison is case-insensitive.
 */
export function isWithinDirectory(
  resolvedPath: string,
  boundaryDir: string,
): boolean {
  const normalizeForBoundaryCompare = (input: string): string => {
    if (process.platform === "win32") {
      return path.win32.normalize(input);
    }
    return input.replace(/\\/g, "/");
  };

  const comparablePath = normalizeForBoundaryCompare(resolvedPath);
  const comparableBoundary = normalizeForBoundaryCompare(boundaryDir);
  const boundaryWithSep = comparableBoundary.endsWith(path.sep)
    ? comparableBoundary
    : comparableBoundary + path.sep;

  if (process.platform === "win32") {
    const lPath = comparablePath.toLowerCase();
    const lBoundary = comparableBoundary.toLowerCase();
    const lNormBoundary = boundaryWithSep.toLowerCase();
    return lPath === lBoundary || lPath.startsWith(lNormBoundary);
  }

  return comparablePath === comparableBoundary || comparablePath.startsWith(boundaryWithSep);
}
