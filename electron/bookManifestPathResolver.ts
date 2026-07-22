/**
 * books.json registry path の実 disk 解決（main process 専用）。
 *
 * v3 query が pure model へ `missing: true` を注入し、表示用 `absolutePath` を埋めるための
 * read-only fs 判定。`.nyoze/books.json` は書き換えない。
 *
 * Mac / Windows 間で project フォルダを移動すると、結合濁点などを含むファイル名が
 * NFC / NFD のどちらで保存されるかが環境依存になり、registry の stored path と disk の
 * 実ファイル名が Unicode 正規化差分でズレることがある。exact path 一致を最優先しつつ、
 * 見つからない場合だけ segment ごとに NFC 比較して実 disk entry を解決する。
 * stored path（books.json の文字列）はここでは一切書き換えない。
 */

import fs from "node:fs";
import path from "node:path";
import { isWithinDirectory } from "./ipcSecurity";
import { bookManifestRegistryPathComparisonKey } from "../src/project/bookManifestPath";

function isRegistryRelativePathAllowed(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.length === 0) return false;
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return false;
  }
  if (normalized === ".nyoze" || normalized.startsWith(".nyoze/")) return false;
  return true;
}

/**
 * 解決した絶対 path が boundary 内の通常ファイルなら true。
 *
 * 最終 component の symlink だけでなく、中間 directory symlink（`project/link -> /outside`）
 * 経由で boundary 外の実ファイルへ到達するケースも防ぐため、常に `realpathSync` で
 * 全 symlink を解決してから boundary を最終確認する。
 */
function isFileWithinBoundary(absolutePath: string, resolvedRoot: string): boolean {
  let realPath: string;
  try {
    // lstat で存在を確認しつつ、realpath で中間・最終の symlink をすべて解決する。
    fs.lstatSync(absolutePath);
    realPath = fs.realpathSync(absolutePath);
  } catch {
    return false;
  }
  if (!isWithinDirectory(realPath, resolvedRoot)) return false;
  return fs.statSync(realPath).isFile();
}

/**
 * directory を `readdirSync` する前の boundary guard。
 * 中間 symlink が boundary 外を指す場合に、その先を走査しないよう realpath で確認する。
 */
function isDirectoryWithinBoundary(absoluteDir: string, resolvedRoot: string): boolean {
  let realDir: string;
  try {
    realDir = fs.realpathSync(absoluteDir);
  } catch {
    return false;
  }
  if (!isWithinDirectory(realDir, resolvedRoot)) return false;
  try {
    return fs.statSync(realDir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * segment 列を、各 directory の実 entry に対して
 * 「exact byte 一致 → NFC 正規化一致（一意のときだけ）」で解決し、
 * 実 disk 上の segment 名列を返す。解決できない / ambiguous なら null。
 */
function resolveRealSegments(resolvedRoot: string, segments: string[]): string[] | null {
  let currentDir = resolvedRoot;
  const realSegments: string[] = [];

  for (const segment of segments) {
    // currentDir を読む前に、中間 symlink が boundary 外を指していないか realpath で確認する。
    // boundary 外を指す symlink directory は、その時点で未解決にして outside を走査しない。
    if (!isDirectoryWithinBoundary(currentDir, resolvedRoot)) return null;

    let entries: string[];
    try {
      entries = fs.readdirSync(currentDir);
    } catch {
      return null;
    }

    let chosen: string;
    if (entries.includes(segment)) {
      // exact byte 一致を最優先（同一 dir に NFC 別表現が併存しても誤判定しない）。
      chosen = segment;
    } else {
      const key = bookManifestRegistryPathComparisonKey(segment);
      const matches = entries.filter(
        (entry) => bookManifestRegistryPathComparisonKey(entry) === key,
      );
      // 0 件 = 未解決、複数 = ambiguous。どちらも安全側で未解決にする。
      if (matches.length !== 1) return null;
      chosen = matches[0]!;
    }

    realSegments.push(chosen);
    currentDir = path.join(currentDir, chosen);
  }

  return realSegments;
}

/** registry relative path の disk 解決結果。 */
export type RegistryDiskResolution = {
  /** disk 上で解決した実 entry の絶対 path（exact / NFC 正規化一致）。未解決なら null。 */
  absolutePath: string | null;
  /** 解決した path が boundary 内の通常ファイルなら true。 */
  isFile: boolean;
};

const UNRESOLVED: RegistryDiskResolution = { absolutePath: null, isFile: false };

/**
 * registry の project 相対 path を実 disk path へ解決する。
 *
 * - exact path を最優先（dir read を伴わない fast path）。
 * - exact が無い場合だけ segment ごとに directory entries を NFC 比較して解決する。
 * - `.nyoze/` / absolute / `..` / 空 segment は拒否。
 * - ambiguous（同一 dir に NFC 比較で複数一致）は安全側で未解決。
 * - realpath が projectRoot 外へ出る symlink は拒否（既存 symlink policy を広げない）。
 */
export function resolveRegistryPathOnDisk(
  projectRoot: string,
  relativePath: string,
): RegistryDiskResolution {
  if (!isRegistryRelativePathAllowed(relativePath)) return UNRESOLVED;

  const resolvedRoot = path.resolve(projectRoot);
  const segments = relativePath.replace(/\\/g, "/").split("/");

  // 1. exact path。存在すればそのまま使う（正規化差分が無い通常ケース）。
  const exactAbsolute = path.resolve(resolvedRoot, ...segments);
  if (!isWithinDirectory(exactAbsolute, resolvedRoot)) return UNRESOLVED;
  let exactExists = false;
  try {
    fs.lstatSync(exactAbsolute);
    exactExists = true;
  } catch {
    exactExists = false;
  }
  if (exactExists) {
    return {
      absolutePath: exactAbsolute,
      isFile: isFileWithinBoundary(exactAbsolute, resolvedRoot),
    };
  }

  // 2. exact が無い場合だけ NFC 正規化差分込みで解決する。
  const realSegments = resolveRealSegments(resolvedRoot, segments);
  if (realSegments === null) return UNRESOLVED;
  const realAbsolute = path.resolve(resolvedRoot, ...realSegments);
  if (!isWithinDirectory(realAbsolute, resolvedRoot)) return UNRESOLVED;
  return {
    absolutePath: realAbsolute,
    isFile: isFileWithinBoundary(realAbsolute, resolvedRoot),
  };
}

/** 未解決時の絶対 path fallback（従来の registry path 単純結合）。 */
function fallbackJoin(resolvedRoot: string, relativePath: string): string {
  const root = resolvedRoot.replace(/[/\\]+$/, "");
  return `${root}/${relativePath}`;
}

/**
 * registry の project 相対 path が、project root 内の通常ファイルとして存在するか。
 * Unicode 正規化差分込みで解決する。
 */
export function isRegistryPathPresentOnDisk(
  projectRoot: string,
  relativePath: string,
): boolean {
  return resolveRegistryPathOnDisk(projectRoot, relativePath).isFile;
}

/**
 * v3 query 経路（Project Books / Book全体 Outline / Chapter Neighbors）で共有する resolver。
 *
 * presence 判定と表示用 `absolutePath` を同じ disk 解決へ寄せる。
 * - `isPathPresent`: 解決結果が通常ファイルなら true。
 * - `resolveAbsolutePath`: 解決できた実 disk path、できなければ従来の単純結合（missing 維持）。
 * relativePath ごとに 1 度だけ disk を読むよう結果を memo 化する。
 */
export function createRegistryDiskResolver(projectRoot: string): {
  isPathPresent: (relativePath: string) => boolean;
  resolveAbsolutePath: (relativePath: string) => string;
} {
  const resolvedRoot = path.resolve(projectRoot);
  const cache = new Map<string, RegistryDiskResolution>();
  const resolve = (relativePath: string): RegistryDiskResolution => {
    const cached = cache.get(relativePath);
    if (cached !== undefined) return cached;
    const result = resolveRegistryPathOnDisk(resolvedRoot, relativePath);
    cache.set(relativePath, result);
    return result;
  };
  return {
    isPathPresent: (relativePath) => resolve(relativePath).isFile,
    resolveAbsolutePath: (relativePath) =>
      resolve(relativePath).absolutePath ?? fallbackJoin(resolvedRoot, relativePath),
  };
}

/** v3 query 経路で共有する presence checker（既存呼び出し互換）。 */
export function createRegistryPathPresenceChecker(
  projectRoot: string,
): (relativePath: string) => boolean {
  return createRegistryDiskResolver(projectRoot).isPathPresent;
}
