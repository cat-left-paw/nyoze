/** Project / Book UI で共有する v3 表示 model と pure filter。 */

import type { WritingMode } from "../settings/types";
import type { BookOutlineItem } from "./bookOutlineTypes";

export const PROJECT_ASSET_ROLES = [
  "synopsis",
  "character",
  "setting",
  "material",
  "unsorted",
] as const;

export type ProjectAssetRole = (typeof PROJECT_ASSET_ROLES)[number];

export type ProjectBookGroup = {
  /** stable Book id。 */
  book: string;
  bookId: string;
  displayName: string;
  title: string;
  authors: string[];
  language: string | null;
  writingMode: WritingMode | null;
  source: "manifest" | "synthetic";
  items: BookOutlineItem[];
};

export type ProjectAssetItem = BookOutlineItem & {
  role: ProjectAssetRole;
  book: string | null;
};

export type ProjectAssetGroup = {
  role: ProjectAssetRole;
  items: ProjectAssetItem[];
};

export type MaterialsFilter = "all" | ProjectAssetRole;

export const MATERIALS_DISPLAY_ROLES: readonly ProjectAssetRole[] = [
  "character",
  "setting",
  "synopsis",
  "material",
  "unsorted",
];

export function flattenProjectAssets(
  assets: ProjectAssetGroup[],
  filter: MaterialsFilter = "all",
): ProjectAssetItem[] {
  const byRole = new Map<ProjectAssetRole, ProjectAssetItem[]>(
    assets.map((group) => [group.role, group.items]),
  );
  const roles = filter === "all" ? MATERIALS_DISPLAY_ROLES : ([filter] as const);
  return roles.flatMap((role) => byRole.get(role) ?? []);
}

export function filterMaterialsFlat(
  items: readonly ProjectAssetItem[],
  filter: MaterialsFilter = "all",
): ProjectAssetItem[] {
  if (filter === "all") return [...items];
  return items.filter((item) => item.role === filter);
}

export type MaterialsRoleFilterSet = ReadonlySet<ProjectAssetRole>;

export function filterMaterialsByRoles(
  items: readonly ProjectAssetItem[],
  activeRoles: MaterialsRoleFilterSet,
): ProjectAssetItem[] {
  return items.filter((item) => activeRoles.has(item.role));
}
