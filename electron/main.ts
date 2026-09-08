import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
import { writeAozoraTextExportFile } from "./aozoraTextExportWrite";
import { writeLeMEMarkdownExportFile } from "./lemeMarkdownExportWrite";
import { writeDendenMarkdownExportFile } from "./dendenMarkdownExportWrite";
import { writeHtmlExportFile } from "./htmlExportWrite";
import { normalizeWebBookPaletteSnapshot } from "../src/editor-core/export/webBookPaletteSnapshot";
import { normalizeWebBookTypographySnapshot } from "../src/editor-core/export/webBookTypographySnapshot";
import { normalizeWebBookAutoTcySnapshot } from "../src/editor-core/export/webBookAutoTcySnapshot";
import {
  parseBookExportIpcPayload,
  runBookExportOperation,
  type BookExportIpcResult,
} from "./bookExportOperation";
import {
  parseWebBookDocumentExportPayload,
  runWebBookDocumentExportOperation,
  type WebBookDocumentExportIpcResult,
} from "./webBookExportOperation";
import {
  parseBookPageViewerRequest,
  runBookPageViewerOperation,
  type BookPageViewerIpcResult,
} from "./bookPageViewerOperation";
import {
  copyFileWithOverwriteBackup,
  moveFileWithOverwriteRollback,
} from "./destructiveFileOps";
import { hasAvailableUpdate } from "./updateVersion";
import {
  runExplorerTransferOperation,
  checkExplorerFolderTransferGuard,
} from "./explorerTransferOperation";
import {
  createProjectIpc,
  detectProjectRootsIpc,
  detectFileRolesIpc,
  listProjectsIpc,
  readNotesIpc,
  resolveMissingFileNotesIpc,
  resolveProjectForFileIpc,
  resolveBookFullOutlineIpc,
  resolveChapterNeighborsIpc,
  resolveBookExportTargetIpc,
  resolveProjectBooksIpc,
  resolvePanelContextIpc,
  writeNotesIpc,
  discardProvisionalNotesIpc,
  updateProjectTitleIpc,
  unregisterProjectIpc,
  updateBookManifestV3Ipc,
  resolveUnregisteredFilesV3Ipc,
  type ProjectIpcBoundary,
} from "./projectIpc";
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
import {
  computeWorkspaceStateUpdate,
  isLibraryRegistryAtLimit,
  normalizeLibraryRegistry,
  readLibraryRegistryFromPersistedState,
  registerExistingLibrary,
  registerNewLibraryEntry,
  renameLibraryById,
  resolveLibraryRootById,
  setActiveLibraryById,
  unregisterLibraryById,
  validateLibraryFolderName,
  type LibraryCreateNewResult,
  type LibraryPickCreateParentResult,
  type LibraryRegistryReadResult,
  type LibraryRegisterExistingResult,
  type LibraryRenameResult,
  type LibraryRevealResult,
  type LibrarySetActiveResult,
  type LibraryUnregisterResult,
} from "../src/settings/libraryRegistry";
import { resolveUserDataPathSpec } from "./resolveUserDataPath";
import {
  WINDOW_STATE_FILE_NAME,
  buildWindowStateForPersist,
  parseWindowStateJson,
  reduceWindowRuntimeState,
  resolveStartupWindowBounds,
  type DisplayWorkArea,
  type WindowRect,
  type WindowRuntimeState,
} from "./appWindowBounds";
import {
  DIRTY_CLOSE_DIALOG_BUTTON_INDEX,
  IDLE_APP_QUIT_INTENT,
  buildDirtyCloseDialogCopy,
  currentQuitAttemptId,
  isExplicitQuitAttempt,
  isQuitResumingAttempt,
  reduceAppQuitIntent,
  resolveDirtyCloseIntent,
  type AppQuitIntentEvent,
  type AppQuitIntentState,
} from "./appQuitIntent";
import {
  E2E_WINDOW_MODE_ENV,
  resolveWindowPresentationPolicy,
} from "./e2eWindowPresentation";
import {
  E2E_BOOTSTRAP_DOCUMENT_THEME_ENV,
  E2E_BOOTSTRAP_DOC_HEADING_COLOR_ENV,
  E2E_BOOTSTRAP_DOC_PAGE_COLOR_ENV,
  E2E_BOOTSTRAP_DOC_TEXT_COLOR_ENV,
  E2E_BOOTSTRAP_ENV_NAMES,
  resolveE2eThemeBootstrap,
} from "./e2eBootstrapTheme";
import {
  LOCAL_IME_EXPERIMENTAL_PREVIEW_CAPABILITY_CHANNEL,
  LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY_ENV,
  resolveLocalImeExperimentalPreviewCapability,
} from "./localImeExperimentalPreviewGate";
import {
  LOCAL_IME_PILOT_AVAILABILITY_CHANNEL,
  LOCAL_IME_PILOT_ENV,
  resolveLocalImePilotAvailability,
} from "./localImePilotGate";
import {
  buildPageViewerWindowQueryString,
  validatePageViewerImageScope,
  validatePageViewerPayloadId,
  validatePageViewerSnapshotRequest,
  type PageViewerImageScope,
  type PageViewerSnapshotPayload,
  type PageViewerSnapshotRequest,
} from "../src/ui/page-viewer/pageViewerTypes";

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
// packaged build では E2E 診断入口を一切作らせない。
// preload は sandbox 実行のため `app.isPackaged` を自分で判定できず、`process.env`
// のコピーだけを見る。ここで環境変数を落としておくことで、preload / renderer が
// 参照する `NYOZE_E2E` は常に `MAIN_E2E_ENABLED` と一致する。renderer 側の
// 二重確認は同期 IPC `e2e:isEnabled` (下記) が正本。
if (!MAIN_E2E_ENABLED) {
  delete process.env.NYOZE_E2E;
  delete process.env.NYOZE_E2E_USER_DATA_DIR;
  // E2E-UX1: window presentation の E2E 専用 env も同じ gate で落とす。
  delete process.env[E2E_WINDOW_MODE_ENV];
  // E2E-UX1b: theme / document color bootstrap の E2E 専用 env も同様。
  for (const envName of E2E_BOOTSTRAP_ENV_NAMES) delete process.env[envName];
}

/**
 * P3-A1a: 作者限定 internal pilot（局所 IME slot safety shell）の availability。
 *
 * **`NYOZE_E2E` とは独立した別 gate**で、E2E 診断入口を pilot の製品経路にしない。
 * packaged build では要求値に関わらず false になり、env 自体もここで落とす
 * （preload は sandbox 実行で `app.isPackaged` を判定できないため）。
 * `available` は「HUD と手動 arm 導線を出してよい」だけで、初期 `enabled` は必ず false。
 */
const LOCAL_IME_PILOT_AVAILABLE = resolveLocalImePilotAvailability({
  isPackaged: app.isPackaged,
  flagValue: process.env[LOCAL_IME_PILOT_ENV],
});
if (!LOCAL_IME_PILOT_AVAILABLE) {
  delete process.env[LOCAL_IME_PILOT_ENV];
}

/**
 * PUBLIC-ENTRY1: Local Window Experimental product **capability**。
 *
 * `true` は「設定 UI を出してよい」だけで、有効化ではない。実効有効化は
 * settings.json のstrategy-neutral preference（既定 false）が正本で、platformは
 * main-process Local Window availability authorityだけが決める。通常devでも利用できる。
 * Linux でも capable になり得るが、公式サポート対象ではない。
 * 作者 pilot が available な起動では常に false（pure policy 上の排他）。
 * E2E/test envは製品capabilityにもruntime stateにも使わない。
 */
const LOCAL_IME_EXPERIMENTAL_PREVIEW_CAPABILITY =
  resolveLocalImeExperimentalPreviewCapability({
    platform: process.platform,
    isPackaged: app.isPackaged,
    authorPilotAvailable: LOCAL_IME_PILOT_AVAILABLE,
    e2eEnabled: MAIN_E2E_ENABLED,
    testCapabilityFlagValue:
      process.env[LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY_ENV],
  });
if (LOCAL_IME_EXPERIMENTAL_PREVIEW_CAPABILITY.reason !== "test-launch-boundary") {
  delete process.env[LOCAL_IME_EXPERIMENTAL_PREVIEW_TEST_CAPABILITY_ENV];
}

/**
 * E2E-UX1b: renderer の初回 paint 前に適用する theme bootstrap。
 * `MAIN_E2E_ENABLED` が正本なので、packaged / 通常 development では常に `null`。
 */
const e2eThemeBootstrap = resolveE2eThemeBootstrap({
  e2eEnabled: MAIN_E2E_ENABLED,
  uiTheme: process.env[E2E_BOOTSTRAP_ENV_NAMES[0]],
  documentTheme: process.env[E2E_BOOTSTRAP_DOCUMENT_THEME_ENV],
  pageColor: process.env[E2E_BOOTSTRAP_DOC_PAGE_COLOR_ENV],
  textColor: process.env[E2E_BOOTSTRAP_DOC_TEXT_COLOR_ENV],
  headingColor: process.env[E2E_BOOTSTRAP_DOC_HEADING_COLOR_ENV],
});

/**
 * E2E-UX1: main / Page Viewer 共通の window presentation policy。
 *
 * `MAIN_E2E_ENABLED` を正本にした pure resolver の結果をそのまま使う。
 *
 * - production / packaged / 通常 development: `show: true` + 明色 `#f4f1e7` +
 *   Page Viewer reuse の show/focus あり。**外観・表示動作とも完全に不変**。
 * - E2E visible (E2E-UX1b): `show: true`・focus 意味論・Page Viewer reuse は
 *   production と同じで、**初期 `backgroundColor` だけ暗色 `#22252c`**
 *   （dark UI theme の `baseBg`）。起動のたびの白い点滅を減らすためで、
 *   製品の既定テーマは変更しない。
 *
 * **`background` policy（`show: false`）は診断 No-Go・park 中**であり、
 * `NYOZE_E2E_WINDOW_MODE=background` を明示指定する manual diagnostic
 * （`tests/e2e/e2e-background-window-mode-diagnostic.spec.ts`）からしか
 * 到達しない。既定 suite・共用 diagnostic config・npm script のいずれからも
 * 到達しない（専用 unsafe config + acknowledgement env が必要）。理由（macOS 15.7.7 /
 * Electron 41.3.0 で `CrBrowserMain` の SIGSEGV が反復）は
 * `docs/work-log.md` の E2E-UX1 節を参照。
 */
const windowPresentationPolicy = resolveWindowPresentationPolicy({
  e2eEnabled: MAIN_E2E_ENABLED,
  requestedMode: process.env[E2E_WINDOW_MODE_ENV],
});
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

// --- APP-WINDOW-BOUNDS-RESTORE1: main window bounds / maximized persistence ---
// main process が唯一の authority。renderer の localStorage / React state は使わない。
// 決定 logic はすべて `electron/appWindowBounds.ts` の pure helper 側にある。
const windowStatePath = path.join(userDataPath, WINDOW_STATE_FILE_NAME);

/** 通常時 bounds と最大化フラグの in-memory 正本（disk write は close / quit 境界だけ）。 */
let mainWindowRuntimeState: WindowRuntimeState = { normalBounds: null, maximized: false };
let mainWindowStateDirty = false;

/** 保存済み window state を読む（best-effort。破損・不正・欠落はすべて null）。 */
function readPersistedWindowState() {
  try {
    return parseWindowStateJson(fs.readFileSync(windowStatePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * `screen` から work area を写し取る。app ready 後にしか呼べないモジュールなので
 * top-level では require せず、失敗しても起動を止めない。
 */
function readDisplayWorkAreas(): DisplayWorkArea[] {
  try {
    const { screen } = require("electron") as typeof import("electron");
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display) => ({
      id: display.id,
      workArea: { ...display.workArea },
      isPrimary: display.id === primaryId,
    }));
  } catch {
    return [];
  }
}

/**
 * resize / move / maximize / unmaximize / close で in-memory state を更新する。
 * 通常時 bounds は `getNormalBounds()` を正本とし、最小化・fullscreen 中は更新しない。
 */
function captureMainWindowRuntimeState(
  targetWindow: InstanceType<typeof BrowserWindow>,
): void {
  if (targetWindow.isDestroyed()) return;
  try {
    const next = reduceWindowRuntimeState(mainWindowRuntimeState, {
      normalBounds: targetWindow.getNormalBounds(),
      maximized: targetWindow.isMaximized(),
      minimized: targetWindow.isMinimized(),
      fullScreen: targetWindow.isFullScreen(),
    });
    if (next === mainWindowRuntimeState) return;
    mainWindowRuntimeState = next;
    mainWindowStateDirty = true;
  } catch {
    // Best-effort — window preference tracking must never break window lifecycle.
  }
}

/**
 * Windows/Electron may add a few DIP to the first hidden-titlebar bounds at a
 * fractional display scale. Correct from the observed outer bounds without a
 * hard-coded frame size; all reads and writes remain in Electron DIP units.
 */
function applyWindowsStartupOuterBounds(
  targetWindow: InstanceType<typeof BrowserWindow>,
  desired: WindowRect,
): void {
  let requested = { ...desired };
  // Four synchronous samples cover the observed Windows fractional-DPI
  // convergence (for example 900 -> 905 -> 902 -> 901 -> 900) while keeping
  // the correction finite and deterministic.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    targetWindow.setBounds(requested);
    const observed = targetWindow.getBounds();
    const widthDelta = desired.width - observed.width;
    const heightDelta = desired.height - observed.height;
    if (widthDelta === 0 && heightDelta === 0) return;
    requested = {
      ...desired,
      width: Math.max(1, requested.width + widthDelta),
      height: Math.max(1, requested.height + heightDelta),
    };
  }
}

/**
 * 実 close / quit 境界でだけ disk へ書く。dirty close の「キャンセル」では
 * ここへ到達しないので、キャンセルを終了成功として扱うことはない。
 * 保存失敗は握りつぶす（原稿保存・close・quit を妨げない）。
 */
function persistMainWindowState(): void {
  if (!mainWindowStateDirty) return;
  const state = buildWindowStateForPersist(mainWindowRuntimeState);
  if (!state) return;
  try {
    fs.writeFileSync(windowStatePath, JSON.stringify(state), "utf-8");
    mainWindowStateDirty = false;
  } catch {
    // Best-effort — window preference persistence is never a quit blocker.
  }
}

/**
 * Read the raw workspace-state.json contents (best-effort).
 * Returns an empty object when the file is missing or unparsable.
 */
function readWorkspaceStateRaw(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(workspaceStatePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Persist the trusted workspace root so it can be restored on next launch.
 *
 * The trusted single `workspaceRoot` remains the source of truth for the
 * existing restore path (kept for compatibility). Alongside it, a library
 * registry is normalized and stored so future 書庫 UI can read it without
 * changing startup restore / File Explorer initial root. The active library
 * root is kept consistent with `workspaceRoot`. No `.nyoze` is created here.
 */
function persistWorkspaceRoot(realRoot: string | null): void {
  try {
    if (realRoot) {
      const prev = readWorkspaceStateRaw();
      const registry = normalizeLibraryRegistry(
        {
          registeredLibraries: prev.registeredLibraries,
          activeLibraryId: prev.activeLibraryId,
          workspaceRoot: realRoot,
        },
        { markActiveOpenedAt: new Date().toISOString() },
      );
      fs.writeFileSync(
        workspaceStatePath,
        JSON.stringify({ workspaceRoot: realRoot, ...registry }),
        "utf-8",
      );
    } else {
      fs.unlinkSync(workspaceStatePath);
    }
  } catch {
    // Best-effort — failure here is non-critical.
  }
}

/**
 * Startup reconcile: always normalize the persisted library registry against
 * the trusted `workspaceRoot` and write back only when the stored state would
 * change. This handles both first-time backfill (legacy `workspaceRoot`-only
 * file) and repair of an already-migrated registry whose `activeLibraryId` is
 * broken, has duplicate `rootPath`, exceeds the limit, or carries invalid
 * entries. Idempotent — no write when stored state is already canonical.
 * Does not modify `workspaceRoot` itself, so startup restore is unaffected.
 */
function reconcilePersistedLibraryRegistry(): void {
  try {
    const prev = readWorkspaceStateRaw();
    const update = computeWorkspaceStateUpdate(prev);
    if (!update) return;
    fs.writeFileSync(workspaceStatePath, JSON.stringify(update.next), "utf-8");
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
let bookExportMenuAvailable = false;
const BOOK_EXPORT_MENU_ITEM_IDS = [
  "export-book-leme",
  "export-book-denden",
  "export-book-aozora",
  "export-book-web-book",
  "book-page-viewer",
] as const;
const dirtyStateByWebContentsId = new Map<number, boolean>();
const forceCloseWindowIds = new Set<number>();
const pendingSaveBeforeCloseRequests = new Map<number, (ok: boolean) => void>();
let saveBeforeCloseRequestSeq = 1;

// APP-MAC-DIRTY-QUIT-CONTINUATION1: 明示 app quit の intent は main process だけが持つ。
// renderer 側に quit state machine は作らない。
let appQuitIntent: AppQuitIntentState = IDLE_APP_QUIT_INTENT;
let appQuitAttemptSeq = 1;
// dirty dialog が開いている window。再入した close で 2 枚目を開かないための latch。
const dirtyCloseDialogWindowIds = new Set<number>();

function dispatchAppQuitIntent(event: AppQuitIntentEvent): void {
  appQuitIntent = reduceAppQuitIntent(appQuitIntent, event);
}

// Light Page Viewer: snapshot payloads for independent viewer BrowserWindows,
// keyed by a main-issued payloadId. Read-only viewer windows are never
// assigned to `win` and never registered in dirtyStateByWebContentsId, so
// their close never triggers the save-before-close dialog. Each entry is
// discarded when its viewer window closes (see createPageViewerWindow).
const pageViewerSnapshotsByPayloadId = new Map<string, PageViewerSnapshotPayload>();
type PageViewerImageScopeRecord = {
  baseDirectoriesByToken: ReadonlyMap<string, string>;
};
const pageViewerImageScopesById = new Map<string, PageViewerImageScopeRecord>();
// Page Viewer は独立した読み取り専用 window だが、同時に複数を持つ必要はない。
// 最新 snapshot を同じ BrowserWindow へ load し直して表示を差し替える。
let pageViewerWindow: InstanceType<typeof BrowserWindow> | null = null;
let pageViewerWindowPayloadId: string | null = null;

function createPageViewerImageScope(input: {
  defaultBaseDirectory?: string;
  chapterBaseDirectories?: Readonly<Record<string, string>>;
}): PageViewerImageScope | undefined {
  const baseDirectoriesByToken = new Map<string, string>();
  const scopeId = randomUUID();
  let defaultBaseToken: string | undefined;
  if (input.defaultBaseDirectory) {
    defaultBaseToken = randomUUID();
    baseDirectoriesByToken.set(defaultBaseToken, input.defaultBaseDirectory);
  }
  const chapterBaseTokens: Record<string, string> = {};
  for (const [chapterPath, baseDirectory] of Object.entries(input.chapterBaseDirectories ?? {})) {
    if (!baseDirectory) continue;
    const baseToken = randomUUID();
    chapterBaseTokens[chapterPath] = baseToken;
    baseDirectoriesByToken.set(baseToken, baseDirectory);
  }
  if (baseDirectoriesByToken.size === 0) return undefined;

  const imageScope = validatePageViewerImageScope({
    scopeId,
    ...(defaultBaseToken === undefined ? {} : { defaultBaseToken }),
    ...(Object.keys(chapterBaseTokens).length === 0 ? {} : { chapterBaseTokens }),
  });
  if (!imageScope) return undefined;
  pageViewerImageScopesById.set(scopeId, { baseDirectoriesByToken });
  return imageScope;
}

function storePageViewerSnapshot(
  payloadId: string,
  request: PageViewerSnapshotRequest,
  imageScopeInput: Parameters<typeof createPageViewerImageScope>[0],
): void {
  const imageScope = createPageViewerImageScope(imageScopeInput);
  pageViewerSnapshotsByPayloadId.set(payloadId, {
    ...request,
    payloadId,
    ...(imageScope === undefined ? {} : { imageScope }),
  });
}

function deletePageViewerSnapshot(payloadId: string): void {
  const snapshot = pageViewerSnapshotsByPayloadId.get(payloadId);
  if (snapshot?.imageScope) {
    pageViewerImageScopesById.delete(snapshot.imageScope.scopeId);
  }
  pageViewerSnapshotsByPayloadId.delete(payloadId);
}

function resolvePageViewerImageBaseDirectory(scopeId: string | null, baseToken: string | null): string | null {
  if (!scopeId || !baseToken) return null;
  return pageViewerImageScopesById.get(scopeId)?.baseDirectoriesByToken.get(baseToken) ?? null;
}

// --- SEC-1 / SEC-2: permission boundary state ---
// Workspace root as a realpath-resolved absolute path (set when user opens a folder).
let activeWorkspaceRoot: string | null = null;
/** E2E only: one-shot override for the next `dialog:openPath` call (avoids native picker). */
let e2eQueuedOpenPathResult: { kind: "file" | "directory"; path: string } | null = null;
/** 書庫新規作成用: main 側で選択した親フォルダ (renderer へは渡さない)。 */
let pendingLibraryCreateParentPath: string | null = null;
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

  // APP-WINDOW-BOUNDS-RESTORE1: 前回終了時の通常 bounds / 最大化状態を復元し、
  // 起動先 display の work area 内へ収まる bounds を BrowserWindow 生成前に確定する。
  const startupWindowBounds = resolveStartupWindowBounds({
    saved: readPersistedWindowState(),
    displays: readDisplayWorkAreas(),
  });

  const currentWindow = new BrowserWindow({
    x: startupWindowBounds.bounds.x,
    y: startupWindowBounds.bounds.y,
    width: startupWindowBounds.bounds.width,
    height: startupWindowBounds.bounds.height,
    minWidth: startupWindowBounds.minimumSize.width,
    minHeight: startupWindowBounds.minimumSize.height,
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
    // production / 通常 development は `show: true` + `#f4f1e7`（従来と同一）。
    // E2E-UX1b: E2E visible は `show: true` のまま初期背景だけ暗色 `#22252c`。
    // parked な E2E background mode だけが native 表示しない
    // （`paintWhenInitiallyHidden` は既定の true を維持）。
    show: windowPresentationPolicy.show,
    backgroundColor: windowPresentationPolicy.backgroundColor,
    title: APP_DISPLAY_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // APP-WINDOW-BOUNDS-RESTORE1-WIN-FRAME1: On Windows at fractional display
  // scaling, Electron can expand the initial hidden-titlebar outer height after
  // construction (for example 900 -> 905 DIP). The resolved values are outer
  // window bounds, not content bounds, so re-apply them synchronously before
  // publishing the window or capturing runtime state.
  if (process.platform === "win32") {
    applyWindowsStartupOuterBounds(currentWindow, startupWindowBounds.bounds);
    currentWindow.once("ready-to-show", () => {
      if (!currentWindow.isDestroyed()) {
        applyWindowsStartupOuterBounds(currentWindow, startupWindowBounds.bounds);
      }
    });
  }
  win = currentWindow;
  const webContentsId = currentWindow.webContents.id;
  dirtyStateByWebContentsId.set(webContentsId, false);

  // APP-WINDOW-BOUNDS-RESTORE1: 通常 bounds を先に in-memory 正本へ入れてから
  // （必要なら）最大化する。最大化中も通常 bounds を失わない。
  mainWindowRuntimeState = {
    normalBounds: { ...startupWindowBounds.bounds },
    maximized: false,
  };
  mainWindowStateDirty = true;
  if (startupWindowBounds.maximized) {
    // 生成直後・load 前に行うことで、通常サイズが一瞬見えてから最大化する
    // ちらつきを避ける。show / focus / E2E presentation policy は変更しない。
    currentWindow.maximize();
  }
  const captureWindowGeometry = () => captureMainWindowRuntimeState(currentWindow);
  currentWindow.on("resize", captureWindowGeometry);
  currentWindow.on("move", captureWindowGeometry);
  currentWindow.on("maximize", captureWindowGeometry);
  currentWindow.on("unmaximize", captureWindowGeometry);
  currentWindow.on("restore", captureWindowGeometry);

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
    // APP-WINDOW-BOUNDS-RESTORE1: dialog へ入る前に最新の通常 bounds を確保する。
    // disk write は実 close（`closed`）/ quit 境界まで行わないので、ここで
    // 「キャンセル」を選ばれても終了成功として扱うことはない。
    captureMainWindowRuntimeState(currentWindow);
    const windowId = currentWindow.id;
    if (forceCloseWindowIds.has(windowId)) {
      forceCloseWindowIds.delete(windowId);
      return;
    }

    const isDirty = dirtyStateByWebContentsId.get(webContentsId);
    if (!isDirty) {
      // 明示 quit はここで中断しない（Electron が quit sequence を続行する）。
      return;
    }

    // APP-MAC-DIRTY-QUIT-CONTINUATION1: dirty guard は必ず quit sequence を中止する。
    // どの操作から来た close なのかを、ここで一度だけ確定させる。
    event.preventDefault();

    if (dirtyCloseDialogWindowIds.has(windowId)) {
      // 既に dirty dialog が開いている。2 枚目を開かず、この close で新たに
      // 立った quit attempt も破棄して stale intent を残さない
      // （進行中 dialog は自分が確定した intent のまま結論を出す）。
      const reentrantAttemptId = currentQuitAttemptId(appQuitIntent);
      if (reentrantAttemptId !== null && isExplicitQuitAttempt(appQuitIntent)) {
        dispatchAppQuitIntent({
          type: "attempt-abandoned",
          attemptId: reentrantAttemptId,
        });
      }
      return;
    }

    const explicitQuitRequested = isExplicitQuitAttempt(appQuitIntent);
    const quitAttemptId = explicitQuitRequested
      ? currentQuitAttemptId(appQuitIntent)
      : null;
    const closeIntent = resolveDirtyCloseIntent({
      explicitQuitRequested,
      platform: process.platform,
      otherOpenWindowCount: BrowserWindow.getAllWindows().filter(
        (other) => other !== currentWindow && !other.isDestroyed(),
      ).length,
    });
    const copy = buildDirtyCloseDialogCopy(closeIntent);

    /**
     * cancel / 保存失敗 / Save As キャンセル / conflict キャンセル / dialog 失敗の
     * 共通後始末。既に resume が受理されている attempt は取り消さない
     * （`app.quit()` が進行中で、window close も latch 済みのため）。
     */
    const abandonQuitAttempt = () => {
      if (quitAttemptId === null) return;
      if (isQuitResumingAttempt(appQuitIntent, quitAttemptId)) return;
      dispatchAppQuitIntent({ type: "attempt-abandoned", attemptId: quitAttemptId });
    };

    dirtyCloseDialogWindowIds.add(windowId);
    dialog
      .showMessageBox(currentWindow, {
        type: "warning",
        buttons: [...copy.buttons],
        defaultId: copy.defaultId,
        cancelId: copy.cancelId,
        title: copy.title,
        message: copy.message,
        detail: copy.detail,
      })
      .then(async (result) => {
        if (currentWindow.isDestroyed()) {
          abandonQuitAttempt();
          return;
        }
        if (result.response === DIRTY_CLOSE_DIALOG_BUTTON_INDEX.cancel) {
          abandonQuitAttempt();
          return;
        }
        if (result.response === DIRTY_CLOSE_DIALOG_BUTTON_INDEX.save) {
          const saved = await requestSaveBeforeClose(currentWindow);
          if (currentWindow.isDestroyed()) {
            abandonQuitAttempt();
            return;
          }
          if (!saved) {
            // 保存失敗 / Save As キャンセル / conflict キャンセル。quit は再開しない。
            abandonQuitAttempt();
            return;
          }
        } else {
          // STICKY-NOTE-DISCARD-CONSISTENCY1: 明示的な破棄。未保存 anchor に対応する
          // provisional 付箋を取り除いてからでないと close / quit を完了させない。
          const cleaned = await requestDiscardBeforeClose(currentWindow);
          if (currentWindow.isDestroyed()) {
            abandonQuitAttempt();
            return;
          }
          if (!cleaned) {
            abandonQuitAttempt();
            return;
          }
        }
        if (quitAttemptId !== null) {
          // 明示 quit だけ、保存成功または明示破棄のあとに app quit を再開する。
          // ただし dialog 待機中の再入 close などでこの attempt が既に失効して
          // いることがある。reducer が resume を受理したことを確認できたときだけ
          // force-close latch と `app.quit()` を実行し、失効 / 別 attempt では
          // window を閉じず quit も再開しない（原稿と window はそのまま残す）。
          dispatchAppQuitIntent({ type: "resume-quit", attemptId: quitAttemptId });
          if (!isQuitResumingAttempt(appQuitIntent, quitAttemptId)) return;
          // window close は `app.quit()` が行い、force latch が dirty guard を通す
          // ので、同じ dialog / save request が二重に始まることはない。
          forceCloseWindowIds.add(windowId);
          app.quit();
          return;
        }
        forceCloseWindowIds.add(windowId);
        currentWindow.close();
      })
      .catch((error: unknown) => {
        // dialog / 保存要求が失敗した場合は fail-closed。window も dirty 内容も
        // 保持し、quit intent を残さない（次の通常 close を明示 quit と誤認しない）。
        abandonQuitAttempt();
        console.warn(
          "[Nyoze] dirty close dialog failed:",
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        dirtyCloseDialogWindowIds.delete(windowId);
      });
  });

  currentWindow.on("closed", () => {
    dirtyStateByWebContentsId.delete(webContentsId);
    forceCloseWindowIds.delete(currentWindow.id);
    dirtyCloseDialogWindowIds.delete(currentWindow.id);
    if (win === currentWindow) {
      win = null;
    }
    // 実 close 到達時にだけ永続化する（force-close 経路も同じここを通る）。
    persistMainWindowState();
  });
}

/** Light Page Viewer: build the loadURL target for a viewer window (dev + prod). */
function buildPageViewerWindowUrl(payloadId: string): string {
  const query = buildPageViewerWindowQueryString(payloadId);
  if (VITE_DEV_SERVER_URL) {
    return `${VITE_DEV_SERVER_URL}?${query}`;
  }
  return `${pathToFileURL(path.join(RENDERER_DIST, "index.html")).href}?${query}`;
}

/** Page Viewer の初回/reuse navigation を同じ rejection policy で開始する。 */
function loadPageViewerWindowUrl(
  viewerWindow: InstanceType<typeof BrowserWindow>,
  targetUrl: string,
): void {
  void viewerWindow.loadURL(targetUrl).catch((error: unknown) => {
    // A newer open request intentionally interrupts the prior navigation.
    // Closing the viewer during navigation has the same benign rejection.
    if (viewerWindow.isDestroyed()) return;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ERR_ABORTED")) return;
    console.warn("[Nyoze] failed to load page viewer window:", error);
  });
}

/**
 * Light Page Viewer: create a read-only viewer window for a stored snapshot
 * payload. Never assigned to `win`, never registered in
 * `dirtyStateByWebContentsId` — so its close never triggers the
 * save-before-close dialog, and it never affects the main window's dirty
 * state. Keeps the same security posture as the main window (SEC-3/SEC-4).
 */
function createPageViewerWindow(
  payloadId: string,
): InstanceType<typeof BrowserWindow> {
  const targetUrl = buildPageViewerWindowUrl(payloadId);
  const existingWindow = pageViewerWindow;
  if (existingWindow && !existingWindow.isDestroyed()) {
    const previousPayloadId = pageViewerWindowPayloadId;
    pageViewerWindowPayloadId = payloadId;
    if (previousPayloadId && previousPayloadId !== payloadId) {
      deletePageViewerSnapshot(previousPayloadId);
    }
    loadPageViewerWindowUrl(existingWindow, targetUrl);
    // E2E-UX1: background mode では OS focus を要求しないため、reuse 時の
    // restore / show / focus を行わない。production / 通常 development /
    // E2E visible mode では従来どおり前面化する。
    if (windowPresentationPolicy.allowReuseActivation) {
      if (existingWindow.isMinimized()) existingWindow.restore();
      existingWindow.show();
      existingWindow.focus();
    }
    return existingWindow;
  }

  // PV-COL-15: main window (`createWindow()` 上部) と同じ hidden-titlebar
  // 統合を、Page Viewer 自身の compact header (`--pv-header-height` = 32px)
  // 向けに全 platform で揃える。
  // - macOS: `titleBarStyle: "hidden"` + `trafficLightPosition`。main window
  //   は 36px topbar に対して `{ x: 14, y: 10 }` を使っているため、32px の
  //   compact header でも同じ視覚バランスになるよう y だけ比率で縮小する
  //   (10 * 32/36 ≈ 8.9 → 9)。x は据え置き (メインと同じ左端インセット)。
  // - Windows/Linux: 既存どおり `titleBarOverlay`。
  const isMac = process.platform === "darwin";
  const viewerUsesOverlayNativeControls =
    process.platform === "win32" || process.platform === "linux";

  const viewerWindow = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 480,
    minHeight: 480,
    // E2E-UX1 / UX1b: main window と同じ policy（show + 初期背景）を
    // Page Viewer にも適用する。
    show: windowPresentationPolicy.show,
    backgroundColor: windowPresentationPolicy.backgroundColor,
    title: APP_DISPLAY_NAME,
    ...(isMac
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 14, y: 9 },
        }
      : viewerUsesOverlayNativeControls
        ? {
            titleBarStyle: "hidden" as const,
            titleBarOverlay: {
              color: "#00000000",
              symbolColor: "#8a90a0",
              height: 32,
            },
          }
        : {}),
    // Windows の main window は app menu を保つ。Page Viewer だけは読み取り
    // surface に不要な menu bar を常時隠す。
    ...(process.platform === "win32" ? { autoHideMenuBar: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  pageViewerWindow = viewerWindow;
  pageViewerWindowPayloadId = payloadId;
  if (process.platform === "win32") {
    viewerWindow.setMenuBarVisibility(false);
  }
  loadPageViewerWindowUrl(viewerWindow, targetUrl);

  // SEC-3: same navigation / window-open restrictions as the main window.
  viewerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  viewerWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationUrl(url, VITE_DEV_SERVER_URL, targetUrl)) {
      event.preventDefault();
      console.warn("[Nyoze] SEC-3: blocked navigation in page viewer window:", url);
    }
  });

  viewerWindow.on("closed", () => {
    if (pageViewerWindow !== viewerWindow) return;
    if (pageViewerWindowPayloadId) {
      deletePageViewerSnapshot(pageViewerWindowPayloadId);
    }
    pageViewerWindow = null;
    pageViewerWindowPayloadId = null;
  });

  return viewerWindow;
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
    const opened = await openTrustedDirectoryInFileManager(backupsRootPath);
    if (opened) return true;
    await showBackupFolderOpenFailureDialog(targetWindow, "");
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

/** Open a trusted directory in the OS file manager (Finder / Explorer 等). */
async function openTrustedDirectoryInFileManager(dirPath: string): Promise<boolean> {
  const openError = await shell.openPath(dirPath);
  if (!openError) return true;
  // SEC-8: openError may contain absolute paths from the OS; log only a generic notice.
  console.warn("[Nyoze] failed to open directory in file manager (shell.openPath returned error)");
  return false;
}

function updateFileBackupMenuItemEnabled(enabled: boolean): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById("open-file-backup");
  if (item) item.enabled = enabled;
}

function updateBookExportMenuItemsEnabled(enabled: boolean): void {
  bookExportMenuAvailable = enabled;
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  for (const id of BOOK_EXPORT_MENU_ITEM_IDS) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  }
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

/**
 * renderer へ close 前の処理を 1 回だけ依頼し、その結果を待つ共通実装。
 *
 * save-before-close と、STICKY-NOTE-DISCARD-CONSISTENCY1 の discard cleanup が
 * 同じ pending map / seq / timeout を共有する（第二の handshake 機構を作らない）。
 * 応答なし・送信失敗は false（fail-closed）で、close / quit を成功扱いにしない。
 */
function requestRendererBeforeClose(
  targetWindow: InstanceType<typeof BrowserWindow>,
  channel: "app:requestSaveBeforeClose" | "app:requestDiscardBeforeClose",
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
      targetWindow.webContents.send(channel, { requestId });
    } catch {
      pendingSaveBeforeCloseRequests.delete(requestId);
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

function requestSaveBeforeClose(
  targetWindow: InstanceType<typeof BrowserWindow>,
): Promise<boolean> {
  return requestRendererBeforeClose(targetWindow, "app:requestSaveBeforeClose");
}

/**
 * STICKY-NOTE-DISCARD-CONSISTENCY1: 明示的な破棄で close / quit する前に、
 * 未保存 anchor に対応する provisional 付箋の cleanup を renderer へ依頼する。
 * false（失敗 / 未応答）なら window も process も閉じない。
 */
function requestDiscardBeforeClose(
  targetWindow: InstanceType<typeof BrowserWindow>,
): Promise<boolean> {
  return requestRendererBeforeClose(targetWindow, "app:requestDiscardBeforeClose");
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
    updateBookExportMenuItemsEnabled(false);
    return;
  }
  activeDocumentDir =
    resolveActiveDocumentDir(filePath, activeWorkspaceRoot, allowedDocumentPaths) ??
    undefined;
  activeDocumentFilePath = filePath;
  updateFileBackupMenuItemEnabled(true);
  updateBookExportMenuItemsEnabled(false);
});

ipcMain.on("menu:setBookExportAvailable", (_event, rawAvailable: unknown): void => {
  updateBookExportMenuItemsEnabled(rawAvailable === true);
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

// --- Light Page Viewer: independent read-only snapshot viewer window ---
//
// The renderer never receives PMNode / PageViewModel over IPC — only a
// serializable Markdown snapshot (`PageViewerSnapshotRequest`). The viewer
// window parses it back into a PageModel itself (`PageViewerWindowRoot.tsx`).

ipcMain.handle(
  "pageViewer:openSnapshot",
  (_event, rawPayload: unknown): { ok: true; payloadId: string } | { ok: false } => {
    const request = validatePageViewerSnapshotRequest(rawPayload);
    if (!request) return { ok: false };

    const payloadId = randomUUID();
    storePageViewerSnapshot(payloadId, request, { defaultBaseDirectory: activeDocumentDir });
    createPageViewerWindow(payloadId);
    return { ok: true, payloadId };
  },
);

ipcMain.handle(
  "pageViewer:getSnapshot",
  (_event, rawPayloadId: unknown): PageViewerSnapshotPayload | null => {
    const payloadId = validatePageViewerPayloadId(rawPayloadId);
    if (!payloadId) return null;
    return pageViewerSnapshotsByPayloadId.get(payloadId) ?? null;
  },
);

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
    if (MAIN_E2E_ENABLED && e2eQueuedOpenPathResult) {
      const queued = e2eQueuedOpenPathResult;
      e2eQueuedOpenPathResult = null;
      try {
        if (queued.kind === "file") {
          await trackDocumentPath(queued.path);
        } else {
          const realRoot = await realpathExisting(queued.path);
          if (realRoot) {
            activeWorkspaceRoot = realRoot;
            persistWorkspaceRoot(realRoot);
          }
        }
        return queued;
      } catch {
        return null;
      }
    }
    const targetWindow = resolveTargetWindow(event);
    // 通常 Load は単独ファイル open 専用にする。フォルダを書庫として使う導線は
    // 書庫管理 (library:registerExisting) 側に寄せ、ここでは directory 選択を出さない。
    // 返り値の型 / directory 分岐は後方互換のため残すが、picker は openFile only。
    const opts: Electron.OpenDialogOptions = {
      properties: ["openFile"],
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

// Read-only: expose the persisted library registry to the renderer so future
// 書庫管理画面 / 切り替え UI can consume it. The renderer cannot mutate the
// registry through this channel — all mutation still flows through the trusted
// folder Load path (`dialog:openFolder` / `dialog:openPath`). The legacy single
// `workspaceRoot` API (`fs:getLastWorkspaceRoot`) is preserved unchanged so the
// existing File Explorer / startup restore path is untouched.
ipcMain.handle(
  "library:getRegistry",
  async (): Promise<LibraryRegistryReadResult> => {
    const raw = readWorkspaceStateRaw();
    return readLibraryRegistryFromPersistedState(raw);
  },
);

// Mutation (registry 内に既に存在する書庫を active に切り替えるだけ): renderer は
// libraryId だけを渡し、rootPath は送らない。main 側で registry から selected root を
// 解決し、dialog 経路と同等に realpath / directory 検証を満たす場合のみ
// workspace-state.json と activeWorkspaceRoot を更新する。書庫の追加 / 新規作成 /
// 登録解除 / 名前変更はこの channel では行わず、`.nyoze` も作らない。
ipcMain.handle(
  "library:setActive",
  async (_event, libraryId: unknown): Promise<LibrarySetActiveResult> => {
    if (typeof libraryId !== "string" || libraryId.length === 0) {
      return { ok: false, error: "unknown-library" };
    }
    const raw = readWorkspaceStateRaw();
    const result = setActiveLibraryById(raw, libraryId, {
      markActiveOpenedAt: new Date().toISOString(),
    });
    if (!result.ok) return { ok: false, error: result.error };

    // selected root を realpath 解決し、存在 + directory を検証する
    // (restorePersistedWorkspaceRoot / dialog:openFolder と同等)。
    const realRoot = await realpathExisting(result.activeRoot);
    if (!realRoot) return { ok: false, error: "not-found" };
    try {
      const stat = await fs.promises.stat(realRoot);
      if (!stat.isDirectory()) return { ok: false, error: "not-found" };
    } catch {
      return { ok: false, error: "not-found" };
    }

    // 永続化: workspaceRoot は registry の stored rootPath (reconcile 整合)、
    // activeWorkspaceRoot は realpath (SEC 境界)。restore と同じ分離。
    try {
      fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
    } catch {
      return { ok: false, error: "write-failed" };
    }
    activeWorkspaceRoot = realRoot;
    return {
      ok: true,
      activeRoot: realRoot,
      activeLibraryId: result.activeLibraryId,
    };
  },
);

// Mutation (既存フォルダを書庫として登録): renderer は引数なしで呼び、folder picker は
// main 側 dialog で開く (renderer から rootPath を渡さない)。選択フォルダを realpath +
// directory 検証し、registry へ追加 (duplicate は既存を active 化) して active 書庫にする。
// `dialog:openFolder` / `dialog:openPath` の Load 挙動は変えず、`.nyoze` も作らない。
ipcMain.handle(
  "library:registerExisting",
  async (event): Promise<LibraryRegisterExistingResult> => {
    // folder picker を main 側で開く (Load の dialog:openFolder とは別 handler)。
    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.OpenDialogOptions = { properties: ["openDirectory"] };
    const dialogResult = targetWindow
      ? await dialog.showOpenDialog(targetWindow, opts)
      : await dialog.showOpenDialog(opts);
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { ok: false, error: "canceled" };
    }
    const selectedPath = dialogResult.filePaths[0];

    // 選択フォルダを realpath 解決 + directory 検証する (dialog:openFolder と同等)。
    const realRoot = await realpathExisting(selectedPath);
    if (!realRoot) return { ok: false, error: "not-found" };
    try {
      const stat = await fs.promises.stat(realRoot);
      if (!stat.isDirectory()) return { ok: false, error: "not-found" };
    } catch {
      return { ok: false, error: "not-found" };
    }

    const raw = readWorkspaceStateRaw();
    const result = registerExistingLibrary(raw, realRoot, {
      markActiveOpenedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      // invalid-root は dialog 経由では起きないが、安全側で not-found へ寄せる。
      return {
        ok: false,
        error: result.error === "limit-reached" ? "limit-reached" : "not-found",
      };
    }

    try {
      fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
    } catch {
      return { ok: false, error: "write-failed" };
    }
    activeWorkspaceRoot = realRoot;
    return {
      ok: true,
      activeRoot: realRoot,
      activeLibraryId: result.activeLibraryId,
      added: result.added,
    };
  },
);

// Mutation (書庫名の変更): renderer は `{ libraryId, name }` だけを渡し、rootPath は
// 送らない。main 側で workspace-state.json を読み、libraryId 一致 entry の name だけ
// 更新して保存する。active 書庫かどうかに関係なく name のみ変更し、workspaceRoot /
// activeWorkspaceRoot / File Explorer dir は変えない。`.nyoze` も作らない。
ipcMain.handle(
  "library:rename",
  async (
    _event,
    payload: unknown,
  ): Promise<LibraryRenameResult> => {
    const libraryId =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).libraryId
        : undefined;
    const name =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).name
        : undefined;
    const raw = readWorkspaceStateRaw();
    const result = renameLibraryById(raw, libraryId, name);
    if (!result.ok) return { ok: false, error: result.error };
    try {
      fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
    } catch {
      return { ok: false, error: "write-failed" };
    }
    // name のみの変更。activeWorkspaceRoot / workspaceRoot は更新しない。
    return { ok: true };
  },
);

// Mutation (書庫の登録解除): renderer は libraryId だけを渡し、rootPath は送らない。
// registry から外すだけで、対象フォルダ / Markdown / Project / `.nyoze` は削除しない。
// active 書庫を解除した場合は次 / 前の行を新 active にし、realpath + directory 検証後に
// workspaceRoot / activeWorkspaceRoot を更新する。非 active 解除では activeWorkspaceRoot は触らない。
// 最後の 1 件は `last-library` で拒否する。
ipcMain.handle(
  "library:unregister",
  async (_event, libraryId: unknown): Promise<LibraryUnregisterResult> => {
    if (typeof libraryId !== "string" || libraryId.length === 0) {
      return { ok: false, error: "unknown-library" };
    }
    const raw = readWorkspaceStateRaw();
    const result = unregisterLibraryById(raw, libraryId);
    if (!result.ok) return { ok: false, error: result.error };

    let activeRootForRenderer: string | null = null
    if (result.activeChanged && result.activeRoot) {
      const realRoot = await realpathExisting(result.activeRoot);
      if (!realRoot) return { ok: false, error: "not-found" };
      try {
        const stat = await fs.promises.stat(realRoot);
        if (!stat.isDirectory()) return { ok: false, error: "not-found" };
      } catch {
        return { ok: false, error: "not-found" };
      }
      try {
        fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
      } catch {
        return { ok: false, error: "write-failed" };
      }
      activeWorkspaceRoot = realRoot;
      activeRootForRenderer = realRoot;
    } else {
      try {
        fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
      } catch {
        return { ok: false, error: "write-failed" };
      }
    }

    return {
      ok: true,
      activeRoot: activeRootForRenderer,
      activeLibraryId: result.activeLibraryId,
      activeChanged: result.activeChanged,
    };
  },
);

// Read-only reveal: renderer は libraryId だけを渡し、rootPath は送らない。main 側で
// workspace-state.json の registry から rootPath を解決し、realpath + directory 検証後に
// OS file manager で開く。state / workspaceRoot / activeWorkspaceRoot は変更しない。
ipcMain.handle(
  "library:reveal",
  async (_event, libraryId: unknown): Promise<LibraryRevealResult> => {
    if (typeof libraryId !== "string" || libraryId.length === 0) {
      return { ok: false, error: "unknown-library" };
    }
    const raw = readWorkspaceStateRaw();
    const result = resolveLibraryRootById(raw, libraryId);
    if (!result.ok) return { ok: false, error: result.error };

    const realRoot = await realpathExisting(result.rootPath);
    if (!realRoot) return { ok: false, error: "not-found" };
    try {
      const stat = await fs.promises.stat(realRoot);
      if (!stat.isDirectory()) return { ok: false, error: "not-found" };
    } catch {
      return { ok: false, error: "not-found" };
    }

    const opened = await openTrustedDirectoryInFileManager(realRoot);
    if (!opened) return { ok: false, error: "reveal-failed" };
    return { ok: true };
  },
);

// Mutation (新規書庫作成): parent 選択は `library:pickCreateParent`、作成は `library:createNew(name)`
// のみ。renderer から parent / 完成 rootPath は渡さない。main 側で parent dialog・mkdir・
// registry 登録・active 化を行う。`.nyoze` は作らない。
ipcMain.handle(
  "library:pickCreateParent",
  async (event): Promise<LibraryPickCreateParentResult> => {
    const raw = readWorkspaceStateRaw();
    if (isLibraryRegistryAtLimit(raw)) {
      return { ok: false, error: "limit-reached" };
    }
    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "書庫を作成する親フォルダを選択",
    };
    const dialogResult = targetWindow
      ? await dialog.showOpenDialog(targetWindow, opts)
      : await dialog.showOpenDialog(opts);
    if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
      return { ok: false, error: "canceled" };
    }
    const selectedPath = dialogResult.filePaths[0];
    const realParent = await realpathExisting(selectedPath);
    if (!realParent) return { ok: false, error: "not-found" };
    try {
      const stat = await fs.promises.stat(realParent);
      if (!stat.isDirectory()) return { ok: false, error: "not-found" };
    } catch {
      return { ok: false, error: "not-found" };
    }
    pendingLibraryCreateParentPath = realParent;
    return { ok: true };
  },
);

ipcMain.handle("library:clearCreateParent", async (): Promise<{ ok: true }> => {
  pendingLibraryCreateParentPath = null;
  return { ok: true };
});

ipcMain.handle(
  "library:createNew",
  async (_event, name: unknown): Promise<LibraryCreateNewResult> => {
    const validated = validateLibraryFolderName(name);
    if (!validated.ok) return { ok: false, error: "invalid-name" };

    if (!pendingLibraryCreateParentPath) {
      return { ok: false, error: "no-parent" };
    }

    const raw = readWorkspaceStateRaw();
    if (isLibraryRegistryAtLimit(raw)) {
      return { ok: false, error: "limit-reached" };
    }

    const realParent = await realpathExisting(pendingLibraryCreateParentPath);
    if (!realParent) return { ok: false, error: "create-failed" };
    try {
      const parentStat = await fs.promises.stat(realParent);
      if (!parentStat.isDirectory()) return { ok: false, error: "create-failed" };
    } catch {
      return { ok: false, error: "create-failed" };
    }

    const targetPath = path.join(realParent, validated.trimmed);
    try {
      await fs.promises.stat(targetPath);
      return { ok: false, error: "already-exists" };
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (code !== "ENOENT") {
        return { ok: false, error: "create-failed" };
      }
    }

    try {
      await fs.promises.mkdir(targetPath);
    } catch {
      return { ok: false, error: "create-failed" };
    }

    const realRoot = await realpathExisting(targetPath);
    if (!realRoot) {
      return { ok: false, error: "create-failed" };
    }
    try {
      const stat = await fs.promises.stat(realRoot);
      if (!stat.isDirectory()) return { ok: false, error: "create-failed" };
    } catch {
      return { ok: false, error: "create-failed" };
    }

    const result = registerNewLibraryEntry(raw, realRoot, validated.trimmed, {
      markActiveOpenedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.error === "limit-reached"
            ? "limit-reached"
            : result.error === "invalid-name"
              ? "invalid-name"
              : "create-failed",
      };
    }

    try {
      fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
    } catch {
      return { ok: false, error: "write-failed" };
    }
    activeWorkspaceRoot = realRoot;
    pendingLibraryCreateParentPath = null;
    return {
      ok: true,
      activeRoot: realRoot,
      activeLibraryId: result.activeLibraryId,
    };
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

// --- Task 3A-2: project / notes IPC (UI 配線は Task 3A-3) ---
// renderer 申告パスは projectIpc.ts 側で realpath + document 境界検査される。
// projectRoot は renderer から受け取らず、main 側で filePath から解決する。
const projectIpcBoundary: ProjectIpcBoundary = {
  getWorkspaceRoot: () => activeWorkspaceRoot,
  isAllowedDocumentPath: (realPath) => allowedDocumentPaths.has(realPath),
};

ipcMain.handle("project:resolveForFile", (_event, filePath: unknown) =>
  resolveProjectForFileIpc(projectIpcBoundary, filePath),
);

ipcMain.handle("project:resolveProjectBooks", (_event, filePath: unknown) =>
  resolveProjectBooksIpc(projectIpcBoundary, filePath),
);

ipcMain.handle("project:resolvePanelContext", (_event, request: unknown) =>
  resolvePanelContextIpc(projectIpcBoundary, request),
);

ipcMain.handle("project:resolveBookFullOutline", (_event, filePath: unknown) =>
  resolveBookFullOutlineIpc(projectIpcBoundary, filePath),
);

ipcMain.handle("project:resolveChapterNeighbors", (_event, filePath: unknown) =>
  resolveChapterNeighborsIpc(projectIpcBoundary, filePath),
);

ipcMain.handle("project:resolveBookExportTarget", (_event, filePath: unknown) =>
  resolveBookExportTargetIpc(projectIpcBoundary, filePath),
);

ipcMain.handle(
  "pageViewer:openBook",
  async (_event, rawFilePath: unknown, rawRequest: unknown): Promise<BookPageViewerIpcResult> => {
    const request = parseBookPageViewerRequest(rawRequest);
    if (!request) {
      return { kind: "validation-failed", errorMessage: "Book Page Viewer の入力が不正です。" };
    }

    const prepared = await runBookPageViewerOperation(projectIpcBoundary, rawFilePath, request);
    if (prepared.kind !== "ok") return prepared;

    const snapshot = validatePageViewerSnapshotRequest(prepared.snapshot);
    if (!snapshot) {
      return { kind: "validation-failed", errorMessage: "Book Page Viewer の snapshot が不正です。" };
    }

    const payloadId = randomUUID();
    storePageViewerSnapshot(payloadId, snapshot, {
      chapterBaseDirectories: prepared.chapterImageBaseDirectories,
    });
    createPageViewerWindow(payloadId);
    return {
      kind: "opened",
      payloadId,
      chapterLoadWarnings: prepared.chapterLoadWarnings,
    };
  },
);

ipcMain.handle("project:detectProjectRoots", (_event, dirPaths: unknown) =>
  detectProjectRootsIpc(projectIpcBoundary, dirPaths),
);

ipcMain.handle("project:listProjects", (_event, filter: unknown) =>
  listProjectsIpc(projectIpcBoundary, filter),
);

ipcMain.handle("project:detectFileRoles", (_event, filePaths: unknown) =>
  detectFileRolesIpc(projectIpcBoundary, filePaths),
);

ipcMain.handle("project:create", (_event, folderPath: unknown, options: unknown) =>
  createProjectIpc(projectIpcBoundary, folderPath, options),
);

ipcMain.handle("project:readNotes", (_event, filePath: unknown) =>
  readNotesIpc(projectIpcBoundary, filePath),
);

ipcMain.handle("project:resolveMissingFileNotes", (_event, filePath: unknown) =>
  resolveMissingFileNotesIpc(projectIpcBoundary, filePath),
);

ipcMain.handle("project:writeNotes", (_event, filePath: unknown, store: unknown) =>
  writeNotesIpc(projectIpcBoundary, filePath, store),
);
// STICKY-NOTE-DISCARD-CONSISTENCY1: 明示的な破棄時の provisional note cleanup。
// project root は renderer 申告値ではなく document path から main が再解決する。
ipcMain.handle(
  "project:discardProvisionalNotes",
  (_event, filePath: unknown, request: unknown) =>
    discardProvisionalNotesIpc(projectIpcBoundary, filePath, request),
);
ipcMain.handle("project:updateTitle", (_event, filePath: unknown, title: unknown) =>
  updateProjectTitleIpc(projectIpcBoundary, filePath, title),
);
ipcMain.handle("project:unregister", (_event, filePath: unknown) =>
  unregisterProjectIpc(projectIpcBoundary, filePath),
);
ipcMain.handle("project:updateBookManifestV3", (_event, filePath: unknown, operation: unknown) =>
  updateBookManifestV3Ipc(projectIpcBoundary, filePath, operation),
);
// File Explorer 単一ファイル rename / move の統合 transfer。物理移動と books.json v3 / 付箋データの
// 追従を main 側で整合更新する。renderer は source / destination / kind / overwrite だけを渡す。
ipcMain.handle("project:transferExplorerEntry", (_event, request: unknown) =>
  runExplorerTransferOperation(projectIpcBoundary, request, { createBackupBeforeOverwrite }),
);
// フォルダ rename / move 前の安全ガード。配下に v3 登録済み path / 非 deleted 付箋があれば blocked。
ipcMain.handle("project:checkFolderTransferGuard", (_event, folderPath: unknown) =>
  checkExplorerFolderTransferGuard(projectIpcBoundary, folderPath),
);

ipcMain.handle("project:resolveUnregisteredFilesV3", (_event, filePathOrAnchor: unknown) =>
  resolveUnregisteredFilesV3Ipc(projectIpcBoundary, filePathOrAnchor),
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

/**
 * E2E 有効判定の唯一の正本を renderer へ同期で渡す。
 *
 * preload は sandbox 実行のため `app.isPackaged` を自分では判定できない。
 * この channel だけが `MAIN_E2E_ENABLED`（= `NYOZE_E2E` かつ非 packaged）を返し、
 * preload は false のとき `nyozeBridge.e2e` を expose しない。結果として
 * packaged build では `window.__NYOZE_E2E__` そのものが構築されず、
 * IME latency probe を含むすべての診断入口が存在しなくなる。
 *
 * 同期 IPC なのは、preload の bridge 構築（= renderer script 実行前）に
 * 判定を確定させる必要があるため。返す値は boolean 1 個だけ。
 */
ipcMain.on("e2e:isEnabled", (event) => {
  event.returnValue = MAIN_E2E_ENABLED;
});

/**
 * E2E-UX1b: 初回 paint 前の theme bootstrap を同期で返す。
 * `MAIN_E2E_ENABLED` が false なら `resolveE2eThemeBootstrap()` が常に `null` を
 * 返すため、packaged / 通常 development では値そのものが存在しない。
 * 返すのは検証済み theme enum 2 つと、3 値そろった `#RRGGBB` の document color
 * だけ。任意 settings も本文も path も載せない。
 */
ipcMain.on("e2e:bootstrapTheme", (event) => {
  event.returnValue = MAIN_E2E_ENABLED ? e2eThemeBootstrap : null;
});

/**
 * P3-A1a: 作者限定 pilot の availability を renderer へ同期で渡す唯一の正本。
 *
 * `e2e:isEnabled` と同じ理由で同期 IPC（preload の bridge 構築前に確定させる必要が
 * ある）。返すのは boolean 1 個だけで、任意設定・本文・path は一切載せない。
 * packaged build では `LOCAL_IME_PILOT_AVAILABLE` が必ず false になるため、
 * preload は `nyozeBridge.localImePilot` を expose せず HUD も手動 arm 入口も存在しない。
 */
ipcMain.on(LOCAL_IME_PILOT_AVAILABILITY_CHANNEL, (event) => {
  event.returnValue = LOCAL_IME_PILOT_AVAILABLE;
});

/**
 * PUBLIC-ENTRY1: Local Window Experimentalのread-only capability。
 *
 * 返すのは fixed read-only boolean 1 個だけで、session 操作・本文・path・diagnostics・
 * 任意 payload は載せない。preference は settings.json 側が正本なのでこの channel には現れず、
 * capability だけで自動的に ON にはならない。
 */
ipcMain.on(LOCAL_IME_EXPERIMENTAL_PREVIEW_CAPABILITY_CHANNEL, (event) => {
  event.returnValue = LOCAL_IME_EXPERIMENTAL_PREVIEW_CAPABILITY.capable;
});

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

/** E2E only: register multiple library roots and set the active one (no OS dialogs). */
ipcMain.handle(
  "e2e:establishLibrariesFixture",
  async (
    _event,
    payload: unknown,
  ): Promise<{ ok: true; activeRoot: string } | { ok: false; error: string }> => {
    if (!MAIN_E2E_ENABLED) return { ok: false, error: "e2e-disabled" };
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "invalid-payload" };
    }
    const { libraryRoots, activeRoot } = payload as {
      libraryRoots?: unknown;
      activeRoot?: unknown;
    };
    if (!Array.isArray(libraryRoots) || libraryRoots.length === 0) {
      return { ok: false, error: "invalid-roots" };
    }
    if (typeof activeRoot !== "string" || activeRoot.length === 0) {
      return { ok: false, error: "invalid-active" };
    }

    const resolvedRoots: string[] = [];
    for (const root of libraryRoots) {
      if (typeof root !== "string" || root.length === 0) {
        return { ok: false, error: "invalid-root" };
      }
      const realRoot = await realpathExisting(root);
      if (!realRoot) return { ok: false, error: "not-found" };
      try {
        const stat = await fs.promises.stat(realRoot);
        if (!stat.isDirectory()) return { ok: false, error: "not-directory" };
      } catch {
        return { ok: false, error: "not-found" };
      }
      resolvedRoots.push(realRoot);
    }

    const activeReal = await realpathExisting(activeRoot);
    if (!activeReal || !resolvedRoots.includes(activeReal)) {
      return { ok: false, error: "active-not-in-roots" };
    }

    let raw = readWorkspaceStateRaw();
    const idByRoot = new Map<string, string>();
    for (const realRoot of resolvedRoots) {
      const result = registerExistingLibrary(raw, realRoot, {
        markActiveOpenedAt: new Date().toISOString(),
      });
      if (!result.ok) return { ok: false, error: result.error };
      try {
        fs.writeFileSync(workspaceStatePath, JSON.stringify(result.next), "utf-8");
      } catch {
        return { ok: false, error: "write-failed" };
      }
      raw = result.next;
      const entry = result.next.registeredLibraries.find(
        (lib) => lib.rootPath === realRoot,
      );
      if (entry) idByRoot.set(realRoot, entry.id);
    }

    const activeId = idByRoot.get(activeReal);
    if (!activeId) return { ok: false, error: "active-id-missing" };
    const switchResult = setActiveLibraryById(raw, activeId, {
      markActiveOpenedAt: new Date().toISOString(),
    });
    if (!switchResult.ok) return { ok: false, error: switchResult.error };
    try {
      fs.writeFileSync(workspaceStatePath, JSON.stringify(switchResult.next), "utf-8");
    } catch {
      return { ok: false, error: "write-failed" };
    }
    activeWorkspaceRoot = activeReal;
    return { ok: true, activeRoot: activeReal };
  },
);

/** E2E only: queue the next `dialog:openPath` result (file open without native picker). */
ipcMain.handle(
  "e2e:queueOpenPathResult",
  (
    _event,
    payload: unknown,
  ): { ok: true } | { ok: false; error: string } => {
    if (!MAIN_E2E_ENABLED) return { ok: false, error: "e2e-disabled" };
    if (!payload || typeof payload !== "object") {
      return { ok: false, error: "invalid-payload" };
    }
    const { kind, path: filePath } = payload as { kind?: unknown; path?: unknown };
    if (kind !== "file" && kind !== "directory") {
      return { ok: false, error: "invalid-kind" };
    }
    if (typeof filePath !== "string" || filePath.length === 0) {
      return { ok: false, error: "invalid-path" };
    }
    e2eQueuedOpenPathResult = { kind, path: filePath };
    return { ok: true };
  },
);

/** E2E only: emit the same menu command channel the native File menu uses. */
ipcMain.handle(
  "e2e:dispatchMenuCommand",
  (event, command: unknown): boolean => {
    if (!MAIN_E2E_ENABLED) return false;
    if (typeof command !== "string" || command.length === 0) return false;
    const targetWindow = resolveTargetWindow(event);
    if (!targetWindow) return false;
    sendToRenderer(targetWindow, command);
    return true;
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

ipcMain.handle(
  "dialog:exportAozoraText",
  async (
    event,
    payload: unknown,
  ): Promise<SaveAsResult> => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出し情報が不正です。",
      };
    const payloadObj = payload as Record<string, unknown>;
    const validContent = validateContentArg(payloadObj.text);
    if (validContent === null)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出す内容が不正です。",
      };
    const rawSuggested = payloadObj.suggestedPath;
    const validSuggested =
      rawSuggested === undefined ? undefined : validatePathArg(rawSuggested);
    if (rawSuggested !== undefined && !validSuggested)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出し先の既定パスが不正です。",
      };

    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.SaveDialogOptions = {
      defaultPath: validSuggested ?? undefined,
      filters: [
        { name: "Text", extensions: ["txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const dialogResult = targetWindow
      ? await dialog.showSaveDialog(targetWindow, opts)
      : await dialog.showSaveDialog(opts);
    if (dialogResult.canceled || !dialogResult.filePath)
      return { saved: false, errorKind: "canceled" };

    let backupWarning: string | undefined;
    try {
      await createBackupBeforeOverwrite(dialogResult.filePath);
    } catch (error) {
      backupWarning =
        `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[Nyoze]", backupWarning);
    }

    try {
      await writeAozoraTextExportFile(dialogResult.filePath, validContent);
      return { saved: true, filePath: dialogResult.filePath, backupWarning };
    } catch (error) {
      const { errorKind, errorMessage } = classifySaveError(error);
      return { saved: false, backupWarning, errorKind, errorMessage };
    }
  },
);

ipcMain.handle(
  "dialog:exportLeMEMarkdown",
  async (
    event,
    payload: unknown,
  ): Promise<SaveAsResult> => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出し情報が不正です。",
      };
    const payloadObj = payload as Record<string, unknown>;
    const validContent = validateContentArg(payloadObj.text);
    if (validContent === null)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出す内容が不正です。",
      };
    const rawSuggested = payloadObj.suggestedPath;
    const validSuggested =
      rawSuggested === undefined ? undefined : validatePathArg(rawSuggested);
    if (rawSuggested !== undefined && !validSuggested)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出し先の既定パスが不正です。",
      };

    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.SaveDialogOptions = {
      defaultPath: validSuggested ?? undefined,
      // LeME export v1 は `.md` + HTML 併用出力を標準とする。
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const dialogResult = targetWindow
      ? await dialog.showSaveDialog(targetWindow, opts)
      : await dialog.showSaveDialog(opts);
    if (dialogResult.canceled || !dialogResult.filePath)
      return { saved: false, errorKind: "canceled" };

    let backupWarning: string | undefined;
    try {
      await createBackupBeforeOverwrite(dialogResult.filePath);
    } catch (error) {
      backupWarning =
        `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[Nyoze]", backupWarning);
    }

    try {
      await writeLeMEMarkdownExportFile(dialogResult.filePath, validContent);
      return { saved: true, filePath: dialogResult.filePath, backupWarning };
    } catch (error) {
      const { errorKind, errorMessage } = classifySaveError(error);
      return { saved: false, backupWarning, errorKind, errorMessage };
    }
  },
);

ipcMain.handle(
  "dialog:exportDendenMarkdown",
  async (
    event,
    payload: unknown,
  ): Promise<SaveAsResult> => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload))
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出し情報が不正です。",
      };
    const payloadObj = payload as Record<string, unknown>;
    const validContent = validateContentArg(payloadObj.text);
    if (validContent === null)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出す内容が不正です。",
      };
    const rawSuggested = payloadObj.suggestedPath;
    const validSuggested =
      rawSuggested === undefined ? undefined : validatePathArg(rawSuggested);
    if (rawSuggested !== undefined && !validSuggested)
      return {
        saved: false,
        errorKind: "validation",
        errorMessage: "書き出し先の既定パスが不正です。",
      };

    const targetWindow = resolveTargetWindow(event);
    const opts: Electron.SaveDialogOptions = {
      defaultPath: validSuggested ?? undefined,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const dialogResult = targetWindow
      ? await dialog.showSaveDialog(targetWindow, opts)
      : await dialog.showSaveDialog(opts);
    if (dialogResult.canceled || !dialogResult.filePath)
      return { saved: false, errorKind: "canceled" };

    let backupWarning: string | undefined;
    try {
      await createBackupBeforeOverwrite(dialogResult.filePath);
    } catch (error) {
      backupWarning =
        `pre-save backup failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[Nyoze]", backupWarning);
    }

    try {
      await writeDendenMarkdownExportFile(dialogResult.filePath, validContent);
      return { saved: true, filePath: dialogResult.filePath, backupWarning };
    } catch (error) {
      const { errorKind, errorMessage } = classifySaveError(error);
      return { saved: false, backupWarning, errorKind, errorMessage };
    }
  },
);

/**
 * Web Book は別IPCにし、palette / typography snapshot を
 * main境界でも strict 検証してから既存HTML write/backup経路を再利用する。
 *
 * WB-IMG-1: `text`（完成 HTML 文字列）は受け取らない。renderer は
 * semantic content の template artifact（asset hole 付き）と
 * `WebBookAssetRequest[]` だけを送り、main が `documentPath` の境界内で
 * 画像を検証・読込み・hash 化して data URL へ materialize する
 * （`webBookExportOperation.ts` / `webBookAssetResolution.ts`）。
 */
ipcMain.handle(
  "dialog:exportWebBook",
  async (event, payload: unknown): Promise<WebBookDocumentExportIpcResult> => {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return { saved: false, errorKind: "validation", errorMessage: "Web Book 書き出し情報が不正です。" };
    }
    const payloadObj = payload as Record<string, unknown>;
    const parsed = parseWebBookDocumentExportPayload(payloadObj);
    if (!parsed) {
      return { saved: false, errorKind: "validation", errorMessage: "書き出す内容が不正です。" };
    }
    try {
      normalizeWebBookPaletteSnapshot(payloadObj.authorPaletteSnapshot);
    } catch {
      return { saved: false, errorKind: "validation", errorMessage: "Web Book の配色情報が不正です。" };
    }
    try {
      normalizeWebBookTypographySnapshot(payloadObj.typographySnapshot);
    } catch {
      return { saved: false, errorKind: "validation", errorMessage: "Web Book の見出し表示情報が不正です。" };
    }
    try {
      normalizeWebBookAutoTcySnapshot(payloadObj.autoTcySnapshot);
    } catch {
      return { saved: false, errorKind: "validation", errorMessage: "Web Book の自動TCY情報が不正です。" };
    }

    const targetWindow = resolveTargetWindow(event);
    return runWebBookDocumentExportOperation(
      {
        createBackupBeforeOverwrite,
        showSaveDialog: async (opts) => {
          const dialogResult = targetWindow
            ? await dialog.showSaveDialog(targetWindow, opts)
            : await dialog.showSaveDialog(opts);
          return { canceled: dialogResult.canceled, filePath: dialogResult.filePath };
        },
        showOpenDialog: async (opts) => {
          const dialogResult = targetWindow
            ? await dialog.showOpenDialog(targetWindow, opts)
            : await dialog.showOpenDialog(opts);
          return { canceled: dialogResult.canceled, filePaths: dialogResult.filePaths };
        },
        writeHtmlExportFile,
        classifySaveError,
      },
      projectIpcBoundary,
      parsed,
    );
  },
);

ipcMain.handle(
  "dialog:exportBook",
  async (event, payload: unknown): Promise<BookExportIpcResult> => {
    const parsed = parseBookExportIpcPayload(payload);
    if (!parsed) {
      return { kind: "validation-failed", errorMessage: "Book 書き出し情報が不正です。" };
    }

    const targetWindow = resolveTargetWindow(event);
    return runBookExportOperation(
      {
        createBackupBeforeOverwrite,
        showSaveDialog: async (opts) => {
          const dialogResult = targetWindow
            ? await dialog.showSaveDialog(targetWindow, opts)
            : await dialog.showSaveDialog(opts);
          return {
            canceled: dialogResult.canceled,
            filePath: dialogResult.filePath,
          };
        },
        showOpenDialog: async (opts) => {
          const dialogResult = targetWindow
            ? await dialog.showOpenDialog(targetWindow, opts)
            : await dialog.showOpenDialog(opts);
          return { canceled: dialogResult.canceled, filePaths: dialogResult.filePaths };
        },
      },
      projectIpcBoundary,
      event,
      parsed.filePath,
      parsed.request,
    );
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

/**
 * P2-G1b follow-up: Page Viewer は App を mount せず onMenuCommand も購読しない。
 * focused が viewer のときは renderer channel ではなく webContents の native edit へ委譲する。
 */
function isPageViewerFocusedWindow(
  focusedWindow: Electron.BaseWindow | undefined,
): boolean {
  return Boolean(
    focusedWindow &&
      pageViewerWindow &&
      !pageViewerWindow.isDestroyed() &&
      focusedWindow === pageViewerWindow,
  );
}

function runPageViewerNativeEdit(
  focusedWindow: Electron.BaseWindow | undefined,
  op: "undo" | "redo" | "selectAll",
): void {
  const bw = focusedWindow as InstanceType<typeof BrowserWindow> | undefined;
  const wc = bw?.webContents;
  if (!wc || wc.isDestroyed()) return;
  if (op === "undo") wc.undo();
  else if (op === "redo") wc.redo();
  else wc.selectAll();
}

function sendEditMenuCommandOrPageViewerNative(
  focusedWindow: Electron.BaseWindow | undefined,
  channel: "menu:edit-undo" | "menu:edit-redo" | "menu:edit-select-all",
): void {
  if (!focusedWindow) return;
  if (isPageViewerFocusedWindow(focusedWindow)) {
    const op =
      channel === "menu:edit-undo"
        ? "undo"
        : channel === "menu:edit-redo"
          ? "redo"
          : "selectAll";
    runPageViewerNativeEdit(focusedWindow, op);
    return;
  }
  sendToRenderer(focusedWindow, channel);
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
      // 単独ファイル open。フォルダを書庫にする導線は下の「書庫を管理」へ寄せる。
      label: withEllipsis(t("common.openFile")),
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
    { type: "separator" },
    {
      // 軽量ページビューア: active document の Markdown snapshot を独立
      // BrowserWindow で読み取り専用表示する（メインエディタ編集への live sync なし）。
      label: withEllipsis(t("menu.pageViewer")),
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:page-viewer");
      },
    },
    {
      id: "book-page-viewer",
      label: withEllipsis(t("menu.bookPageViewer")),
      enabled: bookExportMenuAvailable,
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:book-page-viewer");
      },
    },
    {
      label: t("menu.export"),
      submenu: [
        {
          label: withEllipsis(t("menu.exportAozoraText")),
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-aozora-text");
          },
        },
        {
          label: withEllipsis(t("menu.exportLeMEMarkdown")),
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-leme-markdown");
          },
        },
        {
          label: withEllipsis(t("menu.exportDendenMarkdown")),
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-denden-markdown");
          },
        },
        {
          label: withEllipsis(t("menu.exportWebBook")),
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-web-book");
          },
        },
        { type: "separator" },
        {
          id: "export-book-leme",
          label: withEllipsis(t("menu.exportBookLeME")),
          enabled: bookExportMenuAvailable,
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-book-leme");
          },
        },
        {
          id: "export-book-denden",
          label: withEllipsis(t("menu.exportBookDenden")),
          enabled: bookExportMenuAvailable,
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-book-denden");
          },
        },
        {
          id: "export-book-aozora",
          label: withEllipsis(t("menu.exportBookAozora")),
          enabled: bookExportMenuAvailable,
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-book-aozora");
          },
        },
        {
          id: "export-book-web-book",
          label: withEllipsis(t("menu.exportBookWebBook")),
          enabled: bookExportMenuAvailable,
          click: (_item, focusedWindow) => {
            sendToRenderer(focusedWindow, "menu:export-book-web-book");
          },
        },
      ],
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
    { type: "separator" },
    {
      // 書庫管理画面: 登録済み書庫の一覧 / active 切り替え / 登録 / 作成 /
      // 名前変更 / 登録解除 / OS file manager 表示を行う。
      // toolbar の Load 近くではなく File メニュー側に置き、気軽な folder open に
      // 見えないようにする。
      label: withEllipsis(t("library.menuOpen")),
      click: (_item, focusedWindow) => {
        sendToRenderer(focusedWindow, "menu:manage-libraries");
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
        // P2-G1b: Undo / Redo / Select All だけ native role を外し、renderer routing へ送る。
        // role と click を併記しない（Electron では role 指定時に click が無視される）。
        // Copy / Cut / Paste は既存 role のまま（Source Mode / Paragraph Plain / native input
        // の意味論を実測せず一括置換しない）。
        {
          id: "edit-undo",
          label: t("common.undo"),
          accelerator: "CmdOrCtrl+Z",
          click: (_item, focusedWindow) => {
            sendEditMenuCommandOrPageViewerNative(focusedWindow, "menu:edit-undo");
          },
        },
        {
          id: "edit-redo",
          label: t("common.redo"),
          accelerator: "CmdOrCtrl+Shift+Z",
          click: (_item, focusedWindow) => {
            sendEditMenuCommandOrPageViewerNative(focusedWindow, "menu:edit-redo");
          },
        },
        { type: "separator" },
        { label: t("common.cut"), role: "cut" },
        { label: t("common.copy"), role: "copy" },
        { label: t("common.paste"), role: "paste" },
        {
          id: "edit-select-all",
          label: t("common.selectAll"),
          accelerator: "CmdOrCtrl+A",
          click: (_item, focusedWindow) => {
            sendEditMenuCommandOrPageViewerNative(
              focusedWindow,
              "menu:edit-select-all",
            );
          },
        },
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

// APP-MAC-DIRTY-QUIT-CONTINUATION1: 明示 app quit（Cmd+Q / メニュー「終了」/
// `app.quit()`）だけがここを通る。macOS の赤い close button は通らない。
// dirty guard が close を `preventDefault()` すると Electron は quit sequence を
// 中止するので、その attempt の intent をここで覚えておき、保存成功 / 明示破棄の
// あとにだけ `app.quit()` を再開する。
app.on("before-quit", () => {
  dispatchAppQuitIntent({
    type: "quit-requested",
    attemptId: appQuitAttemptSeq++,
  });
});

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
  // Always reconcile the library registry against the trusted workspaceRoot:
  // backfills legacy state files AND repairs broken activeLibraryId, duplicate
  // rootPath, over-limit, or invalid entries on already-migrated state.
  // Idempotent — does not change the restored workspaceRoot above.
  reconcilePersistedLibraryRegistry();

  // --- SEC-5: nyoze-img:// protocol for safe local image serving ---
  // The renderer constructs nyoze-img://img?src=... URLs (no dir — main tracks it).
  // activeDocumentDir is set via IPC before each document load, so main never trusts
  // a renderer-supplied dir parameter (prevents arbitrary-directory image reads).
  protocol.handle("nyoze-img", async (request) => {
    try {
      const url = new URL(request.url);
      const src = url.searchParams.get("src");
      let baseDirectory: string | null = null;
      if (url.hostname === "img") {
        // Existing editor path: use only the main-tracked active document dir.
        baseDirectory = activeDocumentDir ?? null;
      } else if (url.hostname === "viewer") {
        // Page Viewer path: opaque scope/base capability resolves only through
        // the main-side snapshot store. The renderer never supplies a path.
        baseDirectory = resolvePageViewerImageBaseDirectory(
          url.searchParams.get("scope"),
          url.searchParams.get("base"),
        );
      }
      const resolved = await resolveImageProtocolPath(src, baseDirectory);
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
  // APP-WINDOW-BOUNDS-RESTORE1: window を閉じずに quit へ入る経路の保険。
  // 失敗しても quit を止めない（helper 内で握りつぶす）。
  persistMainWindowState();
  pendingSaveBeforeCloseRequests.clear();
  // APP-MAC-DIRTY-QUIT-CONTINUATION1: quit が確定したので intent を残さない。
  dispatchAppQuitIntent({ type: "quit-settled" });
  globalShortcut.unregisterAll();
});
