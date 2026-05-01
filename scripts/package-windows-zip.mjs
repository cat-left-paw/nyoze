import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VALID_ARCHES = new Set(["x64"]);
const args = process.argv.slice(2);
const arch = args[0];
const dryRun = args.includes("--dry-run");

if (!VALID_ARCHES.has(arch)) {
  console.error("Usage: node scripts/package-windows-zip.mjs <x64> [--dry-run]");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const WINDOWS_ZIP_README_SOURCE = path.join(
  repoRoot,
  "build",
  "windows",
  "README.txt",
);

if (dryRun) {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const appFolderName = buildAppFolderName(packageJson, arch);
  console.log(
    JSON.stringify(
      {
        arch,
        command: [
          process.execPath,
          "scripts/run-with-clean-electron-env.mjs",
          "electron-builder",
          "--win",
          "dir",
          `--${arch}`,
        ],
        zipLayout: `release/${packageJson.version}/${appFolderName}.zip -> ${appFolderName}/...`,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

await runElectronBuilder(repoRoot, arch);
await createFolderRootZip(repoRoot, arch);

function runElectronBuilder(cwd, targetArch) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "scripts/run-with-clean-electron-env.mjs",
        "electron-builder",
        "--win",
        "dir",
        `--${targetArch}`,
      ],
      {
        cwd,
        stdio: "inherit",
        env: process.env,
      },
    );
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `electron-builder terminated by signal: ${signal}`
            : `electron-builder exited with code ${code ?? "unknown"}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

async function createFolderRootZip(cwd, targetArch) {
  const packageJson = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
  const releaseDir = path.join(cwd, "release", packageJson.version);
  const unpackedDir = path.join(releaseDir, "win-unpacked");
  const appFolderName = buildAppFolderName(packageJson, targetArch);
  const stagingDir = path.join(releaseDir, `${appFolderName}-zip-root`);
  const stagedAppDir = path.join(stagingDir, appFolderName);
  const zipPath = path.join(releaseDir, `${appFolderName}.zip`);

  await injectWindowsZipReadme(unpackedDir);
  await rm(stagingDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await mkdir(stagingDir, { recursive: true });
  await cp(unpackedDir, stagedAppDir, { recursive: true });

  await createZipArchive(stagingDir, appFolderName, zipPath);
  await rm(stagingDir, { recursive: true, force: true });

  console.log(`Created ${zipPath}`);
  console.log(`Zip root folder: ${appFolderName}/`);
}

async function injectWindowsZipReadme(unpackedDir) {
  const readmeDestination = path.join(unpackedDir, "README.txt");
  await cp(WINDOWS_ZIP_README_SOURCE, readmeDestination, { force: true });
}

function buildAppFolderName(packageJson, targetArch) {
  const productName =
    typeof packageJson.productName === "string" && packageJson.productName.trim()
      ? packageJson.productName.trim()
      : packageJson.name;
  return `${productName}-Windows-${packageJson.version}-${targetArch}`;
}

async function createZipArchive(cwd, entryName, zipPath) {
  const sevenZip = resolveSevenZipPath();
  if (sevenZip) {
    await runCommand(sevenZip, ["a", "-tzip", zipPath, entryName], cwd);
    return;
  }

  if (process.platform === "win32") {
    await runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Compress-Archive",
        "-Path",
        entryName,
        "-DestinationPath",
        zipPath,
        "-Force",
      ],
      cwd,
    );
    return;
  }

  await runCommand("zip", ["-r", zipPath, entryName], cwd);
}

function resolveSevenZipPath() {
  try {
    const sevenZipBin = require("7zip-bin");
    return sevenZipBin.path7za || sevenZipBin.path7x || null;
  } catch {
    return null;
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${command} terminated by signal: ${signal}`
            : `${command} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
    child.on("error", reject);
  });
}
