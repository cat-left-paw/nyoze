import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { HeadingInfo, LineBreakPolicy } from "../../editor-core/types";
import type { FrontmatterFields } from "../../editor-core/io/frontmatter";
import type {
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  DocumentTheme,
  WritingMode,
} from "../../settings/types";
import { deriveDocThemeTokens } from "../../theme/deriveDocThemeTokens";
import { deriveSyntaxThemeTokens } from "../../theme/deriveSyntaxThemeTokens";
import type { FileExplorerVisibleEntry } from "../hooks/useFileExplorer";
import type { EditorTab } from "../hooks/useAppUiState";
import type { SourceModeController } from "../hooks/useSourceModeController";
import { resolveVisibleOutlineItems } from "../utils/outlineVisibility";
import { FileExplorerPane } from "./FileExplorerPane";
import { FrontmatterView } from "./FrontmatterView";
import { SourceModeEditor } from "./SourceModeEditor";

type RightPaneTab = "outline" | "document" | "theme";
type ActiveDocumentInfo = {
  characterCount: number;
  createdAtText: string;
  updatedAtText: string;
  pathText: string;
  pathTitle: string;
};

type OutlinePreviewMode = "context" | "hover";

type OutlinePreviewState = {
  text: string;
  x: number;
  y: number;
  headingPos: number;
  mode: OutlinePreviewMode;
};

const HOVER_OFFSET_PX = 10;
const HOVER_GAP_ABOVE_POINTER_PX = 2;
const PREVIEW_MAX_WIDTH_PX = 300;

type WorkspaceProps = {
  workspaceRef: RefObject<HTMLElement>;
  editorDivRef: RefObject<HTMLDivElement>;
  sourceModeController: SourceModeController;
  leftPaneOpen: boolean;
  leftWidth: number;
  rightPaneOpen: boolean;
  rightWidth: number;
  fileExplorerDir: string | null;
  fileExplorerRootLoaded: boolean;
  fileExplorerEntries: FileExplorerVisibleEntry[];
  fileExplorerClipboardMode: "cut" | "copy" | null;
  fileExplorerClipboardSourcePath: string | null;
  fileExplorerOperationError: string | null;
  activeDocumentInfo: ActiveDocumentInfo;
  canFileExplorerPaste: boolean;
  tabs: EditorTab[];
  activeTabId: string;
  fullPlainEditActive: boolean;
  fullPlainEditValue: string;
  fullPlainEditError: string;
  rubyVisible: boolean;
  frontmatterVisible: boolean;
  frontmatterShowAuthors: boolean;
  frontmatterShowTranslators: boolean;
  frontmatterShowRoleLabels: boolean;
  writingMode: WritingMode;
  effectiveLineBreakPolicy: LineBreakPolicy;
  editorInlineHintMessage: string | null;
  documentTheme: DocumentTheme;
  docFontPreset: DocumentFontPreset;
  docHeadingFont: DocumentHeadingFont;
  docColorSettings: DocumentColorSettings;
  selectedFont: string | null;
  rightPaneTab: RightPaneTab;
  headings: HeadingInfo[];
  activeHeadingIndex: number;
  foldedHeadingPositions: Set<number>;
  onDividerMouseDown: (side: "left" | "right", e: ReactMouseEvent) => void;
  onFileExplorerCreateNote: (entry: FileExplorerVisibleEntry | null) => void;
  onFileExplorerCreateFolder: (entry: FileExplorerVisibleEntry | null) => void;
  onFileExplorerRenameEntry: (entry: FileExplorerVisibleEntry | null) => void;
  onFileExplorerDeleteEntry: (entry: FileExplorerVisibleEntry | null) => void;
  onFileExplorerRevealInFileManager: (
    entry: FileExplorerVisibleEntry | null,
  ) => void;
  onFileExplorerEntryActivate: (entry: FileExplorerVisibleEntry) => void;
  onFileExplorerEntrySelect: (entry: FileExplorerVisibleEntry) => void;
  onFileExplorerOpenInNewTab: (entry: FileExplorerVisibleEntry) => void;
  onFileExplorerCut: () => void;
  onFileExplorerCopy: () => void;
  onFileExplorerPaste: () => void;
  onDismissFileExplorerError: () => void;
  onSetActiveTab: (tabId: string) => void;
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  tabLimitReached: boolean;
  onFullPlainEditChange: (value: string) => void;
  onApplyFullPlainEdit: () => void;
  onCloseFullPlainEdit: () => void;
  onSetRightPaneTab: (tab: RightPaneTab) => void;
  onToggleHeadingFold: (pos: number) => void;
  onRequestHeadingPreview: (pos: number) => string;
  onScrollToPos: (pos: number) => void;
  frontmatterFields: FrontmatterFields;
  onEmptyUntitledSurfaceClick?: () => void;
  /** BETA-DISP1: resolved caret color string for --editor-caret-color */
  caretColor: string;
  searchBarSlot?: ReactNode;
  documentSettingsSlot?: ReactNode;
  themeStudioSlot?: ReactNode;
};

export function Workspace({
  workspaceRef,
  editorDivRef,
  sourceModeController,
  leftPaneOpen,
  leftWidth,
  rightPaneOpen,
  rightWidth,
  fileExplorerDir,
  fileExplorerRootLoaded,
  fileExplorerEntries,
  fileExplorerClipboardMode,
  fileExplorerClipboardSourcePath,
  fileExplorerOperationError,
  activeDocumentInfo,
  canFileExplorerPaste,
  tabs,
  activeTabId,
  fullPlainEditActive,
  fullPlainEditValue,
  fullPlainEditError,
  rubyVisible,
  frontmatterVisible,
  frontmatterShowAuthors,
  frontmatterShowTranslators,
  frontmatterShowRoleLabels,
  writingMode,
  effectiveLineBreakPolicy,
  editorInlineHintMessage,
  documentTheme,
  docFontPreset,
  docHeadingFont,
  docColorSettings,
  selectedFont,
  rightPaneTab,
  headings,
  activeHeadingIndex,
  foldedHeadingPositions,
  onDividerMouseDown,
  onFileExplorerCreateNote,
  onFileExplorerCreateFolder,
  onFileExplorerRenameEntry,
  onFileExplorerDeleteEntry,
  onFileExplorerRevealInFileManager,
  onFileExplorerEntryActivate,
  onFileExplorerEntrySelect,
  onFileExplorerOpenInNewTab,
  onFileExplorerCut,
  onFileExplorerCopy,
  onFileExplorerPaste,
  onDismissFileExplorerError,
  onSetActiveTab,
  onAddTab,
  onCloseTab,
  tabLimitReached,
  onFullPlainEditChange,
  onApplyFullPlainEdit,
  onCloseFullPlainEdit,
  onSetRightPaneTab,
  onToggleHeadingFold,
  onRequestHeadingPreview,
  onScrollToPos,
  frontmatterFields,
  onEmptyUntitledSurfaceClick,
  caretColor,
  searchBarSlot,
  documentSettingsSlot,
  themeStudioSlot,
}: WorkspaceProps) {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const openTabFilePaths = useMemo(
    () => tabs.map((t) => t.filePath).filter((p): p is string => p != null),
    [tabs],
  );
  const activeTabFilePath = activeTab?.filePath ?? null;
  const docFontFamily = (() => {
    if (docFontPreset === "mincho") return "var(--font-stack-mincho)";
    if (docFontPreset === "gothic") return "var(--font-stack-gothic)";
    if (docFontPreset.startsWith("custom:"))
      return docFontPreset.slice("custom:".length);
    return selectedFont ?? "var(--font-stack-mincho)";
  })();
  const docFontAttr =
    docFontPreset === "mincho" || docFontPreset === "gothic"
      ? docFontPreset
      : "ui-linked";
  const headingFontFamily = (() => {
    if (docHeadingFont === "mincho") return "var(--font-stack-mincho)";
    if (docHeadingFont === "gothic") return "var(--font-stack-gothic)";
    if (docHeadingFont.startsWith("custom:")) {
      return docHeadingFont.slice("custom:".length);
    }
    return docFontFamily;
  })();
  const docThemeTokens = deriveDocThemeTokens({
    pageColor: docColorSettings.pageColor,
    textColor: docColorSettings.textColor,
    headingColor: docColorSettings.headingColor,
  });
  const syntaxThemeTokens = deriveSyntaxThemeTokens({
    pageColor: docColorSettings.pageColor,
    textColor: docColorSettings.textColor,
  });
  const visibleOutlineItems = useMemo(
    () => resolveVisibleOutlineItems(headings, foldedHeadingPositions),
    [headings, foldedHeadingPositions],
  );
  const [outlinePreview, setOutlinePreview] =
    useState<OutlinePreviewState | null>(null);
  const outlinePreviewRef = useRef<HTMLDivElement | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const closeOutlinePreview = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    setOutlinePreview(null);
  }, []);

  const openOutlinePreviewAt = useCallback(
    (
      mode: OutlinePreviewMode,
      headingPos: number,
      text: string,
      x: number,
      y: number,
    ) => {
      const normalized = text.trim();
      if (!normalized) {
        setOutlinePreview(null);
        return;
      }
      setOutlinePreview({ text: normalized, x, y, headingPos, mode });
    },
    [],
  );

  const openOutlineContextPreviewFromEvent = useCallback(
    (pos: number, event: ReactMouseEvent<HTMLElement>) => {
      const text = onRequestHeadingPreview(pos);
      openOutlinePreviewAt(
        "context",
        pos,
        text,
        event.clientX + 8,
        event.clientY + 8,
      );
    },
    [onRequestHeadingPreview, openOutlinePreviewAt],
  );

  const openOutlineHoverPreviewFromEvent = useCallback(
    (pos: number, event: ReactMouseEvent<HTMLElement>) => {
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
      const text = onRequestHeadingPreview(pos);
      const preferredX = event.clientX + HOVER_OFFSET_PX;
      const clampedX = Math.max(
        8,
        Math.min(preferredX, window.innerWidth - PREVIEW_MAX_WIDTH_PX - 8),
      );
      openOutlinePreviewAt(
        "hover",
        pos,
        text,
        clampedX,
        event.clientY + HOVER_OFFSET_PX,
      );
    },
    [onRequestHeadingPreview, openOutlinePreviewAt],
  );

  const scheduleCloseOutlineHoverPreview = useCallback((pos: number) => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setOutlinePreview((current) => {
        if (!current) return current;
        if (current.mode !== "hover") return current;
        if (current.headingPos !== pos) return current;
        return null;
      });
      hoverCloseTimerRef.current = null;
    }, 120);
  }, []);

  const handleOutlineTooltipClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      closeOutlinePreview();
    },
    [closeOutlinePreview],
  );

  const handleOutlineTooltipContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      closeOutlinePreview();
    },
    [closeOutlinePreview],
  );

  const isContextPreviewOpenFor = useCallback(
    (pos: number): boolean =>
      outlinePreview?.mode === "context" && outlinePreview.headingPos === pos,
    [outlinePreview],
  );

  useEffect(() => {
    if (!outlinePreview) return;
    const tooltip = outlinePreviewRef.current;
    if (!tooltip) return;
    const rect = tooltip.getBoundingClientRect();
    let nextX = outlinePreview.x;
    let nextY = outlinePreview.y;

    if (nextX + rect.width > window.innerWidth - 8) {
      nextX = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (nextX < 8) {
      nextX = 8;
    }
    if (nextY + rect.height > window.innerHeight - 8) {
      if (outlinePreview.mode === "hover") {
        // Hover preview should stay near the pointer; flip above with a small pointer gap.
        const pointerY = outlinePreview.y - HOVER_OFFSET_PX;
        nextY = Math.max(
          8,
          pointerY - rect.height - HOVER_GAP_ABOVE_POINTER_PX,
        );
      } else {
        nextY = Math.max(8, window.innerHeight - rect.height - 8);
      }
    }
    if (nextY < 8) {
      nextY = 8;
    }

    if (nextX !== outlinePreview.x || nextY !== outlinePreview.y) {
      setOutlinePreview((current) =>
        current ? { ...current, x: nextX, y: nextY } : current,
      );
    }
  }, [outlinePreview]);

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!outlinePreview) return;
    const onPointerDown = () => closeOutlinePreview();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOutlinePreview();
    };
    const onWindowScroll = () => closeOutlinePreview();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onWindowScroll, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onWindowScroll, true);
    };
  }, [closeOutlinePreview, outlinePreview]);

  return (
    <section ref={workspaceRef} className="workspace">
      <aside
        className={`pane-left${leftPaneOpen ? "" : " collapsed"}`}
        style={{ width: leftPaneOpen ? leftWidth : 0 }}
      >
        <FileExplorerPane
          fileExplorerDir={fileExplorerDir}
          rootDirLoaded={fileExplorerRootLoaded}
          visibleEntries={fileExplorerEntries}
          clipboardMode={fileExplorerClipboardMode}
          clipboardSourcePath={fileExplorerClipboardSourcePath}
          operationError={fileExplorerOperationError}
          activeDocumentInfo={activeDocumentInfo}
          canPaste={canFileExplorerPaste}
          openTabFilePaths={openTabFilePaths}
          activeTabFilePath={activeTabFilePath}
          onCreateNote={onFileExplorerCreateNote}
          onCreateFolder={onFileExplorerCreateFolder}
          onRenameEntry={onFileExplorerRenameEntry}
          onDeleteEntry={onFileExplorerDeleteEntry}
          onRevealInFileManager={onFileExplorerRevealInFileManager}
          onEntryActivate={onFileExplorerEntryActivate}
          onEntrySelect={onFileExplorerEntrySelect}
          onOpenInNewTab={onFileExplorerOpenInNewTab}
          tabLimitReached={tabLimitReached}
          onCutSelectedFile={onFileExplorerCut}
          onCopySelectedFile={onFileExplorerCopy}
          onPasteIntoSelection={onFileExplorerPaste}
          onDismissError={onDismissFileExplorerError}
        />
      </aside>

      {leftPaneOpen && (
        <div
          className="pane-divider"
          onMouseDown={(e) => onDividerMouseDown("left", e)}
        />
      )}

      <div className="pane-center">
        <div className="editor-tab-strip">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`editor-tab${tab.id === activeTab?.id ? " active" : ""}`}
              onClick={() => onSetActiveTab(tab.id)}
              type="button"
            >
              <span className="editor-tab-title">{tab.title}</span>
              {tab.dirty && <span className="editor-tab-dirty">●</span>}
              {tabs.length > 1 && (
                <span
                  className="editor-tab-close"
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="タブを閉じる"
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <button
            className="editor-tab-add"
            type="button"
            onClick={onAddTab}
            disabled={tabLimitReached}
            title={tabLimitReached ? "タブ数の上限に達しています" : "新しいタブ"}
          >
            +
          </button>
        </div>
        <div
          className="editor-panel"
          data-ruby-visible={rubyVisible ? "1" : "0"}
          data-writing-mode={writingMode}
          data-line-break-policy={effectiveLineBreakPolicy}
          data-doc-theme={documentTheme}
          data-doc-font={docFontAttr}
          style={
            {
              ...docThemeTokens,
              ...syntaxThemeTokens,
              "--editor-font-family": docFontFamily,
              "--heading-font-family": headingFontFamily,
              "--source-mode-bg": docColorSettings.pageColor,
              "--source-mode-color": docColorSettings.textColor,
              "--source-mode-font-family":
                '"SF Mono", Menlo, Consolas, monospace',
              "--source-mode-font-size": "var(--editor-font-size)",
              "--source-mode-line-height": "var(--editor-line-height)",
              "--source-mode-padding-top":
                "var(--editor-content-padding-top)",
              "--source-mode-padding-bottom":
                "var(--editor-content-padding-bottom)",
              "--source-mode-padding-inline": "30px",
              "--source-mode-selection-bg": `color-mix(in srgb, ${docColorSettings.headingColor} 24%, ${docColorSettings.pageColor} 76%)`,
              "--editor-caret-color": caretColor,
            } as React.CSSProperties
          }
        >
          {searchBarSlot}
          {editorInlineHintMessage && (
            <div
              className="editor-inline-hint-chip"
              role="status"
              aria-live="polite"
            >
              {editorInlineHintMessage}
            </div>
          )}
          <div
            className={`editor-surface${fullPlainEditActive ? " is-hidden-for-plain" : ""}`}
            onClick={(e) => {
              const t = e.target as Element;
              if (t.closest(".ProseMirror") || t.closest(".frontmatter-view")) return;
              onEmptyUntitledSurfaceClick?.();
            }}
          >
            <FrontmatterView
              fields={frontmatterFields}
              visible={frontmatterVisible}
              showAuthors={frontmatterShowAuthors}
              showTranslators={frontmatterShowTranslators}
              showRoleLabels={frontmatterShowRoleLabels}
            />
            <div ref={editorDivRef} className="editor-core-host" />
          </div>

          {fullPlainEditActive && (
            <>
              <SourceModeEditor
                controller={sourceModeController}
                initialValue={fullPlainEditValue}
                onChange={onFullPlainEditChange}
                onApply={onApplyFullPlainEdit}
                onClose={onCloseFullPlainEdit}
              />
              {fullPlainEditError && (
                <div className="plain-text-error">{fullPlainEditError}</div>
              )}
            </>
          )}
        </div>
      </div>

      {rightPaneOpen && (
        <div
          className="pane-divider"
          onMouseDown={(e) => onDividerMouseDown("right", e)}
        />
      )}

      <aside
        className={`pane-right${rightPaneOpen ? "" : " collapsed"}`}
        style={{ width: rightPaneOpen ? rightWidth : 0 }}
      >
        <div className="pane-inner pane-inner-right">
          <div className="pane-header right-pane-tabs">
            <button
              type="button"
              className={`right-pane-tab${rightPaneTab === "outline" ? " active" : ""}`}
              onClick={() => onSetRightPaneTab("outline")}
            >
              Outline
            </button>
            <button
              type="button"
              className={`right-pane-tab${rightPaneTab === "document" ? " active" : ""}`}
              onClick={() => onSetRightPaneTab("document")}
            >
              Document
            </button>
            <button
              type="button"
              className={`right-pane-tab${rightPaneTab === "theme" ? " active" : ""}`}
              onClick={() => onSetRightPaneTab("theme")}
            >
              Theme
            </button>
          </div>
          {rightPaneTab === "outline" ? (
            <div className="outline-list">
              {headings.length === 0 ? (
                <p className="pane-placeholder">見出しがありません</p>
              ) : (
                visibleOutlineItems.map(({ heading: h, originalIndex }) => {
                  const isFolded = foldedHeadingPositions.has(h.pos);
                  const isActive = originalIndex === activeHeadingIndex;
                  return (
                    <div
                      key={`${h.pos}-${originalIndex}`}
                      className={`outline-row${isActive ? " active" : ""}${isFolded ? " folded" : ""}`}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (isContextPreviewOpenFor(h.pos)) {
                          closeOutlinePreview();
                          return;
                        }
                        openOutlineContextPreviewFromEvent(h.pos, event);
                      }}
                    >
                      <button
                        className={`outline-fold-btn${isFolded ? " folded" : ""}`}
                        type="button"
                        disabled={fullPlainEditActive}
                        onClick={() => onToggleHeadingFold(h.pos)}
                        title={isFolded ? "展開" : "折りたたみ"}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {isFolded ? (
                            <path d="M9 6l6 6l-6 6" />
                          ) : (
                            <path d="M6 9l6 6l6 -6" />
                          )}
                        </svg>
                      </button>
                      <button
                        className={`outline-item outline-level-${h.level}`}
                        type="button"
                        disabled={fullPlainEditActive}
                        onClick={(event) => {
                          event.stopPropagation();
                          closeOutlinePreview();
                          onScrollToPos(h.pos);
                        }}
                        title={h.text}
                      >
                        {h.text || `(H${h.level})`}
                      </button>
                      <button
                        className="outline-preview-btn"
                        type="button"
                        title="見出し内容プレビュー"
                        onMouseEnter={(event) => {
                          event.stopPropagation();
                          openOutlineHoverPreviewFromEvent(h.pos, event);
                        }}
                        onMouseLeave={(event) => {
                          event.stopPropagation();
                          scheduleCloseOutlineHoverPreview(h.pos);
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M8 9h8" />
                          <path d="M8 13h6" />
                          <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : rightPaneTab === "document" ? (
            <div className="document-pane-content">
              {documentSettingsSlot ?? (
                <p className="pane-placeholder">
                  Document Settings を表示できません。
                </p>
              )}
            </div>
          ) : (
            <div className="theme-pane-content">
              {themeStudioSlot ?? (
                <p className="pane-placeholder">テーマ設定を表示できません。</p>
              )}
            </div>
          )}
        </div>
      </aside>
      {outlinePreview && (
        <div
          ref={outlinePreviewRef}
          className={`heading-fold-preview-tooltip${outlinePreview.mode === "context" ? " outline-preview-tooltip" : ""}`}
          style={{
            top: `${outlinePreview.y}px`,
            left: `${outlinePreview.x}px`,
          }}
          onClick={
            outlinePreview.mode === "context"
              ? handleOutlineTooltipClick
              : undefined
          }
          onContextMenu={
            outlinePreview.mode === "context"
              ? handleOutlineTooltipContextMenu
              : undefined
          }
        >
          {outlinePreview.text}
        </div>
      )}
    </section>
  );
}
