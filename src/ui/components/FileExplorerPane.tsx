import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ReactNode } from "react";
import {
  IconArchive,
  IconBook,
  IconBook2,
  IconBooks,
  IconChevronRight,
  IconClipboard,
  IconChevronDown,
  IconCopy,
  IconExternalLink,
  IconFileTypeTxt,
  IconFilePlus,
  IconFileSymlink,
  IconFolderPlus,
  IconFolders,
  IconLibrary,
  IconPencil,
  IconScissors,
  IconTrash,
  type Icon,
} from "@tabler/icons-react";
import type { UiLanguageMode } from "../../settings/types";
import { createUiTextGetter, type UiTextKey } from "../i18n/uiText";
import { useFloatingTooltip } from "../hooks/useFloatingTooltip";
import { getPathBaseName } from "../utils/path";
import {
  getExplorerFileIconKind,
  normalizeForCompare,
  type FileExplorerLeftPaneTab,
  type FileExplorerProjectsPaneView,
  type FileExplorerRegistrationApi,
  type FileExplorerVisibleEntry,
} from "../hooks/useFileExplorer";
import type { FileExplorerRole } from "../../project/fileExplorerRoles";
import type { DocumentContextInfo } from "../../project/documentContextRole";
import {
  MATERIALS_DISPLAY_ROLES,
  type ProjectAssetRole,
} from "../../project/projectBooksQuery";
import { ProjectRoleIcon } from "./projectRoleIcons";
import { PaneTablerIcon } from "./PaneTablerIcon";
import { FileExplorerProjectListSection } from "./FileExplorerProjectListSection";
import type { ProjectListUiState } from "../hooks/useProjectList";

/** 「資料として登録」role 選択の i18n ラベルキー（Project タブと同じ表記）。 */
const REGISTER_ROLE_LABEL_KEY: Record<ProjectAssetRole, UiTextKey> = {
  synopsis: "projectPanel.role.synopsis",
  character: "projectPanel.role.character",
  setting: "projectPanel.role.setting",
  material: "projectPanel.role.material",
  unsorted: "projectPanel.role.unsorted",
};

/** role アイコンの tooltip / aria-label に使う i18n キー（表示専用）。 */
const FILE_ROLE_LABEL_KEY: Record<FileExplorerRole, UiTextKey> = {
  body: "explorer.fileRole.body",
  synopsis: "explorer.fileRole.synopsis",
  character: "explorer.fileRole.character",
  setting: "explorer.fileRole.setting",
  material: "explorer.fileRole.material",
  unsorted: "explorer.fileRole.unsorted",
};

/**
 * 左ペイン下部情報の「書庫 / 作品 / 役割」表示文字列を組み立てる（表示専用）。
 * `none` は `-`。資料 role は既存 `projectPanel.role.*` を流用する。
 */
function documentContextLabels(
  t: ReturnType<typeof createUiTextGetter>,
  ctx: DocumentContextInfo,
): { library: string; project: string; role: string } {
  const dash = "-";
  const library =
    ctx.library.kind === "in"
      ? ctx.library.name || dash
      : ctx.library.kind === "external"
        ? t("explorer.docContext.libraryExternal")
        : dash;
  const project =
    ctx.project.kind === "in"
      ? ctx.project.name || dash
      : ctx.project.kind === "out"
        ? t("explorer.docContext.projectNone")
        : dash;
  const role =
    ctx.role.kind === "body"
      ? t("explorer.docContext.roleBody")
      : ctx.role.kind === "material"
        ? t(REGISTER_ROLE_LABEL_KEY[ctx.role.role])
        : ctx.role.kind === "unregistered"
          ? t("explorer.docContext.roleUnregistered")
          : dash;
  return { library, project, role };
}

const EXPLORER_ACTION_ICON_STROKE = 1.9;
const FILE_EXPLORER_TAB_ICON_STROKE = 1.75;

function FileExplorerIconTab({
  icon: IconComponent,
  label,
  active,
  onSelect,
}: {
  icon: Icon;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { anchorProps, tooltip } = useFloatingTooltip(label);
  return (
    <>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={`right-pane-tab right-pane-tab-icon${active ? " active" : ""}`}
        aria-label={label}
        onClick={onSelect}
        {...anchorProps}
      >
        <PaneTablerIcon
          icon={IconComponent}
          size="md"
          stroke={FILE_EXPLORER_TAB_ICON_STROKE}
        />
      </button>
      {tooltip}
    </>
  );
}

/**
 * 左ペイン header の書庫管理 icon-only ボタン。
 * aria-label + floating tooltip（useFloatingTooltip）で library.menuOpen を表示する。
 * native `title` は使わず、右ペイン / 書庫・作品 tab と同じ chip 見た目に揃える。
 */
function FileExplorerLibraryManageButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const { anchorProps, tooltip } = useFloatingTooltip(label);
  return (
    <>
      <button
        type="button"
        className="file-explorer-library-manage-btn"
        onClick={onClick}
        aria-label={label}
        {...anchorProps}
      >
        <PaneTablerIcon icon={IconLibrary} size="md" stroke={1.9} />
      </button>
      {tooltip}
    </>
  );
}

type FileExplorerPaneProps = {
  uiLanguageMode: UiLanguageMode;
  fileExplorerDir: string | null;
  /** 左ペインのタブ（`書庫` / `作品`）。UI 表示専用。 */
  leftPaneTab: FileExplorerLeftPaneTab;
  /** `作品` タブ内の表示状態（list = 一覧 / project-root = drill-down）。 */
  projectsPaneView: FileExplorerProjectsPaneView;
  /** `書庫` タブ: workspace root の通常 Explorer 表示へ戻す。 */
  onSelectLibraryTab: () => void;
  /** `作品` タブ / breadcrumb 戻る: Project 一覧（list）を表示する。 */
  onShowProjectList: () => void;
  explorerProjectListState: ProjectListUiState;
  /** Project 一覧行クリックで表示フォルダを project root へ切り替える。 */
  onOpenProjectRoot: (projectRoot: string) => void;
  rootDirLoaded: boolean;
  /**
   * 書庫が未登録のとき true。`書庫` tab の空状態に onboarding 導線を出す。
   * 検出は App 側で `library:getRegistry` の read-only payload から行い、ここでは表示専用。
   */
  showLibraryOnboarding: boolean;
  /** onboarding ボタンから書庫管理 modal を開く (= setLibraryManagerOpen(true) 相当)。 */
  onOpenLibraryManager: () => void;
  /**
   * 書庫外の保存済み単独ファイルを開いているとき true。`書庫` tab 空状態に
   * 「書庫外のファイル」表示を出す（onboarding より優先）。検出は App 側。
   */
  externalFileActive: boolean;
  /** 書庫外ファイル表示に出す active tab の basename（表示専用）。 */
  externalFileName: string;
  /** 左ペイン下部情報の「書庫 / 作品 / 役割」表示モデル（read-only）。 */
  documentContext: DocumentContextInfo;
  visibleEntries: FileExplorerVisibleEntry[];
  clipboardMode: "cut" | "copy" | null;
  clipboardSourcePath: string | null;
  operationError: string | null;
  activeDocumentInfo: {
    characterCount: number;
    createdAtText: string;
    updatedAtText: string;
    pathText: string;
    pathTitle: string;
    documentTypeLabel: string;
    eolKind: "lf" | "crlf";
    titleText: string;
    authorText: string;
    translatorText: string;
    writingModeLabel: string;
  };
  canPaste: boolean;
  openTabFilePaths: string[];
  activeTabFilePath: string | null;
  onCreateNote: (entry: FileExplorerVisibleEntry | null) => void;
  onCreateFolder: (entry: FileExplorerVisibleEntry | null) => void;
  onCreateProjectForFolder: (entry: FileExplorerVisibleEntry | null) => void;
  registration: FileExplorerRegistrationApi;
  onRenameEntry: (entry: FileExplorerVisibleEntry | null) => void;
  onDeleteEntry: (entry: FileExplorerVisibleEntry | null) => void;
  onRevealInFileManager: (entry: FileExplorerVisibleEntry | null) => void;
  onEntryActivate: (entry: FileExplorerVisibleEntry) => void;
  onEntrySelect: (entry: FileExplorerVisibleEntry) => void;
  onOpenInNewTab: (entry: FileExplorerVisibleEntry) => void;
  tabLimitReached: boolean;
  onCutSelectedFile: () => void;
  onCopySelectedFile: () => void;
  onPasteIntoSelection: () => void;
  onDismissError: () => void;
};

type ExplorerContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  entry: FileExplorerVisibleEntry | null;
};

type ExplorerActionIconButtonProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

const EMPTY_MENU_STATE: ExplorerContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  entry: null,
};

function ExplorerActionIconButton({
  label,
  icon,
  onClick,
  disabled = false,
}: ExplorerActionIconButtonProps) {
  return (
    <div
      className={`file-explorer-icon-action${disabled ? " is-disabled" : ""}`}
    >
      <button
        type="button"
        className="file-explorer-icon-btn"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        {icon}
      </button>
      <span className="file-explorer-action-chip">{label}</span>
    </div>
  );
}

export function FileExplorerPane({
  uiLanguageMode,
  fileExplorerDir,
  leftPaneTab,
  projectsPaneView,
  onSelectLibraryTab,
  onShowProjectList,
  explorerProjectListState,
  onOpenProjectRoot,
  rootDirLoaded,
  showLibraryOnboarding,
  onOpenLibraryManager,
  externalFileActive,
  externalFileName,
  documentContext,
  visibleEntries,
  clipboardMode,
  clipboardSourcePath,
  operationError,
  activeDocumentInfo,
  canPaste,
  openTabFilePaths,
  activeTabFilePath,
  onCreateNote,
  onCreateFolder,
  onCreateProjectForFolder,
  registration,
  onRenameEntry,
  onDeleteEntry,
  onRevealInFileManager,
  onEntryActivate,
  onEntrySelect,
  onOpenInNewTab,
  tabLimitReached,
  onCutSelectedFile,
  onCopySelectedFile,
  onPasteIntoSelection,
  onDismissError,
}: FileExplorerPaneProps) {
  const t = createUiTextGetter(uiLanguageMode);
  // 文字数の桁区切りは UI 言語に合わせる（mixed / en は en-US）。
  const numberLocale = uiLanguageMode === "ja" ? "ja-JP" : "en-US";
  const docContextLabels = documentContextLabels(t, documentContext);
  const [contextMenu, setContextMenu] =
    useState<ExplorerContextMenuState>(EMPTY_MENU_STATE);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [docInfoExpanded, setDocInfoExpanded] = useState(false);
  /** 登録 context menu のインライン submenu 展開状態（Book 一覧 / role 一覧）。 */
  const [registerSubmenu, setRegisterSubmenu] = useState<"book" | "material" | null>(
    null,
  );

  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.selected) ?? null,
    [visibleEntries],
  );
  const openTabFilePathSet = useMemo(
    () => new Set(openTabFilePaths.map(normalizeForCompare)),
    [openTabFilePaths],
  );
  const normalizedActiveTabFilePath = useMemo(
    () => (activeTabFilePath != null ? normalizeForCompare(activeTabFilePath) : null),
    [activeTabFilePath],
  );
  const explorerTitle = fileExplorerDir
    ? getPathBaseName(fileExplorerDir)
    : t("explorer.loadFolder");
  const projectRootBreadcrumbLabel = useMemo(() => {
    if (!fileExplorerDir) return "";
    if (explorerProjectListState.kind === "ready") {
      const normalizedDir = normalizeForCompare(fileExplorerDir);
      const match = explorerProjectListState.projects.find(
        (project) => normalizeForCompare(project.projectRoot) === normalizedDir,
      );
      if (match) return match.title;
    }
    return getPathBaseName(fileExplorerDir);
  }, [explorerProjectListState, fileExplorerDir]);
  const contextTargetEntry = contextMenu.entry;
  const effectiveTargetEntry = contextTargetEntry ?? selectedEntry;
  // 「作品にする」は右クリックしたフォルダ行のみ（ファイル行・空白では出さない）。
  const canContextCreateProject = Boolean(contextTargetEntry?.isDirectory);
  // 既存 project root では disabled（main も already-exists で拒否する）。
  const contextProjectAlreadyExists = Boolean(contextTargetEntry?.isProjectRoot);
  const contextInsideExistingProject = Boolean(contextTargetEntry?.isInsideExistingProject);
  const contextProjectCreateDisabled =
    contextProjectAlreadyExists || contextInsideExistingProject;
  const canContextCutCopy = Boolean(
    effectiveTargetEntry && !effectiveTargetEntry.isDirectory,
  );
  const canContextOpenInNewTab = Boolean(
    effectiveTargetEntry &&
    !effectiveTargetEntry.isDirectory &&
    !tabLimitReached,
  );
  const canContextRename = Boolean(effectiveTargetEntry);
  const canContextDelete = Boolean(effectiveTargetEntry);
  const canContextReveal = Boolean(effectiveTargetEntry);
  // 登録メニューは「右クリックしたファイル」が v3 未登録として解決できたときだけ出す。
  const registrationReady =
    registration.state.kind === "ready" &&
    contextTargetEntry != null &&
    normalizeForCompare(registration.state.filePath) ===
      normalizeForCompare(contextTargetEntry.path)
      ? registration.state
      : null;
  const registrationBooks = registrationReady?.books ?? [];
  const platform = window.nyozeBridge?.platform;
  const revealLabel =
    platform === "darwin"
      ? t("explorer.revealInFinder")
      : platform === "win32"
        ? t("explorer.revealInExplorer")
        : t("explorer.revealInFileManager");

  const closeContextMenu = useCallback(() => {
    setRegisterSubmenu(null);
    registration.onClear();
    setContextMenu((prev) => {
      if (!prev.visible) return prev;
      return EMPTY_MENU_STATE;
    });
  }, [registration]);

  const openContextMenuAt = useCallback(
    (x: number, y: number, entry: FileExplorerVisibleEntry | null) => {
      setContextMenu({ visible: true, x, y, entry });
    },
    [],
  );

  const handleEntryContextMenu = useCallback(
    (
      event: ReactMouseEvent<HTMLButtonElement>,
      entry: FileExplorerVisibleEntry,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      onEntrySelect(entry);
      setRegisterSubmenu(null);
      // 右クリックしたファイルの v3 登録可否を read-only で解決する（folder / 非対象は内部で弾く）。
      registration.onRequest(entry);
      openContextMenuAt(event.clientX, event.clientY, entry);
    },
    [onEntrySelect, openContextMenuAt, registration],
  );

  const handleExplorerContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".file-explorer-tree-item")) return;
      event.preventDefault();
      openContextMenuAt(event.clientX, event.clientY, null);
    },
    [openContextMenuAt],
  );

  useEffect(() => {
    if (!contextMenu.visible) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      closeContextMenu();
    };
    const onScroll = () => closeContextMenu();
    const onResize = () => closeContextMenu();

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [closeContextMenu, contextMenu.visible]);

  useEffect(() => {
    if (!contextMenu.visible) return;
    const menuEl = contextMenuRef.current;
    if (!menuEl) return;

    const rect = menuEl.getBoundingClientRect();
    const nextX = Math.max(
      8,
      Math.min(contextMenu.x, window.innerWidth - rect.width - 8),
    );
    const nextY = Math.max(
      8,
      Math.min(contextMenu.y, window.innerHeight - rect.height - 8),
    );

    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((prev) => ({ ...prev, x: nextX, y: nextY }));
    }
  }, [contextMenu]);

  const handleContextCut = useCallback(() => {
    if (!canContextCutCopy) return;
    if (effectiveTargetEntry) onEntrySelect(effectiveTargetEntry);
    onCutSelectedFile();
    closeContextMenu();
  }, [
    canContextCutCopy,
    closeContextMenu,
    effectiveTargetEntry,
    onCutSelectedFile,
    onEntrySelect,
  ]);

  const handleContextCopy = useCallback(() => {
    if (!canContextCutCopy) return;
    if (effectiveTargetEntry) onEntrySelect(effectiveTargetEntry);
    onCopySelectedFile();
    closeContextMenu();
  }, [
    canContextCutCopy,
    closeContextMenu,
    effectiveTargetEntry,
    onCopySelectedFile,
    onEntrySelect,
  ]);

  const handleContextPaste = useCallback(() => {
    if (!canPaste) return;
    void onPasteIntoSelection();
    closeContextMenu();
  }, [canPaste, closeContextMenu, onPasteIntoSelection]);

  const handleContextCreateNote = useCallback(() => {
    onCreateNote(contextTargetEntry);
    closeContextMenu();
  }, [closeContextMenu, contextTargetEntry, onCreateNote]);

  const handleContextCreateFolder = useCallback(() => {
    onCreateFolder(contextTargetEntry);
    closeContextMenu();
  }, [closeContextMenu, contextTargetEntry, onCreateFolder]);

  const handleContextCreateProject = useCallback(() => {
    if (!canContextCreateProject || contextProjectCreateDisabled) return;
    onCreateProjectForFolder(contextTargetEntry);
    closeContextMenu();
  }, [
    canContextCreateProject,
    contextProjectCreateDisabled,
    closeContextMenu,
    contextTargetEntry,
    onCreateProjectForFolder,
  ]);

  const handleContextRename = useCallback(() => {
    if (!canContextRename) return;
    onRenameEntry(effectiveTargetEntry);
    closeContextMenu();
  }, [canContextRename, closeContextMenu, effectiveTargetEntry, onRenameEntry]);

  const handleContextOpenInNewTab = useCallback(() => {
    if (!canContextOpenInNewTab || !effectiveTargetEntry) return;
    onOpenInNewTab(effectiveTargetEntry);
    closeContextMenu();
  }, [
    canContextOpenInNewTab,
    closeContextMenu,
    effectiveTargetEntry,
    onOpenInNewTab,
  ]);

  const handleContextReveal = useCallback(() => {
    if (!canContextReveal) return;
    onRevealInFileManager(effectiveTargetEntry);
    closeContextMenu();
  }, [
    canContextReveal,
    closeContextMenu,
    effectiveTargetEntry,
    onRevealInFileManager,
  ]);

  const handleContextDelete = useCallback(() => {
    if (!canContextDelete) return;
    onDeleteEntry(effectiveTargetEntry);
    closeContextMenu();
  }, [
    canContextDelete,
    closeContextMenu,
    effectiveTargetEntry,
    onDeleteEntry,
  ]);

  const handleRegisterToBook = useCallback(
    (bookId: string) => {
      registration.onRegisterToBook(bookId);
      closeContextMenu();
    },
    [closeContextMenu, registration],
  );

  const handleRegisterAsMaterial = useCallback(
    (role: ProjectAssetRole) => {
      registration.onRegisterAsMaterial(role);
      closeContextMenu();
    },
    [closeContextMenu, registration],
  );

  return (
    <div className="pane-inner pane-inner-left">
      <div className="pane-header pane-header-file-explorer">
        <FileExplorerLibraryManageButton
          label={t("library.menuOpen")}
          onClick={onOpenLibraryManager}
        />
        <span
          className="file-explorer-header-title"
          title={fileExplorerDir ?? explorerTitle}
        >
          {explorerTitle}
        </span>
        <div className="pane-header-actions file-explorer-actions">
          <ExplorerActionIconButton
            label={t("explorer.newDocument")}
            icon={
              <PaneTablerIcon
                icon={IconFilePlus}
                size="md"
                stroke={EXPLORER_ACTION_ICON_STROKE}
              />
            }
            onClick={() => onCreateNote(null)}
            disabled={!fileExplorerDir || !rootDirLoaded}
          />
          <ExplorerActionIconButton
            label={t("explorer.newFolder")}
            icon={
              <PaneTablerIcon
                icon={IconFolderPlus}
                size="md"
                stroke={EXPLORER_ACTION_ICON_STROKE}
              />
            }
            onClick={() => onCreateFolder(null)}
            disabled={!fileExplorerDir || !rootDirLoaded}
          />
        </div>
      </div>

      <div
        className="file-explorer-tabs"
        role="tablist"
        aria-label={t("explorer.leftPaneTabs")}
      >
        <FileExplorerIconTab
          icon={IconBooks}
          label={t("explorer.tabLibrary")}
          active={leftPaneTab === "library"}
          onSelect={onSelectLibraryTab}
        />
        <FileExplorerIconTab
          icon={IconBook2}
          label={t("explorer.tabProjects")}
          active={leftPaneTab === "projects"}
          onSelect={onShowProjectList}
        />
      </div>

      {/* 作品 > project-root（drill-down）: tab 下の compact breadcrumb。一覧 view へ戻すだけで dir は変えない。 */}
      {leftPaneTab === "projects" && projectsPaneView === "project-root" && (
        <nav
          className="file-explorer-project-breadcrumb"
          aria-label={t("explorer.projectsHeading")}
        >
          <button
            type="button"
            className="file-explorer-project-breadcrumb-back"
            onClick={onShowProjectList}
            title={t("explorer.backToProjectList")}
            aria-label={t("explorer.backToProjectList")}
          >
            <span
              className="file-explorer-project-breadcrumb-back-label"
              aria-hidden="true"
            >
              ← {t("explorer.breadcrumbBackToList")}
            </span>
          </button>
          <span
            className="file-explorer-project-breadcrumb-current"
            title={projectRootBreadcrumbLabel}
          >
            {projectRootBreadcrumbLabel}
          </span>
        </nav>
      )}

      {/* 作品 > list: Project 一覧。 */}
      {leftPaneTab === "projects" && projectsPaneView === "list" && (
        <div className="pane-content file-explorer-projects-tab">
          <FileExplorerProjectListSection
            state={explorerProjectListState}
            onOpenProject={onOpenProjectRoot}
            t={t}
          />
        </div>
      )}

      {/* 書庫 tab（= workspace root）、または 作品 > project-root の drill-down で file tree を出す。 */}
      {(leftPaneTab === "library" ||
        (leftPaneTab === "projects" && projectsPaneView === "project-root")) && (
      <div
        className="pane-content file-explorer"
        onContextMenu={handleExplorerContextMenu}
      >
        {operationError && (
          <div className="file-explorer-error" role="alert">
            <span>{operationError}</span>
            <button
              type="button"
              className="file-explorer-error-dismiss"
              onClick={onDismissError}
              aria-label="エラーを閉じる"
            >
              ×
            </button>
          </div>
        )}

        {/* 書庫外ファイルは tree とは別枠の banner として上部に常時出す
            （書庫 root 表示中でも active tab が書庫外なら表示する）。 */}
        {externalFileActive && (
          <div className="file-explorer-external-file" role="group">
            <p className="file-explorer-external-file-title">
              {t("explorer.externalFile")}
            </p>
            <p
              className="file-explorer-external-file-name"
              title={externalFileName}
            >
              {externalFileName}
            </p>
            <p className="file-explorer-external-file-helper">
              {t("explorer.externalFile", "helper")}
            </p>
            <button
              type="button"
              className="file-explorer-external-file-button"
              onClick={onOpenLibraryManager}
            >
              {t("library.menuOpen")}
            </button>
          </div>
        )}

        {fileExplorerDir ? (
          <>
            {clipboardMode && clipboardSourcePath && (
              <div className="file-explorer-clipboard">
                {clipboardMode.toUpperCase()}:{" "}
                {getPathBaseName(clipboardSourcePath)}
              </div>
            )}

            {visibleEntries.map((entry) => {
              const isCutClipboardSource =
                clipboardMode === "cut" &&
                clipboardSourcePath != null &&
                clipboardSourcePath === entry.path;
              const normalizedEntryPath = normalizeForCompare(entry.path);
              const isOpenInTab =
                !entry.isDirectory && openTabFilePathSet.has(normalizedEntryPath);
              const isActiveTabFile =
                !entry.isDirectory &&
                normalizedActiveTabFilePath != null &&
                normalizedActiveTabFilePath === normalizedEntryPath;
              const fileIconKind = entry.isDirectory
                ? "default"
                : getExplorerFileIconKind(entry.name);
              return (
                <button
                  key={entry.path}
                  className={`file-explorer-tree-item${entry.selected ? " is-selected" : ""}${entry.isDirectory ? " is-dir" : ""}${isCutClipboardSource ? " is-clipboard-source" : ""}${isActiveTabFile ? " is-active-tab-file" : isOpenInTab ? " is-open-in-tab" : ""}`}
                  type="button"
                  onClick={() => {
                    closeContextMenu();
                    onEntryActivate(entry);
                  }}
                  onContextMenu={(event) =>
                    handleEntryContextMenu(event, entry)
                  }
                  title={entry.path}
                >
                  <span
                    className="file-explorer-tree-indent"
                    style={{ width: `${entry.depth * 14}px` }}
                  />
                  <span className="file-explorer-tree-disclosure">
                    {entry.isDirectory ? (
                      entry.expanded ? (
                        "▾"
                      ) : (
                        "▸"
                      )
                    ) : fileIconKind === "text" ? (
                      <PaneTablerIcon
                        icon={IconFileTypeTxt}
                        size="sm"
                        stroke={1.7}
                        className="file-explorer-file-icon file-explorer-file-icon--text"
                      />
                    ) : (
                      "·"
                    )}
                  </span>
                  <span className="file-explorer-tree-name">{entry.name}</span>
                  {entry.isProjectRoot && (
                    <span
                      className="file-explorer-project-badge"
                      title={t("explorer.projectRoot")}
                      aria-label={t("explorer.projectRoot")}
                    >
                      <ProjectRoleIcon role="project" size="xs" />
                    </span>
                  )}
                  {entry.role && (
                    <span
                      className="file-explorer-role-badge"
                      title={t(FILE_ROLE_LABEL_KEY[entry.role])}
                      aria-label={t(FILE_ROLE_LABEL_KEY[entry.role])}
                    >
                      <ProjectRoleIcon role={entry.role} size="xs" />
                    </span>
                  )}
                  {entry.loading && (
                    <span className="file-explorer-tree-loading">…</span>
                  )}
                </button>
              );
            })}

            {visibleEntries.length === 0 && (
              <p className="pane-placeholder">
                {rootDirLoaded ? t("explorer.empty") : t("explorer.loading")}
              </p>
            )}
          </>
        ) : externalFileActive ? (
          // 書庫外 banner を上部に出しているので、空状態側では onboarding /
          // placeholder を重ねて出さない。
          null
        ) : showLibraryOnboarding ? (
          <div className="file-explorer-library-onboarding" role="group">
            <p className="file-explorer-library-onboarding-title">
              {t("explorer.libraryOnboarding")}
            </p>
            <p className="file-explorer-library-onboarding-helper">
              {t("explorer.libraryOnboarding", "helper")}
            </p>
            <button
              type="button"
              className="file-explorer-library-onboarding-button"
              onClick={onOpenLibraryManager}
            >
              {t("explorer.openLibraryManager")}
            </button>
          </div>
        ) : (
          <p className="pane-placeholder">
            {t("explorer.loadFolder", "helper")}
          </p>
        )}
      </div>
      )}

      <section
        className="file-explorer-doc-info-panel"
        aria-label={t("explorer.docInfo.panel")}
      >
        <button
          type="button"
          className="file-explorer-doc-info-summary"
          onClick={() => setDocInfoExpanded((prev) => !prev)}
          aria-expanded={docInfoExpanded}
          aria-controls="file-explorer-doc-info-details"
        >
          <div className="file-explorer-doc-info-summary-main">
            <span className="file-explorer-doc-info-title">
              {t("explorer.docInfo.characters")}
            </span>
            <span className="file-explorer-doc-info-summary-count">
              {activeDocumentInfo.characterCount.toLocaleString(numberLocale)}
            </span>
          </div>
          <IconChevronDown
            size={14}
            stroke={2}
            className={`file-explorer-doc-info-chevron${docInfoExpanded ? "" : " is-expanded"}`}
          />
        </button>
        {docInfoExpanded && (
          <div
            id="file-explorer-doc-info-details"
            className="file-explorer-doc-info-grid"
          >
            {/* 文書 metadata（表示専用。frontmatter / Markdown には書き込まない）。 */}
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.title")}
              </span>
              <span
                className="file-explorer-doc-info-value"
                title={activeDocumentInfo.titleText}
              >
                {activeDocumentInfo.titleText}
              </span>
            </div>
            {activeDocumentInfo.authorText && (
              <div className="file-explorer-doc-info-row">
                <span className="file-explorer-doc-info-label">
                  {t("explorer.docInfo.author")}
                </span>
                <span
                  className="file-explorer-doc-info-value"
                  title={activeDocumentInfo.authorText}
                >
                  {activeDocumentInfo.authorText}
                </span>
              </div>
            )}
            {activeDocumentInfo.translatorText && (
              <div className="file-explorer-doc-info-row">
                <span className="file-explorer-doc-info-label">
                  {t("explorer.docInfo.translator")}
                </span>
                <span
                  className="file-explorer-doc-info-value"
                  title={activeDocumentInfo.translatorText}
                >
                  {activeDocumentInfo.translatorText}
                </span>
              </div>
            )}
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.documentType")}
              </span>
              <span
                className="file-explorer-doc-info-value"
                title={activeDocumentInfo.documentTypeLabel}
              >
                {activeDocumentInfo.documentTypeLabel}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.writingMode")}
              </span>
              <span
                className="file-explorer-doc-info-value"
                title={activeDocumentInfo.writingModeLabel}
              >
                {activeDocumentInfo.writingModeLabel}
              </span>
            </div>
            {/* 所属（書庫 / 作品 / 役割）。 */}
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docContext.library")}
              </span>
              <span
                className="file-explorer-doc-info-value"
                title={docContextLabels.library}
              >
                {docContextLabels.library}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docContext.project")}
              </span>
              <span
                className="file-explorer-doc-info-value"
                title={docContextLabels.project}
              >
                {docContextLabels.project}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docContext.role")}
              </span>
              <span
                className="file-explorer-doc-info-value"
                title={docContextLabels.role}
              >
                {docContextLabels.role}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.created")}
              </span>
              <span className="file-explorer-doc-info-value">
                {activeDocumentInfo.createdAtText}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.updated")}
              </span>
              <span className="file-explorer-doc-info-value">
                {activeDocumentInfo.updatedAtText}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.eol")}
              </span>
              <span className="file-explorer-doc-info-value">
                {activeDocumentInfo.eolKind === "crlf"
                  ? t("explorer.eol.crlf")
                  : t("explorer.eol.lf")}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.path")}
              </span>
              <span
                className="file-explorer-doc-info-value file-explorer-doc-info-path"
                title={activeDocumentInfo.pathTitle}
              >
                {activeDocumentInfo.pathText}
              </span>
            </div>
          </div>
        )}
      </section>

      {contextMenu.visible && (
        <div
          ref={contextMenuRef}
          className="file-explorer-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          aria-label={t("explorer.fileExplorerMenu")}
        >
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextCreateNote}
          >
            <IconFilePlus size={14} stroke={2} />
            {t("explorer.newDocument")}
          </button>
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextCreateFolder}
          >
            <IconFolderPlus size={14} stroke={2} />
            {t("explorer.newFolder")}
          </button>
          {canContextCreateProject && (
            <button
              type="button"
              className="file-explorer-context-menu-item"
              role="menuitem"
              onClick={handleContextCreateProject}
              disabled={contextProjectCreateDisabled}
              title={
                contextProjectAlreadyExists
                  ? t("explorer.createProjectAlreadyExists")
                  : contextInsideExistingProject
                    ? t("explorer.createProjectInsideExisting")
                    : undefined
              }
            >
              <IconFolders size={14} stroke={2} />
              {t("explorer.createProject")}
            </button>
          )}
          {registrationReady && (
            <>
              <div
                className="file-explorer-context-menu-separator"
                role="separator"
              />
              <button
                type="button"
                className="file-explorer-context-menu-item"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={registerSubmenu === "book"}
                onClick={() =>
                  setRegisterSubmenu((prev) => (prev === "book" ? null : "book"))
                }
                disabled={registrationBooks.length === 0}
                title={
                  registrationBooks.length === 0
                    ? t("explorer.registerNoBooks")
                    : undefined
                }
              >
                <IconBook size={14} stroke={2} />
                {t("explorer.registerToBook")}
                <IconChevronRight
                  size={13}
                  stroke={2}
                  className="file-explorer-context-menu-caret"
                />
              </button>
              {registerSubmenu === "book" &&
                registrationBooks.map((book) => (
                  <button
                    key={book.bookId}
                    type="button"
                    className="file-explorer-context-menu-item file-explorer-context-menu-subitem"
                    role="menuitem"
                    onClick={() => handleRegisterToBook(book.bookId)}
                  >
                    {book.name}
                  </button>
                ))}
              <button
                type="button"
                className="file-explorer-context-menu-item"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={registerSubmenu === "material"}
                onClick={() =>
                  setRegisterSubmenu((prev) =>
                    prev === "material" ? null : "material",
                  )
                }
              >
                <IconArchive size={14} stroke={2} />
                {t("explorer.registerAsMaterial")}
                <IconChevronRight
                  size={13}
                  stroke={2}
                  className="file-explorer-context-menu-caret"
                />
              </button>
              {registerSubmenu === "material" &&
                MATERIALS_DISPLAY_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="file-explorer-context-menu-item file-explorer-context-menu-subitem"
                    role="menuitem"
                    onClick={() => handleRegisterAsMaterial(role)}
                  >
                    <ProjectRoleIcon role={role} size="xs" />
                    {t(REGISTER_ROLE_LABEL_KEY[role])}
                  </button>
                ))}
            </>
          )}
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextOpenInNewTab}
            disabled={!canContextOpenInNewTab}
          >
            <IconFileSymlink size={14} stroke={2} />
            {t("common.openInNewTab")}
          </button>
          <div
            className="file-explorer-context-menu-separator"
            role="separator"
          />
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextRename}
            disabled={!canContextRename}
          >
            <IconPencil size={14} stroke={2} />
            {t("common.rename")}
          </button>
          <button
            type="button"
            className="file-explorer-context-menu-item file-explorer-context-menu-item--danger"
            role="menuitem"
            onClick={handleContextDelete}
            disabled={!canContextDelete}
          >
            <IconTrash size={14} stroke={2} />
            {t("common.delete")}
          </button>
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextReveal}
            disabled={!canContextReveal}
          >
            <IconExternalLink size={14} stroke={2} />
            {revealLabel}
          </button>
          <div
            className="file-explorer-context-menu-separator"
            role="separator"
          />
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextCut}
            disabled={!canContextCutCopy}
          >
            <IconScissors size={14} stroke={2} />
            {t("common.cut")}
          </button>
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextCopy}
            disabled={!canContextCutCopy}
          >
            <IconCopy size={14} stroke={2} />
            {t("common.copy")}
          </button>
          <button
            type="button"
            className="file-explorer-context-menu-item"
            role="menuitem"
            onClick={handleContextPaste}
            disabled={!canPaste}
          >
            <IconClipboard size={14} stroke={2} />
            {t("common.paste")}
          </button>
        </div>
      )}
    </div>
  );
}
