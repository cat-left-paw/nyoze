/**
 * books.json registry path の version 非依存 pure helper。
 *
 * 保存値は project root 相対の `/` 区切り path とし、比較時だけ NFC へ正規化する。
 * filesystem I/O や manifest version の解釈は行わない。
 */

import { isProjectRelativeFilePath } from "./noteStore";

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

/** registry 用 project 相対 path を検証・正規化する。 */
export function normalizeBookManifestRegistryPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const accepted = raw.trim();
  if (accepted.length === 0 || accepted.includes("\0")) return null;
  const normalized = normalizeSeparators(accepted);
  if (!isProjectRelativeFilePath(normalized)) return null;
  if (normalized === ".nyoze" || normalized.startsWith(".nyoze/")) return null;
  return normalized;
}

/**
 * registry path の比較専用 key。
 * separator を `/` に揃えたあと Unicode NFC で正規化する。case folding はしない。
 */
export function bookManifestRegistryPathComparisonKey(registryPath: string): string {
  return normalizeSeparators(registryPath).normalize("NFC");
}
