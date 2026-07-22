/**
 * Book manifest v3: project root 配下の未登録テキスト系ファイル検出（pure helper）。
 *
 * スライス7の責務分離:
 * - ファイル scan（filesystem 走査）は version 非依存で main 側 store が担う。
 * - registry filter（登録済み path の除外）は v3 registry を正本にここで行う。
 *
 * registry filter は v3 schema を正本にし、scan shape は version 非依存 helper と共有する。
 *
 * 不変条件:
 * - filesystem / Electron / IPC / UI / React / frontmatter に依存しない。
 * - registry に登録済みの path は、実ファイルが missing でも未登録一覧へ戻さない。
 * - `ignored[]` の path も未登録一覧から除外する。
 * - 登録済み判定は separator 正規化 + NFC の comparison key で行う（case folding しない）。
 * - 返す file shape は manifest version に依存しない（{@link UnregisteredProjectFile}）。
 */

import { bookManifestRegistryPathComparisonKey } from "./bookManifestPath";
import type { BookManifestV3Registry } from "./bookManifestV3";
import {
  detectProjectTextFileExtension,
  isProjectTextScanRelativePathAllowed,
  projectTextFileDisplayName,
  type ScannedProjectFile,
  type UnregisteredProjectFile,
} from "./projectTextFileScan";

/**
 * 未登録ファイル 1 件の表示用データ。manifest version に依存しない pure な shape。
 * （意味論は registry version に依存しない。）
 */
export type { UnregisteredProjectFile } from "./projectTextFileScan";

/**
 * v3 registry 上で「登録済み」とみなす path 集合（books[].items / materials / ignored）。
 * path は separator 正規化 + NFC した comparison key で保持する。
 */
export function computeBookManifestV3RegisteredPathSet(
  registry: BookManifestV3Registry,
): Set<string> {
  const paths = new Set<string>();
  for (const book of registry.books) {
    for (const item of book.items) {
      paths.add(bookManifestRegistryPathComparisonKey(item.path));
    }
  }
  for (const material of registry.materials) {
    paths.add(bookManifestRegistryPathComparisonKey(material.path));
  }
  for (const ignored of registry.ignored) {
    paths.add(bookManifestRegistryPathComparisonKey(ignored));
  }
  return paths;
}

/**
 * scan 済みファイル一覧から、v3 registry 未登録のテキスト系ファイルだけを返す（pure）。
 */
export function filterUnregisteredProjectFilesForV3(input: {
  files: readonly ScannedProjectFile[];
  registry: BookManifestV3Registry;
}): UnregisteredProjectFile[] {
  const registered = computeBookManifestV3RegisteredPathSet(input.registry);
  const result: UnregisteredProjectFile[] = [];

  for (const file of input.files) {
    const relativePath = file.relativePath.replace(/\\/g, "/");
    if (!isProjectTextScanRelativePathAllowed(relativePath)) continue;
    if (registered.has(bookManifestRegistryPathComparisonKey(relativePath))) continue;

    const extension = detectProjectTextFileExtension(relativePath);
    if (extension === null) continue;

    result.push({
      relativePath,
      absolutePath: file.absolutePath,
      extension,
      displayName: projectTextFileDisplayName(relativePath, extension),
    });
  }

  result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return result;
}
