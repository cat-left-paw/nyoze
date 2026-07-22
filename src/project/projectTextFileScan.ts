/** Project 内の未登録候補テキストファイルを扱う version 非依存 pure helper。 */

export type ProjectTextFileExtension = ".md" | ".markdown" | ".txt";

export type UnregisteredProjectFile = {
  relativePath: string;
  absolutePath: string;
  extension: ProjectTextFileExtension;
  displayName: string;
};

/** main 側 scan が渡す最小ファイル情報。 */
export type ScannedProjectFile = {
  relativePath: string;
  absolutePath: string;
};

const PROJECT_TEXT_FILE_EXTENSIONS: readonly ProjectTextFileExtension[] = [
  ".markdown",
  ".md",
  ".txt",
];

/** ファイル名が Project の登録候補拡張子か。 */
export function detectProjectTextFileExtension(
  fileName: string,
): ProjectTextFileExtension | null {
  const lower = fileName.toLowerCase();
  for (const extension of PROJECT_TEXT_FILE_EXTENSIONS) {
    if (lower.endsWith(extension)) return extension;
  }
  return null;
}

/** scan 結果の project 相対 path が未登録候補として安全か。 */
export function isProjectTextScanRelativePathAllowed(relativePath: string): boolean {
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

export function projectTextFileDisplayName(
  relativePath: string,
  extension: ProjectTextFileExtension,
): string {
  const separatorIndex = relativePath.lastIndexOf("/");
  const basename = separatorIndex >= 0 ? relativePath.slice(separatorIndex + 1) : relativePath;
  const stripped = basename.slice(0, basename.length - extension.length);
  return stripped.length > 0 ? stripped : basename;
}
