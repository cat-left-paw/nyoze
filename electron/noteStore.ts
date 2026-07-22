/**
 * Notes store I/O (main process 側, Task 3A-2 本体)。
 *
 * `project root/.nyoze/notes.json` の read/write を担当する。
 * 検証・正規化は src/project/noteStore.ts の pure helper に委譲し、
 * 書き込みは SEC-9 の atomicWriteFile (temp → fsync → rename) を使う。
 *
 * 方針:
 * - projectRoot は caller が `.nyoze/project.json` で解決済みのものだけを渡す。
 *   防御として write 時に project.json の実在 (valid) を検査し、
 *   project root 以外 (workspace root 直下・単独ファイル親フォルダ等) へは書かない。
 * - notes.json は最初の付箋作成 (write) 時に初めて作る。read は欠損を
 *   空 store として返すだけでファイルを作らない。
 * - 壊れた notes.json は自動修復・上書きしない。read はエラー result を返し、
 *   write も既存ファイルが読めない/invalid な場合は拒否する
 *   (ユーザーのメモを静かに失わないため)。復旧導線は将来スライスで扱う。
 * - notes.json 以外の project data (project.json 等) には触れない。
 * - 本文 Markdown の保存経路とは完全に分離する。
 *
 * IPC bridge 設計メモ (配線は Task 3A-3 で行う):
 * - `project:readNotes` / `project:writeNotes` (ipcMain.handle)
 *   - projectRoot は renderer 申告値を信用せず、main 側で
 *     resolveProjectRootWithFs (electron/projectStore.ts) により
 *     active document から解決した値を使う。
 */

import path from "node:path";
import fs from "node:fs";
import { atomicWriteFile } from "./atomicSave";
import { readProjectMetadata } from "./projectStore";
import { NYOZE_DIR_NAME } from "../src/project/projectMetadata";
import {
  NOTES_STORE_FILENAME,
  createEmptyNotesStore,
  parseNotesStore,
  serializeNotesStore,
} from "../src/project/noteStore";
import type { NyozeNotesStore } from "../src/project/noteStore";
import { buildRelocatedNotesStore } from "../src/project/noteFileRelocation";
import { runExclusiveForNotes } from "./noteStoreLock";

/** `projectRoot/.nyoze/notes.json` の絶対パス。 */
export function notesStorePath(projectRoot: string): string {
  return path.join(projectRoot, NYOZE_DIR_NAME, NOTES_STORE_FILENAME);
}

export type NotesStoreReadResult =
  | {
      ok: true;
      store: NyozeNotesStore;
      /** false なら notes.json はまだ存在しない (空 store を返している)。 */
      fileExists: boolean;
    }
  | {
      ok: false;
      /** invalid: JSON 破損 / shape 不正。read-failed: 権限等で読めない。 */
      reason: "invalid" | "read-failed";
    };

/**
 * notes.json を読む。
 * - 欠損は正常系: 空 store を返し、ファイルは作らない。
 * - invalid JSON / invalid shape はエラー result。自動修復・上書きしない。
 */
export function readNotesStore(projectRoot: string): NotesStoreReadResult {
  const filePath = notesStorePath(projectRoot);
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      return { ok: true, store: createEmptyNotesStore(), fileExists: false };
    }
    return { ok: false, reason: "read-failed" };
  }

  const store = parseNotesStore(text);
  if (store === null) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, store, fileExists: true };
}

export type NotesStoreWriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-a-project" | "existing-invalid" | "write-failed";
    };

/** lock を取らずに notes.json を atomic write する内部実装。 */
async function writeNotesStoreUnlocked(
  projectRoot: string,
  store: NyozeNotesStore,
): Promise<NotesStoreWriteResult> {
  if (readProjectMetadata(projectRoot) === null) {
    return { ok: false, reason: "not-a-project" };
  }

  const existing = readNotesStore(projectRoot);
  if (!existing.ok) {
    return { ok: false, reason: "existing-invalid" };
  }

  const filePath = notesStorePath(projectRoot);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await atomicWriteFile(filePath, serializeNotesStore(store));
  } catch {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

/**
 * notes.json を atomic write する。欠損していればここで初めて作られる。
 * - projectRoot が valid な project.json を持たない場合は書かない。
 * - 既存 notes.json が invalid / 読めない場合は上書きを拒否する。
 *
 * project 単位 notes lock 内で書き込み、relocate の read-modify-write と直列化する。
 */
export async function writeNotesStore(
  projectRoot: string,
  store: NyozeNotesStore,
): Promise<NotesStoreWriteResult> {
  return runExclusiveForNotes(projectRoot, () =>
    writeNotesStoreUnlocked(projectRoot, store),
  );
}

export type NotesRelocateResult =
  | { ok: true; changed: boolean }
  | {
      ok: false;
      reason: "invalid" | "read-failed" | "not-a-project" | "existing-invalid" | "write-failed";
    };

/**
 * File Explorer の単一ファイル rename / move に伴い、notes.json の `note.file` を
 * project 単位 notes lock 内で **その時点の current store** へ追従させる。
 *
 * lock 内で read → relocation 再適用 → write を不可分に行うため、操作の事前 read 以降に
 * 入った付箋本文編集・status 変更・新規追加（別の writeNotesStore 経由）を消さない。
 * relocation は `note.file` の exact 一致置換のみで、本文 marker / 他 field には触れない。
 */
export async function relocateNoteFileInProject(
  projectRoot: string,
  fromRelativePath: string,
  toRelativePath: string,
): Promise<NotesRelocateResult> {
  return runExclusiveForNotes(projectRoot, async () => {
    const read = readNotesStore(projectRoot);
    if (!read.ok) {
      return { ok: false, reason: read.reason } as NotesRelocateResult;
    }
    const relocated = buildRelocatedNotesStore(read.store, {
      fromRelativePath,
      toRelativePath,
    });
    if (!relocated.changed) return { ok: true, changed: false };
    const written = await writeNotesStoreUnlocked(projectRoot, relocated.store);
    if (!written.ok) return { ok: false, reason: written.reason };
    return { ok: true, changed: true };
  });
}
