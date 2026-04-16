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
    await fs.promises.rename(tempPath, targetPath);
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
