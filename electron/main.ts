import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import {
  validatePathArg,
  validateNameArg,
  validateContentArg,
  validateBooleanArg,
  validateWriteFileOptionsArg,
  validateSettingsDataArg,
  validateExternalUrl,
  validateUpdateReleaseUrl,
  isAllowedNavigationUrl,
  hasPreservedFileExtension,
  realpathExisting,
  resolvePathForCheck,
  isWithinDirectory,
  resolveActiveDocumentDir,
  resolveImageProtocolPath,
  MAX_IMAGE_FILE_BYTES,
  readUtf8FileWithinLimitDetailed,
  readUtf8FileWithinLimit,
  coerceSaveBeforeCloseOk,
  type Utf8FileReadErrorKind,
} from "./ipcSecurity";
import {
  sanitizeSettingsJson,
  MAX_SETTINGS_FILE_SIZE,
} from "./settingsSanitizer";
import { atomicWriteFile, classifySaveError } from "./atomicSave";
import type { SaveResult, SaveAsResult } from "./atomicSave";
import {
  copyFileWithOverwriteBackup,
  moveFileWithOverwriteRollback,
} from "./destructiveFileOps";
import { hasAvailableUpdate } from "./updateVersion";
import {
  detectExternalEditConflict,
  type ConflictKind,
  type SavedFileStat,
} from "../src/ui/utils/externalEditConflict";
import { getUiText } from "../src/ui/i18n/uiText";
import type { UiLanguageMode } from "../src/settings/types";
import {
  normalizeUiLanguageMode,
  resolveDefaultUiLanguageMode,
} from "../src/settings/uiLanguageMode";
import { resolveUserDataPathSpec } from "./resolveUserDataPath";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, shell, session, protocol, net } =
  require("electron") as typeof import("electron");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

const APP_DISPLAY_NAME = "Nyoze";
const APP_DESCRIPTION = "Vertical writing Markdown editor for Japanese writing";
const APP_AUTHOR = "Nyoze Project";
const APP_COPYRIGHT = `Copyright © ${new Date().getFullYear()} ${APP_AUTHOR}`;
const APP_ID = "com.nyoze.editor";
const APP_ICON_PNG_PATH = path.join(process.env.APP_ROOT, "build", "icons", "icon.png");
const APP_ICON_ICO_PATH = path.join(process.env.APP_ROOT, "build", "icons", "icon.ico");

// userData パスを app.getPath("userData") より先に確定させる。
// 非パッケージ実行では app.getName() が "Electron" のままになるため、
// 明示的に Nyoze 専用ディレクトリへ固定して "Electron" 共通 userData との衝突を防ぐ。
const E2E_ENABLED = process.env.NYOZE_E2E === "1";
const MAIN_E2E_ENABLED = E2E_ENABLED && !app.isPackaged;
const _userDataSpec = resolveUserDataPathSpec({
  isPackaged: app.isPackaged,
  e2eEnabled: MAIN_E2E_ENABLED,
  e2eUserDataDir: process.env.NYOZE_E2E_USER_DATA_DIR,
  appDataPath: app.getPath("appData"),
  appDisplayName: APP_DISPLAY_NAME,
});
if (_userDataSpec.kind === "e2e") {
  const resolvedPath = path.resolve(_userDataSpec.rawPath);
  fs.mkdirSync(resolvedPath, { recursive: true });
  app.setPath("userData", resolvedPath);
} else if (_userDataSpec.kind === "dev") {
  app.setPath("userData", _userDataSpec.resolvedPath);
}

const userDataPath = app.getPath("userData");

// アプリ表示名を設定する (macOS メニューバー等に反映)。
app.setName(APP_DISPLAY_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

const UPDATE_CHECK_URL =
  "https://raw.githubusercontent.com/cat-left-paw/nyoze/main/latest.json";
const MAX_BACKUP_GENERATIONS = 20;
const BACKUP_TIMESTAMP_PATTERN = /^(\d{8}-\d{6}-\d{3})(?:-.+)?$/;
const backupsRootPath = path.join(userDataPath, "backups");
const workspaceStatePath = path.join(userDataPath, "workspace-state.json");

/** Persist the trusted workspace root so it can be restored on next launch. */
function persistWorkspaceRoot(realRoot: string | null): void {
  try {
    if (realRoot) {
      fs.writeFileSync(
        workspaceStatePath,
        JSON.stringify({ workspaceRoot: realRoot }),
        "utf-8",
      );
    } else {
      fs.unlinkSync(workspaceStatePath);
    }
  } catch {
    // Best-effort — failure here is non-critical.
  }
}

/** Restore the workspace root from the state file (main-side trust only). */
async function restorePersistedWorkspaceRoot(): Promise<string | null> {
  try {
    const raw = fs.readFileSync(workspaceStatePath, "utf-8");
    const parsed = JSON.parse(raw);
    const stored = typeof parsed?.workspaceRoot === "string" ? parsed.workspaceRoot : null;
    if (!stored) return null;
    const real = await realpathExisting(stored);
    if (!real) return null;
    const stat = await fs.promises.stat(real);
    if (!stat.isDirectory()) return null;
    return real;
  } catch {
    return null;
  }
}

let win: InstanceType<typeof BrowserWindow> | null;
// SEC-5: Tracks the document directory of the currently active file.
// Set via IPC from the renderer before each loadMarkdown call.
// Used by the nyoze-img:// protocol handler instead of trusting renderer-provided dir.
let activeDocumentDir: string | undefined;
// Validated absolute path of the currently active file (null when unsaved/untitled).
// Used to locate the per-file backup directory from the File menu.
let activeDocumentFilePath: string | null = null;
const dirtyStateByWebContentsId = new Map<number, boolean>();
const forceCloseWindowIds = new Set<number>();
const pendingSaveBeforeCloseRequests = new Map<number, (ok: boolean) => void>();
let saveBeforeCloseRequestSeq = 1;

// --- SEC-1 / SEC-2: permission boundary state ---
// Workspace root as a realpath-resolved absolute path (set when user opens a folder).
let activeWorkspaceRoot: string | null = null;
// Realpath-resolved document paths explicitly established via OS dialogs.
const allowedDocumentPaths = new Set<string>();

/** Register a file path as an allowed document path (from dialog result). */
async function trackDocumentPath(filePath: string): Promise<void> {
  const real =
    (await realpathExisting(filePath)) ??
    // Fall back to parent-realpath for newly created files (SEC-1 §6).
    (await (async () => {
      try {
        const abs = path.resolve(filePath);
        const realParent = await fs.promises.realpath(path.dirname(abs));
        return path.join(realParent, path.basename(abs));
      } catch {
        return null;
      }
    })());
  if (real) allowedDocumentPaths.add(real);
}

/**
 * Resolve a path and verify it is within the active workspace root.
 * Returns the resolved real path, or null if out-of-bounds or unresolvable.
 * If no workspace is active, returns null (workspace ops require a workspace).
 */
async function checkWorkspacePath(inputPath: string): Promise<string | null> {
  if (!activeWorkspaceRoot) return null;
  const real = await resolvePathForCheck(inputPath);
  if (!real) return null;
  if (!isWithinDirectory(real, activeWorkspaceRoot)) return null;
  return real;
}

/**
 * Resolve a path and verify it is allowed for document read/write.
 * Allowed if within the active workspace root OR in allowedDocumentPaths.
 */
async function checkDocumentPath(inputPath: string): Promise<string | null> {
  const real = await resolvePathForCheck(inputPath);
  if (!real) return null;
  if (activeWorkspaceRoot && isWithinDirectory(real, activeWorkspaceRoot))
    return real;
  if (allowedDocumentPaths.has(real)) return real;
  return null;
}

type WriteFileIpcResult = SaveResult & {
  conflictKind?: ConflictKind;
};

type DocumentReadIpcResult =
  | {
      ok: true;
      content: string;
      size: number;
    }
  | {
      ok: false;
      errorKind: "validation" | Utf8FileReadErrorKind;
      errorMessage: string;
    };

function formatDocumentReadErrorMessage(
  errorKind: "validation" | Utf8FileReadErrorKind,
): string {
  switch (errorKind) {
    case "too-large":
      return "ファイルが大きすぎるため開けません。";
    case "decode-failed":
      return "このファイルは UTF-8 として読み込めません。";
    case "not-file":
      return "通常ファイルのみ開けます。";
    case "validation":
      return "開くファイルの情報が不正です。";
    case "read-failed":
    default:
      return "ファイルを開けませんでした。";
  }
}

async function readDocumentForEditor(filePath: string): Promise<DocumentReadIpcResult> {
  const result = await readUtf8FileWithinLimitDetailed(filePath);
  if (result.ok) return result;
  return {
    ok: false,
    errorKind: result.errorKind,
    errorMessage: formatDocumentReadErrorMessage(result.errorKind),
  };
}

async function readSavedFileStatForConflictCheck(
  filePath: string,
): Promise<SavedFileStat> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return null;
    return {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const usesOverlayNativeControls =
    process.platform === "win32" || process.platform === "linux";
  const windowIconPath =
    process.platform === "win32"
      ? APP_ICON_ICO_PATH
      : APP_ICON_PNG_PATH;

  const currentWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    ...(isMac
      ? {
          titleBarStyle: "hidden" as const,
          // Align native traffic lights to the visual center of our compact topbar.
          trafficLightPosition: { x: 14, y: 10 },
        }
      : usesOverlayNativeControls
        ? {
            // Windows/Linux: use native controls in the overlay area to avoid
            // frameless/custom-button minimize issues.
            titleBarStyle: "hidden" as const,
            titleBarOverlay: {
              color: "#00000000",
              symbolColor: "#8a90a0",
              height: 36,
            },
          }
        : { frame: false }),
    minimizable: true,
    closable: true,
    icon: windowIconPath,
    backgroundColor: "#f4f1e7",
    title: APP_DISPLAY_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win = currentWindow;
  const webContentsId = currentWindow.webContents.id;
  dirtyStateByWebContentsId.set(webContentsId, false);

  if (!isMac) {
    // Keep app menu hidden by default on Windows/Linux.
    // The renderer hamburger button opens the same menu via popup.
    currentWindow.setAutoHideMenuBar(true);
    currentWindow.setMenuBarVisibility(false);
  }

  if (VITE_DEV_SERVER_URL) {
    currentWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    currentWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }

  // --- SEC-3: navigation & window-creation controls ---

  // Block all new window creation (window.open, target="_blank", etc.).
  currentWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Block navigation away from the app's own renderer URL.
  // In dev: allow Vite dev server origin (prefix match for sub-paths).
  // In prod: allow only the exact index.html file URL (not arbitrary file://).
  const prodRendererUrl = pathToFileURL(
    path.join(RENDERER_DIST, "index.html"),
  ).href;
  currentWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationUrl(url, VITE_DEV_SERVER_URL, prodRendererUrl)) {
      event.preventDefault();
      console.warn("[Nyoze] SEC-3: blocked navigation to:", url);
    }
  });

  currentWindow.on("close", (event) => {
    const windowId = currentWindow.id;
    if (forceCloseWindowIds.has(windowId)) {
      forceCloseWindowIds.delete(windowId);
      return;
    }

    const isDirty = dirtyStateByWebContentsId.get(webContentsId);
    if (!isDirty) return;

    event.preventDefault();
    dialog
      .showMessageBox(currentWindow, {
        type: "warning",
        buttons: ["キャンセル", "保存して終了", "破棄して終了"],
        defaultId: 0,
        cancelId: 0,
        title: "未保存の変更があります",
        message: "未保存の変更があります。終了しますか？",
        detail: "保存していない内容は失われます。",
      })
      .then(async (result) => {
        if (currentWindow.isDestroyed()) return;
        if (result.response === 0) return;
        if (result.response === 1) {
          const saved = await requestSaveBeforeClose(currentWindow);
          if (currentWindow.isDestroyed()) return;
          if (!saved) return;
        }
        forceCloseWindowIds.add(windowId);
        currentWindow.close();
      });
  });

  currentWindow.on("closed", () => {
    dirtyStateByWebContentsId.delete(webContentsId);
    forceCloseWindowIds.delete(currentWindow.id);
    if (win === currentWindow) {
      win = null;
    }
  });
}

function resolveTargetWindow(
  event: Electron.IpcMainInvokeEvent,
): InstanceType<typeof BrowserWindow> | null {
  return (
    BrowserWindow.fromWebContents(event.sender) ??
    BrowserWindow.getFocusedWindow() ??
    win
  );
}

function minimizeWindow(
  targetWindow: InstanceType<typeof BrowserWindow> | null,
): boolean {
  if (!targetWindow || targetWindow.isDestroyed()) return false;
  if (!targetWindow.isMinimizable()) {
    targetWindow.setMinimizable(true);
  }
  try {
    targetWindow.minimize();
    return true;
  } catch {
    return false;
  }
}

function normalizePathForCompare(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function isSameFilePath(left: string, right: string): boolean {
  return normalizePathForCompare(left) === normalizePathForCompare(right)
}


function formatBackupTimestampLocal(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}-${hours}${minutes}${seconds}-${milliseconds}`;
}

function getBackupDirectoryPathForFile(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const pathHash = createHash("sha256").update(absolutePath, "utf-8").digest("hex");
  return path.join(backupsRootPath, pathHash);
}

function getBackupTimestampFromFileName(fileName: string): string | null {
  const parsedName = path.parse(fileName).name;
  const match = BACKUP_TIMESTAMP_PATTERN.exec(parsedName);
  if (!match) return null;
  return match[1];
}

async function trimOldBackups(backupDirPath: string): Promise<void> {
  const entries = await fs.promises.readdir(backupDirPath, { withFileTypes: true });
  const backupFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      timestamp: getBackupTimestampFromFileName(entry.name),
    }))
    .filter((entry): entry is { name: string; timestamp: string } => Boolean(entry.timestamp))
    .sort((left, right) => {
      const byTimestamp = left.timestamp.localeCompare(right.timestamp);
      if (byTimestamp !== 0) return byTimestamp;
      return left.name.localeCompare(right.name);
    });

  const removeCount = backupFiles.length - MAX_BACKUP_GENERATIONS;
  if (removeCount <= 0) return;

  for (let index = 0; index < removeCount; index += 1) {
    const backupPath = path.join(backupDirPath, backupFiles[index].name);
    try {
      await fs.promises.unlink(backupPath);
    } catch (error) {
      // SEC-8: log only the filename, not the full absolute path.
      console.warn("[Nyoze] failed to remove old backup:", path.basename(backupPath));
    }
  }
}

async function createBackupBeforeOverwrite(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);

  const existingStat = await fs.promises.stat(absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  });
  if (!existingStat?.isFile()) return;

  const originalContent = await fs.promises.readFile(absolutePath);
  const backupDirPath = getBackupDirectoryPathForFile(absolutePath);
  // SEC-8: verify backup directory stays within the backups root.
  if (!isWithinDirectory(backupDirPath, backupsRootPath)) return;
  await fs.promises.mkdir(backupDirPath, { recursive: true });

  const timestamp = formatBackupTimestampLocal(new Date());
  const sourceExtension = path.extname(absolutePath);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomSuffix = attempt === 0 ? "" : `-${randomBytes(3).toString("hex")}`;
    const backupFileName = `${timestamp}${randomSuffix}${sourceExtension}`;
    const backupPath = path.join(backupDirPath, backupFileName);
    try {
      await fs.promises.writeFile(backupPath, originalContent, { flag: "wx" });
      await trimOldBackups(backupDirPath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "EEXIST") continue;
      throw error;
    }
  }

  const backupFileName = `${timestamp}-${randomBytes(6).toString("hex")}${sourceExtension}`;
  const backupPath = path.join(backupDirPath, backupFileName);
  await fs.promises.writeFile(backupPath, originalContent, { flag: "wx" });
  await trimOldBackups(backupDirPath);
}

function resolveDialogWindow(
  targetWindow?: Electron.BaseWindow | null,
): InstanceType<typeof BrowserWindow> | null {
  const candidate = (targetWindow ?? BrowserWindow.getFocusedWindow() ?? win) as
    | InstanceType<typeof BrowserWindow>
    | null;
  if (!candidate || candidate.isDestroyed()) return null;
  return candidate;
}

async function showBackupFolderOpenFailureDialog(
  targetWindow: Electron.BaseWindow | null | undefined,
  detail: string,
): Promise<void> {
  const options: Electron.MessageBoxOptions = {
    type: "warning",
    title: "バックアップフォルダを開けませんでした",
    message: "バックアップフォルダを開けませんでした。",
    detail,
  };
  const dialogWindow = resolveDialogWindow(targetWindow);
  if (dialogWindow) {
    await dialog.showMessageBox(dialogWindow, options);
  } else {
    await dialog.showMessageBox(options);
  }
}

async function openBackupFolder(
  targetWindow?: Electron.BaseWindow | null,
): Promise<boolean> {
  try {
    await fs.promises.mkdir(backupsRootPath, { recursive: true });
    const openError = await shell.openPath(backupsRootPath);
    if (!openError) return true;
    // SEC-8: openError may contain absolute paths from the OS; log only a generic notice.
    console.warn("[Nyoze] failed to open backup folder (shell.openPath returned error)");
    await showBackupFolderOpenFailureDialog(targetWindow, openError);
    return false;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "原因不明のエラーが発生しました。";
    // SEC-8: log only the error message, not the full error object.
    console.warn("[Nyoze] failed to open backup folder:", detail);
    await showBackupFolderOpenFailureDialog(targetWindow, detail);
    return false;
  }
}

function updateFileBackupMenuItemEnabled(enabled: boolean): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById("open-file-backup");
  if (item) item.enabled = enabled;
}

async function openFileBackupFolder(
  targetWindow?: Electron.BaseWindow | null,
): Promise<void> {
  const filePath = activeDocumentFilePath;
  if (!filePath) return;

  const backupDirPath = getBackupDirectoryPathForFile(filePath);
  // SEC-8: verify backup directory stays within the backups root.
  if (!isWithinDirectory(backupDirPath, backupsRootPath)) return;

  let dirExists: boolean;
  try {
    const stat = await fs.promises.stat(backupDirPath);
    dirExists = stat.isDirectory();
  } catch {
    dirExists = false;
  }

  if (!dirExists) {
    const options: Electron.MessageBoxOptions = {
      type: "info",
      title: "バックアップなし",
      message: "このファイルのバックアップはまだありません。",
      detail: "このファイルへの上書き保存が行われると、バックアップが自動作成されます。",
    };
    const dialogWindow = resolveDialogWindow(targetWindow);
    if (dialogWindow) {
      await dialog.showMessageBox(dialogWindow, options);
    } else {
      await dialog.showMessageBox(options);
    }
    return;
  }

  const openError = await shell.openPath(backupDirPath);
  if (!openError) return;
  // SEC-8: openError may contain absolute paths from the OS; log only a generic notice.
  console.warn("[Nyoze] failed to open file backup folder (shell.openPath returned error)");
  const errOptions: Electron.MessageBoxOptions = {
    type: "warning",
    title: "バックアップフォルダを開けませんでした",
    message: "このファイルのバックアップフォルダを開けませんでした。",
    detail: openError,
  };
  const dialogWindow = resolveDialogWindow(targetWindow);
  if (dialogWindow) {
    await dialog.showMessageBox(dialogWindow, errOptions);
  } else {
    await dialog.showMessageBox(errOptions);
  }
}

function requestSaveBeforeClose(
  targetWindow: InstanceType<typeof BrowserWindow>,
): Promise<boolean> {
  if (targetWindow.isDestroyed() || targetWindow.webContents.isDestroyed()) {
    return Promise.resolve(false);
  }

  const requestId = saveBeforeCloseRequestSeq++;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingSaveBeforeCloseRequests.delete(requestId);
      resolve(false);
    }, 15000);

    pendingSaveBeforeCloseRequests.set(requestId, (ok) => {
      clearTimeout(timeout);
      resolve(ok);
    });
    try {
      targetWindow.webContents.send("app:requestSaveBeforeClose", { requestId });
    } catch {
      pendingSaveBeforeCloseRequests.delete(requestId);
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

// SEC-5: Renderer notifies main of the active file path before loading a document.
// Using ipcRenderer.sendSync so that activeDocumentDir is set before <img> elements
// trigger nyoze-img:// requests.
//
// The renderer-supplied path is treated as a hint — main verifies it against
// the SEC-1 document boundary (workspace root + explicitly allowed paths) and
// only accepts existing regular files, so a compromised renderer cannot point
// activeDocumentDir at an arbitrary directory.
ipcMain.on("document:setActiveFilePath", (event, rawPath: unknown): void => {
  event.returnValue = null;
  const filePath = typeof rawPath === "string" ? validatePathArg(rawPath) : null;
  if (!filePath) {
    activeDocumentDir = undefined;
    activeDocumentFilePath = null;
    updateFileBackupMenuItemEnabled(false);
    return;
  }
  activeDocumentDir =
    resolveActiveDocumentDir(filePath, activeWorkspaceRoot, allowedDocumentPaths) ??
    undefined;
  activeDocumentFilePath = filePath;
  updateFileBackupMenuItemEnabled(true);
});

ipcMain.on(
  "app:saveBeforeClose:result",
  (
    _event,
    payload: { requestId?: number; ok?: boolean } | null | undefined,
  ): void => {
    const requestId = payload?.requestId;
    if (typeof requestId !== "number") return;
    const resolver = pendingSaveBeforeCloseRequests.get(requestId);
    if (!resolver) return;
    pendingSaveBeforeCloseRequests.delete(requestId);
    resolver(coerceSaveBeforeCloseOk(payload));
  },
);

ipcMain.handle("app:setDocumentDirty", (event, dirty: unknown): boolean => {
  const validDirty = validateBooleanArg(dirty);
  if (validDirty === null) return false;
  dirtyStateByWebContentsId.set(event.sender.id, validDirty);
  return true;
});

ipcMain.handle("window:minimize", (event) => {
  return minimizeWindow(resolveTargetWindow(event));
});

ipcMain.handle("window:close", (event) => {
  const targetWindow = resolveTargetWindow(event);
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.close();
});

// --- File system IPC handlers (UI Round 2: left pane) ---

ipcMain.handle(
  "dialog:openFolder",
  async (event): Promise<string | null> => {
    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.OpenDialogOptions = { properties: ["openDirectory"] };
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    const selectedPath = result.filePaths[0];
    // SEC-1: track workspace root via realpath (symlink-resolved).
    const realRoot = await realpathExisting(selectedPath);
    if (realRoot) {
      activeWorkspaceRoot = realRoot;
      persistWorkspaceRoot(realRoot);
    }
    return selectedPath;
  },
);

ipcMain.handle(
  "dialog:openPath",
  async (
    event,
  ): Promise<{ kind: "file" | "directory"; path: string } | null> => {
    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.OpenDialogOptions = {
      properties: ["openFile", "openDirectory"],
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    const selectedPath = result.filePaths[0];
    try {
      const stat = await fs.promises.stat(selectedPath);
      if (stat.isDirectory()) {
        // SEC-1: track workspace root via realpath.
        const realRoot = await realpathExisting(selectedPath);
        if (realRoot) {
          activeWorkspaceRoot = realRoot;
          persistWorkspaceRoot(realRoot);
        }
        return { kind: "directory", path: selectedPath };
      } else {
        // SEC-1: track individual document path via realpath.
        await trackDocumentPath(selectedPath);
        return { kind: "file", path: selectedPath };
      }
    } catch {
      return null;
    }
  },
);

// Renderer asks main for the last trusted workspace root (main-side trust only).
// The path was persisted by main when the user opened a folder via OS dialog.
// Renderer never supplies a path — this prevents SEC-1 boundary bypass.
ipcMain.handle(
  "fs:getLastWorkspaceRoot",
  async (): Promise<string | null> => {
    if (activeWorkspaceRoot) return activeWorkspaceRoot;
    const restored = await restorePersistedWorkspaceRoot();
    if (restored) {
      activeWorkspaceRoot = restored;
      return restored;
    }
    return null;
  },
);

type DirEntry = { name: string; isDirectory: boolean };
type FileStatEntry = { ctimeMs: number; mtimeMs: number; size: number };
type E2eDocumentFixtureEntry = {
  content: string;
  savedStat: SavedFileStat;
};

ipcMain.handle(
  "fs:listDir",
  async (_event, dirPath: unknown): Promise<DirEntry[]> => {
    // SEC-2: validate IPC argument.
    const validPath = validatePathArg(dirPath);
    if (!validPath) return [];
    // SEC-1: workspace must be established; path must be within it.
    const checkedPath = await checkWorkspacePath(validPath);
    if (!checkedPath) return [];
    try {
      const entries = await fs.promises.readdir(checkedPath, {
        withFileTypes: true,
      });
      return entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  },
);

ipcMain.handle(
  "fs:readFile",
  async (_event, filePath: unknown): Promise<DocumentReadIpcResult> => {
    // SEC-2: validate IPC argument.
    const validPath = validatePathArg(filePath);
    if (!validPath) {
      return {
        ok: false,
        errorKind: "validation",
        errorMessage: formatDocumentReadErrorMessage("validation"),
      };
    }
    // SEC-1: verify path is within an allowed boundary.
    const checkedPath = await checkDocumentPath(validPath);
    if (!checkedPath) {
      return {
        ok: false,
        errorKind: "validation",
        errorMessage: "ワークスペース外のファイルは開けません。",
      };
    }
    return await readDocumentForEditor(checkedPath);
  },
);

ipcMain.handle(
  "fs:openFile",
  async (_event, filePath: unknown): Promise<DocumentReadIpcResult> => {
    // SEC-2: validate IPC argument.
    const validPath = validatePathArg(filePath);
    if (!validPath) {
      return {
        ok: false,
        errorKind: "validation",
        errorMessage: formatDocumentReadErrorMessage("validation"),
      };
    }
    // SEC-1: verify path is within an allowed boundary.
    const checkedPath = await checkDocumentPath(validPath);
    if (!checkedPath) {
      return {
        ok: false,
        errorKind: "validation",
        errorMessage: "ワークスペース外のファイルは開けません。",
      };
    }
    return await readDocumentForEditor(checkedPath);
  },
);

ipcMain.handle(
  "e2e:readDocumentFixture",
  async (_event, filePath: unknown): Promise<E2eDocumentFixtureEntry | null> => {
    if (!MAIN_E2E_ENABLED) return null;
    const validPath = validatePathArg(filePath);
    if (!validPath) return null;
    try {
      const stat = await fs.promises.stat(validPath);
      if (!stat.isFile()) return null;
      const content = await readUtf8FileWithinLimit(validPath);
      if (content == null) return null;
      await trackDocumentPath(validPath);
      return {
        content,
        savedStat: {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        },
      };
    } catch {
      return null;
    }
  },
);

/** E2E only: establish trusted workspace root without a dialog (mirrors dialog:openFolder post-path). */
ipcMain.handle(
  "e2e:establishWorkspaceRoot",
  async (_event, dirPath: unknown): Promise<string | null> => {
    if (!MAIN_E2E_ENABLED) return null;
    const validPath = validatePathArg(dirPath);
    if (!validPath) return null;
    const realRoot = await realpathExisting(validPath);
    if (!realRoot) return null;
    try {
      const stat = await fs.promises.stat(realRoot);
      if (!stat.isDirectory()) return null;
    } catch {
      return null;
    }
    activeWorkspaceRoot = realRoot;
    persistWorkspaceRoot(realRoot);
    return realRoot;
  },
);

ipcMain.handle(
  "fs:pathExists",
  async (_event, filePath: unknown): Promise<boolean> => {
    // SEC-2: validate IPC argument.
    const validPath = validatePathArg(filePath);
    if (!validPath) return false;
    // SEC-1: workspace must be established; path must be within it.
    const checkedPath = await checkWorkspacePath(validPath);
    if (!checkedPath) return false;
    try {
      await fs.promises.access(checkedPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "fs:getFileStat",
  async (_event, filePath: unknown): Promise<FileStatEntry | null> => {
    // SEC-2: validate IPC argument.
    const validPath = validatePathArg(filePath);
    if (!validPath) return null;
    // SEC-1: path must resolve to an allowed document boundary (same as readFile).
    const checkedPath = await checkDocumentPath(validPath);
    if (!checkedPath) return null;
    try {
      const stat = await fs.promises.stat(checkedPath);
      if (!stat.isFile()) return null;
      return {
        ctimeMs: stat.ctimeMs,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      };
    } catch {
      return null;
    }
  },
);

ipcMain.handle(
  "fs:copyFile",
  async (
    _event,
    sourcePath: unknown,
    destinationPath: unknown,
    overwrite: unknown,
  ): Promise<boolean> => {
    // SEC-2: validate IPC arguments.
    const validSource = validatePathArg(sourcePath);
    const validDest = validatePathArg(destinationPath);
    const validOverwrite = validateBooleanArg(overwrite);
    if (!validSource || !validDest || validOverwrite === null) return false;
    // SEC-1: both paths must be within the active workspace.
    const checkedSource = await checkWorkspacePath(validSource);
    const checkedDest = await checkWorkspacePath(validDest);
    if (!checkedSource || !checkedDest) return false;
    if (isSameFilePath(checkedSource, checkedDest)) return true;
    return await copyFileWithOverwriteBackup(
      checkedSource,
      checkedDest,
      validOverwrite,
      { createBackupBeforeOverwrite },
    );
  },
);

ipcMain.handle(
  "fs:moveFile",
  async (
    _event,
    sourcePath: unknown,
    destinationPath: unknown,
    overwrite: unknown,
  ): Promise<boolean> => {
    // SEC-2: validate IPC arguments.
    const validSource = validatePathArg(sourcePath);
    const validDest = validatePathArg(destinationPath);
    const validOverwrite = validateBooleanArg(overwrite);
    if (!validSource || !validDest || validOverwrite === null) return false;
    // SEC-1: both paths must be within the active workspace.
    const checkedSource = await checkWorkspacePath(validSource);
    const checkedDest = await checkWorkspacePath(validDest);
    if (!checkedSource || !checkedDest) return false;
    if (isSameFilePath(checkedSource, checkedDest)) return true;
    return await moveFileWithOverwriteRollback(
      checkedSource,
      checkedDest,
      validOverwrite,
      { createBackupBeforeOverwrite },
    );
  },
);

ipcMain.handle(
  "fs:writeFile",
  async (
    _event,
    filePath: unknown,
    content: unknown,
    options: unknown,
  ): Promise<WriteFileIpcResult> => {
    // SEC-2: validate IPC arguments.
    const validPath = validatePathArg(filePath);
    const validContent = validateContentArg(content);
    const validOptions = validateWriteFileOptionsArg(options);
    if (!validPath || validContent === null)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "保存先の情報が不正です。",
      };
    if (!validOptions)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "保存オプションが不正です。",
      };
    // SEC-1: path must resolve to an allowed document boundary.
    const checkedPath = await checkDocumentPath(validPath);
    if (!checkedPath)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "ワークスペース外への保存は許可されていません。",
      };

    const currentStat = await readSavedFileStatForConflictCheck(checkedPath);
    const conflictKind = detectExternalEditConflict(
      validOptions.expectedStat,
      currentStat,
    );
    if (conflictKind && !validOptions.allowConflictOverwrite) {
      return { saved: false, conflictKind };
    }

    // SEC-9: backup failure must not block save; track separately.
    let backupWarning: string | undefined;
    try {
      await createBackupBeforeOverwrite(checkedPath);
    } catch (error) {
      backupWarning =
        `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[Nyoze]", backupWarning);
    }

    // SEC-9: atomic save — temp → fsync → rename.
    try {
      await atomicWriteFile(checkedPath, validContent);
      return { saved: true, backupWarning };
    } catch (error) {
      const { errorKind, errorMessage } = classifySaveError(error);
      return { saved: false, backupWarning, errorKind, errorMessage };
    }
  },
);

ipcMain.handle(
  "fs:createFile",
  async (
    _event,
    parentDir: unknown,
    name: unknown,
    content: unknown = "",
  ): Promise<boolean> => {
    // SEC-2: validate IPC arguments.
    const validParent = validatePathArg(parentDir);
    const validName = validateNameArg(name);
    const validContent = validateContentArg(content);
    if (!validParent || !validName || validContent === null) return false;
    // SEC-1: parent directory must be within the active workspace.
    const checkedParent = await checkWorkspacePath(validParent);
    if (!checkedParent) return false;
    try {
      const parentStat = await fs.promises.stat(checkedParent);
      if (!parentStat.isDirectory()) return false;
      const targetPath = path.join(checkedParent, validName);
      await fs.promises.writeFile(targetPath, validContent, {
        encoding: "utf-8",
        flag: "wx",
      });
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "fs:createDir",
  async (_event, parentDir: unknown, name: unknown): Promise<boolean> => {
    // SEC-2: validate IPC arguments.
    const validParent = validatePathArg(parentDir);
    const validName = validateNameArg(name);
    if (!validParent || !validName) return false;
    // SEC-1: parent directory must be within the active workspace.
    const checkedParent = await checkWorkspacePath(validParent);
    if (!checkedParent) return false;
    try {
      const parentStat = await fs.promises.stat(checkedParent);
      if (!parentStat.isDirectory()) return false;
      const targetPath = path.join(checkedParent, validName);
      await fs.promises.mkdir(targetPath);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "fs:renamePath",
  async (_event, sourcePath: unknown, newName: unknown): Promise<boolean> => {
    // SEC-2: validate IPC arguments.
    const validSource = validatePathArg(sourcePath);
    const validName = validateNameArg(newName);
    if (!validSource || !validName) return false;
    // SEC-1: source must be within the active workspace.
    const checkedSource = await checkWorkspacePath(validSource);
    if (!checkedSource) return false;
    try {
      const sourceStat = await fs.promises.stat(checkedSource);
      if (!sourceStat.isFile() && !sourceStat.isDirectory()) return false;

      // For files, extension must be preserved (prevent rename to invisible
      // extension that would make the file disappear from Explorer).
      if (sourceStat.isFile()) {
        if (!hasPreservedFileExtension(checkedSource, validName)) return false;
      }

      const destinationPath = path.join(path.dirname(checkedSource), validName);
      if (isSameFilePath(checkedSource, destinationPath)) return true;

      // Destination must also be within workspace (same parent → guaranteed,
      // but double-check via checkWorkspacePath for safety).
      const checkedDest = await checkWorkspacePath(destinationPath);
      if (!checkedDest) return false;

      const destinationExists = await fs.promises
        .access(checkedDest, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
      if (destinationExists) return false;

      await fs.promises.rename(checkedSource, checkedDest);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "fs:revealInFileManager",
  async (_event, targetPath: unknown): Promise<boolean> => {
    // SEC-2: validate IPC argument.
    const validPath = validatePathArg(targetPath);
    if (!validPath) return false;
    // SEC-1: workspace must be established; path must be within it.
    const checkedPath = await checkWorkspacePath(validPath);
    if (!checkedPath) return false;
    shell.showItemInFolder(checkedPath);
    return true;
  },
);

ipcMain.handle(
  "fs:trashItem",
  async (_event, targetPath: unknown): Promise<boolean> => {
    const validPath = validatePathArg(targetPath);
    if (!validPath) return false;
    const checkedPath = await checkWorkspacePath(validPath);
    if (!checkedPath) return false;
    try {
      await shell.trashItem(checkedPath);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "shell:openExternal",
  async (_event, url: unknown): Promise<boolean> => {
    // SEC-2: only https:// URLs are permitted from the renderer.
    const validUrl = validateExternalUrl(url);
    if (!validUrl) return false;
    try {
      await shell.openExternal(validUrl);
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "dialog:saveAs",
  async (
    event,
    payload: unknown,
  ): Promise<SaveAsResult> => {
    // SEC-2: validate payload shape and content size.
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "保存情報が不正です。",
      };
    const payloadObj = payload as Record<string, unknown>;
    const validContent = validateContentArg(payloadObj.content);
    if (validContent === null)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "保存する内容が不正です。",
      };
    // defaultPath is optional; validate only if present.
    const rawDefault = payloadObj.defaultPath;
    const validDefault =
      rawDefault === undefined ? undefined : validatePathArg(rawDefault);
    if (rawDefault !== undefined && !validDefault)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "保存先の既定パスが不正です。",
      };

    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.SaveDialogOptions = {
      defaultPath: validDefault ?? undefined,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const dialogResult = targetWindow
      ? await dialog.showSaveDialog(targetWindow, opts)
      : await dialog.showSaveDialog(opts);
    if (dialogResult.canceled || !dialogResult.filePath)
      return { saved: false, errorKind: "canceled" };

    // SEC-9: backup failure must not block save; track separately.
    let backupWarning: string | undefined;
    try {
      await createBackupBeforeOverwrite(dialogResult.filePath);
    } catch (error) {
      backupWarning =
        `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[Nyoze]", backupWarning);
    }

    // SEC-9: atomic save — temp → fsync → rename.
    try {
      await atomicWriteFile(dialogResult.filePath, validContent);
      // SEC-1: register the saved path so subsequent writeFile calls are allowed.
      await trackDocumentPath(dialogResult.filePath);
      return { saved: true, filePath: dialogResult.filePath, backupWarning };
    } catch (error) {
      const { errorKind, errorMessage } = classifySaveError(error);
      return { saved: false, backupWarning, errorKind, errorMessage };
    }
  },
);

// --- Settings JSON persistence ---

const settingsJsonPath = path.join(userDataPath, "settings.json");

async function readSettingsJson(): Promise<Record<string, unknown> | null> {
  try {
    // SEC-6: check file size before reading to prevent OOM on huge files.
    const stat = await fs.promises.stat(settingsJsonPath);
    if (stat.size > MAX_SETTINGS_FILE_SIZE) {
      console.warn(
        "[Nyoze] SEC-6: settings.json exceeds size limit",
        `(${stat.size} bytes), falling back to defaults`,
      );
      return null;
    }
    const raw = await fs.promises.readFile(settingsJsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    // SEC-6: sanitize every field — unknown keys stripped, invalid values → default.
    return sanitizeSettingsJson(parsed);
  } catch {
    return null;
  }
}

async function isProdDevToolsEnabledByDebugSetting(): Promise<boolean> {
  if (app.isPackaged) return false;
  const settings = await readSettingsJson();
  if (!settings || typeof settings !== "object") return false;
  const debug = settings.debug;
  if (!debug || typeof debug !== "object") return false;
  return (debug as Record<string, unknown>).allowProdDevTools === true;
}

function configureMacApplicationPresentation(): void {
  if (process.platform !== "darwin") return;

  app.setAboutPanelOptions({
    applicationName: APP_DISPLAY_NAME,
    applicationVersion: app.getVersion(),
    copyright: APP_COPYRIGHT,
  });

  if (app.dock && fs.existsSync(APP_ICON_PNG_PATH)) {
    app.dock.setIcon(APP_ICON_PNG_PATH);
  }
}

ipcMain.handle(
  "settings:read",
  async (): Promise<Record<string, unknown> | null> => {
    return readSettingsJson();
  },
);

ipcMain.handle(
  "settings:write",
  async (
    _event,
    data: unknown,
  ): Promise<boolean> => {
    // SEC-2: validate that data is a plain object within size limits.
    const validData = validateSettingsDataArg(data);
    if (!validData) return false;
    // SEC-6: sanitize before persisting — strip unknown keys, clamp values.
    const sanitized = sanitizeSettingsJson(validData);
    if (!sanitized) return false;
    try {
      await fs.promises.writeFile(
        settingsJsonPath,
        JSON.stringify(sanitized, null, 2),
        "utf-8",
      );
      rebuildApplicationMenu(resolveEffectiveUiLanguageMode(sanitized.uiLanguageMode));
      return true;
    } catch {
      return false;
    }
  },
);

ipcMain.handle(
  "app:checkForUpdate",
  async (): Promise<{
    ok: boolean;
    hasUpdate: boolean;
    latestVersion: string | null;
    releaseUrl: string | null;
  }> => {
    try {
      const response = await net.fetch(UPDATE_CHECK_URL);
      if (!response.ok) {
        return {
          ok: false,
          hasUpdate: false,
          latestVersion: null,
          releaseUrl: null,
        };
      }
      const payload = (await response.json()) as {
        version?: unknown;
        releaseUrl?: unknown;
      };
      const latestVersion =
        typeof payload.version === "string" ? payload.version.trim() : null;
      const releaseUrl =
        typeof payload.releaseUrl === "string"
          ? validateUpdateReleaseUrl(payload.releaseUrl.trim())
          : null;
      if (!latestVersion) {
        return {
          ok: false,
          hasUpdate: false,
          latestVersion: null,
          releaseUrl,
        };
      }
      return {
        ok: true,
        hasUpdate: hasAvailableUpdate(app.getVersion(), latestVersion),
        latestVersion,
        releaseUrl,
      };
    } catch {
      return {
        ok: false,
        hasUpdate: false,
        latestVersion: null,
        releaseUrl: null,
      };
    }
  },
);

// --- System Font Enumeration ---

ipcMain.handle(
  "fonts:getSystemFonts",
  async (): Promise<string[]> => {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const LARGE_BUFFER = 64 * 1024 * 1024;

      if (process.platform === "darwin") {
        // system_profiler output can be large on macOS, so increase maxBuffer.
        const { stdout } = await execFileAsync(
          "system_profiler",
          ["SPFontsDataType", "-json"],
          { maxBuffer: LARGE_BUFFER },
        );
        const data = JSON.parse(stdout);
        const fonts: string[] = [];
        const items = data?.SPFontsDataType;
        if (Array.isArray(items)) {
          for (const item of items) {
            const typefaces = Array.isArray(item?.typefaces)
              ? item.typefaces
              : [];
            for (const face of typefaces) {
              const family = face?.family;
              if (typeof family === "string" && family.trim()) {
                fonts.push(family.trim());
              }
            }
          }
        }
        return [...new Set(fonts)].sort((a, b) => a.localeCompare(b));
      }

      if (process.platform === "win32") {
        const { stdout } = await execFileAsync("powershell", [
          "-NoProfile",
          "-Command",
          "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress",
        ], { maxBuffer: LARGE_BUFFER });

        const trimmed = stdout.trim();
        let fonts: string[] = [];
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (Array.isArray(parsed)) {
              fonts = parsed.filter((v): v is string => typeof v === "string");
            } else if (typeof parsed === "string") {
              fonts = [parsed];
            }
          } catch {
            // Fallback for unexpected output shape.
            fonts = trimmed
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean);
          }
        }

        return [...new Set(fonts)].sort((a, b) => a.localeCompare(b));
      }

      // Linux: fc-list
      const { stdout } = await execFileAsync("fc-list", [
        "--format=%{family[0]}\\n",
      ]);
      const fonts = stdout
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      return [...new Set(fonts)].sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  },
);

// --- Application Menu ---

const isMacPlatform = process.platform === "darwin";

function sendToRenderer(
  baseWindow: Electron.BaseWindow | undefined,
  channel: string,
): void {
  if (!baseWindow) return;
  const bw = baseWindow as InstanceType<typeof BrowserWindow>;
  if (typeof bw.webContents?.send === "function") {
    bw.webContents.send(channel);
  }
}

function withEllipsis(label: string): string {
  return `${label}…`;
}

function buildAppMenuTemplate(
  uiLanguageMode: UiLanguageMode = "mixed",
): Electron.MenuItemConstructorOptions[] {
  const t = (
    key: Parameters<typeof getUiText>[1],
  ): string => getUiText(uiLanguageMode, key);
  const fileSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: t("common.newDocument"),
      accelerator: "CmdOrCtrl+N",
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:new-document");
      },
    },
    {
      label: withEllipsis(t("common.open")),
      accelerator: "CmdOrCtrl+O",
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:open");
      },
    },
    { type: "separator" },
    {
      label: t("common.save"),
      accelerator: "CmdOrCtrl+S",
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:save");
      },
    },
    {
      label: withEllipsis(t("common.saveAs")),
      accelerator: "CmdOrCtrl+Shift+S",
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:save-as");
      },
    },
    {
      label: t("menu.openBackupFolder"),
      click: (_item, focusedWindow) => {
        void openBackupFolder(focusedWindow);
      },
    },
    {
      id: "open-file-backup",
      label: t("menu.openFileBackupFolder"),
      enabled: activeDocumentFilePath !== null,
      click: (_item, focusedWindow) => {
        void openFileBackupFolder(focusedWindow);
      },
    },
  ];

  if (!isMacPlatform) {
    fileSubmenu.push(
      { type: "separator" },
      { label: t("common.quit"), role: "quit" },
    );
  }

  const template: Electron.MenuItemConstructorOptions[] = [];

  if (isMacPlatform) {
    template.push({
      label: APP_DISPLAY_NAME,
      submenu: [
        { label: `${t("common.about")} ${APP_DISPLAY_NAME}`, role: "about" },
        { type: "separator" },
        { label: t("common.services"), role: "services" },
        { type: "separator" },
        { label: `${t("common.hide")} ${APP_DISPLAY_NAME}`, role: "hide" },
        { label: t("common.hideOthers"), role: "hideOthers" },
        { label: t("common.showAll"), role: "unhide" },
        { type: "separator" },
        { label: `${t("common.quit")} ${APP_DISPLAY_NAME}`, role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: t("menu.file"),
      submenu: fileSubmenu,
    },
    {
      label: t("menu.edit"),
      submenu: [
        { label: t("common.undo"), role: "undo" },
        { label: t("common.redo"), role: "redo" },
        { type: "separator" },
        { label: t("common.cut"), role: "cut" },
        { label: t("common.copy"), role: "copy" },
        { label: t("common.paste"), role: "paste" },
        { label: t("common.selectAll"), role: "selectAll" },
      ],
    },
    {
      label: t("menu.view"),
      submenu: [
        {
          label: withEllipsis(t("menu.viewSettings")),
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:view-settings");
          },
        },
        { type: "separator" },
        { label: t("menu.resetZoom"), role: "resetZoom" },
        { label: t("menu.zoomIn"), role: "zoomIn" },
        { label: t("menu.zoomOut"), role: "zoomOut" },
        { type: "separator" },
        { label: t("menu.toggleFullscreen"), role: "togglefullscreen" },
      ],
    },
  );

  if (isMacPlatform) {
    template.push({
      label: t("menu.window"),
      submenu: [
        { label: t("common.minimize"), role: "minimize" },
        { label: t("common.zoom"), role: "zoom" },
        { type: "separator" },
        { label: t("menu.bringAllToFront"), role: "front" },
      ],
    });
  } else {
    template.push({
      label: t("menu.window"),
      submenu: [
        { label: t("common.minimize"), role: "minimize" },
        { label: t("common.close"), role: "close" },
      ],
    });
  }

  const helpSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: t("help.openManual"),
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:open-manual");
      },
    },
    {
      label: t("help.shortcutsReference"),
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:show-shortcuts");
      },
    },
    { type: "separator" },
    {
      label: t("displaySettings.support.reportBug"),
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:bug-report");
      },
    },
    {
      label: t("displaySettings.support.sendFeedback"),
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:feedback");
      },
    },
  ];

  if (!isMacPlatform) {
    helpSubmenu.push(
      { type: "separator" },
      {
        label: `${t("common.about")} ${APP_DISPLAY_NAME}`,
        click: (_item, focusedWindow) => {
          const aboutWin = focusedWindow ?? win;
          if (!aboutWin || aboutWin.isDestroyed()) return;
          dialog.showMessageBox(aboutWin, {
            type: "info",
            title: `About ${APP_DISPLAY_NAME}`,
            message: APP_DISPLAY_NAME,
            detail: `Version ${app.getVersion()}\n${APP_DESCRIPTION}\n${APP_COPYRIGHT}`,
          });
        },
      },
    );
  }

  template.push({
    label: t("menu.help"),
    submenu: helpSubmenu,
  });

  return template;
}

function resolveSystemDefaultUiLanguageMode(): UiLanguageMode {
  const preferredLanguages =
    typeof app.getPreferredSystemLanguages === "function"
      ? app.getPreferredSystemLanguages()
      : typeof app.getLocale === "function"
        ? [app.getLocale()]
        : null;
  return resolveDefaultUiLanguageMode(preferredLanguages);
}

let currentMenuUiLanguageMode: UiLanguageMode = resolveSystemDefaultUiLanguageMode();

function resolveEffectiveUiLanguageMode(value: unknown): UiLanguageMode {
  return normalizeUiLanguageMode(value) ?? resolveSystemDefaultUiLanguageMode();
}

function rebuildApplicationMenu(uiLanguageMode: UiLanguageMode): void {
  currentMenuUiLanguageMode = uiLanguageMode;
  const appMenu = Menu.buildFromTemplate(buildAppMenuTemplate(uiLanguageMode));
  Menu.setApplicationMenu(appMenu);
}

async function loadMenuUiLanguageModeFromSettings(): Promise<UiLanguageMode> {
  const settings = await readSettingsJson();
  return resolveEffectiveUiLanguageMode(settings?.uiLanguageMode);
}

ipcMain.handle("menu:openAppMenu", (event, uiLanguageMode: unknown) => {
  const targetWindow = resolveTargetWindow(event);
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const menu = Menu.buildFromTemplate(
    buildAppMenuTemplate(
      normalizeUiLanguageMode(uiLanguageMode) ?? currentMenuUiLanguageMode,
    ),
  );
  menu.popup({ window: targetWindow });
});

// Single-instance lock: if another Nyoze process is already running, bring it
// to the front and exit this new process. This runs before whenReady() so the
// second process never creates a window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  configureMacApplicationPresentation();

  // Restore trusted workspace root from main-side state file (if any).
  // This runs before the renderer loads, so activeWorkspaceRoot is available
  // when the first listDir / createFile IPC arrives.
  const restoredRoot = await restorePersistedWorkspaceRoot();
  if (restoredRoot) activeWorkspaceRoot = restoredRoot;

  // --- SEC-5: nyoze-img:// protocol for safe local image serving ---
  // The renderer constructs nyoze-img://img?src=... URLs (no dir — main tracks it).
  // activeDocumentDir is set via IPC before each document load, so main never trusts
  // a renderer-supplied dir parameter (prevents arbitrary-directory image reads).
  protocol.handle("nyoze-img", async (request) => {
    try {
      const url = new URL(request.url);
      const src = url.searchParams.get("src");
      // Use the main-tracked dir, then verify the final realpath stays inside it.
      const resolved = await resolveImageProtocolPath(
        src,
        activeDocumentDir ?? null,
      );
      if (!resolved) {
        return new Response("Forbidden", { status: 403 });
      }
      const stat = await fs.promises.stat(resolved);
      if (!stat.isFile()) {
        return new Response("Forbidden", { status: 403 });
      }
      if (stat.size > MAX_IMAGE_FILE_BYTES) {
        return new Response("Payload Too Large", { status: 413 });
      }
      // Serve the file via Electron's net module
      return net.fetch(pathToFileURL(resolved).href);
    } catch {
      return new Response("Internal Error", { status: 500 });
    }
  });

  // --- SEC-3 + SEC-4: Content Security Policy (defense-in-depth) ---
  // Blocks inline scripts, eval, and plugin content even if raw HTML somehow
  // reaches the DOM. In dev mode, Vite HMR needs inline scripts + ws:.
  const isDev = Boolean(VITE_DEV_SERVER_URL);
  const cspDirectives = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: nyoze-img:",
    "font-src 'self'",
    isDev
      ? "connect-src 'self' ws:"
      : "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [cspDirectives],
      },
    });
  });

  const initialMenuUiLanguageMode = await loadMenuUiLanguageModeFromSettings();
  rebuildApplicationMenu(initialMenuUiLanguageMode);

  createWindow();

  // Register global shortcuts for DevTools in development, or when explicitly
  // enabled in settings.json debug flag.
  const allowProdDevTools = await isProdDevToolsEnabledByDebugSetting();
  if (VITE_DEV_SERVER_URL || allowProdDevTools) {
    const toggleDevTools = () => {
      if (win && !win.isDestroyed()) {
        win.webContents.toggleDevTools();
      }
    };
    globalShortcut.register("CmdOrCtrl+Option+I", toggleDevTools);
    globalShortcut.register("CmdOrCtrl+Shift+I", toggleDevTools);
    globalShortcut.register("F12", toggleDevTools);
  }
});

app.on("will-quit", () => {
  pendingSaveBeforeCloseRequests.clear();
  globalShortcut.unregisterAll();
});
