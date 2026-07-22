/** WB-IMG-2: main-only staging writer for a Web Book public package. */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedWebBookAssetRegistry } from "./webBookAssetResolution";

export type WebBookPackageManifest = {
  formatVersion: 1;
  assets: Array<{
    assetId: string;
    kind: "image";
    relativePath: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
  }>;
};

export type WebBookPackageWriteErrorKind = "target-not-empty" | "target-symlink" | "target-invalid" | "write-failed";
export class WebBookPackageWriteError extends Error {
  constructor(readonly kind: WebBookPackageWriteErrorKind) { super(kind); }
}

/** Fixed UI-safe text only; never expose OS errors or filesystem paths. */
export function webBookPackageWriteErrorMessage(error: unknown): string {
  if (error instanceof WebBookPackageWriteError) {
    switch (error.kind) {
      case "target-not-empty":
        return "選択したフォルダには既存のファイルがあるため、Web 公開用パッケージを書き出せません。空のフォルダを選択してください。";
      case "target-symlink":
        return "シンボリックリンクのフォルダには、Web 公開用パッケージを書き出せません。";
      case "target-invalid":
        return "選択したフォルダは、Web 公開用パッケージの出力先として使用できません。";
      case "write-failed":
        return "Web 公開用パッケージの書き込みに失敗しました。";
    }
  }
  return "Web 公開用パッケージの書き込みに失敗しました。";
}

/** Test-only failure injection for the final staging -> target publication. */
export type WebBookPackageWriteDeps = {
  writeFile?: typeof fs.writeFile;
  publishRename?: typeof fs.rename;
};

function assetRelativePath(asset: { sha256: string; extension: string }): string {
  return `assets/img/${asset.sha256}.${asset.extension}`;
}

export function buildWebBookPackageManifest(registry: ResolvedWebBookAssetRegistry): WebBookPackageManifest {
  return {
    formatVersion: 1,
    assets: [...registry.assets]
      .sort((a, b) => a.sha256.localeCompare(b.sha256))
      .map((asset) => ({
        assetId: asset.assetId,
        kind: asset.kind,
        relativePath: assetRelativePath(asset),
        mediaType: asset.mediaType,
        byteLength: asset.byteLength,
        sha256: asset.sha256,
      })),
  };
}

export function packageAssetUrlByRefId(registry: ResolvedWebBookAssetRegistry): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const [refId, asset] of registry.assetByRefId) values.set(refId, `./${assetRelativePath(asset)}`);
  return values;
}

async function inspectTarget(target: string): Promise<"missing" | "empty"> {
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try { stat = await fs.lstat(target); } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw new WebBookPackageWriteError("target-invalid");
  }
  if (stat.isSymbolicLink()) throw new WebBookPackageWriteError("target-symlink");
  if (!stat.isDirectory()) throw new WebBookPackageWriteError("target-invalid");
  const entries = await fs.readdir(target);
  if (entries.length !== 0) throw new WebBookPackageWriteError("target-not-empty");
  return "empty";
}

/**
 * Write all files in a sibling staging directory, then publish by rename.
 * Existing empty targets are rechecked and removed only immediately before
 * the rename; nonempty user content is never removed.
 */
export async function writeWebBookPackage(
  targetDir: string,
  html: string,
  registry: ResolvedWebBookAssetRegistry,
  deps?: WebBookPackageWriteDeps,
): Promise<void> {
  const parent = path.dirname(targetDir);
  const basename = path.basename(targetDir);
  if (!basename || basename === "." || basename === path.sep) throw new WebBookPackageWriteError("target-invalid");
  await inspectTarget(targetDir);
  let staging: string | null = null;
  let emptyTargetBackup: string | null = null;
  try {
    staging = await fs.mkdtemp(path.join(parent, `.nyoze-web-book-${crypto.randomBytes(8).toString("hex")}-`));
    await fs.mkdir(path.join(staging, "assets", "img"), { recursive: true });
    const writeFile = deps?.writeFile ?? fs.writeFile;
    await writeFile(path.join(staging, "index.html"), html, "utf8");
    for (const asset of registry.assets) {
      await writeFile(path.join(staging, "assets", "img", `${asset.sha256}.${asset.extension}`), asset.bytes);
    }
    await writeFile(
      path.join(staging, "assets", "manifest.json"),
      `${JSON.stringify(buildWebBookPackageManifest(registry), null, 2)}\n`,
      "utf8",
    );
    const current = await inspectTarget(targetDir);
    if (current === "empty") {
      // Preserve an allowed empty target until publish succeeds. On a final
      // rename failure it is restored, so an existing user-selected folder is
      // not lost merely because publication failed.
      emptyTargetBackup = path.join(parent, `.nyoze-web-book-empty-${crypto.randomBytes(8).toString("hex")}`);
      await fs.rename(targetDir, emptyTargetBackup);
    }
    try {
      await (deps?.publishRename ?? fs.rename)(staging, targetDir);
    } catch {
      if (emptyTargetBackup) {
        await fs.rename(emptyTargetBackup, targetDir).catch(() => undefined);
        emptyTargetBackup = null;
      }
      throw new WebBookPackageWriteError("write-failed");
    }
    staging = null;
    if (emptyTargetBackup) {
      await fs.rmdir(emptyTargetBackup);
      emptyTargetBackup = null;
    }
  } catch (error) {
    if (error instanceof WebBookPackageWriteError) throw error;
    throw new WebBookPackageWriteError("write-failed");
  } finally {
    if (staging) await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    // A restore failure must not delete the backup: retaining an empty
    // sibling directory is safer than losing a user-selected target.
  }
}
