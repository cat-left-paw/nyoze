/**
 * Book manifest v3: 新規登録向けの frontmatter metadata read-only 取得（main process）。
 *
 * disk 解決は `resolveRegistryPathOnDisk`（exact → segment NFC 一意）。
 * Markdown / frontmatter は読むだけで書き換えない。
 */

import fs from "node:fs";
import path from "node:path";
import { resolveRegistryPathOnDisk } from "./bookManifestPathResolver";
import { splitLeadingFrontmatter } from "../src/editor-core/io/frontmatter";
import { normalizeBookManifestRegistryPath } from "../src/project/bookManifestPath";
import {
  extractV3FrontmatterMetadataFields,
  type BookManifestV3FrontmatterFields,
} from "../src/project/bookManifestV3FrontmatterMetadata";

export type ReadRegistrationFileMetadataResult =
  | { status: "present"; fields: BookManifestV3FrontmatterFields }
  | { status: "invalid-path" }
  | { status: "missing-file" }
  | { status: "read-error" };

function isSupportedRegistrationExtension(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return ext === ".md" || ext === ".markdown" || ext === ".txt";
}

/**
 * project 内の 1 ファイル分について read-only metadata を取得する。
 */
export function readRegistrationFileMetadata(
  projectRoot: string,
  relativePath: string,
): ReadRegistrationFileMetadataResult {
  const normalizedPath = normalizeBookManifestRegistryPath(relativePath);
  if (normalizedPath === null || !isSupportedRegistrationExtension(normalizedPath)) {
    return { status: "invalid-path" };
  }

  const resolution = resolveRegistryPathOnDisk(projectRoot, normalizedPath);
  if (resolution.absolutePath === null || !resolution.isFile) {
    return { status: "missing-file" };
  }

  const ext = path.extname(resolution.absolutePath).toLowerCase();
  if (ext === ".txt") {
    return { status: "present", fields: {} };
  }

  let content: string;
  try {
    content = fs.readFileSync(resolution.absolutePath, "utf-8");
  } catch {
    return { status: "read-error" };
  }

  const split = splitLeadingFrontmatter(content);
  if (!split.hasFrontmatter) {
    return { status: "present", fields: {} };
  }

  const fields = extractV3FrontmatterMetadataFields(split.frontmatterPrefix);
  return {
    status: "present",
    fields,
  };
}
