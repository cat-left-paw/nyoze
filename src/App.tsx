import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  CommandAvailability,
  EditorCoreHandle,
  LineBreakPolicy,
  LogEntry,
} from "./editor-core/types";
import {
  type FrontmatterFields,
  parseFrontmatterFields,
  splitLeadingFrontmatter,
} from "./editor-core/io/frontmatter";
import {
  canSafelyPatchFrontmatter,
  patchFrontmatterKnownScalars,
  resolveDocumentMarkdownOptions,
  resolveDocumentType,
  resolveTypeDerivedLineBreakPolicy,
} from "./editor-core/io/frontmatterDocumentSettings";
import type { DocumentType } from "./editor-core/io/frontmatterDocumentSettings";
import {
  DEFAULT_APP_TITLE_CUSTOM,
  DEFAULT_APP_TITLE_FONT,
  DEFAULT_APP_TITLE_PRESET,
  DEFAULT_APP_TITLE_VISIBLE,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_DOC_FONT_PRESET,
  DEFAULT_DOC_HEADING_FONT,
  DEFAULT_EDITOR_ARROW_POINTER,
  DEFAULT_FRONTMATTER_SHOW_AUTHORS,
  DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES,
  DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE,
  DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS,
  DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS,
  DEFAULT_FRONTMATTER_SHOW_TRANSLATORS,
  DEFAULT_FRONTMATTER_VISIBLE,
  DEFAULT_TOOLBAR_ICON_STROKE,
  DEFAULT_TOOLBAR_SCALE,
  DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO,
  DEFAULT_TYPEWRITER_MODE_ENABLED,
  DEFAULT_TYPEWRITER_OFFSET_RATIO,
  DEFAULT_UI_FONT_SCALE,
  DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED,
  DEFAULT_PSEUDO_CARET_BLINK_ENABLED,
  DEFAULT_PSEUDO_CARET_ENABLED,
  DEFAULT_PSEUDO_CARET_THICKNESS,
  DOCUMENT_THEME_COLOR_PRESETS,
  UI_THEME_DOC_COLOR_PRESETS,
} from "./settings/defaults";
import {
  DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR,
  DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY,
  DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR,
  DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY,
  DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY,
} from "./settings/visualFocusAppearance";
import {
  DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED,
  DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED,
  DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED,
} from "./settings/visualFocusSettings";
import type {
  DocumentColorSettings,
  DocumentTheme,
  Theme,
} from "./settings/types";
import { usePaneLayout } from "./ui/hooks/usePaneLayout";
import { useDocumentWritingModeChange } from "./ui/hooks/useDocumentWritingModeChange";
import { useFileExplorer } from "./ui/hooks/useFileExplorer";
import { useEditorTabRoles } from "./ui/hooks/useEditorTabRoles";
import { useLibraryManagerGlue } from "./ui/hooks/useLibraryManagerGlue";
import { useProjectPanelContext } from "./ui/hooks/useProjectPanelContext";
import { useEditorCoreBridge } from "./ui/hooks/useEditorCoreBridge";
import type { TypewriterRuntimeSnapshot } from "./ui/hooks/typewriterRuntimeRef";
import { applyVisualFocusCssVariables } from "./ui/utils/syncVisualFocusCssVariables";
import { useRubyBoutenPrompt } from "./ui/hooks/useRubyBoutenPrompt";
import { useEditorContextMenu } from "./ui/hooks/useEditorContextMenu";
import { useEditorTabActionsSlot } from "./ui/hooks/useEditorTabActionsSlot";
import { useSearchUiState } from "./ui/hooks/useSearchUiState";
import { useBlockDirectiveCommands } from "./ui/hooks/useBlockDirectiveCommands";
import { useAozoraTextExport } from "./ui/hooks/useAozoraTextExport";
import { useLeMEMarkdownExport } from "./ui/hooks/useLeMEMarkdownExport";
import { useDendenMarkdownExport } from "./ui/hooks/useDendenMarkdownExport";
import { useWebBookExport } from "./ui/hooks/useWebBookExport";
import { usePageViewerLauncher } from "./ui/hooks/usePageViewerLauncher";
import { useBookPageViewerLauncher } from "./ui/hooks/useBookPageViewerLauncher";
import { useExternalExportOptionsRouting } from "./ui/hooks/useExternalExportOptionsRouting";
import { useBookExport } from "./ui/hooks/useBookExport";
import { useBookExportResultDetailsPrompt } from "./ui/hooks/useBookExportResultDetailsPrompt";
import { useWebBookCapacityConfirmPrompt } from "./ui/hooks/useWebBookCapacityConfirmPrompt";
import { useBookExportMenuAvailability } from "./ui/hooks/useBookExportMenuAvailability";
import { useLargeDocumentGuard } from "./ui/hooks/useLargeDocumentGuard";
import { useGlobalShortcuts } from "./ui/hooks/useGlobalShortcuts";
import { useUndoRedoRouting } from "./ui/hooks/useUndoRedoRouting";
import { useE2eBridge } from "./ui/hooks/useE2eBridge";
import { useImeProfiler } from "./ui/hooks/useImeProfiler";
import type { ImeProfilerSessionSummary } from "./ui/hooks/useImeProfiler";
import { useImePhaseAUpdateGate } from "./ui/hooks/useImePhaseAUpdateGate";
import { useImePhaseBRubySuspend } from "./ui/hooks/useImePhaseBRubySuspend";
import {
  appendImeProfilerJsonLogEntry,
  readImeProfilerJsonLogs,
  writeImeProfilerJsonLogs,
} from "./ui/hooks/imeProfilerJsonLog";
import { useTabManager, MAX_OPEN_TABS } from "./ui/hooks/useTabManager";
import {
  guardSourceModeDraft as guardSourceModeDraftImpl,
} from "./ui/hooks/sourceModeDraftGuard";
import {
  saveAllDirtyTabsBeforeCloseDetailed,
  saveTabWithSaveAsDetailed,
} from "./ui/hooks/saveBeforeClose";
import type { ActiveTabSaveOutcome } from "./ui/hooks/saveBeforeClose";
import {
  EMPTY_COMMAND_AVAILABILITY,
  type EditorTab,
  useAppUiState,
} from "./ui/hooks/useAppUiState";
import { useSourceModeController } from "./ui/hooks/useSourceModeController";
import {
  copySelection,
  cutSelection,
  pasteFromClipboard,
  pasteFromClipboardPlainOnly,
} from "./ui/utils/nativeEditCommands";
import { clampCommandAvailabilityForInternalDoc } from "./ui/utils/clampCommandAvailabilityForInternalDoc";
import { getPathBaseName } from "./ui/utils/path";
import {
  formatWritingModeLabel,
  resolveDisplayedDocumentMetadata,
} from "./ui/utils/documentMetadataDisplay";
import {
  formatDocumentTypeLabel,
  formatDocumentTypeNoticeMessage,
} from "./ui/utils/documentTypePresentation";
import { UnifiedHeader } from "./ui/components/UnifiedHeader";
import { Workspace } from "./ui/components/Workspace";
import { DocumentSettingsPanel } from "./ui/components/DocumentSettingsPanel";
import { EditorContextMenu } from "./ui/components/EditorContextMenu";
import { DisplaySettingsModal } from "./ui/components/DisplaySettingsModal";
import { LibraryManagerModal } from "./ui/components/LibraryManagerModal";
import { ThemeStudioPanel } from "./ui/components/ThemeStudioModal";
import { LargeDocumentGuardModal } from "./ui/components/LargeDocumentGuardModal";
import { LineBreakPolicyConfirmModal } from "./ui/components/LineBreakPolicyConfirmModal";
import { FileExplorerNamePromptModal } from "./ui/components/FileExplorerNamePromptModal";
import { ExplorerProjectCreateModalHost } from "./ui/components/ExplorerProjectCreateModalHost";
import { FileTransferConflictModal } from "./ui/components/FileTransferConflictModal";
import { UnsavedChangesModal } from "./ui/components/UnsavedChangesModal";
import {
  ExternalEditConflictModal,
  type ExternalEditConflictAction,
} from "./ui/components/ExternalEditConflictModal";
import {
  SaveFailureModal,
  type SaveFailureAction,
  type SaveFailureInfo,
} from "./ui/components/SaveFailureModal";
import { BackupWarningNotice } from "./ui/components/BackupWarningNotice";
import { ExportOptionsModal } from "./ui/components/ExportOptionsModal";
import { BookExportResultDetailsModal } from "./ui/components/BookExportResultDetailsModal";
import { WebBookCapacityConfirmModal } from "./ui/components/WebBookCapacityConfirmModal";
import {
  buildConflictAwareWriteFileOptions,
  detectExternalEditConflict,
} from "./ui/utils/externalEditConflict";
import type {
  ConflictAwareWriteFileResult,
  SavedFileStat,
  SaveErrorKind,
  ConflictKind,
} from "./ui/utils/externalEditConflict";
import { resolvePlainModeKind } from "./ui/utils/plainModeCommandGate";
// BETA-SP10: 配列生成なし��文字数カウント共有ユーティリティ
import { countBodyCharacters as countDocumentBodyCharacters } from "./ui/utils/countBodyCharacters";
// BETA-SP11: EOL fidelity — 保存時に元の改行種別へ戻す
import { applyEol } from "./editor-core/io/eolHelper";
import { shouldEnableAutoTcyDisplay } from "./editor-core/features/autoTcy";
import { resolveCaretColor, resolveUiThemeAccentColor } from "./theme/caretColor";
import { PromptModal } from "./ui/components/PromptModal";
import { NoteAnchorModal } from "./ui/components/NoteAnchorModal";
import { useNoteAnchorInsert } from "./ui/hooks/useNoteAnchorInsert";
import { resolveNoteAnchorOnlyContextMenuId } from "./ui/utils/noteAnchorContextMenu";
import {
  commitNoteAnchorDelete,
  prepareNoteAnchorDelete,
} from "./ui/hooks/noteAnchorDeleteController";
import {
  commitOrphanNoteDelete,
  prepareOrphanNoteDelete,
} from "./ui/hooks/noteOrphanDeleteController";
import {
  commitMissingFileNoteDelete,
  commitMissingFileNotesBulkDelete,
  prepareMissingFileNoteDelete,
} from "./ui/hooks/noteMissingFileDeleteController";
import { useNotePanelActions } from "./ui/hooks/useNotePanelActions";
import {
  commitNoteAnchorMarkerOnlyDelete,
  prepareNoteAnchorMarkerOnlyDelete,
} from "./ui/hooks/noteAnchorMarkerOnlyDeleteController";
import {
  deriveMarkerDeleteModeForMenu,
  resolveNoteAnchorDeletePath,
} from "./ui/utils/noteAnchorDeletePath";
import type { OrphanNoteDeleteResult } from "./ui/components/DocumentNotesPanel";
import type { MissingFileNoteDeleteResult } from "./ui/components/MissingFileNotesSection";
import { useNoteAnchorPreviews } from "./ui/hooks/useNoteAnchorPreviews";
import { useDocumentNotes } from "./ui/hooks/useDocumentNotes";
import { DocumentNotesPanel } from "./ui/components/DocumentNotesPanel";
import { MissingFileNotesSection } from "./ui/components/MissingFileNotesSection";
import { useMissingFileNotes } from "./ui/hooks/useMissingFileNotes";
import { useNoteFileRelocation } from "./ui/hooks/useNoteFileRelocation";
import { useExplorerMetadataBridge } from "./ui/hooks/useExplorerMetadataBridge";
import { useActiveFileProjectMembership } from "./ui/hooks/useActiveFileProjectMembership";
import { useFileMetadataPanelGlue } from "./ui/hooks/useFileMetadataPanelGlue";
import { resolveProjectDocumentStartDisplay } from "./project/projectDocumentStartDisplay";
import { ProjectPaneContainer } from "./ui/components/ProjectPaneContainer";
import { BookOutlinePaneContainer } from "./ui/components/BookOutlinePaneContainer";
import { ToolbarChapterNavContainer } from "./ui/components/ToolbarChapterNavContainer";
import { EditorChapterBoundaryNavContainer } from "./ui/components/EditorChapterBoundaryNavContainer";
import { SearchBar } from "./ui/components/SearchBar";
import { ImeProfilerHud } from "./ui/components/ImeProfilerHud";
import { createUiTextGetter, getUiText } from "./ui/i18n/uiText";
import { getShortcutReferenceContent } from "./ui/internalDocs/getShortcutReferenceContent";

const BUG_REPORT_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScBnYx3xCLDvjyApXNyWuzJmIk9N74r4s-zOz0xTmE3IGX2Ww/viewform?usp=publish-editor";
const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScKH53jmuErA91Z19iO67AU5iet448XbqpRdaKb7Dj2mQW3jg/viewform?usp=dialog";
const REPOSITORY_URL = "https://github.com/cat-left-paw/nyoze";
/** Fixed HTTPS URL for online MANUAL — opened via renderer shell.openExternal (SEC validation). */
const MANUAL_GITHUB_URL =
  "https://github.com/cat-left-paw/nyoze/blob/main/MANUAL.md";

type UnsavedContinueAction = "cancel" | "save" | "discard";
type FileStatInfo = {
  ctimeMs: number;
  mtimeMs: number;
  size: number;
};
type ActiveDocumentInfo = {
  characterCount: number;
  createdAtText: string;
  updatedAtText: string;
  pathText: string;
  pathTitle: string;
  documentTypeLabel: string;
  eolKind: "lf" | "crlf";
  /** frontmatter title 優先、無ければ basename / tab title fallback（表示専用）。 */
  titleText: string;
  /** 著者表示（author + co_authors を結合）。空なら行を出さない。 */
  authorText: string;
  /** 訳者表示（translator + co_translators を結合）。空なら行を出さない。 */
  translatorText: string;
  /** effective writing mode のラベル（既存 i18n 由来、raw 値ではない）。 */
  writingModeLabel: string;
};
type PendingDocumentSettingsChange = {
  nextFrontmatterPrefix: string;
  nextFrontmatterFields: FrontmatterFields;
  nextDocumentType: DocumentType;
  nextEffectiveLineBreakPolicy: LineBreakPolicy;
  nextDocumentMarkdownOptions: {
    preserveEmptyParagraphs: boolean;
  };
};
type SaveDocumentTarget = Pick<EditorTab, "id" | "title" | "filePath" | "savedStat">;
type EditorSurfaceScroll = Pick<EditorTab, "scrollTop" | "scrollLeft">;

// R3.5-2 P2: saveDocument の最終結果を ref 経由で close-before-save ラッパーに渡す。
type SaveDocumentDetail = {
  backupWarning?: string;
  canceled?: boolean;
  errorKind?: SaveErrorKind;
  errorMessage?: string;
};

const DOC_INFO_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDocumentInfoDate(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return DOC_INFO_DATE_FORMATTER.format(new Date(ms));
}


function resolveEffectiveLineBreakPolicyForDocumentSettings(
  frontmatterFields: FrontmatterFields,
  tabLineBreakPolicy: LineBreakPolicy,
): LineBreakPolicy {
  const explicitPolicy = frontmatterFields.nyozeLineBreakPolicy;
  if (
    explicitPolicy === "obsidian-paragraph" ||
    explicitPolicy === "commonmark-strict"
  ) {
    return explicitPolicy;
  }
  const typeDerivedPolicy = resolveTypeDerivedLineBreakPolicy(
    resolveDocumentType(frontmatterFields),
  );
  return typeDerivedPolicy ?? tabLineBreakPolicy;
}

function resolveProfilerDocumentId(
  override: string | null,
  filePath: string | null,
  fallbackTitle: string,
): string {
  if (override && override.trim().length > 0) return override.trim();
  if (filePath && filePath.trim().length > 0) return filePath;
  return fallbackTitle;
}

function resolveDocThemeColors(
  docTheme: DocumentTheme,
  uiTheme: Theme,
  options?: {
    activeUiThemePresetId?: string | null;
    uiThemePresets?: Array<{
      id: string;
      colors: {
        surfaceBg: string;
        textPrimary: string;
      };
    }>;
  },
): DocumentColorSettings {
  if (docTheme === "ui-linked") {
    const activePresetId = options?.activeUiThemePresetId ?? null;
    const activePreset = activePresetId
      ? options?.uiThemePresets?.find((preset) => preset.id === activePresetId)
      : null;
    if (activePreset) {
      return {
        pageColor: activePreset.colors.surfaceBg,
        textColor: activePreset.colors.textPrimary,
        headingColor: activePreset.colors.textPrimary,
      };
    }
    return { ...UI_THEME_DOC_COLOR_PRESETS[uiTheme] };
  }
  return { ...DOCUMENT_THEME_COLOR_PRESETS[docTheme] };
}

function isSystemDocPreset(preset: {
  id: string;
  kind?: "system" | "custom";
}): boolean {
  if (preset.kind) return preset.kind === "system";
  return preset.id.startsWith("preset-doc-");
}


const COMMAND_AVAILABILITY_KEYS: Array<keyof CommandAvailability> = [
  "hasSelection",
  "canBold",
  "canItalic",
  "canStrike",
  "canHighlight",
  "canUnderline",
  "canInlineCode",
  "canClearFormat",
  "canBlockTransforms",
  "canUndo",
  "canRedo",
  "canInsertRuby",
  "canParagraphPlain",
  "canToggleTcy",
  "canCopy",
  "canCut",
  "canPaste",
  "canSelectAll",
  "canMoveListUp",
  "canMoveListDown",
  "isHeading",
  "isBold",
  "isItalic",
  "isStrike",
  "isHighlight",
  "isUnderline",
  "isInlineCode",
  "isBulletList",
  "isOrderedList",
  "isChecklist",
  "isBlockquote",
  "isCodeBlock",
  "canBlockDirective",
  "blockDirectiveToken",
];

function isSameCommandAvailability(
  a: CommandAvailability,
  b: CommandAvailability,
): boolean {
  return COMMAND_AVAILABILITY_KEYS.every((key) => a[key] === b[key]);
}

function App() {
  const coreRef = useRef<EditorCoreHandle | null>(null);
  const typewriterRuntimeRef = useRef<TypewriterRuntimeSnapshot>({
    enabled: DEFAULT_TYPEWRITER_MODE_ENABLED,
    offsetRatio: DEFAULT_TYPEWRITER_OFFSET_RATIO,
    followBandRatio: DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO,
    sourceModeActive: false,
    macosArrowScrollClampEnabled: DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED,
    visualFocusBlockHighlightEnabled: DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED,
    visualFocusDimNonFocusedBlocksEnabled:
      DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED,
    visualFocusBlockHighlightColor: DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR,
    visualFocusBlockHighlightOpacity: DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY,
    visualFocusDimNonFocusedBlocksOpacity:
      DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY,
    visualFocusCurrentLineHighlightEnabled:
      DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED,
    visualFocusCurrentLineHighlightColor: DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR,
    visualFocusCurrentLineHighlightOpacity:
      DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY,
    pseudoCaretEnabled: DEFAULT_PSEUDO_CARET_ENABLED,
    pseudoCaretThickness: DEFAULT_PSEUDO_CARET_THICKNESS,
    pseudoCaretBlinkEnabled: DEFAULT_PSEUDO_CARET_BLINK_ENABLED,
  });
  const rubyVisibleRef = useRef(true);
  const editorDivRef = useRef<HTMLDivElement | null>(null);
  const sourceModeController = useSourceModeController();
  const [commandAvailability, setCommandAvailability] =
    useState<CommandAvailability>(EMPTY_COMMAND_AVAILABILITY);

  const {
    workspaceRef,
    leftPaneOpen,
    rightPaneOpen,
    leftWidth,
    rightWidth,
    setLeftPaneOpen,
    setRightPaneOpen,
    handleDividerMouseDown,
  } = usePaneLayout();

  const ui = useAppUiState({ coreRef });

  typewriterRuntimeRef.current = {
    enabled: ui.typewriterModeEnabled,
    offsetRatio: ui.typewriterOffsetRatio,
    followBandRatio: ui.typewriterFollowBandRatio,
    sourceModeActive: ui.fullPlainEditActive,
    macosArrowScrollClampEnabled: ui.macosArrowScrollClampEnabled,
    visualFocusBlockHighlightEnabled: ui.visualFocusBlockHighlightEnabled,
    visualFocusDimNonFocusedBlocksEnabled: ui.visualFocusDimNonFocusedBlocksEnabled,
    visualFocusBlockHighlightColor: ui.visualFocusBlockHighlightColor,
    visualFocusBlockHighlightOpacity: ui.visualFocusBlockHighlightOpacity,
    visualFocusDimNonFocusedBlocksOpacity: ui.visualFocusDimNonFocusedBlocksOpacity,
    visualFocusCurrentLineHighlightEnabled: ui.visualFocusCurrentLineHighlightEnabled,
    visualFocusCurrentLineHighlightColor: ui.visualFocusCurrentLineHighlightColor,
    visualFocusCurrentLineHighlightOpacity: ui.visualFocusCurrentLineHighlightOpacity,
    pseudoCaretEnabled: ui.pseudoCaretEnabled,
    pseudoCaretThickness: ui.pseudoCaretThickness,
    pseudoCaretBlinkEnabled: ui.pseudoCaretBlinkEnabled,
  };

  const imeProfilerBuildType: "dev" | "prod" = import.meta.env.DEV
    ? "dev"
    : "prod";
  const handleImeProfilerSessionSummary = useCallback(
    (summary: ImeProfilerSessionSummary) => {
      if (!ui.imeProfilerSaveJson) return;
      const documentId = resolveProfilerDocumentId(
        ui.imeProfilerBenchmarkDocumentId,
        ui.activeTab.filePath,
        ui.activeTab.title || "untitled.md",
      );
      const current = readImeProfilerJsonLogs();
      const next = appendImeProfilerJsonLogEntry(current, summary, {
        documentId,
        buildType: imeProfilerBuildType,
        hudEnabled: ui.imeProfilerShowHud,
        phaseAEnabled: ui.imePhaseAEnabled,
        phaseAMinSyncIntervalMs: ui.imePhaseAMinSyncIntervalMs,
        rubyVisible: ui.rubyVisible,
        // Phase B is kept only as a compatibility/debug flag and is currently a no-op.
        rubySuspendDuringComposition: false,
        inputChars: ui.imeProfilerBenchmarkInputChars,
      });
      writeImeProfilerJsonLogs(next);
      const latest = next[next.length - 1];
      if (latest) {
        console.info("[Nyoze][IMEProfiler] benchmark-json", latest);
      }
    },
    [
      imeProfilerBuildType,
      ui.activeTab.filePath,
      ui.activeTab.title,
      ui.imeProfilerBenchmarkDocumentId,
      ui.imeProfilerBenchmarkInputChars,
      ui.imePhaseAEnabled,
      ui.imePhaseAMinSyncIntervalMs,
      ui.imeProfilerSaveJson,
      ui.imeProfilerShowHud,
      ui.rubyVisible,
    ],
  );
  const {
    handleCoreLog: handleImeProfilerLog,
    handleCoreUpdate: handleImeProfilerUpdate,
    hudSnapshot: imeProfilerHudSnapshot,
  } = useImeProfiler({
    enabled: ui.imeProfilerEnabled,
    showHud: ui.imeProfilerShowHud,
    logSummary: ui.imeProfilerLogSummary,
    onSessionSummary: handleImeProfilerSessionSummary,
  });

  const {
    promptInputRef,
    promptModal,
    promptValue,
    rubyBoutenTab,
    boutenValue,
    customBoutenInput,
    customBoutenChars,
    boutenOptions,
    setPromptValue,
    setRubyBoutenTab,
    setBoutenValue,
    setCustomBoutenInput,
    imageSrc,
    imageAlt,
    imageTitle,
    setImageSrc,
    setImageAlt,
    setImageTitle,
    openLinkPrompt,
    openRubyBoutenPrompt,
    openImagePrompt,
    handlePromptSubmit,
    handlePromptCancel,
    addCustomBoutenChar,
    removeSelectedCustomBoutenChar,
  } = useRubyBoutenPrompt({ coreRef });

  const getPlainModeKind = useCallback(
    () =>
      resolvePlainModeKind({
        paragraphPlainModeActive: ui.paragraphPlainModeActive,
        fullPlainEditActive: ui.fullPlainEditActive,
      }),
    [ui.fullPlainEditActive, ui.paragraphPlainModeActive],
  );
  // 付箋 hover preview: notes.json → editor DOM (display-only)
  const { refreshNoteAnchorPreviews } = useNoteAnchorPreviews({
    coreRef,
    getActiveFilePath: () => ui.activeTab.filePath,
    isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
  });
  const { documentNotesState, refreshDocumentNotes } = useDocumentNotes({
    getActiveFilePath: () => ui.activeTab.filePath,
    isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
  });
  const { missingFileNotesState, refreshMissingFileNotes } = useMissingFileNotes({
    getActiveFilePath: () => ui.activeTab.filePath,
    isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
  });
  // frontmatter display の文脈対応: 現在ファイルが Project 所属かを resolve する。
  // projectRoot は渡さず、main の resolveForFile に active file path だけを渡す。
  const activeFileMembership = useActiveFileProjectMembership({
    getActiveFilePath: () => ui.activeTab.filePath,
    isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
  });
  // File Explorer の rename / move / delete に付箋 (notes.json) を追従させる。
  // projectRoot は renderer から渡さず、controller が resolveForFile の結果のみ使う。
  const [projectRefreshNonce, setProjectRefreshNonce] = useState(0);
  // エディタタブへ Project role アイコンを出すための display-only role map。
  // `.nyoze/books.json` v3 だけを正本とし、EditorTab 自体には role を持たせない。
  const editorTabRoles = useEditorTabRoles(ui.tabs, projectRefreshNonce);
  const refreshAllNotePanels = useCallback(() => {
    void refreshNoteAnchorPreviews();
    void refreshDocumentNotes();
    void refreshMissingFileNotes();
  }, [refreshNoteAnchorPreviews, refreshDocumentNotes, refreshMissingFileNotes]);
  const { relocateNotesForMove, refreshNotesAfterDelete } = useNoteFileRelocation({
    onRelocated: refreshAllNotePanels,
    onRefreshAfterDelete: refreshAllNotePanels,
    onError: (message) => {
      console.warn("[Nyoze] file explorer path relocation:", message);
    },
  });
  // File Explorer 単一ファイル rename / move と open tab / 付箋 / 作品タブの整合は hook へ集約。
  const explorerMetadataBridge = useExplorerMetadataBridge({
    tabs: ui.tabs,
    patchTab: ui.patchTab,
    relocateNotesForMove,
    refreshAllNotePanels,
    bumpProjectRefresh: () => setProjectRefreshNonce((nonce) => nonce + 1),
    activeFilePath: ui.activeTab.filePath,
    // Source Mode draft / Paragraph Plain 未確定 overlay は tab.dirty に即時反映されないため、
    // active file の rename / move 前にこれらの未確定 draft を probe して安全側で拒否する。
    hasActiveFileUncommittedDraft: () =>
      ui.fullPlainEditActive ||
      (coreRef.current?.hasParagraphPlainPendingOverlayChanges() ?? false),
  });
  const [focusedDocumentNoteId, setFocusedDocumentNoteId] = useState<string | null>(
    null,
  );
  // marker click ごとに増える単調キー。同じ note id を連続クリックしても
  // reveal を再発火できるよう、id とは別にイベントとして通知する。
  const [focusedDocumentNoteSerial, setFocusedDocumentNoteSerial] = useState(0);
  const [anchoredNoteIds, setAnchoredNoteIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const syncAnchoredNoteIds = useCallback(() => {
    setAnchoredNoteIds(new Set(coreRef.current?.getNoteAnchorIdsInDoc() ?? []));
  }, []);
  // 付箋追加 (Task 3A-3): flow は useNoteAnchorInsert / controller 側に分離
  const {
    noteAnchorModal,
    noteAnchorTitleValue,
    setNoteAnchorTitleValue,
    noteAnchorBodyValue,
    setNoteAnchorBodyValue,
    openNoteAnchorPrompt,
    handleNoteAnchorFirstNoticeConfirm,
    handleNoteAnchorSubmit,
    handleNoteAnchorCancel,
  } = useNoteAnchorInsert({
    coreRef,
    getActiveFilePath: () => ui.activeTab.filePath,
    isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
    getPlainModeKind,
    noticeConfirmed: ui.noteAnchorNoticeConfirmed,
    onNoticeConfirmedChange: ui.setNoteAnchorNoticeConfirmed,
    onInsertSuccess: () => {
      void refreshNoteAnchorPreviews();
      void refreshDocumentNotes();
      void refreshMissingFileNotes();
    },
  });

  const {
    menu: ctxMenu,
    menuRef: ctxMenuRef,
    close: closeCtxMenu,
  } = useEditorContextMenu(
    coreRef,
    editorDivRef,
    getPlainModeKind,
    ui.showEditorInlineHint,
  );

  const search = useSearchUiState({ coreRef });
  const handleOpenSearchReplaceShortcut = useCallback(() => {
    if (ui.activeTab.internalDocId) {
      search.openSearch();
      return;
    }
    search.openSearchReplace();
  }, [search, ui.activeTab.internalDocId]);

  useEffect(() => {
    if (ui.activeTab.internalDocId) {
      search.setReplaceOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only stable setter + tab switch; avoid `search` snapshot churn
  }, [ui.activeTab.internalDocId, search.setReplaceOpen]);

  const largeDocGuard = useLargeDocumentGuard();
  const [unsavedModalOpen, setUnsavedModalOpen] = useState(false);
  const [activeDocumentCharacterCount, setActiveDocumentCharacterCount] =
    useState(0);
  const [activeDocumentStat, setActiveDocumentStat] =
    useState<FileStatInfo | null>(null);
  const activeDocumentStatRequestSeqRef = useRef(0);
  const unsavedActionResolverRef = useRef<
    ((action: UnsavedContinueAction) => void) | null
  >(null);
  // BETA-IO1: External edit conflict modal state
  const [conflictModalKind, setConflictModalKind] =
    useState<ConflictKind | null>(null);
  const conflictActionResolverRef = useRef<
    ((action: ExternalEditConflictAction) => void) | null
  >(null);
  // R3.5-2: Save failure modal state
  const [saveFailureInfo, setSaveFailureInfo] = useState<SaveFailureInfo | null>(
    null,
  );
  const [projectSwitcherRoot, setProjectSwitcherRoot] = useState<string | null>(null);
  const saveFailureActionResolverRef = useRef<
    ((action: SaveFailureAction) => void) | null
  >(null);
  // R3.5-2: backup warning banner state
  const [backupWarningMessage, setBackupWarningMessage] = useState<string | null>(
    null,
  );
  // R3.5-2: close-before-save の場合、警告を確認してから window を閉じる必要がある。
  // resolver が設定されている間は dismiss が close 許可の trigger になる。
  const backupWarningAckResolverRef = useRef<(() => void) | null>(null);

  // R3.5-2 P2: saveDocument が通常保存でも close-before-save でも使えるよう、
  // 最新の保存結果を ref に記録する。saveActiveTabForClose がこの ref を読み、
  // ActiveTabSaveOutcome を構成する。
  const saveDocumentDetailRef = useRef<SaveDocumentDetail | null>(null);

  const toggleParagraphPlainMode = useCallback(() => {
    if (ui.fullPlainEditActive) return;
    if (ui.activeTab.internalDocId) return;
    const core = coreRef.current;
    if (!core) return;
    const next = core.toggleParagraphPlainMode();
    ui.setParagraphPlainModeActive(next);
  }, [ui]);

  const handleToggleLeftPane = useCallback(() => {
    setLeftPaneOpen((v) => !v);
  }, [setLeftPaneOpen]);
  const handleToggleRightPane = useCallback(() => {
    setRightPaneOpen((v) => !v);
  }, [setRightPaneOpen]);

  const handleCtxHeading = useCallback(
    (level: number) => {
      if (ui.activeTab.internalDocId) return;
      coreRef.current?.toggleHeading(level);
    },
    [ui.activeTab.internalDocId],
  );
  const handleCtxSelectAll = useCallback(() => {
    coreRef.current?.selectAll();
  }, []);
  const handleCtxMoveUp = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.moveListItemUp();
  }, [ui.activeTab.internalDocId]);
  const handleCtxMoveDown = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.moveListItemDown();
  }, [ui.activeTab.internalDocId]);

  const handleToggleHeadingFold = useCallback(
    (pos: number) => {
      const core = coreRef.current;
      if (!core) return;
      core.toggleHeadingFold(pos);
      ui.setFoldedHeadingPositions(core.getFoldedHeadingPositions());
    },
    [ui],
  );

  const handleRequestHeadingPreview = useCallback((pos: number): string => {
    return coreRef.current?.getHeadingPreview(pos) ?? "";
  }, []);

  const refreshActiveDocumentCharacterCount = useCallback(() => {
    const core = coreRef.current;
    if (!core) {
      setActiveDocumentCharacterCount(0);
      return;
    }
    const markdown = core.peekMarkdown();
    setActiveDocumentCharacterCount(countDocumentBodyCharacters(markdown));
  }, []);

  const refreshActiveDocumentStat = useCallback(
    async (pathOverride?: string | null) => {
      const requestId = ++activeDocumentStatRequestSeqRef.current;
      const targetPath =
        pathOverride === undefined ? ui.activeTab.filePath : pathOverride;
      if (!targetPath) {
        setActiveDocumentStat(null);
        return;
      }
      const getFileStat = window.nyozeBridge?.fs?.getFileStat;
      if (typeof getFileStat !== "function") {
        setActiveDocumentStat(null);
        return;
      }
      const stat = await getFileStat(targetPath).catch(() => null);
      if (requestId !== activeDocumentStatRequestSeqRef.current) return;
      setActiveDocumentStat(stat);
    },
    [ui.activeTab.filePath],
  );

  const onCoreLog = ui.onCoreLog;
  const onCoreSelectionUpdate = ui.onCoreSelectionUpdate;
  const onCoreUpdateLight = ui.onCoreUpdateLight;
  const onCoreUpdate = ui.onCoreUpdate;
  const onCoreReady = ui.onCoreReady;

  const syncCommandAvailability = useCallback(() => {
    const next =
      coreRef.current?.getCommandAvailability() ?? EMPTY_COMMAND_AVAILABILITY;
    setCommandAvailability((prev) =>
      isSameCommandAvailability(prev, next) ? prev : next,
    );
  }, []);

  const performFullCoreUiSync = useCallback(() => {
    const currentMarkdown = coreRef.current?.peekMarkdown();
    onCoreUpdate(currentMarkdown);
    syncCommandAvailability();
    if (currentMarkdown === undefined) {
      setActiveDocumentCharacterCount(0);
      return;
    }
    setActiveDocumentCharacterCount(countDocumentBodyCharacters(currentMarkdown));
  }, [
    coreRef,
    onCoreUpdate,
    syncCommandAvailability,
  ]);

  const performLightCoreUiSync = useCallback(() => {
    onCoreUpdateLight();
    // syncCommandAvailability intentionally omitted during light sync (IME composition).
    // Toolbar state is not needed while composing; it is flushed on compositionend via full sync.
  }, [onCoreUpdateLight]);

  const {
    handleCoreLog: handleImePhaseALog,
    handleCoreUpdate: handleImePhaseAUpdate,
    flushDeferredSync: flushImeDeferredUiSync,
    isComposingRef: imeComposingRef,
  } = useImePhaseAUpdateGate({
    enabled: ui.imePhaseAEnabled,
    minSyncIntervalMs: ui.imePhaseAMinSyncIntervalMs,
    onFullSync: performFullCoreUiSync,
    onLightSync: performLightCoreUiSync,
  });

  const {
    handleCoreLog: handleImePhaseBLog,
    forceResumeRuby: forceResumeImeRuby,
  } = useImePhaseBRubySuspend({
    enabled: ui.imePhaseBRubySuspendEnabled,
    rubyVisible: ui.rubyVisible,
  });

  const flushImeCompositionSideEffects = useCallback(
    (reason: string) => {
      flushImeDeferredUiSync(reason);
      forceResumeImeRuby(reason);
    },
    [flushImeDeferredUiSync, forceResumeImeRuby],
  );

  const handleCoreLog = useCallback(
    (entry: LogEntry) => {
      handleImePhaseALog(entry);
      handleImePhaseBLog(entry);
      handleImeProfilerLog(entry);
      onCoreLog(entry);
      // Post-composition availability safety net: schedule an additional sync
      // via requestAnimationFrame.  The gate's setTimeout-based flush may fire
      // while ProseMirror is still in a temporary recomposition state (e.g.,
      // macOS live conversion with direct Enter), leaving view.composing = true.
      // rAF fires after all microtasks, MutationObserver callbacks, and
      // ProseMirror DOM reconciliation, guaranteeing composing is fully cleared.
      if (entry.event === "compositionend") {
        requestAnimationFrame(() => {
          syncCommandAvailability();
        });
      }
    },
    [handleImePhaseALog, handleImePhaseBLog, handleImeProfilerLog, onCoreLog, syncCommandAvailability],
  );

  const handleCoreSelectionUpdate = useCallback(() => {
    // Skip all selection-derived UI sync during IME composition.
    // onCoreSelectionUpdate() walks the full doc to find the active heading —
    // expensive in long documents and unnecessary mid-composition.
    // Full sync fires on compositionend via performFullCoreUiSync.
    if (imeComposingRef.current) return;
    onCoreSelectionUpdate();
    syncCommandAvailability();
  }, [imeComposingRef, onCoreSelectionUpdate, syncCommandAvailability]);

  const handleCoreUpdate = useCallback(() => {
    handleImeProfilerUpdate();
    handleImePhaseAUpdate();
    syncAnchoredNoteIds();
  }, [handleImePhaseAUpdate, handleImeProfilerUpdate, syncAnchoredNoteIds]);

  const handleCoreReady = useCallback(
    (core: EditorCoreHandle) => {
      core.setEnableRuby(rubyVisibleRef.current);
      core.setAutoTcyOptions({
        enabled: shouldEnableAutoTcyDisplay({
          autoTcyEnabled: ui.displaySettings.autoTcyEnabled,
          writingMode: ui.writingMode,
          fullPlainEditActive: ui.fullPlainEditActive,
          paragraphPlainModeActive: ui.paragraphPlainModeActive,
        }),
        numbersOnly: ui.displaySettings.autoTcyNumbersOnly,
        minDigits: ui.displaySettings.autoTcyMinDigits,
        maxDigits: ui.displaySettings.autoTcyMaxDigits,
      });
      onCoreReady(core);
      syncCommandAvailability();
      refreshActiveDocumentCharacterCount();
      void refreshNoteAnchorPreviews();
      syncAnchoredNoteIds();
    },
    [
      onCoreReady,
      syncAnchoredNoteIds,
      refreshActiveDocumentCharacterCount,
      refreshNoteAnchorPreviews,
      syncCommandAvailability,
      ui.displaySettings.autoTcyEnabled,
      ui.displaySettings.autoTcyNumbersOnly,
      ui.displaySettings.autoTcyMinDigits,
      ui.displaySettings.autoTcyMaxDigits,
      ui.fullPlainEditActive,
      ui.paragraphPlainModeActive,
      ui.writingMode,
    ],
  );

  const {
    fileExplorerDir,
    leftPaneTab: fileExplorerLeftPaneTab, projectsPaneView: fileExplorerProjectsPaneView,
    handleSelectLibraryTab: handleFileExplorerSelectLibraryTab, handleShowProjectList: handleFileExplorerShowProjectList,
    explorerProjectListState: fileExplorerProjectListState, handleOpenProjectRootFromList: handleFileExplorerOpenProjectRoot,
    rootDirLoaded: fileExplorerRootLoaded,
    visibleEntries: fileExplorerEntries,
    setFileExplorerDir, handleLibraryRootActivated,
    clipboardMode: fileExplorerClipboardMode,
    clipboardSourcePath: fileExplorerClipboardSourcePath,
    operationError: fileExplorerOperationError,
    transferConflict,
    namePrompt: fileExplorerNamePrompt,
    canPaste: canFileExplorerPaste,
    handleEntryActivate: handleFileSelect,
    handleEntrySelect: handleFileSelectOnly,
    handleOpenInNewTab: handleFileOpenInNewTab,
    handleCreateNote,
    handleCreateFolder,
    handleCreateProjectForFolder,
    closeProjectCreateModal,
    projectCreateModalTarget,
    notifyProjectCreatedForFolder,
    notifyProjectUnregistered,
    fileExplorerRegistration,
    handleRenameEntry,
    handleDeleteEntry,
    handleRevealInFileManager,
    handleCutSelectedFile,
    handleCopySelectedFile,
    handlePasteIntoSelection,
    resolveTransferConflictByOverwrite,
    resolveTransferConflictKeepBoth,
    cancelTransferConflict,
    cancelNamePrompt: cancelFileExplorerNamePrompt,
    submitNamePrompt: submitFileExplorerNamePrompt,
    clearOperationError: clearFileExplorerOperationError,
    notifyFileSaved: notifyFileExplorerFileSaved,
  } = useFileExplorer({
    uiLanguageMode: ui.uiLanguageMode,
    onFileContentLoaded: async (filePath, content) => {
      flushImeCompositionSideEffects("file-load-active-tab");
      const stat = await window.nyozeBridge?.fs?.getFileStat?.(filePath).catch(() => null);
      const saved: SavedFileStat = stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null;
      void tabManager.loadIntoActiveTab(
        filePath,
        getPathBaseName(filePath),
        content,
        saved,
      );
    },
    onOpenFileInNewTab: async (filePath, content) => {
      flushImeCompositionSideEffects("file-load-new-tab");
      const stat = await window.nyozeBridge?.fs?.getFileStat?.(filePath).catch(() => null);
      const saved: SavedFileStat = stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null;
      const opened = await tabManager.openFileInTab(filePath, getPathBaseName(filePath), content, saved);
      if (opened === "tab-limit") showTabLimitNotice();
    },
    onFileMoved: explorerMetadataBridge.onFileMoved,
    canTransferEntry: explorerMetadataBridge.canTransferEntry,
    onProjectFileTransferred: explorerMetadataBridge.onProjectFileTransferred,
    onFileDeleted: () => {
      // 付箋は自動削除しない。missing-file 一覧へ反映するため refresh のみ。
      refreshNotesAfterDelete();
    },
    // File Explorer からの v3 登録成功後、Project タブを refresh。
    onProjectRegistered: () => setProjectRefreshNonce((nonce) => nonce + 1),
    projectRefreshNonce,
  });

  const projectPanelContext = useProjectPanelContext({
    projectSwitcherRoot,
    activeFilePath: ui.activeTab.filePath,
    isInternalDoc: Boolean(ui.activeTab.internalDocId),
  });

  const openExternalEditorLink = useCallback(async (url: string): Promise<boolean> => {
    const openExternal = window.nyozeBridge?.shell?.openExternal;
    if (!openExternal) return false;
    return openExternal(url).catch(() => false);
  }, []);

  useEditorCoreBridge({
    coreRef,
    editorDivRef,
    initialLineBreakPolicy: ui.initialLineBreakPolicy,
    typewriterRuntimeRef,
    onLog: handleCoreLog,
    onSelectionUpdate: handleCoreSelectionUpdate,
    onParagraphPlainModeChange: ui.onCoreParagraphPlainModeChange,
    onLineBreakPolicyChange: ui.onCoreLineBreakPolicyChange,
    onUpdate: handleCoreUpdate,
    onFoldChange: ui.onCoreFoldChange,
    openExternalUrl: openExternalEditorLink,
    onReady: handleCoreReady,
  });

  useEffect(() => {
    coreRef.current?.syncTypewriterRuntimeState();
    coreRef.current?.nudgeDecorationsRefresh();
    coreRef.current?.scheduleVisualFocusCurrentLineUpdate();
    // Re-evaluate the pseudo caret on Source Mode / Paragraph Plain toggles so a stale overlay never
    // lingers when the surface is hidden / re-shown (display-only; the controller decides hide/show).
    coreRef.current?.schedulePseudoCaretUpdate();
  }, [
    ui.typewriterModeEnabled,
    ui.fullPlainEditActive,
    ui.paragraphPlainModeActive,
  ]);

  useEffect(() => {
    applyVisualFocusCssVariables(document.documentElement, {
      visualFocusBlockHighlightColor: ui.visualFocusBlockHighlightColor,
      visualFocusBlockHighlightOpacity: ui.visualFocusBlockHighlightOpacity,
      visualFocusDimNonFocusedBlocksOpacity: ui.visualFocusDimNonFocusedBlocksOpacity,
      visualFocusCurrentLineHighlightColor: ui.visualFocusCurrentLineHighlightColor,
      visualFocusCurrentLineHighlightOpacity: ui.visualFocusCurrentLineHighlightOpacity,
    });
  }, [
    ui.visualFocusBlockHighlightColor,
    ui.visualFocusBlockHighlightOpacity,
    ui.visualFocusDimNonFocusedBlocksOpacity,
    ui.visualFocusCurrentLineHighlightColor,
    ui.visualFocusCurrentLineHighlightOpacity,
  ]);

  useEffect(() => {
    coreRef.current?.nudgeDecorationsRefresh();
  }, [ui.visualFocusBlockHighlightEnabled, ui.visualFocusDimNonFocusedBlocksEnabled]);

  useEffect(() => {
    coreRef.current?.scheduleVisualFocusCurrentLineUpdate();
  }, [
    ui.visualFocusCurrentLineHighlightEnabled,
    ui.visualFocusCurrentLineHighlightColor,
    ui.visualFocusCurrentLineHighlightOpacity,
  ]);

  useEffect(() => {
    coreRef.current?.schedulePseudoCaretUpdate();
  }, [ui.pseudoCaretEnabled, ui.pseudoCaretThickness, ui.pseudoCaretBlinkEnabled]);

  // Frontmatter view mount/unmount and field changes shift the body's offset inside
  // `.editor-surface`. None of the controller's own triggers (PM transactions, scroll,
  // resize) fire on these React-side layout changes — so the overlay keeps stale coords
  // until the next user-driven update. Re-schedule a single update after the DOM commit
  // so the new layout is read before paint. No persistent observers; the dependency list
  // is intentionally narrow to the fields that `FrontmatterView` actually renders.
  const frontmatterFields = ui.activeTab?.frontmatterFields;
  const frontmatterTitle = frontmatterFields?.title;
  const frontmatterOriginalTitle = frontmatterFields?.original_title;
  const frontmatterSubtitle = frontmatterFields?.subtitle;
  const frontmatterAuthor = frontmatterFields?.author;
  const frontmatterCoAuthorsKey = (frontmatterFields?.co_authors ?? []).join("\u0000");
  const frontmatterTranslator = frontmatterFields?.translator;
  const frontmatterCoTranslatorsKey = (frontmatterFields?.co_translators ?? []).join(
    "\u0000",
  );

  useEffect(() => {
    if (!ui.imePhaseAEnabled && !ui.imePhaseBRubySuspendEnabled) return;

    const onWindowBlur = () => {
      flushImeCompositionSideEffects("window-blur");
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      flushImeCompositionSideEffects("visibility-hidden");
    };
    const onBeforeUnload = () => {
      flushImeCompositionSideEffects("beforeunload");
    };

    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [
    flushImeCompositionSideEffects,
    ui.imePhaseAEnabled,
    ui.imePhaseBRubySuspendEnabled,
  ]);

  useEffect(() => {
    if (!ui.fullPlainEditActive) return;
    const timer = window.setTimeout(() => {
      sourceModeController.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sourceModeController, ui.fullPlainEditActive]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.setAutoTcyOptions({
      enabled: shouldEnableAutoTcyDisplay({
        autoTcyEnabled: ui.displaySettings.autoTcyEnabled,
        writingMode: ui.writingMode,
        fullPlainEditActive: ui.fullPlainEditActive,
        paragraphPlainModeActive: ui.paragraphPlainModeActive,
      }),
      numbersOnly: ui.displaySettings.autoTcyNumbersOnly,
      minDigits: ui.displaySettings.autoTcyMinDigits,
      maxDigits: ui.displaySettings.autoTcyMaxDigits,
    });
  }, [
    ui.displaySettings.autoTcyEnabled,
    ui.displaySettings.autoTcyNumbersOnly,
    ui.displaySettings.autoTcyMinDigits,
    ui.displaySettings.autoTcyMaxDigits,
    ui.fullPlainEditActive,
    ui.paragraphPlainModeActive,
    ui.writingMode,
  ]);

  // Hard ruby OFF: sync rubyVisible → core.setEnableRuby with save→reload cycle
  const rubyToggleInProgressRef = useRef(false);
  const { rubyVisible, fullPlainEditActive, setSuppressNextDirty } = ui;
  rubyVisibleRef.current = rubyVisible;
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    if (core.isRubyEnabled() === rubyVisible) return;
    if (fullPlainEditActive) {
      // Defer reload until fullPlain exits; do NOT set the flag here so the
      // mismatch persists and triggers a reload when fullPlainEditActive becomes false.
      return;
    }
    flushImeCompositionSideEffects("ruby-toggle");
    const md = core.saveMarkdown();
    core.setEnableRuby(rubyVisible);
    setSuppressNextDirty(true);
    rubyToggleInProgressRef.current = true;
    core.loadMarkdown(md);
    rubyToggleInProgressRef.current = false;
    syncCommandAvailability();
  }, [
    flushImeCompositionSideEffects,
    fullPlainEditActive,
    rubyVisible,
    setSuppressNextDirty,
    syncCommandAvailability,
  ]);

  // BETA-IO1: External edit conflict modal handlers
  const requestConflictAction = useCallback(
    (kind: ConflictKind): Promise<ExternalEditConflictAction> =>
      new Promise((resolve) => {
        if (conflictActionResolverRef.current) {
          conflictActionResolverRef.current("cancel");
        }
        conflictActionResolverRef.current = resolve;
        setConflictModalKind(kind);
      }),
    [],
  );

  const resolveConflictAction = useCallback(
    (action: ExternalEditConflictAction) => {
      setConflictModalKind(null);
      const resolver = conflictActionResolverRef.current;
      conflictActionResolverRef.current = null;
      if (resolver) resolver(action);
    },
    [],
  );

  // R3.5-2: Save failure modal handlers
  const requestSaveFailureAction = useCallback(
    (info: SaveFailureInfo): Promise<SaveFailureAction> =>
      new Promise((resolve) => {
        if (saveFailureActionResolverRef.current) {
          saveFailureActionResolverRef.current("cancel");
        }
        saveFailureActionResolverRef.current = resolve;
        setSaveFailureInfo(info);
      }),
    [],
  );

  const resolveSaveFailureAction = useCallback(
    (action: SaveFailureAction) => {
      setSaveFailureInfo(null);
      const resolver = saveFailureActionResolverRef.current;
      saveFailureActionResolverRef.current = null;
      if (resolver) resolver(action);
    },
    [],
  );

  const dismissBackupWarning = useCallback(() => {
    setBackupWarningMessage(null);
    const resolver = backupWarningAckResolverRef.current;
    backupWarningAckResolverRef.current = null;
    if (resolver) resolver();
  }, []);

  const showBackupWarningIfPresent = useCallback(
    (warning: string | undefined | null) => {
      if (!warning) return;
      setBackupWarningMessage(warning);
    },
    [],
  );

  // R3.5-2: close-before-save で backupWarning をユーザーに読ませてから close に進む。
  // 警告がなければ即 resolve。警告がある場合は dismiss されるまで待つ。
  const acknowledgeBackupWarning = useCallback(
    (warning: string | undefined | null): Promise<void> => {
      if (!warning) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const previous = backupWarningAckResolverRef.current;
        if (previous) previous();
        backupWarningAckResolverRef.current = resolve;
        setBackupWarningMessage(warning);
      });
    },
    [],
  );

  // BETA-IO1: Fetch file stat and update a specific tab's savedStat baseline.
  // Uses patchTab(tabId, ...) to avoid race when the active tab changes during
  // the async getFileStat call.
  const fetchAndPatchSavedStat = useCallback(
    async (tabId: string, filePath: string) => {
      const stat = await window.nyozeBridge?.fs?.getFileStat?.(filePath).catch(() => null);
      const saved: SavedFileStat = stat
        ? { mtimeMs: stat.mtimeMs, size: stat.size }
        : null;
      ui.patchTab(tabId, { savedStat: saved });
    },
    [ui],
  );

  const saveDocument = useCallback(
    async (
      forceSaveAs: boolean,
      targetTabOverride?: SaveDocumentTarget,
    ): Promise<boolean> => {
      saveDocumentDetailRef.current = null;
      flushImeCompositionSideEffects("save-document");
      const core = coreRef.current;
      if (!core) return false;

      // Capture the target tab id upfront so all post-await metadata updates
      // go to the tab that initiated the save, not whatever tab is active
      // at the time async operations complete.
      const targetTabId = targetTabOverride?.id ?? ui.activeTabId;
      const tabForSave = ui.tabs.find((t) => t.id === targetTabId);
      if (tabForSave?.internalDocId) {
        return true;
      }
      const currentFilePath =
        targetTabOverride?.filePath ?? ui.activeTab.filePath;
      const currentTabTitle = targetTabOverride?.title ?? ui.activeTab.title;
      const currentSavedStat =
        targetTabOverride?.savedStat ?? ui.activeTab.savedStat;

      // BETA-Q1: If Full Plain edit is active, apply the draft to core first.
      // core.saveMarkdown() would return stale content otherwise.
      if (ui.fullPlainEditActive) {
        const draftMarkdown =
          sourceModeController.getValue() ?? ui.fullPlainEditValue;
        try {
          core.loadMarkdown(draftMarkdown);
          const normalizedMarkdown = core.saveMarkdown();
          const { frontmatterPrefix } =
            splitLeadingFrontmatter(normalizedMarkdown);
          // BETA-SP10: 同じ引数で 2 回呼ばないよう 1 回に集約する
          const normalizedCharCount = countDocumentBodyCharacters(normalizedMarkdown);
          ui.patchTab(targetTabId, {
            frontmatterFields: parseFrontmatterFields(frontmatterPrefix),
            documentMarkdownOptions: core.getDocumentMarkdownOptions(),
            markdownSnapshot: normalizedMarkdown,
            characterCount: normalizedCharCount,
          });
          setActiveDocumentCharacterCount(normalizedCharCount);
          ui.setFullPlainEditValue(normalizedMarkdown);
          sourceModeController.setValue(normalizedMarkdown, {
            resetHistory: true,
          });
          ui.setFullPlainEditError("");
        } catch {
          ui.setFullPlainEditError(
            "Markdown適用に失敗しました。保存を中断します。",
          );
          saveDocumentDetailRef.current = { canceled: true };
          return false;
        }
      }

      if (!core.commitParagraphPlainIfActive()) {
        saveDocumentDetailRef.current = { canceled: true };
        return false;
      }

      const md = core.saveMarkdown();
      // BETA-SP11: 元の EOL を復元して書き出す。内部比較用の md は LF のまま保持。
      const tabEol = ui.activeTab.eol ?? "lf";
      const mdToWrite = applyEol(md, tabEol);
      const bridge = window.nyozeBridge?.fs;

      if (bridge?.writeFile && bridge?.saveAs) {
        const finalizeSuccessfulSave = (
          savedFilePath: string,
          backupWarning?: string,
        ): true => {
          ui.markDirtyFalseForTab(targetTabId, md);
          void refreshActiveDocumentStat(savedFilePath);
          void fetchAndPatchSavedStat(targetTabId, savedFilePath);
          showBackupWarningIfPresent(backupWarning);
          saveDocumentDetailRef.current = { backupWarning };
          return true;
        };

        const saveCurrentDocumentAs = async (): Promise<boolean> => {
          const defaultPath = currentFilePath ?? currentTabTitle ?? "document.md";
          const saveAsResult = await bridge.saveAs(mdToWrite, defaultPath);
          if (saveAsResult?.saved && saveAsResult.filePath) {
            ui.patchTab(targetTabId, {
              title: getPathBaseName(saveAsResult.filePath),
              filePath: saveAsResult.filePath,
            });
            const result = finalizeSuccessfulSave(
              saveAsResult.filePath,
              saveAsResult.backupWarning,
            );
            void notifyFileExplorerFileSaved(saveAsResult.filePath);
            return result;
          }
          // R3.5-2: saveAs canceled is NOT an error; any other kind (permission,
          // disk-full, parent-missing, write-failed) must be surfaced so the user
          // can retry / pick another location / cancel explicitly.
          const errorKind = saveAsResult?.errorKind;
          if (!errorKind || errorKind === "canceled") {
            saveDocumentDetailRef.current = { canceled: true };
            return false;
          }
          return await handleSaveAsFailure({
            errorKind,
            errorMessage: saveAsResult?.errorMessage,
          });
        };

        // R3.5-2: When writeFile fails with a real error (not cancel, not conflict),
        // ask the user how to proceed. Returns whether the save ultimately succeeded.
        const handleWriteFileFailure = async (
          result: ConflictAwareWriteFileResult | null,
        ): Promise<boolean> => {
          const errorKind = result?.errorKind ?? "write-failed";
          const info: SaveFailureInfo = {
            tabTitle: currentTabTitle,
            filePath: currentFilePath,
            errorKind,
            errorMessage: result?.errorMessage,
          };
          const action = await requestSaveFailureAction(info);
          if (action === "cancel") {
            saveDocumentDetailRef.current = { canceled: true };
            return false;
          }
          if (action === "saveAs") return await saveCurrentDocumentAs();
          // retry: same path, conflict check still active (no allowConflictOverwrite).
          return await saveCurrentDocumentWithRetry();
        };

        // R3.5-2: Save As で実エラーが発生したときもモーダルで対処を問う。
        // saveAs では conflict は出ないので retry は単に saveAs を再実行する。
        const handleSaveAsFailure = async (details: {
          errorKind: NonNullable<ConflictAwareWriteFileResult["errorKind"]>;
          errorMessage?: string;
        }): Promise<boolean> => {
          const info: SaveFailureInfo = {
            tabTitle: currentTabTitle,
            filePath: currentFilePath,
            errorKind: details.errorKind,
            errorMessage: details.errorMessage,
          };
          const action = await requestSaveFailureAction(info);
          if (action === "cancel") {
            saveDocumentDetailRef.current = { canceled: true };
            return false;
          }
          // retry / saveAs both re-open the Save As dialog.
          return await saveCurrentDocumentAs();
        };

        // 通常の再試行: conflict check は有効のまま再書き込みする。
        const saveCurrentDocumentWithRetry = async (): Promise<boolean> => {
          if (!currentFilePath) return await saveCurrentDocumentAs();
          const baseline = currentSavedStat;
          const retryResult: ConflictAwareWriteFileResult | null =
            await bridge.writeFile(
              currentFilePath,
              mdToWrite,
              buildConflictAwareWriteFileOptions(baseline),
            );
          if (retryResult?.saved) {
            return finalizeSuccessfulSave(
              currentFilePath,
              retryResult.backupWarning,
            );
          }
          if (retryResult?.conflictKind) {
            const action = await requestConflictAction(retryResult.conflictKind);
            if (action === "cancel") {
              saveDocumentDetailRef.current = { canceled: true };
              return false;
            }
            if (action === "saveAs") return await saveCurrentDocumentAs();
            // overwrite: conflict 上書きを明示的に許可して再試行する。
            return await saveCurrentDocumentWithOverwrite();
          }
          return await handleWriteFileFailure(retryResult);
        };

        // conflict モーダルで「上書き」を選んだ直後のみ使う。
        // allowConflictOverwrite を立てて main 側の conflict 検知を bypass する。
        const saveCurrentDocumentWithOverwrite = async (): Promise<boolean> => {
          if (!currentFilePath) return await saveCurrentDocumentAs();
          const baseline = currentSavedStat;
          const overwriteResult: ConflictAwareWriteFileResult | null =
            await bridge.writeFile(
              currentFilePath,
              mdToWrite,
              buildConflictAwareWriteFileOptions(baseline, true),
            );
          if (overwriteResult?.saved) {
            return finalizeSuccessfulSave(
              currentFilePath,
              overwriteResult.backupWarning,
            );
          }
          // conflict bypass 中の 2 度目 conflict は想定外だが、通常フローへ戻す。
          if (overwriteResult?.conflictKind) {
            const action = await requestConflictAction(overwriteResult.conflictKind);
            if (action === "cancel") {
              saveDocumentDetailRef.current = { canceled: true };
              return false;
            }
            if (action === "saveAs") return await saveCurrentDocumentAs();
            return await saveCurrentDocumentWithOverwrite();
          }
          return await handleWriteFileFailure(overwriteResult);
        };

        if (!forceSaveAs && currentFilePath) {
          // BETA-IO1: Check for external edit conflict before overwriting.
          const baseline = currentSavedStat;
          let allowConflictOverwrite = false;
          if (baseline && bridge.getFileStat) {
            const currentStat = await bridge.getFileStat(currentFilePath).catch(() => null);
            const conflict = detectExternalEditConflict(
              baseline,
              currentStat ? { mtimeMs: currentStat.mtimeMs, size: currentStat.size } : null,
            );
            if (conflict) {
              const action = await requestConflictAction(conflict);
              if (action === "cancel") {
                saveDocumentDetailRef.current = { canceled: true };
                return false;
              }
              if (action === "saveAs") return await saveCurrentDocumentAs();
              allowConflictOverwrite = true;
            }
          }

          const result: ConflictAwareWriteFileResult | null =
            await bridge.writeFile(
              currentFilePath,
              mdToWrite,
              buildConflictAwareWriteFileOptions(
                baseline,
                allowConflictOverwrite,
              ),
            );
          if (result?.saved) {
            return finalizeSuccessfulSave(currentFilePath, result.backupWarning);
          }
          // Not saved — distinguish conflict (BETA-IO1) from other errors.
          const writeConflict = result?.conflictKind ?? null;
          if (writeConflict) {
            const action = await requestConflictAction(writeConflict);
            if (action === "cancel") {
              saveDocumentDetailRef.current = { canceled: true };
              return false;
            }
            if (action === "saveAs") return await saveCurrentDocumentAs();
            // overwrite: 明示的に conflict を上書き許可して再試行する。
            return await saveCurrentDocumentWithOverwrite();
          }
          // R3.5-2: No silent fallback to Save As — ask the user explicitly.
          return await handleWriteFileFailure(result);
        }

        // forceSaveAs OR untitled tab — route through Save As.
        // Save As cancellation surfaces as false but is not an error dialog.
        return await saveCurrentDocumentAs();
      }

      const blob = new Blob([mdToWrite], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentTabTitle || "document.md";
      a.click();
      URL.revokeObjectURL(url);
      ui.markDirtyFalseForTab(targetTabId, md);
      return true;
    },
    [
      fetchAndPatchSavedStat,
      flushImeCompositionSideEffects,
      notifyFileExplorerFileSaved,
      refreshActiveDocumentStat,
      requestConflictAction,
      requestSaveFailureAction,
      showBackupWarningIfPresent,
      sourceModeController,
      ui,
    ],
  );

  // Shared options confirm UI (pageBreak / pageBreakBeforeHeading /
  // pageBreakBeforeHeadingMaxLevel, plus Book-only insertPageBreakBetweenChapters)
  // for both active document export and Book export. One prompt/modal instance;
  // scope binding lives in the routing hook, format binding lives in each
  // export hook itself (each already knows its own format).
  const {
    prompt: externalExportOptionsPrompt, resolveInitialSelection, confirmExportOptions,
    cancelExportOptions,
    requestDocumentExportOptions,
    requestBookExportOptions: requestBookExportOptionsForBook,
  } = useExternalExportOptionsRouting();

  // Aozora / LeME export hooks share an identical input surface (active doc,
  // plain-mode gates, notice + save-failure plumbing, options confirm UI).
  const documentExportInput = {
    coreRef,
    activeTab: ui.activeTab,
    internalDocActive: Boolean(ui.activeTab.internalDocId),
    fullPlainEditActive: ui.fullPlainEditActive,
    paragraphPlainModeActive: ui.paragraphPlainModeActive,
    uiLanguageMode: ui.uiLanguageMode,
    // HTML系 export は現在の実効書字方向を `HtmlExportOptions` /
    // `WebBookExportOptions` へ渡す。青空文庫風 / LeME / でんでんのhookは使わない。
    writingMode: ui.writingMode,
    showGlobalNotice: (message: string) => ui.showLineBreakPolicyNotice(message, false),
    showEditorInlineHint: ui.showEditorInlineHint,
    showBackupWarningIfPresent,
    requestSaveFailureAction,
    requestExportOptions: requestDocumentExportOptions,
  };
  const { exportActiveDocument: exportAozoraTextDocument } =
    useAozoraTextExport(documentExportInput);
  const { exportActiveDocument: exportLeMEMarkdownDocument } =
    useLeMEMarkdownExport(documentExportInput);
  const { exportActiveDocument: exportDendenMarkdownDocument } =
    useDendenMarkdownExport(documentExportInput);
  const {
    state: bookExportResultDetails,
    showBookExportResultDetails,
    closeBookExportResultDetails,
  } = useBookExportResultDetailsPrompt();
  const {
    capacity: webBookCapacityConfirm,
    requestCapacityConfirm,
    resolveCapacityConfirm,
  } = useWebBookCapacityConfirmPrompt();
  const { exportActiveDocument: exportWebBookDocument } =
    useWebBookExport({
      ...documentExportInput,
      docColorSettings: ui.docColorSettings,
      docHeadingFont: ui.docHeadingFont,
      displaySettings: ui.displaySettings,
      showBookExportResultDetails,
      requestCapacityConfirm,
    });
  const { openPageViewer } = usePageViewerLauncher({
    coreRef,
    activeTab: ui.activeTab,
    internalDocActive: Boolean(ui.activeTab.internalDocId),
    writingMode: ui.writingMode,
    docColorSettings: ui.docColorSettings,
    docFontPreset: ui.docFontPreset,
    selectedFont: ui.selectedFont,
    docHeadingFont: ui.docHeadingFont,
    displaySettings: ui.displaySettings,
    frontmatterVisible: ui.frontmatterVisible,
    frontmatterShowAuthors: ui.frontmatterShowAuthors,
    frontmatterShowTranslators: ui.frontmatterShowTranslators,
    frontmatterShowRoleLabels: ui.frontmatterShowRoleLabels,
  });
  const { openBookPageViewer } = useBookPageViewerLauncher({
    activeTab: ui.activeTab,
    internalDocActive: Boolean(ui.activeTab.internalDocId),
    uiLanguageMode: ui.uiLanguageMode,
    showEditorInlineHint: ui.showEditorInlineHint,
    writingMode: ui.writingMode,
    docColorSettings: ui.docColorSettings,
    docFontPreset: ui.docFontPreset,
    selectedFont: ui.selectedFont,
    docHeadingFont: ui.docHeadingFont,
    displaySettings: ui.displaySettings,
    frontmatterVisible: ui.frontmatterVisible,
    frontmatterShowAuthors: ui.frontmatterShowAuthors,
    frontmatterShowTranslators: ui.frontmatterShowTranslators,
    frontmatterShowRoleLabels: ui.frontmatterShowRoleLabels,
    frontmatterShowInProjectFiles: ui.frontmatterShowInProjectFiles,
    frontmatterProjectShowTitle: ui.frontmatterProjectShowTitle,
    frontmatterProjectShowAuthors: ui.frontmatterProjectShowAuthors,
  });

  const bookExportInput = {
    activeTab: ui.activeTab,
    internalDocActive: Boolean(ui.activeTab.internalDocId),
    uiLanguageMode: ui.uiLanguageMode,
    showGlobalNotice: (message: string) => ui.showLineBreakPolicyNotice(message, false),
    showEditorInlineHint: ui.showEditorInlineHint,
    showBackupWarningIfPresent,
    requestSaveFailureAction,
    requestBookExportOptions: requestBookExportOptionsForBook,
    writingMode: ui.writingMode, // Book HTML / Web Book: options.*.writingMode.
    docColorSettings: ui.docColorSettings,
    docHeadingFont: ui.docHeadingFont,
    displaySettings: ui.displaySettings,
    showBookExportResultDetails,
    requestCapacityConfirm,
  };
  const { exportBookAsLeME, exportBookAsDenden, exportBookAsAozora, exportBookAsWebBook } =
    useBookExport(bookExportInput);
  const bookPageViewerToolbarAvailability = useBookExportMenuAvailability({
    activeTab: ui.activeTab,
    internalDocActive: Boolean(ui.activeTab.internalDocId),
  });

  // R3.5-2 P2: close-before-save 専用ラッパー。
  // saveDocument(false) を呼び、ref に記録された詳細情報から ActiveTabSaveOutcome を構成する。
  // backupWarning / cancel 理由 / errorKind が orchestrator に伝わるようになる。
  const saveActiveTabForClose = useCallback(
    async (): Promise<ActiveTabSaveOutcome> => {
      saveDocumentDetailRef.current = null;
      const ok = await saveDocument(false);
      const detail = saveDocumentDetailRef.current as SaveDocumentDetail | null;
      saveDocumentDetailRef.current = null;
      if (ok) {
        return { ok: true, backupWarning: detail?.backupWarning };
      }
      if (detail?.canceled) {
        return { ok: false, reason: { kind: "canceled" } };
      }
      return {
        ok: false,
        reason: {
          kind: "save-error",
          errorKind: detail?.errorKind ?? "write-failed",
          errorMessage: detail?.errorMessage,
        },
      };
    },
    [saveDocument],
  );

  const requestUnsavedContinueAction = useCallback(
    (): Promise<UnsavedContinueAction> =>
      new Promise((resolve) => {
        if (unsavedActionResolverRef.current) {
          unsavedActionResolverRef.current("cancel");
        }
        unsavedActionResolverRef.current = resolve;
        setUnsavedModalOpen(true);
      }),
    [],
  );

  const resolveUnsavedContinueAction = useCallback(
    (action: UnsavedContinueAction) => {
      setUnsavedModalOpen(false);
      const resolver = unsavedActionResolverRef.current;
      unsavedActionResolverRef.current = null;
      if (resolver) resolver(action);
    },
    [],
  );

  useEffect(() => {
    return () => {
      const resolver = unsavedActionResolverRef.current;
      unsavedActionResolverRef.current = null;
      if (resolver) resolver("cancel");
    };
  }, []);

  const confirmContinueWithUnsavedChanges = useCallback(
    async (options?: {
      forcePrompt?: boolean;
      saveTargetTab?: SaveDocumentTarget;
    }): Promise<boolean> => {
      if (!options?.forcePrompt && !ui.activeTab.dirty) return true;
      const action = await requestUnsavedContinueAction();
      if (action === "cancel") return false;
      if (action === "discard") return true;
      return saveDocument(false, options?.saveTargetTab);
    },
    [requestUnsavedContinueAction, saveDocument, ui.activeTab.dirty],
  );

  const syncActiveTabFrontmatter = useCallback(
    (markdown: string) => {
      const documentMarkdownOptions =
        coreRef.current?.getDocumentMarkdownOptions() ?? {
          preserveEmptyParagraphs: false,
        };
      const { frontmatterPrefix } = splitLeadingFrontmatter(markdown);
      // BETA-SP10: 同じ引数で 2 回呼ばないよう 1 回に集約する
      const charCount = countDocumentBodyCharacters(markdown);
      ui.patchActiveTab({
        frontmatterFields: parseFrontmatterFields(frontmatterPrefix),
        documentMarkdownOptions,
        markdownSnapshot: markdown,
        characterCount: charCount,
      });
      setActiveDocumentCharacterCount(charCount);
    },
    [ui],
  );

  const handleTabContentLoaded = useCallback(
    (
      _markdown: string,
      _fields: ReturnType<typeof parseFrontmatterFields>,
      charCount: number,
      documentMarkdownOptions: { preserveEmptyParagraphs: boolean },
    ) => {
      ui.patchActiveTab({ documentMarkdownOptions });
      setActiveDocumentCharacterCount(charCount);
    },
    [ui],
  );

  const applyEditorScroll = useCallback((position: EditorSurfaceScroll) => {
    const surface = editorDivRef.current?.closest(".editor-surface");
    if (!(surface instanceof HTMLElement)) return;
    surface.scrollTop = position.scrollTop;
    surface.scrollLeft = position.scrollLeft;
  }, []);

  const captureEditorScroll = useCallback((): EditorSurfaceScroll => {
    const surface = editorDivRef.current?.closest(".editor-surface");
    if (!(surface instanceof HTMLElement)) {
      return { scrollTop: 0, scrollLeft: 0 };
    }
    return {
      scrollTop: surface.scrollTop,
      scrollLeft: surface.scrollLeft,
    };
  }, []);

  const restoreEditorScroll = useCallback((position: EditorSurfaceScroll) => {
    requestAnimationFrame(() => {
      applyEditorScroll(position);
    });
  }, [applyEditorScroll]);

  const resetEditorScroll = useCallback(() => {
    requestAnimationFrame(() => {
      applyEditorScroll({ scrollTop: 0, scrollLeft: 0 });
    });
  }, [applyEditorScroll]);

  // BETA-SP1: Source Mode ドラフト消失防止ガード
  // closeFullPlainEdit は後方で定義されるため、ref 経由で遅延参照する。
  const guardSourceModeDraftDepsRef = useRef({
    fullPlainEditActive: ui.fullPlainEditActive,
    sourceModeController,
    saveDocument,
    closeFullPlainEdit: (() => {}) as () => void,
    requestUnsavedContinueAction,
  });
  // 最新 deps を毎レンダーで同期（closeFullPlainEdit は後で上書き）
  guardSourceModeDraftDepsRef.current.fullPlainEditActive =
    ui.fullPlainEditActive;
  guardSourceModeDraftDepsRef.current.sourceModeController =
    sourceModeController;
  guardSourceModeDraftDepsRef.current.saveDocument = saveDocument;
  guardSourceModeDraftDepsRef.current.requestUnsavedContinueAction =
    requestUnsavedContinueAction;

  const guardSourceModeDraftFn = useCallback(
    () => {
      const r = guardSourceModeDraftDepsRef.current;
      return guardSourceModeDraftImpl({
        fullPlainEditActive: r.fullPlainEditActive,
        getSourceModeDraft: () => r.sourceModeController.getValue(),
        getCoreMarkdown: () => coreRef.current?.peekMarkdown() ?? null,
        saveDocument: () => r.saveDocument(false),
        closeFullPlainEdit: () => r.closeFullPlainEdit(),
        requestUnsavedContinueAction: () =>
          r.requestUnsavedContinueAction(),
      });
    },
    [],
  );

  const tabManager = useTabManager({
    coreRef,
    tabs: ui.tabs,
    activeTabId: ui.activeTabId,
    activeTab: ui.activeTab,
    setActiveTabId: ui.setActiveTabId,
    patchActiveTab: ui.patchActiveTab,
    patchTab: ui.patchTab,
    addTab: ui.addTab,
    removeTab: ui.removeTab,
    setTabs: ui.setTabs,
    setSuppressNextDirty: ui.setSuppressNextDirty,
    ensureSafeLineBreakPolicyBeforeDocumentLoad:
      ui.ensureSafeLineBreakPolicyBeforeDocumentLoad,
    closePlainEditModes: ui.closePlainEditModes,
    refreshHeadings: ui.refreshHeadings,
    confirmContinueWithUnsavedChanges,
    onTabContentLoaded: handleTabContentLoaded,
    notifyActiveDocumentPath: (filePath) => {
      window.nyozeBridge?.document?.setActiveFilePath(filePath);
    },
    captureEditorScroll,
    resetEditorScroll,
    restoreEditorScroll,
    defaultWritingMode: ui.defaultWritingMode,
    defaultLineBreakPolicy: ui.defaultLineBreakPolicy,
    guardSourceModeDraft: guardSourceModeDraftFn,
  });

  const sendBugReport = useCallback(async () => {
    const ok = await window.nyozeBridge?.shell?.openExternal(BUG_REPORT_URL);
    if (ok === false) {
      window.alert("不具合報告ページを開けませんでした。\n" + BUG_REPORT_URL);
    }
  }, []);

  const openManualFromMenu = useCallback(async () => {
    const ok = await window.nyozeBridge?.shell?.openExternal(MANUAL_GITHUB_URL);
    if (ok === false) {
      window.alert(
        "MANUAL を開けませんでした。\nブラウザ連携を確認してください。\n\n" +
          MANUAL_GITHUB_URL,
      );
    }
  }, []);

  const sendFeedback = useCallback(async () => {
    const ok = await window.nyozeBridge?.shell?.openExternal(FEEDBACK_URL);
    if (ok === false) {
      window.alert("フィードバックページを開けませんでした。\n" + FEEDBACK_URL);
    }
  }, []);

  const openRepository = useCallback(async () => {
    if (!REPOSITORY_URL) {
      window.alert("リポジトリURLはまだ設定されていません。");
      return;
    }
    const ok = await window.nyozeBridge?.shell?.openExternal(REPOSITORY_URL);
    if (ok === false) {
      window.alert("リポジトリページを開けませんでした。\n" + REPOSITORY_URL);
    }
  }, []);

  const tabLimitReached = ui.tabs.length >= MAX_OPEN_TABS;

  const [tabLimitNotice, setTabLimitNotice] = useState<string | null>(null);
  const activeTabFilePath = ui.activeTab.filePath;
  const {
    libraryManagerOpen, reloadLibraryRegistry,
    handleOpenLibraryManager, handleCloseLibraryManager,
    handleOpenLibraryManagerFromDisplaySettings, handleLibraryActivated,
    externalFileActive, externalFileName, documentContextInfo, projectDisplayMetadata,
    projectDocumentStartInfo, showLibraryOnboarding,
  } = useLibraryManagerGlue({
    activeTabFilePath,
    isInternalDoc: Boolean(ui.activeTab.internalDocId),
    fileExplorerDir,
    projectRefreshNonce,
    setDisplaySettingsOpen: ui.setDisplaySettingsOpen,
    onLibraryRootActivated: handleLibraryRootActivated,
  });
  const documentStartMasterVisible =
    ui.frontmatterVisible && !ui.activeTab.internalDocId;
  const standaloneFrontmatterVisible =
    documentStartMasterVisible &&
    !activeFileMembership.pending &&
    !activeFileMembership.inProject;
  const projectDocumentStartDisplay = useMemo(
    () =>
      resolveProjectDocumentStartDisplay({
        masterVisible: documentStartMasterVisible,
        inProject: activeFileMembership.inProject,
        startInfo: projectDocumentStartInfo,
        showBookAuthors: ui.frontmatterShowAuthors,
        showInProjectFiles: ui.frontmatterShowInProjectFiles,
        showFileTitle: ui.frontmatterProjectShowTitle,
        showFileAuthors: ui.frontmatterProjectShowAuthors,
        showTranslators: ui.frontmatterShowTranslators,
      }),
    [
      documentStartMasterVisible,
      activeFileMembership.inProject,
      projectDocumentStartInfo,
      ui.frontmatterShowAuthors,
      ui.frontmatterShowInProjectFiles,
      ui.frontmatterProjectShowTitle,
      ui.frontmatterProjectShowAuthors,
      ui.frontmatterShowTranslators,
    ],
  );

  const { documentSettingsGlue } = useFileMetadataPanelGlue({
    inProject: activeFileMembership.inProject,
    membershipPending: activeFileMembership.pending,
    documentContext: documentContextInfo,
    setRightPaneOpen,
    setRightPaneTab: ui.setRightPaneTab,
    setDisplaySettingsOpen: ui.setDisplaySettingsOpen,
    isDirty: ui.activeTab.dirty,
    saveDocument,
  });

  const projectDocumentStartKey = useMemo(() => {
    if (!documentStartMasterVisible || projectDocumentStartInfo.kind === "none") {
      return null;
    }
    return JSON.stringify(projectDocumentStartInfo);
  }, [documentStartMasterVisible, projectDocumentStartInfo]);
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    // One rAF gives the document-start / frontmatter mount/unmount layout shift time
    // to commit before the controller's own rAF-debounced scheduleUpdate reads coords.
    const raf = window.requestAnimationFrame(() => {
      core.scheduleVisualFocusCurrentLineUpdate();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [
    standaloneFrontmatterVisible,
    ui.frontmatterShowAuthors,
    ui.frontmatterShowTranslators,
    ui.frontmatterShowRoleLabels,
    frontmatterTitle,
    frontmatterOriginalTitle,
    frontmatterSubtitle,
    frontmatterAuthor,
    frontmatterCoAuthorsKey,
    frontmatterTranslator,
    frontmatterCoTranslatorsKey,
    projectDocumentStartDisplay.book.visible,
    projectDocumentStartDisplay.file.visible,
    projectDocumentStartKey,
  ]);
  const tabLimitNoticeTimerRef = useRef<number | null>(null);
  const showTabLimitNotice = useCallback(() => {
    setTabLimitNotice(`タブ数の上限（${MAX_OPEN_TABS}）に達しています。不要なタブを閉じてください。`);
    if (tabLimitNoticeTimerRef.current !== null) {
      window.clearTimeout(tabLimitNoticeTimerRef.current);
    }
    tabLimitNoticeTimerRef.current = window.setTimeout(() => {
      setTabLimitNotice(null);
      tabLimitNoticeTimerRef.current = null;
    }, 4000);
  }, []);

  const openShortcutReferenceFromMenu = useCallback(async () => {
    const t = createUiTextGetter(ui.uiLanguageMode);
    const title = t("help.shortcutsReference");
    const { markdown, bundleKey } = getShortcutReferenceContent(ui.uiLanguageMode);
    const result = await tabManager.openOrFocusShortcutReferenceTab({
      title,
      markdown,
      bundleKey,
    });
    if (result === "tab-limit") showTabLimitNotice();
  }, [tabManager, ui.uiLanguageMode, showTabLimitNotice]);

  useEffect(() => {
    if (!ui.activeTab.internalDocId) return;
    const { markdown, bundleKey } = getShortcutReferenceContent(ui.uiLanguageMode);
    const title = createUiTextGetter(ui.uiLanguageMode)("help.shortcutsReference");
    if (
      ui.activeTab.internalShortcutBundleKey === bundleKey &&
      ui.activeTab.markdownSnapshot === markdown &&
      ui.activeTab.title === title
    ) {
      return;
    }
    void tabManager.openOrFocusShortcutReferenceTab({
      title,
      markdown,
      bundleKey,
    });
  }, [
    tabManager,
    ui.activeTab.internalDocId,
    ui.activeTab.internalShortcutBundleKey,
    ui.activeTab.markdownSnapshot,
    ui.activeTab.title,
    ui.uiLanguageMode,
  ]);

  useE2eBridge({
    loadIntoActiveTab: tabManager.loadIntoActiveTab,
    openFileInNewTab: tabManager.openFileInTab,
    flushImeCompositionSideEffects,
    showTabLimitNotice,
    setExplorerRootForE2e: setFileExplorerDir,
    onLibraryActivatedForE2e: handleLibraryActivated,
    reloadLibraryRegistryForE2e: reloadLibraryRegistry,
    inspectSpecialInlineAdjacentCaretPm: () =>
      coreRef.current?.inspectSpecialInlineAdjacentCaretPm() ?? null,
    openOrFocusShortcutReferenceTab: tabManager.openOrFocusShortcutReferenceTab,
    setPseudoCaretEnabledForE2e: ui.setPseudoCaretEnabled,
    setPseudoCaretThicknessForE2e: ui.setPseudoCaretThickness,
    setPseudoCaretBlinkEnabledForE2e: ui.setPseudoCaretBlinkEnabled,
  });

  // --- Menu command listener (macOS menu bar / Win+Linux popup menu) ---
  useEffect(() => {
    const bridge = window.nyozeBridge?.menu;
    if (!bridge?.onMenuCommand) return;
    return bridge.onMenuCommand((command: string) => {
      switch (command) {
        case "menu:new-document": {
          flushImeCompositionSideEffects("menu-new-document");
          void tabManager.addNewTab().then((ok) => {
            if (ok === "tab-limit") showTabLimitNotice();
          });
          break;
        }
        case "menu:open": {
          // 単独ファイル open ボタンを叩く（aria-label は localize されるため安定 selector を使う）。
          const btn = document.querySelector<HTMLButtonElement>(
            '[data-toolbar-action="open-file"]',
          );
          btn?.click();
          break;
        }
        case "menu:save": {
          void saveDocument(false);
          break;
        }
        case "menu:save-as": {
          void saveDocument(true);
          break;
        }
        case "menu:export-aozora-text": {
          void exportAozoraTextDocument();
          break;
        }
        case "menu:export-leme-markdown":
          void exportLeMEMarkdownDocument();
          break;
        case "menu:export-denden-markdown":
          void exportDendenMarkdownDocument();
          break;
        case "menu:export-web-book":
          void exportWebBookDocument();
          break;
        case "menu:export-book-leme":
          void exportBookAsLeME();
          break;
        case "menu:export-book-denden":
          void exportBookAsDenden();
          break;
        case "menu:export-book-aozora":
          void exportBookAsAozora();
          break;
        case "menu:export-book-web-book":
          void exportBookAsWebBook();
          break;
        case "menu:page-viewer":
          void openPageViewer();
          break;
        case "menu:book-page-viewer":
          void openBookPageViewer();
          break;
        case "menu:view-settings":
          ui.setDisplaySettingsOpen(true);
          break;
        case "menu:manage-libraries":
          handleOpenLibraryManager();
          break;
        case "menu:open-manual":
          void openManualFromMenu();
          break;
        case "menu:show-shortcuts":
          flushImeCompositionSideEffects("menu-show-shortcuts");
          void openShortcutReferenceFromMenu();
          break;
        case "menu:bug-report":
          void sendBugReport();
          break;
        case "menu:feedback":
          void sendFeedback();
          break;
      }
    });
  }, [
    confirmContinueWithUnsavedChanges,
    flushImeCompositionSideEffects,
    handleOpenLibraryManager,
    openManualFromMenu,
    openShortcutReferenceFromMenu,
    saveDocument,
    exportAozoraTextDocument,
    exportLeMEMarkdownDocument,
    exportDendenMarkdownDocument,
    exportWebBookDocument,
    exportBookAsLeME,
    exportBookAsDenden,
    exportBookAsAozora,
    exportBookAsWebBook,
    openPageViewer,
    openBookPageViewer,
    sendBugReport,
    sendFeedback,
    tabManager,
    ui,
    showTabLimitNotice,
  ]);

  const anyTabDirty = ui.tabs.some((t) => t.dirty);
  useEffect(() => {
    const setDirty = window.nyozeBridge?.appState?.setDocumentDirty;
    if (typeof setDirty !== "function") return;
    setDirty(anyTabDirty).catch(() => {
      // ignore
    });
  }, [anyTabDirty]);

  useEffect(() => {
    void refreshActiveDocumentStat(ui.activeTab.filePath ?? null);
  }, [refreshActiveDocumentStat, ui.activeTab.filePath, ui.activeTabId]);

  // SEC-5: Re-notify main of the active file path whenever it changes.
  // This catches Save As (new filePath) and Explorer move/rename (remapped filePath).
  // The pre-loadMarkdown notification in useTabManager handles the document-load case;
  // this effect handles post-render filePath changes where no new loadMarkdown occurs.
  useEffect(() => {
    window.nyozeBridge?.document?.setActiveFilePath(
      ui.activeTab.filePath ?? null,
    );
    // Project タブはアクティブなタブに連動する。作品切り替え(switcher)の上書きはタブ変更で解除し再連動。
    setProjectSwitcherRoot(null);
  }, [ui.activeTab.filePath, ui.activeTabId]);

  // BETA-SP2: save-before-close で全 dirty tab を順次保存する。
  // R3.5-2 P2: active tab は saveActiveTabForClose (ActiveTabSaveOutcome を返す)、
  // non-active dirty tab は markdownSnapshot を直接保存。
  // non-active tab Save As は setActiveTabId + saveDocument ではなく
  // saveTabWithSaveAsDetailed を使い、markdownSnapshot + eol を正本とする。
  useEffect(() => {
    const appState = window.nyozeBridge?.appState;
    const bridge = window.nyozeBridge?.fs;
    if (
      !appState?.onRequestSaveBeforeClose ||
      !appState?.reportSaveBeforeClose ||
      !bridge?.writeFile ||
      !bridge?.saveAs ||
      !bridge?.getFileStat
    ) {
      return;
    }
    return appState.onRequestSaveBeforeClose((requestId) => {
      const closeBridge = {
        writeFile: bridge.writeFile,
        saveAs: bridge.saveAs,
        getFileStat: bridge.getFileStat,
      };
      // P2 fix: local mutable tabs snapshot.
      // React state updates (patchTab/markDirtyFalseForTab) are async,
      // so re-runs of runOnce() must use a synchronously updated copy.
      const closeTabs = ui.tabs.map((t) => ({ ...t }));

      const localMarkTabClean = (tabId: string, md: string) => {
        ui.markDirtyFalseForTab(tabId, md);
        const idx = closeTabs.findIndex((t) => t.id === tabId);
        if (idx !== -1) {
          closeTabs[idx] = { ...closeTabs[idx], dirty: false, markdownSnapshot: md };
        }
      };

      const localPatchTab = (
        tabId: string,
        patch: { title?: string; filePath?: string | null },
      ) => {
        ui.patchTab(tabId, patch);
        const idx = closeTabs.findIndex((t) => t.id === tabId);
        if (idx !== -1) {
          closeTabs[idx] = { ...closeTabs[idx], ...patch };
        }
      };

      const closeDeps = {
        markTabClean: localMarkTabClean,
        fetchAndPatchSavedStat,
        patchTab: localPatchTab,
      };

      const runOnce = () =>
        saveAllDirtyTabsBeforeCloseDetailed({
          tabs: closeTabs,
          activeTabId: ui.activeTabId,
          saveActiveTab: async () => {
            const outcome = await saveActiveTabForClose();
            if (outcome.ok) {
              const idx = closeTabs.findIndex((t) => t.id === ui.activeTabId);
              if (idx !== -1) {
                closeTabs[idx] = { ...closeTabs[idx], dirty: false };
              }
            }
            return outcome;
          },
          ...closeDeps,
          bridge: closeBridge,
        });

      const combineWarnings = (
        warnings: Array<{ tabId: string; warning: string }>,
      ): string | null =>
        warnings.length > 0 ? warnings.map((w) => w.warning).join("\n") : null;

      // P2 fix: out-of-band Save As (handleNonActiveTabSaveAs / active saveAs)
      // で発生した backupWarning を蓄積し、最終 acknowledge で使う。
      const extraWarnings: Array<{ tabId: string; warning: string }> = [];

      // R3.5-2 P2: 非 active tab の Save As を markdownSnapshot で行う。
      // Save As エラーが起きた場合は SaveFailureModal で retry/cancel を繰り返す。
      const handleNonActiveTabSaveAs = async (
        failedTabId: string,
      ): Promise<boolean> => {
        const tabInfo = closeTabs.find((t) => t.id === failedTabId);
        if (!tabInfo || !tabInfo.dirty) return false;
        const outcome = await saveTabWithSaveAsDetailed(tabInfo, {
          ...closeDeps,
          bridge: closeBridge,
        });
        if (outcome.ok) {
          if (outcome.backupWarning) {
            extraWarnings.push({ tabId: failedTabId, warning: outcome.backupWarning });
          }
          // localPatchTab が closeTabs を同期更新済みなので新しい filePath を読める
          const savedPath = closeTabs.find((t) => t.id === failedTabId)?.filePath;
          if (savedPath) void notifyFileExplorerFileSaved(savedPath);
          return true;
        }
        if (outcome.reason.kind === "canceled") return false;
        // save-error: Ask user
        const info: SaveFailureInfo = {
          tabTitle: tabInfo.title,
          filePath: tabInfo.filePath,
          errorKind:
            outcome.reason.kind === "save-error"
              ? outcome.reason.errorKind
              : "write-failed",
          errorMessage:
            outcome.reason.kind === "save-error"
              ? outcome.reason.errorMessage
              : undefined,
        };
        const action = await requestSaveFailureAction(info);
        if (action === "cancel") return false;
        return await handleNonActiveTabSaveAs(failedTabId);
      };

      const attempt = async (): Promise<boolean> => {
        const result = await runOnce();
        const allWarnings = [...result.backupWarnings, ...extraWarnings];
        const combined = combineWarnings(allWarnings);

        if (result.ok) {
          if (combined) await acknowledgeBackupWarning(combined);
          return true;
        }

        // 失敗 attempt でも成功済みタブの warnings を蓄積する。
        // retry 後は保存済みタブが clean になり同じ警告が返らないため、
        // ここで extraWarnings に移さないと最終成功時の acknowledge から漏れる。
        for (const w of result.backupWarnings) {
          if (!extraWarnings.some((e) => e.tabId === w.tabId && e.warning === w.warning)) {
            extraWarnings.push(w);
          }
        }

        if (combined) showBackupWarningIfPresent(combined);

        if (result.reason.kind === "save-error") {
          const info: SaveFailureInfo = {
            tabTitle: result.failedTab.title,
            filePath: result.failedTab.filePath,
            errorKind: result.reason.errorKind,
            errorMessage: result.reason.errorMessage,
          };
          const action = await requestSaveFailureAction(info);
          if (action === "cancel") return false;
          if (action === "retry") {
            return await attempt();
          }
          // saveAs: active tab と non-active tab で経路を分ける。
          if (result.failedTab.id === ui.activeTabId) {
            saveDocumentDetailRef.current = null;
            const saved = await saveDocument(true);
            if (!saved) return false;
            const detail = saveDocumentDetailRef.current as SaveDocumentDetail | null;
            saveDocumentDetailRef.current = null;
            if (detail?.backupWarning) {
              extraWarnings.push({
                tabId: result.failedTab.id,
                warning: detail.backupWarning,
              });
            }
            const idx = closeTabs.findIndex((t) => t.id === result.failedTab.id);
            if (idx !== -1) {
              closeTabs[idx] = { ...closeTabs[idx], dirty: false };
            }
          } else {
            const saved = await handleNonActiveTabSaveAs(result.failedTab.id);
            if (!saved) return false;
          }
          return await attempt();
        }
        // conflict / canceled: close is aborted.
        return false;
      };

      void attempt()
        .then((ok) => appState.reportSaveBeforeClose(requestId, ok))
        .catch(() => appState.reportSaveBeforeClose(requestId, false));
    });
  }, [
    saveDocument,
    saveActiveTabForClose,
    ui.tabs,
    ui.activeTabId,
    ui,
    fetchAndPatchSavedStat,
    showBackupWarningIfPresent,
    acknowledgeBackupWarning,
    requestSaveFailureAction,
    notifyFileExplorerFileSaved,
  ]);

  // BETA-C1: Centralized Undo/Redo routing — toolbar, shortcuts, and availability
  // all derive from the same source via useUndoRedoRouting.
  const { handleUndo, handleRedo, effectiveAvailability } = useUndoRedoRouting({
    coreRef,
    fullPlainEditActive: ui.fullPlainEditActive,
    sourceModeController,
    paragraphPlainModeActive: ui.paragraphPlainModeActive,
    imeComposingRef,
    commandAvailability,
  });

  const internalShortcutDocActive = Boolean(ui.activeTab.internalDocId);

  const headerCommandAvailability = useMemo(
    () =>
      internalShortcutDocActive
        ? clampCommandAvailabilityForInternalDoc(effectiveAvailability)
        : effectiveAvailability,
    [internalShortcutDocActive, effectiveAvailability],
  );

  const contextMenuCommandAvailability = useMemo(
    () =>
      internalShortcutDocActive
        ? clampCommandAvailabilityForInternalDoc(ctxMenu.availability)
        : ctxMenu.availability,
    [internalShortcutDocActive, ctxMenu.availability],
  );

  const guardedUndo = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    handleUndo();
  }, [handleUndo, ui.activeTab.internalDocId]);

  const guardedRedo = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    handleRedo();
  }, [handleRedo, ui.activeTab.internalDocId]);

  const runMarkCommand = useCallback(
    (commandName: "bold" | "italic" | "strike" | "highlight" | "underline") => {
      if (ui.activeTab.internalDocId) return;
      if (coreRef.current?.getCommandAvailability().touchesNoteAnchor) return;
      coreRef.current?.execute(commandName);
    },
    [ui.activeTab.internalDocId],
  );

  const handleToggleInlineCode = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleInlineCode();
  }, [ui.activeTab.internalDocId]);

  const handleClearFormat = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    if (coreRef.current?.getCommandAvailability().touchesNoteAnchor) return;
    coreRef.current?.clearFormat();
  }, [ui.activeTab.internalDocId]);

  const handleInsertHorizontalRule = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.insertHorizontalRule();
  }, [ui.activeTab.internalDocId]);

  const handleToggleHeading = useCallback((level: number) => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleHeading(level);
  }, [ui.activeTab.internalDocId]);

  const handleToggleBulletList = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleBulletList();
  }, [ui.activeTab.internalDocId]);

  const handleToggleOrderedList = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleOrderedList();
  }, [ui.activeTab.internalDocId]);

  const handleToggleChecklist = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleChecklist();
  }, [ui.activeTab.internalDocId]);

  const handleToggleBlockquote = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleBlockquote();
  }, [ui.activeTab.internalDocId]);

  const handleToggleCodeBlock = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleCodeBlock();
  }, [ui.activeTab.internalDocId]);

  const blockDirective = useBlockDirectiveCommands(coreRef, Boolean(ui.activeTab.internalDocId));

  const guardedOpenLinkPrompt = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    openLinkPrompt();
  }, [openLinkPrompt, ui.activeTab.internalDocId]);

  const guardedOpenImagePrompt = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    openImagePrompt();
  }, [openImagePrompt, ui.activeTab.internalDocId]);

  const guardedOpenRubyBoutenPrompt = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    openRubyBoutenPrompt();
  }, [openRubyBoutenPrompt, ui.activeTab.internalDocId]);

  // Global keyboard shortcuts (marks, headings, list move, outline, search)
  useGlobalShortcuts({
    coreRef,
    sourceModeController,
    writingMode: ui.writingMode,
    getPlainModeKind,
    getInternalDocActive: () => Boolean(ui.activeTab.internalDocId),
    onOpenSearch: search.openSearch,
    onOpenSearchReplace: handleOpenSearchReplaceShortcut,
    onOpenLinkPrompt: guardedOpenLinkPrompt,
    onOpenRubyPrompt: guardedOpenRubyBoutenPrompt,
    onShowEditorInlineHint: ui.showEditorInlineHint,
    onToggleParagraphPlainMode: toggleParagraphPlainMode,
    onToggleLeftPane: handleToggleLeftPane,
    onToggleRightPane: handleToggleRightPane,
  });

  const handleWindowMinimize = useCallback(() => {
    const minimize = window.nyozeBridge?.windowControls?.minimize;
    if (typeof minimize === "function") {
      minimize().catch(() => {
        // ignore
      });
    }
  }, []);

  const handleWindowClose = useCallback(() => {
    const close = window.nyozeBridge?.windowControls?.close;
    if (typeof close === "function") {
      close().catch(() => {
        // ignore
      });
      return;
    }
    window.close();
  }, []);

  const handleOpenAppMenu = useCallback(() => {
    const openMenu = window.nyozeBridge?.menu?.openAppMenu;
    if (typeof openMenu === "function") {
      openMenu(ui.uiLanguageMode).catch(() => {
        // ignore
      });
    }
  }, [ui.uiLanguageMode]);

  const handleLoad = useCallback(
    async (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey) {
        flushImeCompositionSideEffects("load-shift-new-tab");
        void tabManager.addNewTab().then((ok) => {
          if (ok === "tab-limit") showTabLimitNotice();
        });
        return;
      }

      const bridge = window.nyozeBridge?.fs;
      if (bridge?.openPath && bridge?.openFile) {
        const opened = await bridge.openPath();
        if (!opened) return;
        if (opened.kind === "directory") {
          // main 側 picker は openFile only。万一フォルダが返っても気軽な書庫追加に
          // せず、rootPath を渡さず書庫管理画面へ誘導する（登録は modal 内導線で）。
          handleOpenLibraryManager();
          return;
        }
        const openResult = await bridge.openFile(opened.path);
        if (!openResult.ok) {
          window.alert(openResult.errorMessage);
          return;
        }
        flushImeCompositionSideEffects("load-into-active-tab");
        const stat = await bridge.getFileStat?.(opened.path).catch(() => null);
        const saved: SavedFileStat = stat ? { mtimeMs: stat.mtimeMs, size: stat.size } : null;
        void tabManager.loadIntoActiveTab(
          opened.path,
          getPathBaseName(opened.path),
          openResult.content,
          saved,
        );
        return;
      }

      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.markdown,.txt";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          flushImeCompositionSideEffects("load-local-file");
          void tabManager.loadIntoActiveTab(
            null,
            file.name || "document.md",
            text,
          );
        };
        reader.readAsText(file);
      };
      input.click();
    },
    [flushImeCompositionSideEffects, handleOpenLibraryManager, showTabLimitNotice, tabManager],
  );

  const handleSave = useCallback(
    async (event: ReactMouseEvent<HTMLButtonElement>) => {
      await saveDocument(event.shiftKey);
    },
    [saveDocument],
  );

  const handleToggleTcy = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    coreRef.current?.toggleTcy();
  }, [ui.activeTab.internalDocId]);

  const handleCut = useCallback(() => {
    if (coreRef.current?.getCommandAvailability().touchesNoteAnchor) return;
    cutSelection();
  }, []);

  const handleCopy = useCallback(() => {
    copySelection();
  }, []);

  const handlePaste = useCallback(async () => {
    await pasteFromClipboard();
  }, []);

  const handlePastePlain = useCallback(async () => {
    const r = await pasteFromClipboardPlainOnly();
    if (r.ok) return;
    if (r.reason === "clipboard_unavailable") {
      ui.showEditorInlineHint(
        "Could not read the clipboard. Allow clipboard access, or use Paste.",
      );
      return;
    }
    ui.showEditorInlineHint("No plain text on the clipboard.");
  }, [ui]);

  const handleDocumentThemeChange = useCallback(
    (docTheme: DocumentTheme) => {
      const matchedSystemPreset = ui.docThemePresets.find(
        (preset) =>
          isSystemDocPreset(preset) && preset.baseDocTheme === docTheme,
      );
      if (matchedSystemPreset) {
        ui.setActiveDocThemePresetId(matchedSystemPreset.id);
        if (docTheme === "ui-linked") {
          // Keep ui-linked document colors synchronized with the current UI theme/preset.
          ui.syncDocColorSettings(
            resolveDocThemeColors(docTheme, ui.theme, {
              activeUiThemePresetId: ui.activeUiThemePresetId,
              uiThemePresets: ui.uiThemePresets,
            }),
          );
        }
        return;
      }
      ui.setDocumentTheme(docTheme);
      ui.setDocColorSettings(
        resolveDocThemeColors(docTheme, ui.theme, {
          activeUiThemePresetId: ui.activeUiThemePresetId,
          uiThemePresets: ui.uiThemePresets,
        }),
      );
    },
    [ui],
  );

  const documentTheme = ui.documentTheme;
  const activeDocThemePresetId = ui.activeDocThemePresetId;
  const activeUiThemePresetId = ui.activeUiThemePresetId;
  const uiThemePresets = ui.uiThemePresets;
  const uiTheme = ui.theme;
  const docColorSettings = ui.docColorSettings;
  const syncDocColorSettings = ui.syncDocColorSettings;
  const activeDocPreset = activeDocThemePresetId
    ? (ui.docThemePresets.find(
        (preset) => preset.id === activeDocThemePresetId,
      ) ?? null)
    : null;
  const shouldFollowUiThemeForDocument =
    documentTheme === "ui-linked" &&
    activeDocPreset !== null &&
    isSystemDocPreset(activeDocPreset) &&
    activeDocPreset.baseDocTheme === "ui-linked";
  const activeUiPreset = activeUiThemePresetId
    ? (uiThemePresets.find((preset) => preset.id === activeUiThemePresetId) ??
      null)
    : null;
  const resolvedCaretColor = resolveCaretColor(
    ui.caretColorMode,
    ui.caretColorCustom,
    ui.docColorSettings.pageColor,
    resolveUiThemeAccentColor(uiTheme, activeUiPreset),
  );

  useEffect(() => {
    if (!shouldFollowUiThemeForDocument) return;
    // Follow UI theme only while the linked system preset is active.
    const linked = resolveDocThemeColors("ui-linked", uiTheme, {
      activeUiThemePresetId,
      uiThemePresets,
    });
    const current = docColorSettings;
    if (
      current.pageColor === linked.pageColor &&
      current.textColor === linked.textColor &&
      current.headingColor === linked.headingColor
    ) {
      return;
    }
    syncDocColorSettings(linked);
  }, [
    shouldFollowUiThemeForDocument,
    uiTheme,
    docColorSettings,
    activeUiThemePresetId,
    uiThemePresets,
    syncDocColorSettings,
  ]);

  const handleOpenThemeStudioPane = useCallback(() => {
    setRightPaneOpen(true);
    ui.setRightPaneTab("theme");
    ui.setDisplaySettingsOpen(false);
  }, [setRightPaneOpen, ui]);

  const handleRevealNoteInPanel = useCallback(
    (id: string) => {
      if (ui.activeTab.internalDocId) return;
      if (ui.fullPlainEditActive || ui.paragraphPlainModeActive) return;
      setRightPaneOpen(true);
      // 付箋 UI は Notes タブへ分離済み。marker click は Notes タブを開く。
      ui.setRightPaneTab("notes");
      ui.setDisplaySettingsOpen(false);
      setFocusedDocumentNoteId(id);
      // 同じ id でもイベントとして再通知し、reveal を必ず再発火させる。
      setFocusedDocumentNoteSerial((serial) => serial + 1);
      syncAnchoredNoteIds();
    },
    [setRightPaneOpen, syncAnchoredNoteIds, ui],
  );

  const handleDeleteOrphanNote = useCallback(
    async (id: string): Promise<OrphanNoteDeleteResult> => {
      if (ui.activeTab.internalDocId) {
        return { kind: "cancelled" };
      }
      if (ui.fullPlainEditActive || ui.paragraphPlainModeActive) {
        return { kind: "cancelled" };
      }

      const t = createUiTextGetter(ui.uiLanguageMode);
      if (!window.confirm(t("documentNotes.orphanDeleteConfirm"))) {
        return { kind: "cancelled" };
      }

      const deps = {
        getActiveFilePath: () => ui.activeTab.filePath,
        isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
        getPlainModeKind,
        getBridge: () => window.nyozeBridge?.project ?? null,
        getAnchoredNoteIds: () => anchoredNoteIds,
      };

      const prepared = await prepareOrphanNoteDelete(deps);
      if (prepared.kind === "blocked") {
        return { kind: "failed", message: prepared.message };
      }

      const result = await commitOrphanNoteDelete(deps, {
        activeFilePath: prepared.activeFilePath,
        id,
      });
      if (result.kind === "failed") {
        return { kind: "failed", message: result.message };
      }

      void refreshDocumentNotes();
      void refreshMissingFileNotes();
      void refreshNoteAnchorPreviews();
      return { kind: "deleted" };
    },
    [
      anchoredNoteIds,
      getPlainModeKind,
      refreshDocumentNotes,
      refreshMissingFileNotes,
      refreshNoteAnchorPreviews,
      ui,
    ],
  );

  const {
    handleSaveNoteEdit,
    handleMarkResolved,
    handleReopenNote,
    handleAddTag,
    handleRenameTag,
    handleDeleteTag,
  } = useNotePanelActions({
    getActiveFilePath: () => ui.activeTab.filePath,
    isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
    isPlainModeActive: () => ui.fullPlainEditActive || ui.paragraphPlainModeActive,
    getPlainModeKind,
    getBridge: () => window.nyozeBridge?.project ?? null,
    getUiLanguageMode: () => ui.uiLanguageMode,
    onSaved: refreshAllNotePanels,
  });

  const missingFileDeleteDeps = useMemo(
    () => ({
      getActiveFilePath: () => ui.activeTab.filePath,
      isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
      getPlainModeKind,
      getBridge: () => window.nyozeBridge?.project ?? null,
    }),
    [getPlainModeKind, ui.activeTab.filePath, ui.activeTab.internalDocId],
  );

  const handleDeleteMissingFileNote = useCallback(
    async (id: string): Promise<MissingFileNoteDeleteResult> => {
      if (ui.activeTab.internalDocId) {
        return { kind: "cancelled" };
      }
      if (ui.fullPlainEditActive || ui.paragraphPlainModeActive) {
        return { kind: "cancelled" };
      }

      const t = createUiTextGetter(ui.uiLanguageMode);
      if (!window.confirm(t("documentNotes.missingFileDeleteConfirm"))) {
        return { kind: "cancelled" };
      }

      const prepared = await prepareMissingFileNoteDelete(missingFileDeleteDeps);
      if (prepared.kind === "blocked") {
        return { kind: "failed", message: prepared.message };
      }

      const result = await commitMissingFileNoteDelete(missingFileDeleteDeps, {
        activeFilePath: prepared.activeFilePath,
        id,
      });
      if (result.kind === "failed") {
        return { kind: "failed", message: result.message };
      }

      void refreshDocumentNotes();
      void refreshMissingFileNotes();
      void refreshNoteAnchorPreviews();
      return { kind: "deleted" };
    },
    [
      missingFileDeleteDeps,
      refreshDocumentNotes,
      refreshMissingFileNotes,
      refreshNoteAnchorPreviews,
      ui,
    ],
  );

  const handleDeleteAllMissingFileNotes = useCallback(async (): Promise<MissingFileNoteDeleteResult> => {
    if (ui.activeTab.internalDocId) {
      return { kind: "cancelled" };
    }
    if (ui.fullPlainEditActive || ui.paragraphPlainModeActive) {
      return { kind: "cancelled" };
    }
    if (missingFileNotesState.kind !== "ready" || missingFileNotesState.notes.length === 0) {
      return { kind: "cancelled" };
    }

    const t = createUiTextGetter(ui.uiLanguageMode);
    if (!window.confirm(t("documentNotes.missingFileDeleteAllConfirm"))) {
      return { kind: "cancelled" };
    }

    const prepared = await prepareMissingFileNoteDelete(missingFileDeleteDeps);
    if (prepared.kind === "blocked") {
      return { kind: "failed", message: prepared.message };
    }

    const result = await commitMissingFileNotesBulkDelete(missingFileDeleteDeps, {
      activeFilePath: prepared.activeFilePath,
      ids: missingFileNotesState.notes.map((note) => note.id),
    });
    if (result.kind === "failed") {
      return { kind: "failed", message: result.message };
    }

    void refreshDocumentNotes();
    void refreshMissingFileNotes();
    void refreshNoteAnchorPreviews();
    return { kind: "deleted" };
  }, [
    missingFileDeleteDeps,
    missingFileNotesState,
    refreshDocumentNotes,
    refreshMissingFileNotes,
    refreshNoteAnchorPreviews,
    ui,
  ]);

  const handleDeleteNoteAnchor = useCallback(
    async (id: string, domMarker: Element | null = null) => {
      if (ui.activeTab.internalDocId) return;
      if (ui.fullPlainEditActive || ui.paragraphPlainModeActive) return;

      const t = createUiTextGetter(ui.uiLanguageMode);
      const activeFilePath = ui.activeTab.filePath;
      const bridge = window.nyozeBridge?.project ?? null;
      const deletePath = await resolveNoteAnchorDeletePath(bridge, activeFilePath, id);

      if (deletePath === "markerOnly") {
        if (!window.confirm(t("editor.noteAnchor.removeMarkerOnlyConfirm"))) return;

        const markerOnlyDeps = {
          isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
          getPlainModeKind,
          removeAnchorAtDom: (markerElement: Element | null, noteId: string) =>
            coreRef.current?.removeNoteAnchorAtDomMarker(markerElement, noteId) ?? false,
        };
        const prepared = await prepareNoteAnchorMarkerOnlyDelete(markerOnlyDeps);
        if (prepared.kind === "blocked") {
          ui.showEditorInlineHint(prepared.message);
          return;
        }

        const result = commitNoteAnchorMarkerOnlyDelete(markerOnlyDeps, {
          id,
          domMarker,
        });
        if (result.kind === "failed") {
          ui.showEditorInlineHint(result.message);
          return;
        }

        syncAnchoredNoteIds();
        void refreshNoteAnchorPreviews();
        void refreshDocumentNotes();
        void refreshMissingFileNotes();
        return;
      }

      if (!window.confirm(t("editor.noteAnchor.deleteConfirm"))) return;

      const prepared = await prepareNoteAnchorDelete({
        getActiveFilePath: () => ui.activeTab.filePath,
        isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
        getPlainModeKind,
        getBridge: () => window.nyozeBridge?.project ?? null,
        removeAnchor: (noteId) =>
          coreRef.current?.removeNoteAnchorAtDomMarker(domMarker, noteId) ?? false,
      });
      if (prepared.kind === "blocked") {
        ui.showEditorInlineHint(prepared.message);
        return;
      }

      const result = await commitNoteAnchorDelete(
        {
          getActiveFilePath: () => ui.activeTab.filePath,
          isInternalDoc: () => Boolean(ui.activeTab.internalDocId),
          getPlainModeKind,
          getBridge: () => window.nyozeBridge?.project ?? null,
          removeAnchor: (noteId) =>
            coreRef.current?.removeNoteAnchorAtDomMarker(domMarker, noteId) ?? false,
        },
        { activeFilePath: prepared.activeFilePath, id },
      );
      if (result.kind === "failed") {
        ui.showEditorInlineHint(result.message);
        return;
      }

      syncAnchoredNoteIds();
      void refreshNoteAnchorPreviews();
      void refreshDocumentNotes();
      void refreshMissingFileNotes();
    },
    [
      getPlainModeKind,
      refreshDocumentNotes,
      refreshMissingFileNotes,
      refreshNoteAnchorPreviews,
      syncAnchoredNoteIds,
      ui,
    ],
  );

  useEffect(() => {
    const core = coreRef.current;
    core?.setOnNoteAnchorReveal(handleRevealNoteInPanel);
    return () => {
      core?.setOnNoteAnchorReveal(null);
    };
  }, [handleRevealNoteInPanel]);

  useEffect(() => {
    syncAnchoredNoteIds();
  }, [documentNotesState, syncAnchoredNoteIds, ui.activeTab.filePath]);

  const noteAnchorContextMenuId = resolveNoteAnchorOnlyContextMenuId({
    pmHasSelection: ctxMenu.hadTextSelectionAtOpen,
    domHasTextSelection: false,
    hadRecentEditorTextSelection: false,
    domNoteAnchorContextId: ctxMenu.domNoteAnchorContextId,
  });
  const noteAnchorMarkerDeleteMode = deriveMarkerDeleteModeForMenu(
    noteAnchorContextMenuId,
    documentNotesState,
  );

  const [pendingDocumentSettingsChange, setPendingDocumentSettingsChange] =
    useState<PendingDocumentSettingsChange | null>(null);

  const applyDocumentSettingsChange = useCallback(
    (pendingChange: PendingDocumentSettingsChange) => {
      const core = coreRef.current;
      if (!core) return;

      const currentEffectiveLineBreakPolicy = ui.effectiveLineBreakPolicy;
      const currentDocumentMarkdownOptions =
        ui.activeTab.documentMarkdownOptions;
      const lineBreakPolicyChanged =
        pendingChange.nextEffectiveLineBreakPolicy !==
        currentEffectiveLineBreakPolicy;
      const preserveEmptyParagraphsChanged =
        pendingChange.nextDocumentMarkdownOptions.preserveEmptyParagraphs !==
        currentDocumentMarkdownOptions.preserveEmptyParagraphs;

      core.setFrontmatterPrefix(pendingChange.nextFrontmatterPrefix);
      const frontmatterPatchedMarkdown = core.saveMarkdown();

      if (lineBreakPolicyChanged) {
        core.setLineBreakPolicy(pendingChange.nextEffectiveLineBreakPolicy);
        core.applyLineBreakPolicyNow(
          pendingChange.nextEffectiveLineBreakPolicy,
          pendingChange.nextDocumentMarkdownOptions,
        );
      } else if (preserveEmptyParagraphsChanged) {
        if (pendingChange.nextDocumentMarkdownOptions.preserveEmptyParagraphs) {
          core.setDocumentMarkdownOptions(
            pendingChange.nextDocumentMarkdownOptions,
          );
        } else {
          core.applyLineBreakPolicyNow(
            currentEffectiveLineBreakPolicy,
            pendingChange.nextDocumentMarkdownOptions,
          );
        }
      }

      const nextMarkdown = core.saveMarkdown();
      ui.patchActiveTab({
        frontmatterFields: pendingChange.nextFrontmatterFields,
        documentMarkdownOptions: pendingChange.nextDocumentMarkdownOptions,
        markdownSnapshot: nextMarkdown,
        characterCount: countDocumentBodyCharacters(nextMarkdown),
      });
      ui.recalcDirtyFromCore();

      if (!lineBreakPolicyChanged) {
        return;
      }

      if (pendingChange.nextEffectiveLineBreakPolicy === "commonmark-strict") {
        const changedByPolicy = frontmatterPatchedMarkdown !== nextMarkdown;
        const dirtyAfter =
          ui.activeTab.cleanMarkdownSnapshot.length !== nextMarkdown.length ||
          ui.activeTab.cleanMarkdownSnapshot !== nextMarkdown;
        ui.showLineBreakPolicyNotice(
          formatDocumentTypeNoticeMessage(pendingChange.nextDocumentType, {
            changed: changedByPolicy,
            dirty: dirtyAfter,
          }),
          dirtyAfter,
        );
        ui.pulseCommonmarkBadge();
        return;
      }

      ui.clearLineBreakPolicyNotice();
    },
    [ui],
  );

  const handleConfirmLineBreakPolicyChange = useCallback(() => {
    // BETA-SP9: commonmark-strict 確認後も大文書 guard を適用
    if (pendingDocumentSettingsChange) {
      const change = pendingDocumentSettingsChange;
      setPendingDocumentSettingsChange(null);
      largeDocGuard.requestGuardedAction(
        activeDocumentCharacterCount,
        "改行ポリシーの変更は、大きな文書では全文の変換を伴うため数秒かかる場合があります。続行しますか。",
        () => applyDocumentSettingsChange(change),
      );
      return;
    }
    // useAppUiState 経由の requestLineBreakPolicyChange → confirmLineBreakPolicyChange
    largeDocGuard.requestGuardedAction(
      activeDocumentCharacterCount,
      "改行ポリシーの変更は、大きな文書では全文の変換を伴うため数秒かかる場合があります。続行しますか。",
      () => ui.confirmLineBreakPolicyChange(),
    );
  }, [activeDocumentCharacterCount, applyDocumentSettingsChange, largeDocGuard, pendingDocumentSettingsChange, ui]);

  const handleCancelLineBreakPolicyChange = useCallback(() => {
    setPendingDocumentSettingsChange(null);
    ui.cancelLineBreakPolicyChange();
  }, [ui]);

  const documentSettingsMarkdown = ui.activeTab.markdownSnapshot;
  const documentSettingsSplit =
    splitLeadingFrontmatter(documentSettingsMarkdown);
  const documentSettingsHasMalformedLeadingFence =
    /^---[ \t]*(?:\r\n|\n|\r)/.test(documentSettingsMarkdown) &&
    !documentSettingsSplit.hasFrontmatter;
  const canEditDocumentSettings =
    !ui.fullPlainEditActive &&
    !ui.paragraphPlainModeActive &&
    !ui.activeTab.internalDocId &&
    !documentSettingsHasMalformedLeadingFence &&
    canSafelyPatchFrontmatter(documentSettingsSplit.frontmatterPrefix);

  const handleDocumentSettingsChange = useCallback(
    (nextSettings: {
      documentType: DocumentType;
      preserveEmptyParagraphs: boolean;
      persistPreserveEmptyParagraphs?: boolean;
      title: string;
      author: string;
      translator: string;
    }) => {
      if (ui.activeTab.internalDocId) return;
      if (ui.fullPlainEditActive) return;
      if (ui.paragraphPlainModeActive) return;

      const core = coreRef.current;
      if (!core) return;

      const currentMarkdown = core.peekMarkdown();
      const split = splitLeadingFrontmatter(currentMarkdown);
      const hasMalformedLeadingFence =
        /^---[ \t]*(?:\r\n|\n|\r)/.test(currentMarkdown) && !split.hasFrontmatter;
      if (
        hasMalformedLeadingFence ||
        !canSafelyPatchFrontmatter(split.frontmatterPrefix)
      ) {
        return;
      }

      const currentCanonicalDocumentMarkdownOptions =
        resolveDocumentMarkdownOptions(ui.activeTab.frontmatterFields);
      const currentEffectivePreserveEmptyParagraphs =
        ui.activeTab.documentMarkdownOptions.preserveEmptyParagraphs;
      const preserveToggleChanged =
        nextSettings.preserveEmptyParagraphs !==
        currentEffectivePreserveEmptyParagraphs;
      const nextExplicitPreserveEmptyParagraphs =
        nextSettings.documentType === "article" &&
        (nextSettings.persistPreserveEmptyParagraphs === true
          ? true
          : preserveToggleChanged
            ? nextSettings.preserveEmptyParagraphs
            : currentCanonicalDocumentMarkdownOptions.preserveEmptyParagraphs);
      const nextFrontmatterPrefix = patchFrontmatterKnownScalars(
        split.frontmatterPrefix,
        {
          documentType: nextSettings.documentType,
          nyozePreserveEmptyParagraphs:
            nextExplicitPreserveEmptyParagraphs
              ? true
              : null,
          title: nextSettings.title,
          author: nextSettings.author,
          translator: nextSettings.translator,
        },
      );
      const nextFrontmatterFields = parseFrontmatterFields(nextFrontmatterPrefix);
      const nextDocumentType = resolveDocumentType(nextFrontmatterFields);
      const nextDocumentMarkdownOptions = {
        preserveEmptyParagraphs:
          nextSettings.documentType === "article" &&
          nextSettings.preserveEmptyParagraphs,
      };
      const nextEffectiveLineBreakPolicy =
        resolveEffectiveLineBreakPolicyForDocumentSettings(
          nextFrontmatterFields,
          ui.activeTab.lineBreakPolicy,
        );
      const currentDocumentMarkdownOptions = ui.activeTab.documentMarkdownOptions;
      if (
        nextFrontmatterPrefix === split.frontmatterPrefix &&
        nextEffectiveLineBreakPolicy === ui.effectiveLineBreakPolicy &&
        nextDocumentMarkdownOptions.preserveEmptyParagraphs ===
          currentDocumentMarkdownOptions.preserveEmptyParagraphs
      ) {
        return;
      }
      const pendingChange = {
        nextFrontmatterPrefix,
        nextFrontmatterFields,
        nextDocumentType,
        nextEffectiveLineBreakPolicy,
        nextDocumentMarkdownOptions,
      };
      const requiresImmediateNormalization =
        nextEffectiveLineBreakPolicy !== ui.effectiveLineBreakPolicy ||
        (currentDocumentMarkdownOptions.preserveEmptyParagraphs &&
          !nextDocumentMarkdownOptions.preserveEmptyParagraphs);

      if (
        nextEffectiveLineBreakPolicy !== ui.effectiveLineBreakPolicy &&
        nextEffectiveLineBreakPolicy === "commonmark-strict"
      ) {
        setPendingDocumentSettingsChange(pendingChange);
        return;
      }

      // BETA-SP9: 文書全体の再解釈が必要な変更では大文書 guard をかける
      if (requiresImmediateNormalization) {
        largeDocGuard.requestGuardedAction(
          activeDocumentCharacterCount,
          "この変更は、大きな文書では全文の再解釈を伴うため数秒かかる場合があります。続行しますか。",
          () => applyDocumentSettingsChange(pendingChange),
        );
        return;
      }

      applyDocumentSettingsChange(pendingChange);
    },
    [activeDocumentCharacterCount, applyDocumentSettingsChange, largeDocGuard, ui],
  );
  const handleDocumentWritingModeChange = useDocumentWritingModeChange(coreRef, ui);

  const openFullPlainEdit = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    const core = coreRef.current;
    if (!core) return;
    core.setParagraphPlainMode(false);
    ui.setParagraphPlainModeActive(false);
    // Snapshot both raw editor-surface scroll (writing-mode toggle fallback)
    // and a layout-independent viewport anchor (for Source Mode round-trip).
    const anchor = core.captureViewportAnchor();
    const markdown = core.saveMarkdown();
    // Map the PM viewport anchor to an approximate Markdown body offset by
    // ratio. Keep frontmatter as a raw prefix so the Source Mode scroller lands
    // near the same body text instead of being shifted by metadata length.
    let initialSourceOffset: number | null = null;
    const markdownSplit = splitLeadingFrontmatter(markdown);
    if (
      anchor &&
      anchor.textTotal > 0 &&
      markdownSplit.body.length > 0 &&
      anchor.textOffset > 0
    ) {
      const ratio = Math.max(
        0,
        Math.min(1, anchor.textOffset / anchor.textTotal),
      );
      initialSourceOffset =
        markdownSplit.frontmatterPrefix.length +
        Math.round(ratio * markdownSplit.body.length);
    }
    ui.patchActiveTab({
      ...captureEditorScroll(),
      viewportAnchorPmPos: anchor?.pmPos ?? null,
      viewportAnchorTextOffset: anchor?.textOffset ?? null,
      viewportAnchorTextTotal: anchor?.textTotal ?? null,
      sourceModeTopOffset: initialSourceOffset,
    });
    ui.setFullPlainEditValue(markdown);
    ui.setFullPlainEditError("");
    ui.setFullPlainEditActive(true);
  }, [captureEditorScroll, ui]);

  const applyFullPlainEdit = useCallback((): boolean => {
    const core = coreRef.current;
    if (!core || !ui.fullPlainEditActive) return false;
    const draftMarkdown =
      sourceModeController.getValue() ?? ui.fullPlainEditValue;
    try {
      core.loadMarkdown(draftMarkdown);
      const normalizedMarkdown = core.saveMarkdown();
      syncActiveTabFrontmatter(normalizedMarkdown);
      ui.setFullPlainEditValue(normalizedMarkdown);
      sourceModeController.setValue(normalizedMarkdown, {
        resetHistory: true,
      });
      ui.setFullPlainEditError("");
      return true;
    } catch {
      ui.setFullPlainEditError(
        "Markdown適用に失敗しました。入力内容を確認してください。",
      );
      return false;
    }
  }, [sourceModeController, syncActiveTabFrontmatter, ui]);

  const closeFullPlainEdit = useCallback(() => {
    // While Source Mode is active, WYSIWYG .editor-surface には is-hidden-for-plain
    // で display:none が付いている。非表示のまま scroll を書いても 0 丸めされ得るため、
    // 可視化してから (rAF×2) で復元する。
    // Capture Source Mode's current viewport-center offset BEFORE tearing down
    // the overlay so the centered PM restore does not introduce a half-screen
    // jump. The legacy tab field name is kept for compatibility.
    const sourceCenterOffset =
      sourceModeController.captureViewportCenterOffset();
    const sourceValue = sourceModeController.getValue();
    let sourceBodyTextOffset: number | null = null;
    let sourceRatio: number | null = null;
    if (
      typeof sourceValue === "string" &&
      typeof sourceCenterOffset === "number"
    ) {
      const sourceSplit = splitLeadingFrontmatter(sourceValue);
      sourceBodyTextOffset = Math.max(
        0,
        sourceCenterOffset - sourceSplit.frontmatterPrefix.length,
      );
      sourceRatio =
        sourceSplit.body.length > 0
          ? Math.max(
              0,
              Math.min(1, sourceBodyTextOffset / sourceSplit.body.length),
            )
          : null;
    }
    ui.patchActiveTab({ sourceModeTopOffset: sourceCenterOffset });

    ui.setFullPlainEditActive(false);
    ui.setFullPlainEditError("");
    // Full Plain editing may have set dirty based on Source Mode content.
    // After discarding, re-evaluate dirty from the core (unchanged) content.
    ui.recalcDirtyFromCore();

    const { scrollTop, scrollLeft } = ui.activeTab;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const core = coreRef.current;
        // Prefer PM text-offset restore. It is still approximate because
        // Source Mode offset is Markdown text, but it avoids mapping a
        // Markdown ratio directly onto PM structural docSize.
        if (core && sourceBodyTextOffset !== null && sourceBodyTextOffset > 0) {
          const restored =
            core.scrollEditorSurfaceToTextOffset(sourceBodyTextOffset);
          if (restored) return;
        }
        if (core && sourceRatio !== null && sourceRatio > 0) {
          core.scrollEditorSurfaceToRatio(sourceRatio);
          return;
        }
        // Fallback: raw pre-enter scroll (may reset to top for new layouts).
        applyEditorScroll({ scrollTop, scrollLeft });
      });
    });
  }, [applyEditorScroll, sourceModeController, ui]);
  // BETA-SP1: guardSourceModeDraft の遅延参照用 ref に closeFullPlainEdit を登録
  guardSourceModeDraftDepsRef.current.closeFullPlainEdit = closeFullPlainEdit;

  // BETA-SP9: Source Mode apply を guard でラップ
  const guardedApplyAndCloseFullPlainEdit = useCallback(() => {
    const ok = applyFullPlainEdit();
    if (ok) closeFullPlainEdit();
  }, [applyFullPlainEdit, closeFullPlainEdit]);

  const handleToggleWritingMode = useCallback(() => {
    if (ui.activeTab.internalDocId) return;
    // Writing-mode toggle flips the scroll axis and changes layout entirely,
    // so raw scrollTop/scrollLeft restore lands on the wrong spot (usually
    // snapped to 0). Use a layout-independent PM viewport anchor instead:
    // capture the PM pos nearest the visible center, toggle, then re-anchor
    // via coordsAtPos against the new layout.
    const core = coreRef.current;
    const anchor = core?.captureViewportAnchor() ?? null;
    const scrollPosition = captureEditorScroll();
    ui.patchActiveTab({
      ...scrollPosition,
      viewportAnchorPmPos: anchor?.pmPos ?? null,
      viewportAnchorTextOffset: anchor?.textOffset ?? null,
      viewportAnchorTextTotal: anchor?.textTotal ?? null,
    });
    ui.toggleWritingMode();
    // Defer restore until after the new writing-mode CSS has been applied by
    // the browser. rAF×2 matches the existing closeFullPlainEdit pattern.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentCore = coreRef.current;
        if (anchor && currentCore) {
          currentCore.restoreViewportAnchor(anchor);
        } else {
          applyEditorScroll(scrollPosition);
        }
      });
    });
  }, [applyEditorScroll, captureEditorScroll, ui]);

  const toggleFullPlainEdit = useCallback(() => {
    if (ui.fullPlainEditActive) {
      largeDocGuard.requestGuardedAction(
        activeDocumentCharacterCount,
        "Source Mode から通常表示へ戻るときは、大きな文書では数秒かかる場合があります。続行しますか。",
        guardedApplyAndCloseFullPlainEdit,
      );
      return;
    }
    openFullPlainEdit();
  }, [
    activeDocumentCharacterCount,
    guardedApplyAndCloseFullPlainEdit,
    largeDocGuard,
    openFullPlainEdit,
    ui.fullPlainEditActive,
  ]);

  const resolvedDocumentType = resolveDocumentType(ui.activeTab.frontmatterFields);
  const displayedDocumentMetadata = resolveDisplayedDocumentMetadata({
    fields: ui.activeTab.frontmatterFields,
    filePath: ui.activeTab.filePath,
    fallbackTitle: ui.activeTab.title,
    inProject: activeFileMembership.inProject,
    projectDisplayMetadata,
  });
  const activeDocumentInfo: ActiveDocumentInfo = {
    characterCount: activeDocumentCharacterCount,
    createdAtText: ui.activeTab.filePath
      ? formatDocumentInfoDate(activeDocumentStat?.ctimeMs ?? null)
      : "—",
    updatedAtText: ui.activeTab.filePath
      ? formatDocumentInfoDate(activeDocumentStat?.mtimeMs ?? null)
      : "—",
    pathText:
      ui.activeTab.filePath ?? getUiText(ui.uiLanguageMode, "common.unsaved"),
    pathTitle:
      ui.activeTab.filePath ?? getUiText(ui.uiLanguageMode, "common.unsaved"),
    documentTypeLabel: formatDocumentTypeLabel(
      resolvedDocumentType,
      ui.uiLanguageMode,
    ),
    eolKind: ui.activeTab.eol,
    // 文書 metadata（表示専用。frontmatter / Markdown には書き込まない）。
    titleText: displayedDocumentMetadata.titleText,
    authorText: displayedDocumentMetadata.authorText,
    translatorText: displayedDocumentMetadata.translatorText,
    writingModeLabel: formatWritingModeLabel(ui.writingMode, ui.uiLanguageMode),
  };
  const resolvedDocumentMarkdownOptions = resolveDocumentMarkdownOptions(
    ui.activeTab.frontmatterFields,
  );
  const autoProtectedPreserveEmptyParagraphs =
    resolvedDocumentType === "article" &&
    ui.activeTab.documentMarkdownOptions.preserveEmptyParagraphs &&
    !resolvedDocumentMarkdownOptions.preserveEmptyParagraphs;

  const editorTabActionsSlot = useEditorTabActionsSlot({
    ui,
    search,
    largeDocGuard,
    activeDocumentCharacterCount,
    toggleParagraphPlainMode,
    toggleFullPlainEdit,
    handleToggleWritingMode,
    headerCommandAvailability,
    openPageViewer,
    openBookPageViewer,
    bookPageViewerToolbarAvailability,
  });

  return (
    <main className="app-shell">
      <UnifiedHeader
        leftPaneOpen={leftPaneOpen}
        rightPaneOpen={rightPaneOpen}
        onToggleLeftPane={() => setLeftPaneOpen((v) => !v)}
        onToggleRightPane={() => setRightPaneOpen((v) => !v)}
        usesNativeWindowControls={ui.usesNativeWindowControls}
        onWindowMinimize={handleWindowMinimize}
        onWindowClose={handleWindowClose}
        platform={ui.platform}
        uiLanguageMode={ui.uiLanguageMode}
        toolbarVisible={ui.toolbarVisible}
        onToggleToolbarVisible={ui.toggleToolbarVisible}
        toolbarOffset={ui.toolbarOffset}
        onToolbarOffsetChange={ui.setToolbarOffset}
        onToolbarOffsetReset={ui.resetToolbarOffset}
        writingMode={ui.writingMode}
        availability={headerCommandAvailability}
        paragraphPlainModeActive={ui.paragraphPlainModeActive}
        fullPlainEditActive={ui.fullPlainEditActive}
        internalDocActive={Boolean(ui.activeTab.internalDocId)}
        onRunMarkCommand={runMarkCommand}
        onUndo={guardedUndo}
        onRedo={guardedRedo}
        onToggleInlineCode={handleToggleInlineCode}
        onInsertHorizontalRule={handleInsertHorizontalRule}
        onToggleHeading={handleToggleHeading}
        onToggleBulletList={handleToggleBulletList}
        onToggleOrderedList={handleToggleOrderedList}
        onToggleChecklist={handleToggleChecklist}
        onToggleBlockquote={handleToggleBlockquote}
        onToggleCodeBlock={handleToggleCodeBlock}
        onApplyBlockDirective={blockDirective.apply}
        onRemoveBlockDirective={blockDirective.remove}
        onInsertPageBreak={blockDirective.insertPageBreak}
        onDeletePageBreak={blockDirective.deletePageBreak}
        onInsertBlankPage={blockDirective.insertBlankPage}
        onClearFormat={handleClearFormat}
        onSetOrUnsetLink={guardedOpenLinkPrompt}
        onInsertImage={guardedOpenImagePrompt}
        onInsertRubyBouten={guardedOpenRubyBoutenPrompt}
        onAddNoteAnchor={openNoteAnchorPrompt}
        onToggleTcy={handleToggleTcy}
        onShowEditorInlineHint={ui.showEditorInlineHint}
        onLoad={handleLoad}
        onSave={handleSave}
        onOpenAppMenu={handleOpenAppMenu}
        appTitleVisible={ui.appTitleVisible}
        appTitleText={ui.appTitleText}
        chapterNavSlot={
          <ToolbarChapterNavContainer
            getActiveFilePath={() => ui.activeTab.filePath} isInternalDoc={() => Boolean(ui.activeTab.internalDocId)}
            uiLanguageMode={ui.uiLanguageMode} writingMode={ui.writingMode} loadIntoActiveTab={tabManager.loadIntoActiveTab} openFileInTab={tabManager.openFileInTab}
            flushImeCompositionSideEffects={flushImeCompositionSideEffects} onTabLimit={showTabLimitNotice}
            navigationDisabled={ui.fullPlainEditActive || ui.paragraphPlainModeActive}
            projectRefreshNonce={projectRefreshNonce}
          />
        }
      />

      <Workspace
        editorTabActionsSlot={editorTabActionsSlot}
        workspaceRef={workspaceRef}
        editorDivRef={editorDivRef}
        sourceModeController={sourceModeController}
        uiLanguageMode={ui.uiLanguageMode}
        leftPaneOpen={leftPaneOpen}
        leftWidth={leftWidth}
        rightPaneOpen={rightPaneOpen}
        rightWidth={rightWidth}
        fileExplorerDir={fileExplorerDir}
        fileExplorerLeftPaneTab={fileExplorerLeftPaneTab} fileExplorerProjectsPaneView={fileExplorerProjectsPaneView}
        onFileExplorerSelectLibraryTab={handleFileExplorerSelectLibraryTab} onFileExplorerShowProjectList={handleFileExplorerShowProjectList}
        fileExplorerProjectListState={fileExplorerProjectListState} onFileExplorerOpenProjectRoot={handleFileExplorerOpenProjectRoot}
        fileExplorerShowLibraryOnboarding={showLibraryOnboarding} onFileExplorerOpenLibraryManager={handleOpenLibraryManager}
        fileExplorerExternalFileActive={externalFileActive} fileExplorerExternalFileName={externalFileName}
        fileExplorerDocumentContext={documentContextInfo}
        fileExplorerRootLoaded={fileExplorerRootLoaded}
        fileExplorerEntries={fileExplorerEntries}
        fileExplorerClipboardMode={fileExplorerClipboardMode}
        fileExplorerClipboardSourcePath={fileExplorerClipboardSourcePath}
        fileExplorerOperationError={fileExplorerOperationError}
        activeDocumentInfo={activeDocumentInfo}
        canFileExplorerPaste={canFileExplorerPaste}
        tabs={ui.tabs}
        tabRoles={editorTabRoles}
        activeTabId={ui.activeTabId}
        fullPlainEditActive={ui.fullPlainEditActive}
        paragraphPlainModeActive={ui.paragraphPlainModeActive}
        fullPlainEditValue={ui.fullPlainEditValue}
        fullPlainEditError={ui.fullPlainEditError}
        fullPlainEditInitialScrollOffset={ui.activeTab.sourceModeTopOffset}
        rubyVisible={ui.rubyVisible}
        frontmatterVisible={standaloneFrontmatterVisible}
        frontmatterShowTitle={true}
        frontmatterViewShowAuthors={ui.frontmatterShowAuthors}
        frontmatterShowTranslators={ui.frontmatterShowTranslators}
        frontmatterShowRoleLabels={ui.frontmatterShowRoleLabels}
        projectDocumentStartDisplay={projectDocumentStartDisplay}
        writingMode={ui.writingMode}
        frontmatterFields={ui.activeTab.frontmatterFields}
        effectiveLineBreakPolicy={ui.effectiveLineBreakPolicy}
        editorInlineHintMessage={ui.editorInlineHintMessage}
        documentTheme={ui.documentTheme}
        docFontPreset={ui.docFontPreset}
        docHeadingFont={ui.docHeadingFont}
        docColorSettings={ui.docColorSettings}
        selectedFont={ui.selectedFont}
        rightPaneTab={ui.rightPaneTab}
        headings={ui.headings}
        activeHeadingIndex={ui.activeHeadingIndex}
        foldedHeadingPositions={ui.foldedHeadingPositions}
        onDividerMouseDown={handleDividerMouseDown}
        onFileExplorerCreateNote={handleCreateNote}
        onFileExplorerCreateFolder={handleCreateFolder}
        onFileExplorerCreateProjectForFolder={handleCreateProjectForFolder}
        fileExplorerRegistration={fileExplorerRegistration}
        onFileExplorerRenameEntry={handleRenameEntry}
        onFileExplorerDeleteEntry={handleDeleteEntry}
        onFileExplorerRevealInFileManager={handleRevealInFileManager}
        onFileExplorerEntryActivate={handleFileSelect}
        onFileExplorerEntrySelect={handleFileSelectOnly}
        onFileExplorerOpenInNewTab={handleFileOpenInNewTab}
        onFileExplorerCut={handleCutSelectedFile}
        onFileExplorerCopy={handleCopySelectedFile}
        onFileExplorerPaste={handlePasteIntoSelection}
        onDismissFileExplorerError={clearFileExplorerOperationError}
        onSetActiveTab={(tabId: string) => {
          flushImeCompositionSideEffects("workspace-switch-tab");
          void tabManager.switchTab(tabId);
        }}
        onAddTab={() => {
          flushImeCompositionSideEffects("workspace-add-tab");
          void tabManager.addNewTab();
        }}
        tabLimitReached={tabLimitReached}
        onCloseTab={(tabId: string) => {
          flushImeCompositionSideEffects("workspace-close-tab");
          void tabManager.closeTab(tabId);
        }}
        onFullPlainEditChange={ui.handleFullPlainEditChange}
        onApplyFullPlainEdit={() => {
          largeDocGuard.requestGuardedAction(
            activeDocumentCharacterCount,
            "Source Mode から通常表示へ戻るときは、大きな文書では数秒かかる場合があります。続行しますか。",
            guardedApplyAndCloseFullPlainEdit,
          );
        }}
        onCloseFullPlainEdit={closeFullPlainEdit}
        onSetRightPaneTab={ui.setRightPaneTab}
        onToggleHeadingFold={handleToggleHeadingFold}
        onRequestHeadingPreview={handleRequestHeadingPreview}
        onScrollToPos={(pos) => coreRef.current?.scrollToPos(pos)}
        caretColor={resolvedCaretColor}
        pseudoCaretEnabled={ui.pseudoCaretEnabled}
        useEditorArrowPointer={ui.useEditorArrowPointer}
        typewriterRuntimeRef={typewriterRuntimeRef}
        onEmptyUntitledSurfaceClick={() => {
          if (
            ui.activeTab.filePath === null &&
            ui.activeTab.markdownSnapshot === "" &&
            !ui.fullPlainEditActive &&
            !ui.paragraphPlainModeActive
          ) {
            coreRef.current?.focusEditor();
          }
        }}
        searchBarSlot={
          <SearchBar
            open={search.state.open}
            replaceOpen={search.state.replaceOpen}
            replaceDisabled={Boolean(ui.activeTab.internalDocId)}
            query={search.state.query}
            replacement={search.state.replacement}
            caseSensitive={search.state.caseSensitive}
            matchCount={search.state.searchState.matchCount}
            currentIndex={search.state.searchState.currentIndex}
            searchInputRef={search.searchInputRef}
            onQueryChange={search.updateQuery}
            onReplacementChange={search.setReplacement}
            onToggleCaseSensitive={search.toggleCaseSensitive}
            onToggleReplace={() => search.setReplaceOpen((v) => !v)}
            onExecuteSearch={search.executeSearch}
            onNext={search.searchNext}
            onPrev={search.searchPrev}
            onReplaceOne={search.replaceOne}
            onReplaceAll={search.replaceAll}
            onClose={search.closeSearch}
          />
        }
        documentSettingsSlot={
          ui.activeTab.internalDocId ? (
            <p className="pane-placeholder">
              {createUiTextGetter(ui.uiLanguageMode)(
                "workspace.document.internalShortcutUnavailable",
              )}
            </p>
          ) : (
            <DocumentSettingsPanel
              {...documentSettingsGlue}
              canEdit={canEditDocumentSettings}
              fullPlainEditActive={ui.fullPlainEditActive}
              uiLanguageMode={ui.uiLanguageMode}
              documentType={resolvedDocumentType}
              preserveEmptyParagraphs={ui.activeTab.documentMarkdownOptions.preserveEmptyParagraphs}
              preserveEmptyParagraphsAutoDetected={autoProtectedPreserveEmptyParagraphs}
              title={ui.activeTab.frontmatterFields.title ?? ""}
              author={ui.activeTab.frontmatterFields.author ?? ""}
              translator={ui.activeTab.frontmatterFields.translator ?? ""}
              hasDocumentBehaviorOverride={
                ui.lineBreakPolicyLockReason === "frontmatter"
              }
              writingMode={ui.writingMode}
              writingModeFollowsTypeRecommendation={
                ui.writingModeFollowsTypeRecommendation
              }
              documentWritingMode={ui.documentWritingMode}
              documentWritingModeUnsupported={ui.documentWritingModeUnsupported}
              paragraphPlainModeActive={ui.paragraphPlainModeActive}
              onChangeSettings={handleDocumentSettingsChange}
              onClearManualWritingModeOverride={
                ui.resetWritingModeToTypeRecommendation
              }
              onChangeDocumentWritingMode={handleDocumentWritingModeChange}
            />
          )
        }
        notesPaneSlot={
          ui.activeTab.internalDocId ? null : (
            <>
              <DocumentNotesPanel
                state={documentNotesState}
                uiLanguageMode={ui.uiLanguageMode}
                anchoredNoteIds={anchoredNoteIds}
                focusedNoteId={focusedDocumentNoteId}
                focusedNoteEventKey={focusedDocumentNoteSerial}
                orphanDeleteEnabled={
                  !ui.fullPlainEditActive && !ui.paragraphPlainModeActive
                }
                onDeleteOrphanNote={handleDeleteOrphanNote}
                noteEditEnabled={!ui.fullPlainEditActive && !ui.paragraphPlainModeActive}
                tagSlotsEnabled={!ui.fullPlainEditActive && !ui.paragraphPlainModeActive}
                tagContext={
                  documentNotesState.kind === 'ready' || documentNotesState.kind === 'empty'
                    ? documentNotesState.tagContext
                    : undefined
                }
                statusUpdateEnabled={!ui.fullPlainEditActive && !ui.paragraphPlainModeActive}
                onSaveNoteEdit={handleSaveNoteEdit}
                onAddTag={handleAddTag}
                onRenameTag={handleRenameTag}
                onDeleteTag={handleDeleteTag}
                onMarkResolved={handleMarkResolved} onReopenNote={handleReopenNote}
                onJumpToNote={(id) => {
                  if (ui.fullPlainEditActive || ui.paragraphPlainModeActive) {
                    return false;
                  }
                  return coreRef.current?.scrollToNoteAnchor(id) ?? false;
                }}
              />
              <MissingFileNotesSection
                state={missingFileNotesState}
                uiLanguageMode={ui.uiLanguageMode}
                deleteEnabled={
                  !ui.fullPlainEditActive && !ui.paragraphPlainModeActive
                }
                onDeleteNote={handleDeleteMissingFileNote}
                onDeleteAll={handleDeleteAllMissingFileNotes}
              />
            </>
          )
        }
        projectPaneSlot={
          <ProjectPaneContainer
            getActiveFilePath={() => ui.activeTab.filePath} isInternalDoc={() => Boolean(ui.activeTab.internalDocId)}
            uiLanguageMode={ui.uiLanguageMode} loadIntoActiveTab={tabManager.loadIntoActiveTab} openFileInTab={tabManager.openFileInTab}
            flushImeCompositionSideEffects={flushImeCompositionSideEffects} onTabLimit={showTabLimitNotice}
            projectRefreshNonce={projectRefreshNonce}
            onProjectUnregistered={notifyProjectUnregistered}
            onRevealProjectInExplorer={handleFileExplorerOpenProjectRoot}
            projectPanelContext={projectPanelContext}
            onProjectSwitcherContextChange={setProjectSwitcherRoot}
            onProjectBooksChanged={() => setProjectRefreshNonce((nonce) => nonce + 1)}
          />
        }
        bookOutlineSlot={
          <BookOutlinePaneContainer
            getActiveFilePath={() => ui.activeTab.filePath} isInternalDoc={() => Boolean(ui.activeTab.internalDocId)}
            uiLanguageMode={ui.uiLanguageMode} loadIntoActiveTab={tabManager.loadIntoActiveTab} openFileInTab={tabManager.openFileInTab}
            flushImeCompositionSideEffects={flushImeCompositionSideEffects} onTabLimit={showTabLimitNotice}
            getDocumentHeadings={() => coreRef.current?.getHeadings() ?? []} activeHeadingIndex={ui.activeHeadingIndex}
            scrollToPos={(pos) => coreRef.current?.scrollToPos(pos)}
            navigationDisabled={ui.fullPlainEditActive || ui.paragraphPlainModeActive}
            projectRefreshNonce={projectRefreshNonce}
          />
        }
        chapterBoundaryNavSlot={
          <EditorChapterBoundaryNavContainer
            getActiveFilePath={() => ui.activeTab.filePath} isInternalDoc={() => Boolean(ui.activeTab.internalDocId)}
            uiLanguageMode={ui.uiLanguageMode} writingMode={ui.writingMode}
            getScrollHost={() => (editorDivRef.current?.closest(".editor-surface") as HTMLElement | null) ?? null}
            loadIntoActiveTab={tabManager.loadIntoActiveTab} openFileInTab={tabManager.openFileInTab}
            flushImeCompositionSideEffects={flushImeCompositionSideEffects} onTabLimit={showTabLimitNotice}
            navigationDisabled={ui.fullPlainEditActive || ui.paragraphPlainModeActive}
            getIsComposing={() => coreRef.current?.isComposing() ?? false}
            projectRefreshNonce={projectRefreshNonce}
          />
        }
        themeStudioSlot={
          <ThemeStudioPanel
            uiLanguageMode={ui.uiLanguageMode}
            platform={ui.platform}
            uiThemePresets={ui.uiThemePresets}
            activeUiThemePresetId={ui.activeUiThemePresetId}
            currentUiTheme={ui.theme}
            currentUiFont={ui.uiFont}
            currentUiFontScale={ui.uiFontScale}
            currentUiTextPrimary={ui.uiTextPrimary}
            docThemePresets={ui.docThemePresets}
            activeDocThemePresetId={ui.activeDocThemePresetId}
            currentDocColorSettings={ui.docColorSettings}
            currentDocTheme={ui.documentTheme}
            currentDocFontPreset={ui.docFontPreset}
            currentDocHeadingFont={ui.docHeadingFont}
            displaySettings={ui.displaySettings}
            registeredFonts={ui.registeredFonts}
            onSetActiveUiThemePresetId={ui.setActiveUiThemePresetId}
            onSetActiveDocThemePresetId={ui.setActiveDocThemePresetId}
            onDetachActiveDocThemePreset={ui.detachActiveDocThemePreset}
            onSaveUiThemePreset={ui.saveUiThemePreset}
            onSaveDocThemePreset={ui.saveDocThemePreset}
            onOverwriteUiThemePreset={ui.overwriteUiThemePreset}
            onOverwriteDocThemePreset={ui.overwriteDocThemePreset}
            onPreviewUiThemeDraft={ui.previewUiThemeDraft}
            onPreviewDocThemeDraft={ui.previewDocThemeDraft}
            onRenameUiThemePreset={ui.renameUiThemePreset}
            onRenameDocThemePreset={ui.renameDocThemePreset}
            onDuplicateUiThemePreset={ui.duplicateUiThemePreset}
            onDuplicateDocThemePreset={ui.duplicateDocThemePreset}
            onDeleteUiThemePreset={ui.deleteUiThemePreset}
            onDeleteDocThemePreset={ui.deleteDocThemePreset}
            onSetUiFont={ui.setUiFont}
            onSetUiFontScale={ui.setUiFontScale}
            onSetDocFontPreset={ui.setDocFontPreset}
            onSetDocHeadingFont={ui.setDocHeadingFont}
            onSetDisplayNumber={ui.setDisplayNumber}
          />
        }
      />

      <EditorContextMenu
        visible={ctxMenu.visible}
        x={ctxMenu.x}
        y={ctxMenu.y}
        availability={contextMenuCommandAvailability}
        writingMode={ui.writingMode}
        uiLanguageMode={ui.uiLanguageMode}
        menuRef={ctxMenuRef}
        onUndo={guardedUndo}
        onRedo={guardedRedo}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onPastePlain={handlePastePlain}
        onSelectAll={handleCtxSelectAll}
        onBold={() => runMarkCommand("bold")}
        onItalic={() => runMarkCommand("italic")}
        onStrike={() => runMarkCommand("strike")}
        onHighlight={() => runMarkCommand("highlight")}
        onUnderline={() => runMarkCommand("underline")}
        onHeading={handleCtxHeading}
        onBulletList={handleToggleBulletList}
        onOrderedList={handleToggleOrderedList}
        onChecklist={handleToggleChecklist}
        onRuby={guardedOpenRubyBoutenPrompt}
        onTcy={handleToggleTcy}
        onClearFormat={handleClearFormat}
        onMoveListUp={handleCtxMoveUp}
        onMoveListDown={handleCtxMoveDown}
        onApplyBlockDirective={blockDirective.apply}
        onRemoveBlockDirective={blockDirective.remove}
        onInsertPageBreak={blockDirective.insertPageBreak}
        onDeletePageBreak={blockDirective.deletePageBreak}
        onInsertBlankPage={blockDirective.insertBlankPage}
        noteAnchorContextId={noteAnchorContextMenuId}
        noteAnchorMarkerDeleteMode={noteAnchorMarkerDeleteMode}
        onShowNoteInPanel={handleRevealNoteInPanel}
        onDeleteNoteAnchor={(id) => {
          void handleDeleteNoteAnchor(id, ctxMenu.domNoteAnchorContextTarget);
        }}
        showAddNoteAnchor={!internalShortcutDocActive} contextMenuSelectionRange={ctxMenu.selectionRange} onOpenNoteAnchorPrompt={openNoteAnchorPrompt}
        onClose={closeCtxMenu}
      />

      <FileTransferConflictModal
        uiLanguageMode={ui.uiLanguageMode}
        conflict={transferConflict}
        onCancel={cancelTransferConflict}
        onOverwrite={resolveTransferConflictByOverwrite}
        onKeepBoth={resolveTransferConflictKeepBoth}
      />

      <FileExplorerNamePromptModal
        prompt={fileExplorerNamePrompt}
        onCancel={cancelFileExplorerNamePrompt}
        onSubmit={submitFileExplorerNamePrompt}
      />

      <ExplorerProjectCreateModalHost
        target={projectCreateModalTarget}
        uiLanguageMode={ui.uiLanguageMode}
        onCancel={closeProjectCreateModal}
        notifyProjectCreatedForFolder={notifyProjectCreatedForFolder}
        onProjectCreated={() => setProjectRefreshNonce((nonce) => nonce + 1)}
      />

      <UnsavedChangesModal
        open={unsavedModalOpen}
        onCancel={() => resolveUnsavedContinueAction("cancel")}
        onSaveAndContinue={() => resolveUnsavedContinueAction("save")}
        onDiscardAndContinue={() => resolveUnsavedContinueAction("discard")}
      />

      <ExternalEditConflictModal
        conflictKind={conflictModalKind}
        onAction={resolveConflictAction}
      />

      <SaveFailureModal
        info={saveFailureInfo}
        onAction={resolveSaveFailureAction}
      />

      <ExportOptionsModal prompt={externalExportOptionsPrompt} uiLanguageMode={ui.uiLanguageMode} resolveInitialSelection={resolveInitialSelection} onConfirm={confirmExportOptions} onCancel={cancelExportOptions} />
      <WebBookCapacityConfirmModal
        capacity={webBookCapacityConfirm}
        uiLanguageMode={ui.uiLanguageMode}
        onResolve={resolveCapacityConfirm}
      />
      <BookExportResultDetailsModal state={bookExportResultDetails} uiLanguageMode={ui.uiLanguageMode} onClose={closeBookExportResultDetails} />

      <BackupWarningNotice
        message={backupWarningMessage}
        onDismiss={dismissBackupWarning}
      />

      <LibraryManagerModal
        open={libraryManagerOpen} t={createUiTextGetter(ui.uiLanguageMode)}
        onClose={handleCloseLibraryManager} onLibraryActivated={handleLibraryActivated}
      />

      <DisplaySettingsModal
        open={ui.displaySettingsOpen}
        expandSectionOnOpen={ui.displaySettingsExpandSectionKey}
        onExpandSectionOnOpenConsumed={() => ui.setDisplaySettingsExpandSectionKey(null)}
        displaySettings={ui.displaySettings}
        writingMode={ui.writingMode}
        documentTypeWritingModeDefaults={ui.documentTypeWritingModeDefaults}
        onChangeDocumentTypeWritingModeDefault={ui.setDocumentTypeWritingModeDefaults}
        uiLanguageMode={ui.uiLanguageMode}
        platform={ui.platform}
        theme={ui.theme}
        uiThemePresets={ui.uiThemePresets}
        activeUiThemePresetId={ui.activeUiThemePresetId}
        uiFont={ui.uiFont}
        uiTextPrimary={ui.uiTextPrimary}
        uiFontScale={ui.uiFontScale}
        toolbarIconColor={ui.toolbarIconColor}
        toolbarIconStroke={ui.toolbarIconStroke}
        toolbarScale={ui.toolbarScale}
        appTitleVisible={ui.appTitleVisible}
        appTitlePreset={ui.appTitlePreset}
        appTitleCustom={ui.appTitleCustom}
        appTitleColor={ui.appTitleColor}
        appTitleFont={ui.appTitleFont}
        documentTheme={ui.documentTheme}
        docThemePresets={ui.docThemePresets}
        activeDocThemePresetId={ui.activeDocThemePresetId}
        docFontPreset={ui.docFontPreset}
        docHeadingFont={ui.docHeadingFont}
        docColorSettings={ui.docColorSettings}
        registeredFonts={ui.registeredFonts}
        selectedFont={ui.selectedFont}
        frontmatterVisible={ui.frontmatterVisible}
        frontmatterShowAuthors={ui.frontmatterShowAuthors}
        frontmatterShowTranslators={ui.frontmatterShowTranslators}
        frontmatterShowRoleLabels={ui.frontmatterShowRoleLabels}
        frontmatterShowInProjectFiles={ui.frontmatterShowInProjectFiles}
        frontmatterProjectShowTitle={ui.frontmatterProjectShowTitle}
        frontmatterProjectShowAuthors={ui.frontmatterProjectShowAuthors}
        onClose={() => ui.setDisplaySettingsOpen(false)}
        onReset={() => {
          ui.setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
          handleDocumentThemeChange("ui-linked");
          ui.setDocFontPreset(DEFAULT_DOC_FONT_PRESET);
          ui.setDocHeadingFont(DEFAULT_DOC_HEADING_FONT);
          ui.setUiTextPrimary(null);
          ui.setUiFontScale(DEFAULT_UI_FONT_SCALE);
          ui.setToolbarIconColor(null);
          ui.setToolbarIconStroke(DEFAULT_TOOLBAR_ICON_STROKE);
          ui.setToolbarScale(DEFAULT_TOOLBAR_SCALE);
          ui.setAppTitleVisible(DEFAULT_APP_TITLE_VISIBLE);
          ui.setAppTitlePreset(DEFAULT_APP_TITLE_PRESET);
          ui.setAppTitleCustom(DEFAULT_APP_TITLE_CUSTOM);
          ui.setAppTitleColor(null);
          ui.setAppTitleFont(DEFAULT_APP_TITLE_FONT);
          ui.setSelectedFont(null);
          ui.setFrontmatterVisible(DEFAULT_FRONTMATTER_VISIBLE);
          ui.setFrontmatterShowAuthors(DEFAULT_FRONTMATTER_SHOW_AUTHORS);
          ui.setFrontmatterShowTranslators(DEFAULT_FRONTMATTER_SHOW_TRANSLATORS);
          ui.setFrontmatterShowRoleLabels(DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS);
          ui.setFrontmatterShowInProjectFiles(
            DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES,
          );
          ui.setFrontmatterProjectShowTitle(DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE);
          ui.setFrontmatterProjectShowAuthors(DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS);
          ui.setUseEditorArrowPointer(DEFAULT_EDITOR_ARROW_POINTER);
          ui.setPseudoCaretEnabled(DEFAULT_PSEUDO_CARET_ENABLED);
          ui.setPseudoCaretThickness(DEFAULT_PSEUDO_CARET_THICKNESS);
          ui.setPseudoCaretBlinkEnabled(DEFAULT_PSEUDO_CARET_BLINK_ENABLED);
          ui.setParagraphPlainBehavior("fast");
          ui.setTypewriterModeEnabled(DEFAULT_TYPEWRITER_MODE_ENABLED);
          ui.setTypewriterOffsetRatio(DEFAULT_TYPEWRITER_OFFSET_RATIO);
          ui.setTypewriterFollowBandRatio(DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO);
          ui.setVisualFocusBlockHighlightEnabled(
            DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED,
          );
          ui.setVisualFocusDimNonFocusedBlocksEnabled(
            DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED,
          );
          ui.setVisualFocusBlockHighlightColor(DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR);
          ui.setVisualFocusBlockHighlightOpacity(DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY);
          ui.setVisualFocusDimNonFocusedBlocksOpacity(
            DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY,
          );
          ui.setVisualFocusCurrentLineHighlightEnabled(
            DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED,
          );
          ui.setVisualFocusCurrentLineHighlightColor(DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR);
          ui.setVisualFocusCurrentLineHighlightOpacity(
            DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY,
          );
        }}
        onSetDisplayNumber={ui.setDisplayNumber}
        onAutoTcyEnabledChange={ui.setAutoTcyEnabled}
        onAutoTcyNumbersOnlyChange={ui.setAutoTcyNumbersOnly}
        onSetHeadingDividerLevel={ui.setHeadingDividerLevel}
        onSetHeadingAlignHorizontal={ui.setHeadingAlignHorizontal}
        onSetHeadingAlignVertical={ui.setHeadingAlignVertical}
        onThemeChange={ui.setTheme}
        onSetActiveUiThemePresetId={ui.setActiveUiThemePresetId}
        onUiFontChange={ui.setUiFont}
        onUiLanguageModeChange={ui.setUiLanguageMode}
        onUiTextPrimaryChange={ui.setUiTextPrimary}
        onUiFontScaleChange={ui.setUiFontScale}
        onToolbarIconColorChange={ui.setToolbarIconColor}
        onToolbarIconStrokeChange={ui.setToolbarIconStroke}
        onToolbarScaleChange={ui.setToolbarScale}
        onAppTitleVisibleChange={ui.setAppTitleVisible}
        onAppTitlePresetChange={ui.setAppTitlePreset}
        onAppTitleCustomChange={ui.setAppTitleCustom}
        onAppTitleColorChange={ui.setAppTitleColor}
        onAppTitleFontChange={ui.setAppTitleFont}
        onDocumentThemeChange={handleDocumentThemeChange}
        onSetActiveDocThemePresetId={ui.setActiveDocThemePresetId}
        onDocFontPresetChange={ui.setDocFontPreset}
        onDocHeadingFontChange={ui.setDocHeadingFont}
        onDocColorSettingsChange={ui.setDocColorSettings}
        onSelectedFontChange={ui.setSelectedFont}
        onRegisteredFontsChange={ui.setRegisteredFonts}
        onFrontmatterVisibleChange={ui.setFrontmatterVisible}
        onFrontmatterShowAuthorsChange={ui.setFrontmatterShowAuthors}
        onFrontmatterShowTranslatorsChange={ui.setFrontmatterShowTranslators}
        onFrontmatterShowRoleLabelsChange={ui.setFrontmatterShowRoleLabels}
        onFrontmatterShowInProjectFilesChange={
          ui.setFrontmatterShowInProjectFiles
        }
        onFrontmatterProjectShowTitleChange={ui.setFrontmatterProjectShowTitle}
        onFrontmatterProjectShowAuthorsChange={ui.setFrontmatterProjectShowAuthors}
        caretColorMode={ui.caretColorMode}
        caretColorCustom={ui.caretColorCustom}
        useEditorArrowPointer={ui.useEditorArrowPointer}
        onCaretColorModeChange={ui.setCaretColorMode}
        onCaretColorCustomChange={ui.setCaretColorCustom}
        onUseEditorArrowPointerChange={ui.setUseEditorArrowPointer}
        pseudoCaretEnabled={ui.pseudoCaretEnabled}
        onPseudoCaretEnabledChange={ui.setPseudoCaretEnabled}
        pseudoCaretThickness={ui.pseudoCaretThickness}
        onPseudoCaretThicknessChange={ui.setPseudoCaretThickness}
        pseudoCaretBlinkEnabled={ui.pseudoCaretBlinkEnabled}
        onPseudoCaretBlinkEnabledChange={ui.setPseudoCaretBlinkEnabled}
        paragraphPlainBehavior={ui.paragraphPlainBehavior}
        onParagraphPlainBehaviorChange={ui.setParagraphPlainBehavior}
        typewriterModeEnabled={ui.typewriterModeEnabled}
        typewriterOffsetRatio={ui.typewriterOffsetRatio}
        typewriterFollowBandRatio={ui.typewriterFollowBandRatio}
        onTypewriterModeEnabledChange={ui.setTypewriterModeEnabled}
        onTypewriterOffsetRatioChange={ui.setTypewriterOffsetRatio}
        onTypewriterFollowBandRatioChange={ui.setTypewriterFollowBandRatio}
        visualFocusBlockHighlightEnabled={ui.visualFocusBlockHighlightEnabled}
        onVisualFocusBlockHighlightEnabledChange={
          ui.setVisualFocusBlockHighlightEnabled
        }
        visualFocusDimNonFocusedBlocksEnabled={ui.visualFocusDimNonFocusedBlocksEnabled}
        onVisualFocusDimNonFocusedBlocksEnabledChange={
          ui.setVisualFocusDimNonFocusedBlocksEnabled
        }
        visualFocusBlockHighlightColor={ui.visualFocusBlockHighlightColor}
        onVisualFocusBlockHighlightColorChange={ui.setVisualFocusBlockHighlightColor}
        visualFocusBlockHighlightOpacity={ui.visualFocusBlockHighlightOpacity}
        onVisualFocusBlockHighlightOpacityChange={
          ui.setVisualFocusBlockHighlightOpacity
        }
        visualFocusDimNonFocusedBlocksOpacity={ui.visualFocusDimNonFocusedBlocksOpacity}
        onVisualFocusDimNonFocusedBlocksOpacityChange={
          ui.setVisualFocusDimNonFocusedBlocksOpacity
        }
        visualFocusCurrentLineHighlightEnabled={ui.visualFocusCurrentLineHighlightEnabled}
        onVisualFocusCurrentLineHighlightEnabledChange={
          ui.setVisualFocusCurrentLineHighlightEnabled
        }
        visualFocusCurrentLineHighlightColor={ui.visualFocusCurrentLineHighlightColor}
        onVisualFocusCurrentLineHighlightColorChange={
          ui.setVisualFocusCurrentLineHighlightColor
        }
        visualFocusCurrentLineHighlightOpacity={ui.visualFocusCurrentLineHighlightOpacity}
        onVisualFocusCurrentLineHighlightOpacityChange={
          ui.setVisualFocusCurrentLineHighlightOpacity
        }
        onOpenThemeStudio={handleOpenThemeStudioPane}
        onOpenLibraryManager={handleOpenLibraryManagerFromDisplaySettings}
        onSendBugReport={() => void sendBugReport()}
        onSendFeedback={() => void sendFeedback()}
        onOpenRepository={() => void openRepository()}
      />

      {ui.lineBreakPolicyNoticeMessage && (
        <div
          className={`app-global-toast${ui.lineBreakPolicyNoticeIsDirty ? " is-dirty" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="app-global-toast-message">
            {ui.lineBreakPolicyNoticeMessage}
          </span>
          <button
            type="button"
            className="app-global-toast-close"
            onClick={ui.clearLineBreakPolicyNotice}
            aria-label="通知を閉じる"
          >
            ×
          </button>
        </div>
      )}

      {tabLimitNotice && (
        <div className="app-global-toast" role="status" aria-live="polite">
          <span className="app-global-toast-message">{tabLimitNotice}</span>
          <button
            type="button"
            className="app-global-toast-close"
            onClick={() => setTabLimitNotice(null)}
            aria-label="通知を閉じる"
          >
            ×
          </button>
        </div>
      )}

      <LargeDocumentGuardModal
        pendingAction={largeDocGuard.pendingAction}
        onConfirm={largeDocGuard.confirmPendingAction}
        onCancel={largeDocGuard.cancelPendingAction}
      />

      <LineBreakPolicyConfirmModal
        pendingPolicy={
          pendingDocumentSettingsChange
            ? "commonmark-strict"
            : ui.pendingLineBreakPolicy
        }
        documentType={
          pendingDocumentSettingsChange?.nextDocumentType ??
          resolveDocumentType(ui.activeTab.frontmatterFields)
        }
        onConfirm={handleConfirmLineBreakPolicyChange}
        onCancel={handleCancelLineBreakPolicyChange}
      />

      <ImeProfilerHud snapshot={imeProfilerHudSnapshot} />

      <PromptModal
        promptModal={promptModal}
        promptValue={promptValue}
        promptInputRef={promptInputRef}
        rubyBoutenTab={rubyBoutenTab}
        boutenValue={boutenValue}
        customBoutenInput={customBoutenInput}
        boutenOptions={boutenOptions}
        customBoutenChars={customBoutenChars}
        onPromptValueChange={setPromptValue}
        onPromptCancel={handlePromptCancel}
        onPromptSubmit={handlePromptSubmit}
        onRubyBoutenTabChange={setRubyBoutenTab}
        onBoutenValueChange={setBoutenValue}
        onCustomBoutenInputChange={setCustomBoutenInput}
        onAddCustomBoutenChar={addCustomBoutenChar}
        onRemoveSelectedCustomBoutenChar={removeSelectedCustomBoutenChar}
        imageSrc={imageSrc}
        imageAlt={imageAlt}
        imageTitle={imageTitle}
        onImageSrcChange={setImageSrc}
        onImageAltChange={setImageAlt}
        onImageTitleChange={setImageTitle}
      />

      <NoteAnchorModal
        modal={noteAnchorModal}
        titleValue={noteAnchorTitleValue}
        bodyValue={noteAnchorBodyValue}
        onTitleValueChange={setNoteAnchorTitleValue}
        onBodyValueChange={setNoteAnchorBodyValue}
        onFirstNoticeConfirm={handleNoteAnchorFirstNoticeConfirm}
        onSubmit={handleNoteAnchorSubmit}
        onCancel={handleNoteAnchorCancel}
      />
    </main>
  );
}

export default App;
