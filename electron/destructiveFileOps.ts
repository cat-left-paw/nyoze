import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

type FileStatLike = {
  isFile(): boolean;
};

type DestructiveFileOpsFs = Pick<
  typeof fs.promises,
  "stat" | "copyFile" | "rename" | "unlink"
>;

type CopyFileDeps = {
  createBackupBeforeOverwrite: (filePath: string) => Promise<void>;
  fsPromises?: DestructiveFileOpsFs;
};

type MoveFileDeps = CopyFileDeps & {
  randomBytesFn?: (size: number) => Buffer;
};

async function statIfExists(
  fsPromises: DestructiveFileOpsFs,
  filePath: string,
): Promise<FileStatLike | null> {
  try {
    return await fsPromises.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function createSiblingTempPath(
  destinationPath: string,
  fsPromises: DestructiveFileOpsFs,
  randomBytesFn: (size: number) => Buffer,
  maxAttempts = 10,
): Promise<string> {
  const dir = path.dirname(destinationPath);
  const base = path.basename(destinationPath);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = path.join(
      dir,
      `.~nyoze-replaced-${base}-${randomBytesFn(6).toString("hex")}.tmp`,
    );
    const existing = await statIfExists(fsPromises, candidate);
    if (!existing) return candidate;
  }
  throw new Error("failed to allocate sibling temp path");
}

async function restoreReplacedDestination(
  destinationPath: string,
  parkedDestinationPath: string,
  fsPromises: DestructiveFileOpsFs,
): Promise<void> {
  const currentDestinationStat = await statIfExists(fsPromises, destinationPath);
  if (currentDestinationStat?.isFile()) {
    await fsPromises.unlink(destinationPath);
  } else if (currentDestinationStat) {
    throw new Error("destination became non-file during rollback");
  }
  await fsPromises.rename(parkedDestinationPath, destinationPath);
}

async function moveSourceIntoPlace(
  sourcePath: string,
  destinationPath: string,
  fsPromises: DestructiveFileOpsFs,
): Promise<void> {
  try {
    await fsPromises.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EXDEV") throw error;
  }

  await fsPromises.copyFile(sourcePath, destinationPath);
  try {
    await fsPromises.unlink(sourcePath);
  } catch (error) {
    const copiedDestinationStat = await statIfExists(fsPromises, destinationPath);
    if (copiedDestinationStat?.isFile()) {
      try {
        await fsPromises.unlink(destinationPath);
      } catch {
        // best effort; caller still treats the move as failed
      }
    }
    throw error;
  }
}

export async function copyFileWithOverwriteBackup(
  sourcePath: string,
  destinationPath: string,
  overwrite: boolean,
  deps: CopyFileDeps,
): Promise<boolean> {
  const fsPromises = deps.fsPromises ?? fs.promises;
  try {
    const sourceStat = await fsPromises.stat(sourcePath);
    if (!sourceStat.isFile()) return false;

    if (!overwrite) {
      await fsPromises.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
      return true;
    }

    const destinationStat = await statIfExists(fsPromises, destinationPath);
    if (destinationStat && !destinationStat.isFile()) return false;
    if (destinationStat) {
      await deps.createBackupBeforeOverwrite(destinationPath);
    }

    await fsPromises.copyFile(sourcePath, destinationPath);
    return true;
  } catch {
    return false;
  }
}

export async function moveFileWithOverwriteRollback(
  sourcePath: string,
  destinationPath: string,
  overwrite: boolean,
  deps: MoveFileDeps,
): Promise<boolean> {
  const fsPromises = deps.fsPromises ?? fs.promises;
  const randomBytesFn = deps.randomBytesFn ?? randomBytes;

  try {
    const sourceStat = await fsPromises.stat(sourcePath);
    if (!sourceStat.isFile()) return false;

    const destinationStat = await statIfExists(fsPromises, destinationPath);
    if (!destinationStat) {
      await moveSourceIntoPlace(sourcePath, destinationPath, fsPromises);
      return true;
    }
    if (!destinationStat.isFile()) return false;
    if (!overwrite) return false;

    await deps.createBackupBeforeOverwrite(destinationPath);

    const parkedDestinationPath = await createSiblingTempPath(
      destinationPath,
      fsPromises,
      randomBytesFn,
    );
    await fsPromises.rename(destinationPath, parkedDestinationPath);

    try {
      await moveSourceIntoPlace(sourcePath, destinationPath, fsPromises);
    } catch {
      try {
        await restoreReplacedDestination(
          destinationPath,
          parkedDestinationPath,
          fsPromises,
        );
      } catch {
        // best effort rollback
      }
      return false;
    }

    try {
      await fsPromises.unlink(parkedDestinationPath);
    } catch {
      // best effort cleanup; the primary move already succeeded
    }
    return true;
  } catch {
    return false;
  }
}
