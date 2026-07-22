/**
 * Book manifest v3 registry path の追従 helper（File Explorer 単一ファイル rename / move 対応）。
 *
 * Nyoze 自身の File Explorer で同一 Project 内の登録済みファイル 1 件を rename / move したとき、
 * `.nyoze/books.json` v3 の `books[].items[].path` / `materials[].path` / `ignored[]` を
 * 新しい project relative path へ追従させる pure helper。
 *
 * v3 schema の不変条件を明示するために独立実装にしている。フォルダ relocation は扱わず、単一ファイルの
 * exact match だけを対象にする。
 *
 * v3 schema の不変条件:
 * - body item / material は `id` / `title` / `authors` / `translators` / `role` と配列順を保持し、
 *   path だけを置換する。
 * - 比較は separator 正規化 + NFC（{@link bookManifestRegistryPathComparisonKey}）で行い、
 *   Mac / Windows 間の Unicode 正規化差分を吸収する。stored 文字列は compare key で書き換えず、
 *   保存する新 path は操作後 path（`toRelativePath`）由来にする。
 * - `.nyoze/` 配下や絶対 path・`..` 脱出は対象外（changed=false）。
 * - 置換後に registry 全体（items + materials + ignored）で path が重複するなら失敗（duplicate-path）。
 * - 入力 registry を mutate しない。失敗時は部分更新しない。
 * - Markdown / frontmatter / notes.json には触れない。
 */

import {
  bookManifestRegistryPathComparisonKey,
  normalizeBookManifestRegistryPath,
} from "./bookManifestPath";
import { isProjectRelativeFilePath } from "./noteStore";
import type { BookManifestV3Registry } from "./bookManifestV3";

// path 比較 / 正規化は version 非依存の pure helper を共有する（v3 schema 側も同じものを使う）。
type V3Registry = BookManifestV3Registry;

export type RelocateBookManifestV3Result =
  | { ok: true; registry: V3Registry; changed: boolean }
  | { ok: false; reason: "invalid-input" | "duplicate-path" };

export type RelocateBookManifestV3FileOptions = {
  /** 旧 project relative ファイルパス */
  fromRelativePath: string;
  /** 新 project relative ファイルパス */
  toRelativePath: string;
};

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRelocatableRelativePath(value: string): boolean {
  const normalized = normalizeSeparators(value);
  if (!isProjectRelativeFilePath(normalized)) return false;
  if (normalized === ".nyoze" || normalized.startsWith(".nyoze/")) return false;
  return true;
}

function collectRegistryPaths(registry: V3Registry): string[] {
  const paths: string[] = [];
  for (const book of registry.books) {
    for (const item of book.items) paths.push(item.path);
  }
  for (const material of registry.materials) paths.push(material.path);
  for (const ignored of registry.ignored) paths.push(ignored);
  return paths;
}

function hasDuplicatePaths(registry: V3Registry): boolean {
  const seen = new Set<string>();
  for (const path of collectRegistryPaths(registry)) {
    const key = bookManifestRegistryPathComparisonKey(path);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function cloneRegistry(registry: V3Registry): V3Registry {
  return {
    version: registry.version,
    books: registry.books.map((book) => ({
      ...book,
      authors: [...book.authors],
      items: book.items.map((item) => ({
        ...item,
        authors: [...item.authors],
        translators: [...item.translators],
      })),
    })),
    materials: registry.materials.map((material) => ({
      ...material,
      authors: [...material.authors],
      translators: [...material.translators],
    })),
    ignored: [...registry.ignored],
  };
}

/**
 * 単一ファイルの rename / move 1 回分を v3 registry へ適用する。
 *
 * `books[].items[].path` / `materials[].path` / `ignored[]` のうち、`fromRelativePath` と
 * 比較 key が完全一致するものだけを `toRelativePath`（normalize 済み）へ置換する。
 * フォルダ配下の一括追従はこのスライスでは行わない。
 */
export function relocateRegistryPathsInBookManifestV3(
  registry: V3Registry,
  options: RelocateBookManifestV3FileOptions,
): RelocateBookManifestV3Result {
  const from = normalizeSeparators(options.fromRelativePath);
  const toNormalized = normalizeBookManifestRegistryPath(options.toRelativePath);
  if (toNormalized === null) return { ok: true, registry, changed: false };
  if (!isRelocatableRelativePath(from) || !isRelocatableRelativePath(toNormalized)) {
    return { ok: true, registry, changed: false };
  }
  if (from === toNormalized) return { ok: true, registry, changed: false };

  const fromKey = bookManifestRegistryPathComparisonKey(from);
  // from と to が NFC 比較で同一なら実質変化なし（separator だけ違う等）。
  if (fromKey === bookManifestRegistryPathComparisonKey(toNormalized)) {
    return { ok: true, registry, changed: false };
  }

  let changed = false;
  const next = cloneRegistry(registry);

  for (const book of next.books) {
    for (let index = 0; index < book.items.length; index += 1) {
      const item = book.items[index];
      if (bookManifestRegistryPathComparisonKey(item.path) !== fromKey) continue;
      book.items[index] = { ...item, path: toNormalized };
      changed = true;
    }
  }

  for (let index = 0; index < next.materials.length; index += 1) {
    const material = next.materials[index];
    if (bookManifestRegistryPathComparisonKey(material.path) !== fromKey) continue;
    next.materials[index] = { ...material, path: toNormalized };
    changed = true;
  }

  for (let index = 0; index < next.ignored.length; index += 1) {
    if (bookManifestRegistryPathComparisonKey(next.ignored[index]) !== fromKey) continue;
    next.ignored[index] = toNormalized;
    changed = true;
  }

  if (!changed) return { ok: true, registry, changed: false };
  if (hasDuplicatePaths(next)) {
    return { ok: false, reason: "duplicate-path" };
  }
  return { ok: true, registry: next, changed: true };
}

/**
 * `fromRelativePath` が registry に登録済み（body item / material / ignored いずれか）かを返す。
 * cross-project move 拒否判定で使う read-only helper。
 */
export function isPathRegisteredInBookManifestV3(
  registry: V3Registry,
  relativePath: string,
): boolean {
  const key = bookManifestRegistryPathComparisonKey(normalizeSeparators(relativePath));
  for (const path of collectRegistryPaths(registry)) {
    if (bookManifestRegistryPathComparisonKey(path) === key) return true;
  }
  return false;
}
