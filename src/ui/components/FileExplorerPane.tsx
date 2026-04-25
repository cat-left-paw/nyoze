import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ReactNode } from "react";
import {
  IconClipboard,
  IconChevronDown,
  IconCopy,
  IconExternalLink,
  IconFileTypeTxt,
  IconFilePlus,
  IconFileSymlink,
  IconFolderPlus,
  IconPencil,
  IconScissors,
  IconTrash,
} from "@tabler/icons-react";
import type { UiLanguageMode } from "../../settings/types";
import { createUiTextGetter } from "../i18n/uiText";
import { getPathBaseName } from "../utils/path";
import {
  getExplorerFileIconKind,
  normalizeForCompare,
  type FileExplorerVisibleEntry,
} from "../hooks/useFileExplorer";

type FileExplorerPaneProps = {
  uiLanguageMode: UiLanguageMode;
  fileExplorerDir: string | null;
  rootDirLoaded: boolean;
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
  };
  canPaste: boolean;
  openTabFilePaths: string[];
  activeTabFilePath: string | null;
  onCreateNote: (entry: FileExplorerVisibleEntry | null) => void;
  onCreateFolder: (entry: FileExplorerVisibleEntry | null) => void;
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

const EXPLORER_ACTION_ICON_SIZE = 16;
const EXPLORER_ACTION_ICON_STROKE = 1.9;

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
        title={label}
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
  rootDirLoaded,
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
  const [contextMenu, setContextMenu] =
    useState<ExplorerContextMenuState>(EMPTY_MENU_STATE);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [docInfoExpanded, setDocInfoExpanded] = useState(false);

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
  const contextTargetEntry = contextMenu.entry;
  const effectiveTargetEntry = contextTargetEntry ?? selectedEntry;
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
  const platform = window.nyozeBridge?.platform;
  const revealLabel =
    platform === "darwin"
      ? t("explorer.revealInFinder")
      : platform === "win32"
        ? t("explorer.revealInExplorer")
        : t("explorer.revealInFileManager");

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => {
      if (!prev.visible) return prev;
      return EMPTY_MENU_STATE;
    });
  }, []);

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
      openContextMenuAt(event.clientX, event.clientY, entry);
    },
    [onEntrySelect, openContextMenuAt],
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

  return (
    <div className="pane-inner pane-inner-left">
      <div className="pane-header pane-header-file-explorer">
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
              <IconFilePlus
                size={EXPLORER_ACTION_ICON_SIZE}
                stroke={EXPLORER_ACTION_ICON_STROKE}
              />
            }
            onClick={() => onCreateNote(null)}
            disabled={!fileExplorerDir || !rootDirLoaded}
          />
          <ExplorerActionIconButton
            label={t("explorer.newFolder")}
            icon={
              <IconFolderPlus
                size={EXPLORER_ACTION_ICON_SIZE}
                stroke={EXPLORER_ACTION_ICON_STROKE}
              />
            }
            onClick={() => onCreateFolder(null)}
            disabled={!fileExplorerDir || !rootDirLoaded}
          />
        </div>
      </div>

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

        {fileExplorerDir ? (
          <>
            {clipboardMode && clipboardSourcePath && (
              <div className="file-explorer-clipboard">
                {clipboardMode.toUpperCase()}:{" "}
                {getPathBaseName(clipboardSourcePath)}
              </div>
            )}

            {visibleEntries.map((entry) => {
              const isClipboardSource =
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
                  className={`file-explorer-tree-item${entry.selected ? " is-selected" : ""}${entry.isDirectory ? " is-dir" : ""}${isClipboardSource ? " is-clipboard-source" : ""}${isActiveTabFile ? " is-active-tab-file" : isOpenInTab ? " is-open-in-tab" : ""}`}
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
                      <IconFileTypeTxt
                        size={15}
                        stroke={1.7}
                        className="file-explorer-file-icon file-explorer-file-icon--text"
                      />
                    ) : (
                      "·"
                    )}
                  </span>
                  <span className="file-explorer-tree-name">{entry.name}</span>
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
        ) : (
          <p className="pane-placeholder">
            {t("explorer.loadFolder", "helper")}
          </p>
        )}
      </div>

      <section className="file-explorer-doc-info-panel" aria-label="文書情報">
        <button
          type="button"
          className="file-explorer-doc-info-summary"
          onClick={() => setDocInfoExpanded((prev) => !prev)}
          aria-expanded={docInfoExpanded}
          aria-controls="file-explorer-doc-info-details"
        >
          <div className="file-explorer-doc-info-summary-main">
            <span className="file-explorer-doc-info-title">文字数</span>
            <span className="file-explorer-doc-info-summary-count">
              {activeDocumentInfo.characterCount.toLocaleString("ja-JP")}
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
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">作成</span>
              <span className="file-explorer-doc-info-value">
                {activeDocumentInfo.createdAtText}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">更新</span>
              <span className="file-explorer-doc-info-value">
                {activeDocumentInfo.updatedAtText}
              </span>
            </div>
            <div className="file-explorer-doc-info-row">
              <span className="file-explorer-doc-info-label">
                {t("explorer.docInfo.type")}
              </span>
              <span className="file-explorer-doc-info-value">
                {activeDocumentInfo.documentTypeLabel}
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
              <span className="file-explorer-doc-info-label">パス</span>
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
