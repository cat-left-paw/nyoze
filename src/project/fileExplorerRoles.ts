/**
 * Slice B16: File Explorer の role アイコン用 pure helper。
 *
 * books.json v3 registry を正本に、File Explorer で表示専用アイコンを出す
 * 対象 role だけを判定する。表示補助に限定し、分類・並び順・操作ロジックには関与しない。
 *
 * 不変条件:
 * - filesystem / Electron / UI に依存しない（pure）。
 * - frontmatter へ fallback しない。registry path 比較のみ。
 *
 * 対象 role:
 * - `body` / `synopsis` / `character` / `setting` / `material` / `unsorted`。
 */

import { bookManifestRegistryPathComparisonKey } from "./bookManifestPath";
import type { BookManifestV3Registry } from "./bookManifestV3";
import type { ProjectAssetRole } from "./projectBooksQuery";

/** File Explorer で role アイコンを出す role の集合（表示順は固定）。 */
export const FILE_EXPLORER_ROLE_VALUES = [
  "body",
  "synopsis",
  "character",
  "setting",
  "material",
  "unsorted",
] as const;

/** File Explorer の role アイコン対象。`ProjectIconRole` の部分集合（body + 資料 role）。 */
export type FileExplorerRole = "body" | ProjectAssetRole;

const MATERIAL_ROLE_SET = new Set<string>(
  FILE_EXPLORER_ROLE_VALUES.filter((role) => role !== "body"),
);

/**
 * v3 registry から File Explorer 表示用 role を解決する。
 * books[].items[] 登録 → body、materials[] 登録 → registry role。未登録は null。
 */
export function resolveFileExplorerRoleFromManifestV3(
  registry: BookManifestV3Registry,
  relativePath: string,
): FileExplorerRole | null {
  const key = bookManifestRegistryPathComparisonKey(relativePath);
  for (const book of registry.books) {
    for (const item of book.items) {
      if (bookManifestRegistryPathComparisonKey(item.path) === key) {
        return "body";
      }
    }
  }
  for (const material of registry.materials) {
    if (bookManifestRegistryPathComparisonKey(material.path) !== key) continue;
    if (!MATERIAL_ROLE_SET.has(material.role)) return null;
    return material.role as ProjectAssetRole;
  }
  return null;
}
