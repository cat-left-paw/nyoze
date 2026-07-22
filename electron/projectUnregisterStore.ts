/**
 * Project 登録解除 I/O (main process)。
 *
 * `.nyoze/project.json` と `.nyoze/books.json` だけを削除する。
 * Markdown / frontmatter / notes.json / unknown `.nyoze` ファイルには触れない。
 */

import fs from "node:fs";
import path from "node:path";
import { BOOK_MANIFEST_FILENAME } from "./bookManifestStore";
import { notesStorePath } from "./noteStore";
import {
  NYOZE_DIR_NAME,
  PROJECT_METADATA_FILENAME,
} from "../src/project/projectMetadata";
import { parseNotesStore, type NoteStatus } from "../src/project/noteStore";

export type UnregisterProjectErrorReason = "notes-exist" | "read-error" | "delete-error";

export type UnregisterProjectResult =
  | { ok: true }
  | { ok: false; reason: UnregisterProjectErrorReason };

/** 登録解除をブロックする付箋 status（`deleted` のみ残っていれば解除可）。 */
function noteStatusBlocksUnregister(status: NoteStatus): boolean {
  return status === "open" || status === "resolved" || status === "orphaned";
}

/**
 * notes.json を読み、未削除付箋（open / resolved / orphaned）があれば拒否する。
 * - ファイル不在 → 解除可
 * - 読み取り不能 / 不正 JSON / invalid shape → read-error
 * - deleted のみ / 空 store → 解除可
 */
export async function checkNotesAllowUnregister(
  projectRoot: string,
): Promise<{ ok: true } | { ok: false; reason: "notes-exist" | "read-error" }> {
  const filePath = notesStorePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { ok: true };
  }

  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return { ok: false, reason: "read-error" };
  }

  const store = parseNotesStore(raw);
  if (!store) {
    return { ok: false, reason: "read-error" };
  }

  for (const note of Object.values(store.notes)) {
    if (noteStatusBlocksUnregister(note.status)) {
      return { ok: false, reason: "notes-exist" };
    }
  }

  return { ok: true };
}

/**
 * project root の Project 管理ファイルだけを削除する。
 * 未削除付箋（open / resolved / orphaned）がある場合は何も削除せず notes-exist を返す。
 */
export async function unregisterProjectAt(projectRoot: string): Promise<UnregisterProjectResult> {
  const nyozeDir = path.join(projectRoot, NYOZE_DIR_NAME);

  const notesCheck = await checkNotesAllowUnregister(projectRoot);
  if (!notesCheck.ok) {
    return { ok: false, reason: notesCheck.reason };
  }

  const metadataPath = path.join(nyozeDir, PROJECT_METADATA_FILENAME);
  const manifestPath = path.join(nyozeDir, BOOK_MANIFEST_FILENAME);

  if (!fs.existsSync(metadataPath)) {
    return { ok: false, reason: "read-error" };
  }

  try {
    if (fs.existsSync(manifestPath)) {
      await fs.promises.unlink(manifestPath);
    }
    await fs.promises.unlink(metadataPath);
  } catch {
    return { ok: false, reason: "delete-error" };
  }

  try {
    const remaining = fs.readdirSync(nyozeDir);
    if (remaining.length === 0) {
      await fs.promises.rmdir(nyozeDir);
    }
  } catch {
    // unknown file / notes.json が残る / rmdir 失敗は許容（管理ファイル削除は完了済み）。
  }

  return { ok: true };
}
