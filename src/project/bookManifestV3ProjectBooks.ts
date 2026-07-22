/**
 * Book manifest v3 → Project Books / current file metadata 変換（pure）。
 *
 * v3 registry を既存 Project タブ payload 形へ read-only 変換する。
 * frontmatter / filesystem / Electron / IPC には依存しない。
 */

import { bookManifestRegistryPathComparisonKey } from "./bookManifestPath";
import {
  bookManifestV3BasenameTitle,
  type BookManifestV3Book,
  type BookManifestV3Material,
  type BookManifestV3Registry,
} from "./bookManifestV3";
import {
  PROJECT_ASSET_ROLES,
  type ProjectAssetGroup,
  type ProjectAssetItem,
  type ProjectBookGroup,
} from "./projectBooksQuery";

function joinProjectAbsolute(projectRoot: string, relativePath: string): string {
  const root = projectRoot.replace(/[/\\]+$/, "");
  return `${root}/${relativePath}`;
}

function normalizeComparePath(relativePath: string): string {
  return bookManifestRegistryPathComparisonKey(relativePath);
}

function resolveDisplayTitle(title: string, relativePath: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : bookManifestV3BasenameTitle(relativePath);
}

function copyCredits(values: readonly string[]): string[] {
  return [...values];
}

function buildAssetGroupsFromFlat(materialsFlat: ProjectAssetItem[]): ProjectAssetGroup[] {
  const byRole = new Map<string, ProjectAssetItem[]>();
  for (const role of PROJECT_ASSET_ROLES) byRole.set(role, []);
  for (const item of materialsFlat) {
    byRole.get(item.role)!.push(item);
  }
  return PROJECT_ASSET_ROLES.map((role) => ({
    role,
    items: byRole.get(role) ?? [],
  }));
}

function buildBodyItem(input: {
  item: BookManifestV3Book["items"][number];
  currentKey: string | null;
  resolveAbsolutePath: (relativePath: string) => string;
  isPathPresent?: (relativePath: string) => boolean;
}): ProjectBookGroup["items"][number] {
  const { item, currentKey, resolveAbsolutePath, isPathPresent } = input;
  const path = item.path;
  const pathKey = normalizeComparePath(path);
  return {
    relativePath: path,
    absolutePath: resolveAbsolutePath(path),
    title: resolveDisplayTitle(item.title, path),
    authors: copyCredits(item.authors),
    translators: copyCredits(item.translators),
    order: null,
    isCurrent: currentKey !== null && pathKey === currentKey,
    registryId: item.id,
    ...(isPathPresent !== undefined ? { missing: !isPathPresent(path) } : {}),
  };
}

function buildMaterialItem(input: {
  material: BookManifestV3Material;
  currentKey: string | null;
  resolveAbsolutePath: (relativePath: string) => string;
  isPathPresent?: (relativePath: string) => boolean;
}): ProjectAssetItem {
  const { material, currentKey, resolveAbsolutePath, isPathPresent } = input;
  const path = material.path;
  const pathKey = normalizeComparePath(path);
  return {
    relativePath: path,
    absolutePath: resolveAbsolutePath(path),
    title: resolveDisplayTitle(material.title, path),
    authors: copyCredits(material.authors),
    translators: copyCredits(material.translators),
    order: null,
    isCurrent: currentKey !== null && pathKey === currentKey,
    role: material.role,
    book: null,
    registryId: material.id,
    ...(isPathPresent !== undefined ? { missing: !isPathPresent(path) } : {}),
  };
}

/**
 * v3 registry を Project タブ表示用 payload へ変換する（pure）。
 *
 * - Book / body item / material の順序は registry 配列順。
 * - current 判定は separator 正規化 + NFC comparison key で行う。
 * - stored path は書き換えない。
 * - `label` / `registryLabel` は v3 payload に出さない。
 */
export function projectBooksPayloadFromManifestV3(input: {
  registry: BookManifestV3Registry;
  projectRoot: string;
  currentRelativePath: string | null;
  isPathPresent?: (relativePath: string) => boolean;
  resolveAbsolutePath?: (relativePath: string) => string;
}): {
  books: ProjectBookGroup[];
  materialsFlat: ProjectAssetItem[];
  assets: ProjectAssetGroup[];
} {
  const { registry, projectRoot, currentRelativePath, isPathPresent } = input;
  const resolveAbsolutePath =
    input.resolveAbsolutePath ??
    ((relativePath: string) => joinProjectAbsolute(projectRoot, relativePath));
  const currentKey =
    currentRelativePath !== null ? normalizeComparePath(currentRelativePath) : null;

  const books: ProjectBookGroup[] = registry.books.map((book) => ({
    book: book.id,
    bookId: book.id,
    displayName: book.name,
    title: book.name,
    authors: copyCredits(book.authors),
    language: book.language,
    writingMode: book.writingMode,
    source: "manifest",
    items: book.items.map((item) =>
      buildBodyItem({
        item,
        currentKey,
        resolveAbsolutePath,
        isPathPresent,
      }),
    ),
  }));

  const materialsFlat: ProjectAssetItem[] = registry.materials.map((material) =>
    buildMaterialItem({
      material,
      currentKey,
      resolveAbsolutePath,
      isPathPresent,
    }),
  );

  return {
    books,
    materialsFlat,
    assets: buildAssetGroupsFromFlat(materialsFlat),
  };
}

export type CurrentProjectFileRegistration =
  | {
      kind: "body";
      book: ProjectBookGroup;
      item: ProjectBookGroup["items"][number];
    }
  | {
      kind: "material";
      item: ProjectAssetItem;
    }
  | {
      kind: "unregistered";
    };

/**
 * Project Books payload から active file の登録種別を分類する（pure）。
 */
export function resolveCurrentRegistrationFromProjectBooksPayload(input: {
  books: ProjectBookGroup[];
  materialsFlat: readonly ProjectAssetItem[];
}): CurrentProjectFileRegistration {
  for (const book of input.books) {
    const item = book.items.find((candidate) => candidate.isCurrent);
    if (item) return { kind: "body", book, item };
  }
  const material = input.materialsFlat.find((candidate) => candidate.isCurrent);
  if (material) return { kind: "material", item: material };
  return { kind: "unregistered" };
}

export type CurrentRegisteredFileMetadata = {
  title: string;
  authors: string[];
  translators: string[];
};

/**
 * Project Books payload から active file の title / authors / translators を返す（pure）。
 * - body / material: v3 manifest metadata
 * - unregistered: null（basename fallback は呼び出し側）
 */
export function resolveCurrentRegisteredFileMetadataFromProjectBooksPayload(input: {
  books: ProjectBookGroup[];
  materialsFlat: readonly ProjectAssetItem[];
}): CurrentRegisteredFileMetadata | null {
  const current = resolveCurrentRegistrationFromProjectBooksPayload(input);
  if (current.kind === "body") {
    return {
      title: current.item.title,
      authors: copyCredits(current.item.authors ?? []),
      translators: copyCredits(current.item.translators ?? []),
    };
  }
  if (current.kind === "material") {
    return {
      title: current.item.title,
      authors: copyCredits(current.item.authors ?? []),
      translators: copyCredits(current.item.translators ?? []),
    };
  }
  return null;
}
