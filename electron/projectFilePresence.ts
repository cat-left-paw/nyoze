/**
 * project root 相対ファイル path の実 disk 解決（main process 専用）。
 *
 * `.nyoze/notes.json` の `note.file` のような project relative path を、Mac / Windows 間の
 * Unicode 正規化差分（NFC / NFD）込みで実ファイルへ解決するための read-only helper。
 *
 * 解決ロジックは books.json registry 用の {@link resolveRegistryPathOnDisk} と同一
 * （exact 優先 → segment ごと NFC 一意一致、
 * projectRoot 境界チェック、中間 / 最終 symlink が projectRoot 外を指す場合の拒否）。
 * 同じ安全性を notes 側でも共有するため委譲する。stored path 文字列は書き換えない。
 */

import { resolveRegistryPathOnDisk } from "./bookManifestPathResolver";

/**
 * project relative path が project 内の通常ファイルとして存在するか。
 * Unicode 正規化差分を吸収し、boundary 外 / 中間 symlink 脱出は false。
 */
export function isProjectRelativeFilePresentOnDisk(
  projectRoot: string,
  relativeFile: string,
): boolean {
  return resolveRegistryPathOnDisk(projectRoot, relativeFile).isFile;
}
