/**
 * Book manifest v3: project root 配下の未登録テキスト系ファイル scan（main process 専用）。
 *
 * read-only。ファイル内容は読まず、`.nyoze/books.json` / Markdown / frontmatter も書き換えない。
 * version 非依存の scanner（{@link scanProjectTextFiles}）を v3 registry filter
 * （{@link filterUnregisteredProjectFilesForV3}）と組み合わせる。
 *
 * IPC は `project:resolveUnregisteredFilesV3`（`electron/projectIpc.ts`）経由で接続する。
 */

import type { BookManifestV3Registry } from "../src/project/bookManifestV3";
import {
  filterUnregisteredProjectFilesForV3,
  type UnregisteredProjectFile,
} from "../src/project/bookManifestV3UnregisteredFiles";
import { scanProjectTextFiles } from "./projectTextFileScan";

export type BookManifestV3UnregisteredFilesResult =
  | { ok: true; files: UnregisteredProjectFile[] }
  | { ok: false; reason: "scan-failed" };

/**
 * v3 registry を正本として、project root 配下の未登録テキスト系ファイルを返す。
 * scan 自体は version 非依存。registry filter だけが v3 を見る。
 */
export function readUnregisteredProjectFilesForV3(
  projectRoot: string,
  registry: BookManifestV3Registry,
): BookManifestV3UnregisteredFilesResult {
  try {
    const scanned = scanProjectTextFiles(projectRoot);
    const files = filterUnregisteredProjectFilesForV3({ files: scanned, registry });
    return { ok: true, files };
  } catch {
    return { ok: false, reason: "scan-failed" };
  }
}
