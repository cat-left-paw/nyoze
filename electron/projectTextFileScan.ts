/** Project root 配下の登録候補テキストファイル scan（main process 専用）。 */

import fs from "node:fs";
import path from "node:path";
import {
  detectProjectTextFileExtension,
  type ScannedProjectFile,
} from "../src/project/projectTextFileScan";

function toPosixRelative(fromDir: string, target: string): string {
  return path.relative(fromDir, target).split(path.sep).join("/");
}

/**
 * project root 配下を再帰 scan し、`.md` / `.markdown` / `.txt` の通常ファイルを列挙する。
 * `.nyoze` は探索せず、symlink は辿らず、ファイル内容も読まない。
 */
export function scanProjectTextFiles(projectRoot: string): ScannedProjectFile[] {
  const resolvedRoot = path.resolve(projectRoot);
  const files: ScannedProjectFile[] = [];

  const walk = (dir: string, isRoot: boolean): void => {
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (isRoot) throw error;
      return;
    }

    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        if (dirent.name !== ".nyoze") walk(path.join(dir, dirent.name), false);
        continue;
      }
      if (!dirent.isFile() || detectProjectTextFileExtension(dirent.name) === null) continue;
      const absolutePath = path.join(dir, dirent.name);
      files.push({
        relativePath: toPosixRelative(resolvedRoot, absolutePath),
        absolutePath,
      });
    }
  };

  walk(resolvedRoot, true);
  return files;
}
