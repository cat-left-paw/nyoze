/**
 * SEC-9: Atomic file save via temp-file → fsync → rename.
 *
 * Ensures that a crash or write failure never leaves the target file
 * in a partial or empty state.
 */

import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";

export async function openAtomicTempFile(
  targetPath: string,
  maxAttempts = 10,
): Promise<{ fd: fs.promises.FileHandle; tempPath: string }> {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tempName = `.~nyoze-${base}-${randomBytes(6).toString("hex")}.tmp`;
    const tempPath = path.join(dir, tempName);
    try {
      const fd = await fs.promises.open(tempPath, "wx");
      return { fd, tempPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error("failed to create atomic temp file");
}

/**
 * Windows `rename(temp → existing target)` fails with `EPERM` / `EACCES` while
 * another handle has the destination open. Observed on win32:
 * dest `openSync('r')`, `openSync('r+')`, and concurrent `readFile` all throw
 * `EPERM` (errno -4048); closing the competing handle makes the next rename
 * succeed in 0ms. POSIX replace is a single rename. This retry is win32-only,
 * bounded, and fail-closed: the original target is never unlinked first.
 *
 * Requested delays sum to 7ms (0+1+2+4). That is a yield budget for a handle
 * that is already closing — it does **not** cover a reader that stays open
 * (Playwright 100ms notes.json poll). Those tests wait for UI completion
 * instead of racing the write. A lock that outlives the 5 attempts fails closed.
 */
export const WINDOWS_ATOMIC_REPLACE_RETRY_DELAYS_MS = [0, 1, 2, 4] as const;
export const WINDOWS_ATOMIC_REPLACE_ATTEMPTS =
  WINDOWS_ATOMIC_REPLACE_RETRY_DELAYS_MS.length + 1;
export const WINDOWS_ATOMIC_REPLACE_RETRY_BUDGET_MS: number =
  WINDOWS_ATOMIC_REPLACE_RETRY_DELAYS_MS.reduce<number>(
    (sum, delay) => sum + delay,
    0,
  );

export function isWindowsAtomicReplaceRetryable(
  platform: NodeJS.Platform,
  error: unknown,
): boolean {
  if (platform !== "win32") return false;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "EPERM" || code === "EACCES";
}

export type AtomicReplaceAttemptRecord = {
  readonly attempt: number;
  readonly ok: boolean;
  readonly code: string | null;
  readonly injected: boolean;
};

type AtomicReplaceTestControl = {
  enabled: boolean;
  attemptLimit: number | null;
  injectRemaining: number;
  injectCode: "EPERM" | "EACCES";
  attempts: AtomicReplaceAttemptRecord[];
};

let atomicReplaceTestControl: AtomicReplaceTestControl | null = null;

function isAtomicReplaceTestControlEnabled(): boolean {
  return atomicReplaceTestControl?.enabled === true;
}

/** Test-only. Production never calls this; no renderer / IPC port. */
export function enableAtomicReplaceTestControlForTests(): void {
  atomicReplaceTestControl = {
    enabled: true,
    attemptLimit: null,
    injectRemaining: 0,
    injectCode: "EPERM",
    attempts: [],
  };
}

/** Test-only. Production never calls this. */
export function armAtomicReplaceFaultForTests(input?: {
  failures?: number;
  code?: "EPERM" | "EACCES";
  attemptLimit?: number | null;
}): void {
  if (!isAtomicReplaceTestControlEnabled() || !atomicReplaceTestControl) {
    throw new Error("atomic replace test control is not enabled");
  }
  atomicReplaceTestControl.injectRemaining = input?.failures ?? 0;
  atomicReplaceTestControl.injectCode = input?.code ?? "EPERM";
  atomicReplaceTestControl.attemptLimit = input?.attemptLimit ?? null;
  atomicReplaceTestControl.attempts = [];
}

/** Test-only. Production never calls this. */
export function snapshotAtomicReplaceAttemptsForTests(): {
  readonly attempts: readonly AtomicReplaceAttemptRecord[];
  readonly attemptLimit: number;
} {
  return {
    attempts: atomicReplaceTestControl?.attempts.slice() ?? [],
    attemptLimit:
      atomicReplaceTestControl?.attemptLimit ?? WINDOWS_ATOMIC_REPLACE_ATTEMPTS,
  };
}

/** Test-only. Production never calls this. */
export function disableAtomicReplaceTestControlForTests(): void {
  atomicReplaceTestControl = null;
}

function recordAtomicReplaceAttempt(record: AtomicReplaceAttemptRecord): void {
  if (!isAtomicReplaceTestControlEnabled() || !atomicReplaceTestControl) return;
  atomicReplaceTestControl.attempts.push(record);
}

function resolveAtomicReplaceAttemptLimit(): number {
  if (
    isAtomicReplaceTestControlEnabled() &&
    atomicReplaceTestControl?.attemptLimit != null
  ) {
    return atomicReplaceTestControl.attemptLimit;
  }
  return WINDOWS_ATOMIC_REPLACE_ATTEMPTS;
}

async function renameTempOverTarget(
  tempPath: string,
  targetPath: string,
): Promise<void> {
  let lastError: unknown = null;
  const attemptLimit = resolveAtomicReplaceAttemptLimit();
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    let injected = false;
    let error: unknown = null;
    if (
      isAtomicReplaceTestControlEnabled() &&
      atomicReplaceTestControl &&
      atomicReplaceTestControl.injectRemaining > 0
    ) {
      atomicReplaceTestControl.injectRemaining -= 1;
      injected = true;
      error = Object.assign(new Error("atomic-replace-test-fault"), {
        code: atomicReplaceTestControl.injectCode,
      });
    } else {
      try {
        await fs.promises.rename(tempPath, targetPath);
        recordAtomicReplaceAttempt({
          attempt: attempt + 1,
          ok: true,
          code: null,
          injected: false,
        });
        return;
      } catch (renameError) {
        error = renameError;
      }
    }
    lastError = error;
    const code = (error as NodeJS.ErrnoException | null)?.code ?? null;
    recordAtomicReplaceAttempt({
      attempt: attempt + 1,
      ok: false,
      code,
      injected,
    });
    if (
      !isWindowsAtomicReplaceRetryable(process.platform, error) ||
      attempt === attemptLimit - 1
    ) {
      throw error;
    }
    const delayMs = WINDOWS_ATOMIC_REPLACE_RETRY_DELAYS_MS[attempt] ?? 0;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
  throw lastError ?? new Error("failed to replace target with atomic temp file");
}

/**
 * Write `content` to `targetPath` atomically.
 *
 * 1. Create a temp file in the **same directory** (avoids cross-device rename).
 * 2. Write content to the temp file.
 * 3. `fsync` the temp file descriptor to flush to disk.
 * 4. Rename (atomic on POSIX) the temp file over the target.
 *
 * If any step fails, the temp file is cleaned up and the original
 * target file is left untouched.
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string,
): Promise<void> {
  let tempPath = "";
  let fd: fs.promises.FileHandle | null = null;
  try {
    // Open with exclusive create to avoid collisions.
    const opened = await openAtomicTempFile(targetPath);
    fd = opened.fd;
    tempPath = opened.tempPath;
    await fd.writeFile(content, "utf-8");
    // Flush OS buffers to physical media before renaming.
    await fd.sync();
    await fd.close();
    fd = null;

    // Atomic rename: on POSIX this is guaranteed atomic for same-filesystem.
    await renameTempOverTarget(tempPath, targetPath);
  } catch (error) {
    // Ensure the file handle is closed before cleanup.
    if (fd) {
      try {
        await fd.close();
      } catch {
        // ignore close error during cleanup
      }
    }
    // Best-effort cleanup of the temp file.
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // temp file may not exist if open() failed
    }
    throw error;
  }
}

/**
 * R3.5-2: Cause of a save failure. Distinct from backup/conflict so the
 * renderer can show a targeted retry / save-as / cancel dialog.
 *
 * - 'canceled' is only used by Save As (user closed the dialog) and must
 *   not be treated as an error by the UI.
 */
export type SaveErrorKind =
  | "validation"
  | "parent-missing"
  | "permission"
  | "disk-full"
  | "write-failed"
  | "canceled";

/** Result of a save operation. */
export type SaveResult = {
  /** Whether the document content was successfully written to disk. */
  saved: boolean;
  /** If backup was attempted but failed, contains the error message. */
  backupWarning?: string;
  /** Populated when saved === false (except for Save As cancel which uses 'canceled'). */
  errorKind?: SaveErrorKind;
  /** Short user-facing error message. Never contains a stack trace. */
  errorMessage?: string;
};

/** Result of a Save As operation — extends SaveResult with the chosen path. */
export type SaveAsResult = SaveResult & {
  /** The file path chosen by the user (only present when saved is true). */
  filePath?: string;
};

/**
 * Map a filesystem error (Node.js ErrnoException) to a user-facing SaveResult
 * error kind. Unknown errors fall through to 'write-failed'.
 */
export function classifySaveError(error: unknown): {
  errorKind: SaveErrorKind;
  errorMessage: string;
} {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  switch (code) {
    case "ENOSPC":
    case "EDQUOT":
    case "EFBIG":
      return {
        errorKind: "disk-full",
        errorMessage: "ディスクの空き容量が不足しています。",
      };
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return {
        errorKind: "permission",
        errorMessage: "ファイルに書き込む権限がありません。",
      };
    case "ENOENT":
    case "ENOTDIR":
      return {
        errorKind: "parent-missing",
        errorMessage: "保存先のフォルダが見つかりません。",
      };
    default:
      return {
        errorKind: "write-failed",
        errorMessage: "ファイルの保存に失敗しました。",
      };
  }
}
