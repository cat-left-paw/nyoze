/**
 * books.json v3 の query 用 canonical 状態解決（main 側共有）。
 *
 * `resolveProjectBooks` / outline / File Explorer role など、
 * v3 registry を正本にする read-only query で共通利用する。
 */

import {
  BOOK_MANIFEST_V3_VERSION,
  type BookManifestV3Registry,
} from "../src/project/bookManifestV3";
import type { ProjectManifestWarning } from "../src/project/projectIpcTypes";
import type { BookManifestV3LoadResult } from "./bookManifestStore";

export function emptyBookManifestV3Registry(): BookManifestV3Registry {
  return {
    version: BOOK_MANIFEST_V3_VERSION,
    books: [],
    materials: [],
    ignored: [],
  };
}

function mapProjectManifestWarning(kind: string): ProjectManifestWarning | undefined {
  switch (kind) {
    case "unsupported-version":
    case "invalid":
    case "read-error":
      return kind;
    default:
      return undefined;
  }
}

export function hasReadyManifestV3Diagnostics(
  load: BookManifestV3LoadResult,
): boolean {
  return (
    load.kind === "ready" &&
    (load.diagnostics.dropped.length > 0 || load.diagnostics.warnings.length > 0)
  );
}

export function resolveCanonicalManifestV3QueryState(
  load: BookManifestV3LoadResult,
): {
  registry: BookManifestV3Registry;
  manifestSource: "v3" | "none";
  manifestWarning?: ProjectManifestWarning;
} {
  if (load.kind === "ready" && !hasReadyManifestV3Diagnostics(load)) {
    return {
      registry: load.registry,
      manifestSource: "v3",
    };
  }
  return {
    registry: emptyBookManifestV3Registry(),
    manifestSource: "none",
    manifestWarning:
      hasReadyManifestV3Diagnostics(load)
        ? "invalid"
        : mapProjectManifestWarning(load.kind),
  };
}
