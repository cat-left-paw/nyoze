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
  UiLanguageMode,
  WritingMode,
} from "../../settings/types";
import { deriveDocThemeTokens } from "../../theme/deriveDocThemeTokens";
import { deriveSyntaxThemeTokens } from "../../theme/deriveSyntaxThemeTokens";
import type {
  FileExplorerLeftPaneTab,
  FileExplorerProjectsPaneView,
  FileExplorerRegistrationApi,
  FileExplorerVisibleEntry,
} from "../hooks/useFileExplorer";
import type { ProjectListUiState } from "../hooks/useProjectList";
import type { DocumentContextInfo } from "../../project/documentContextRole";
import type { EditorTab } from "../hooks/useAppUiState";
import { createUiTextGetter } from "../i18n/uiText";
import type { SourceModeController } from "../hooks/useSourceModeController";
import type { TypewriterRuntimeRef } from "../hooks/typewriterRuntimeRef";
import { resolveVisibleOutlineItems } from "../utils/outlineVisibility";
import { OutlineModeToggle, type OutlineMode } from "./OutlineModeToggle";
import { FileExplorerPane } from "./FileExplorerPane";
import { FrontmatterView } from "./FrontmatterView";
import type { ProjectDocumentStartDisplay } from "../../project/projectDocumentStartDisplay";
import { ProjectDocumentStartViews } from "./ProjectDocumentStartViews";
import { SourceModeEditor } from "./SourceModeEditor";
import { RightPaneTabBar } from "./RightPaneTabBar";
import type { FileExplorerRole } from "../../project/fileExplorerRoles";
import { EditorTabStrip } from "./EditorTabStrip";

type RightPaneTab = "outline" | "document" | "notes" | "project" | "theme";
type ActiveDocumentInfo = {
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
  uiLanguageMode: UiLanguageMode;
  leftPaneOpen: boolean;
  leftWidth: number;
  rightPaneOpen: boolean;
  rightWidth: number;
  fileExplorerDir: string | null;
  fileExplorerLeftPaneTab: FileExplorerLeftPaneTab; fileExplorerProjectsPaneView: FileExplorerProjectsPaneView;
  onFileExplorerSelectLibraryTab: () => void; onFileExplorerShowProjectList: () => void;
  fileExplorerProjectListState: ProjectListUiState; onFileExplorerOpenProjectRoot: (projectRoot: string) => void;
  fileExplorerShowLibraryOnboarding: boolean; onFileExplorerOpenLibraryManager: () => void;
  fileExplorerExternalFileActive: boolean; fileExplorerExternalFileName: string;
  fileExplorerDocumentContext: DocumentContextInfo;
  fileExplorerRootLoaded: boolean;
  fileExplorerEntries: FileExplorerVisibleEntry[];
  fileExplorerClipboardMode: "cut" | "copy" | null;
  fileExplorerClipboardSourcePath: string | null;
  fileExplorerOperationError: string | null;
  activeDocumentInfo: ActiveDocumentInfo;
  canFileExplorerPaste: boolean;
  tabs: EditorTab[];
  /**
   * `filePath -> FileExplorerRole` の display-only map（`.nyoze/books.json` v3 正本）。
   * タブアイコン表示にだけ使い、`EditorTab` の保存状態には持たせない。
   */
  tabRoles?: ReadonlyMap<string, FileExplorerRole>;
  activeTabId: string;
  fullPlainEditActive: boolean;
  paragraphPlainModeActive: boolean;
  fullPlainEditValue: string;
  fullPlainEditError: string;
  /** Source Mode 起動時、CodeMirror を初期スクロールするドキュメントオフセット。 */
  fullPlainEditInitialScrollOffset: number | null;
  rubyVisible: boolean;
  frontmatterVisible: boolean;
  /** FrontmatterView 用 — Project/standalone の有効値（App.tsx で計算）。 */
  frontmatterShowTitle: boolean;
  /** FrontmatterView 用 — standalone の有効値（App.tsx で計算）。 */
  frontmatterViewShowAuthors: boolean;
  frontmatterShowTranslators: boolean;
  frontmatterShowRoleLabels: boolean;
  projectDocumentStartDisplay: ProjectDocumentStartDisplay;
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
  onFileExplorerCreateProjectForFolder: (entry: FileExplorerVisibleEntry | null) => void;
  fileExplorerRegistration: FileExplorerRegistrationApi;
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
  /** Task 2-4: hide the WYSIWYG native caret when the pseudo caret is enabled. */
  pseudoCaretEnabled: boolean;
  useEditorArrowPointer: boolean;
  /** Live Typewriter + hidden macOS clamp flags for Source Mode (CodeMirror). */
  typewriterRuntimeRef?: TypewriterRuntimeRef;
  searchBarSlot?: ReactNode;
  documentSettingsSlot?: ReactNode;
  notesPaneSlot?: ReactNode;
  projectPaneSlot?: ReactNode;
  /** Outline 拡張: Book全体モードで表示する read-only スロット。 */
  bookOutlineSlot?: ReactNode;
  themeStudioSlot?: ReactNode;
  /** 中央エディタ章境界ナビ（章頭=前章 / 章末=次章）の表示専用オーバーレイ。 */
  chapterBoundaryNavSlot?: ReactNode;
  /**
   * タブ列右端（右ペインが開いていればそのすぐ左側）に固定表示する、非装飾系の
   * エディタアクション（書字方向 / 検索 / ルビ表示 / Paragraph Plain / Source Mode /
   * Typewriter・Visual Focus / Display Settings / Page Viewer）。`null` / `undefined`
   * のときは actions 領域自体を描画しない（toolbar 非表示時など）。
   */
  editorTabActionsSlot?: ReactNode;
};

export function Workspace({
  workspaceRef,
  editorDivRef,
  sourceModeController,
  uiLanguageMode,
  leftPaneOpen,
  leftWidth,
  rightPaneOpen,
  rightWidth,
  fileExplorerDir,
  fileExplorerLeftPaneTab, fileExplorerProjectsPaneView,
  onFileExplorerSelectLibraryTab, onFileExplorerShowProjectList,
  fileExplorerProjectListState, onFileExplorerOpenProjectRoot,
  fileExplorerShowLibraryOnboarding, onFileExplorerOpenLibraryManager,
  fileExplorerExternalFileActive, fileExplorerExternalFileName,
  fileExplorerDocumentContext,
  fileExplorerRootLoaded,
  fileExplorerEntries,
  fileExplorerClipboardMode,
  fileExplorerClipboardSourcePath,
  fileExplorerOperationError,
  activeDocumentInfo,
  canFileExplorerPaste,
  tabs,
  tabRoles,
  activeTabId,
  fullPlainEditActive,
  paragraphPlainModeActive,
  fullPlainEditValue,
  fullPlainEditError,
  fullPlainEditInitialScrollOffset,
  rubyVisible,
  frontmatterVisible,
  frontmatterShowTitle,
  frontmatterViewShowAuthors,
  frontmatterShowTranslators,
  frontmatterShowRoleLabels,
  projectDocumentStartDisplay,
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
  onFileExplorerCreateProjectForFolder,
  fileExplorerRegistration,
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
  pseudoCaretEnabled,
  useEditorArrowPointer,
  typewriterRuntimeRef,
  searchBarSlot,
  documentSettingsSlot,
  notesPaneSlot,
  projectPaneSlot,
  bookOutlineSlot,
  themeStudioSlot,
  chapterBoundaryNavSlot,
  editorTabActionsSlot,
}: WorkspaceProps) {
  const t = createUiTextGetter(uiLanguageMode);
  const hideDocumentStartOverlays = paragraphPlainModeActive;
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
  // Outline 拡張: [現在の文書] / [Book全体] の表示切替。既定は現在の文書。
  const [outlineMode, setOutlineMode] = useState<OutlineMode>("document");
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
          uiLanguageMode={uiLanguageMode}
          fileExplorerDir={fileExplorerDir}
          leftPaneTab={fileExplorerLeftPaneTab} projectsPaneView={fileExplorerProjectsPaneView}
          onSelectLibraryTab={onFileExplorerSelectLibraryTab} onShowProjectList={onFileExplorerShowProjectList}
          explorerProjectListState={fileExplorerProjectListState} onOpenProjectRoot={onFileExplorerOpenProjectRoot}
          showLibraryOnboarding={fileExplorerShowLibraryOnboarding} onOpenLibraryManager={onFileExplorerOpenLibraryManager}
          externalFileActive={fileExplorerExternalFileActive} externalFileName={fileExplorerExternalFileName}
          documentContext={fileExplorerDocumentContext}
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
          onCreateProjectForFolder={onFileExplorerCreateProjectForFolder}
          registration={fileExplorerRegistration}
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
        <EditorTabStrip
          tabs={tabs}
          tabRoles={tabRoles}
          activeTabId={activeTab?.id}
          onSetActiveTab={onSetActiveTab}
          onCloseTab={onCloseTab}
          onAddTab={onAddTab}
          tabLimitReached={tabLimitReached}
          editorTabActionsSlot={editorTabActionsSlot}
        />
        <div
          className="editor-panel"
          data-ruby-visible={rubyVisible ? "1" : "0"}
          data-writing-mode={writingMode}
          data-editor-pointer-mode={useEditorArrowPointer ? "arrow" : "text"}
          data-pseudo-caret={pseudoCaretEnabled ? "on" : "off"}
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
            <ProjectDocumentStartViews
              display={projectDocumentStartDisplay}
              hidden={hideDocumentStartOverlays}
              showRoleLabels={frontmatterShowRoleLabels}
              t={t}
            />
            <FrontmatterView
              fields={frontmatterFields}
              visible={frontmatterVisible && !hideDocumentStartOverlays}
              showTitle={frontmatterShowTitle}
              showAuthors={frontmatterViewShowAuthors}
              showTranslators={frontmatterShowTranslators}
              showRoleLabels={frontmatterShowRoleLabels}
              authorLabel={t("frontmatterCredit.author", "body")}
              coAuthorLabel={t("frontmatterCredit.coAuthor", "body")}
              translatorLabel={t("frontmatterCredit.translator", "body")}
              coTranslatorLabel={t("frontmatterCredit.coTranslator", "body")}
            />
            <div ref={editorDivRef} className="editor-core-host" />
          </div>

          {fullPlainEditActive && (
            <>
              <SourceModeEditor
                controller={sourceModeController}
                editorRuntimeRef={typewriterRuntimeRef}
                initialValue={fullPlainEditValue}
                initialScrollOffset={fullPlainEditInitialScrollOffset}
                onChange={onFullPlainEditChange}
                onApply={onApplyFullPlainEdit}
                onClose={onCloseFullPlainEdit}
              />
              {fullPlainEditError && (
                <div className="plain-text-error">{fullPlainEditError}</div>
              )}
            </>
          )}
          {chapterBoundaryNavSlot}
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
          <RightPaneTabBar
            activeTab={rightPaneTab}
            onSelect={onSetRightPaneTab}
            t={t}
          />
          {rightPaneTab === "outline" ? (
            <div className="outline-list">
              <OutlineModeToggle mode={outlineMode} onChange={setOutlineMode} t={t} />
              {outlineMode === "book" ? (
                <div className="book-outline-content">{bookOutlineSlot}</div>
              ) : headings.length === 0 ? (
                <p className="pane-placeholder">{t("workspace.outline.empty")}</p>
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
                        title={isFolded ? t("workspace.outline.expand") : t("workspace.outline.collapse")}
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
                        title={t("workspace.outline.preview")}
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
                  {t("workspace.document.unavailable")}
                </p>
              )}
            </div>
          ) : rightPaneTab === "notes" ? (
            <div className="notes-pane-content">{notesPaneSlot}</div>
          ) : rightPaneTab === "project" ? (
            <div className="project-pane-content">{projectPaneSlot}</div>
          ) : (
            <div className="theme-pane-content">
              {themeStudioSlot ?? <p className="pane-placeholder">{t("workspace.theme.unavailable")}</p>}
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
