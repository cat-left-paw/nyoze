import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type {
  CommandAvailability,
  EditorCoreHandle,
  HeadingInfo,
  LineBreakPolicy,
  LogEntry,
  MarkdownDocumentOptions,
} from "../../editor-core/types";
import { resolveAutoTcyDigitRange } from "../../editor-core/features/autoTcy";
import { setParagraphPlainFormalBehaviorRuntime } from "../../editor-core/features/paragraphPlainExperiments";
import type { FrontmatterFields } from "../../editor-core/io/frontmatter";
import {
  resolveDocumentType,
  resolveEffectiveWritingMode,
  resolveFrontmatterWritingMode,
  resolveTypeDefaultWritingMode,
  resolveTypeDerivedLineBreakPolicy,
} from "../../editor-core/io/frontmatterDocumentSettings";
import type { SavedFileStat } from "../utils/externalEditConflict";
import type { InternalDocId } from "../internalDocs/internalDocIds";
import type { DisplaySettingsSectionKey } from "../components/displaySettingsSectionState";
import {
  APP_TITLE_COLOR_PRESETS,
  APP_TITLE_PRESET_TEXTS,
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_FRONTMATTER_SHOW_AUTHORS,
  DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES,
  DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE,
  DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS,
  DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS,
  DEFAULT_FRONTMATTER_SHOW_TRANSLATORS,
  DEFAULT_FRONTMATTER_VISIBLE,
  DEFAULT_LINE_BREAK_POLICY,
  DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED,
  DEFAULT_PSEUDO_CARET_BLINK_ENABLED,
  DEFAULT_NOTE_ANCHOR_NOTICE_CONFIRMED,
  DEFAULT_PSEUDO_CARET_ENABLED,
  DEFAULT_PSEUDO_CARET_THICKNESS,
  DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO,
  DEFAULT_TYPEWRITER_MODE_ENABLED,
  DEFAULT_TYPEWRITER_OFFSET_RATIO,
  MAX_TOOLBAR_ICON_STROKE,
  MAX_TOOLBAR_SCALE,
  MIN_TOOLBAR_ICON_STROKE,
  MIN_TOOLBAR_SCALE,
  UI_THEME_MAIN_COLORS,
} from "../../settings/defaults";
import { normalizeAppTitleCustomValue } from "../../settings/appTitleCustom";
import {
  DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR,
  normalizeParagraphPlainBehavior,
} from "../../settings/paragraphPlainBehavior";
import type { ParagraphPlainBehavior } from "../../settings/types";
import {
  normalizeTypewriterFollowBandRatio,
  normalizeTypewriterModeEnabled,
  normalizeTypewriterOffsetRatio,
} from "../../settings/typewriterModeSettings";
import {
  DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR,
  DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY,
  DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR,
  DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY,
  DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY,
  normalizeVisualFocusBlockHighlightColor,
  normalizeVisualFocusBlockHighlightOpacity,
  normalizeVisualFocusCurrentLineHighlightColor,
  normalizeVisualFocusCurrentLineHighlightOpacity,
  normalizeVisualFocusDimNonFocusedBlocksOpacity,
} from "../../settings/visualFocusAppearance";
import {
  DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED,
  DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED,
  DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED,
  normalizeVisualFocusBlockHighlightEnabled,
  normalizeVisualFocusCurrentLineHighlightEnabled,
  normalizeVisualFocusDimNonFocusedBlocksEnabled,
} from "../../settings/visualFocusSettings";
import { normalizeMacosArrowScrollClampEnabled } from "../../settings/macosArrowScrollClampSettings";
import {
  normalizePseudoCaretBlinkEnabled,
  normalizePseudoCaretEnabled,
  normalizePseudoCaretThickness,
} from "../../settings/pseudoCaretSettings";
import { normalizeNoteAnchorNoticeConfirmed } from "../../settings/noteAnchorSettings";
import { normalizeUiLanguageMode } from "../../settings/uiLanguageMode";
import { normalizeTheme } from "../../settings/themeUtils";
import {
  migrateToSettingsJson,
  migrateToThemePresets,
  runSettingsMigration,
} from "../../settings/migration";
import {
  loadAppTitleColor,
  loadAppTitleCustom,
  loadAppTitleFont,
  loadAppTitlePreset,
  loadAppTitleVisible,
  loadDisplaySettings,
  loadDocColorSettings,
  loadDocHeadingFont,
  loadDocFontPreset,
  loadDocumentTheme,
  loadCaretColorMode,
  loadCaretColorCustom,
  loadUseEditorArrowPointer,
  saveCaretColorMode,
  saveCaretColorCustom,
  saveUseEditorArrowPointer,
  loadRegisteredFonts,
  loadRubyVisibility,
  loadSelectedFont,
  loadSettingsJson,
  loadUiFont,
  loadUiLanguageMode,
  loadUiFontScale,
  loadUiTextPrimary,
  loadToolbarIconColor,
  loadToolbarIconStroke,
  loadToolbarScale,
  loadToolbarOffset,
  loadToolbarVisible,
  loadUiTheme,
  loadWritingMode,
  normalizeDisplaySettings,
  syncHeadingAlignDataset,
  patchSettingsJson,
  saveAppTitleColor,
  saveAppTitleCustom,
  saveAppTitleFont,
  saveAppTitlePreset,
  saveAppTitleVisible,
  saveDisplaySettings,
  saveDocColorSettings,
  saveDocHeadingFont,
  saveDocFontPreset,
  saveDocumentTheme,
  saveLineBreakPolicy,
  saveRegisteredFonts,
  saveRubyVisibility,
  saveSelectedFont,
  saveUiFont,
  saveUiLanguageMode,
  saveUiFontScale,
  saveUiTextPrimary,
  saveToolbarIconColor,
  saveToolbarIconStroke,
  saveToolbarScale,
  saveUiTheme,
  saveToolbarOffset,
  saveToolbarVisible,
  saveWritingMode,
  validateUiThemePresets,
  validateDocThemePresets,
} from "../../settings/storage";
import {
  DEFAULT_DOCUMENT_TYPE_WRITING_MODE_DEFAULTS,
  resolveDocumentTypeWritingModeDefaultsFromSettings,
} from "../../settings/writingModeDefaults";
import type {
  AppTitleFont,
  AppTitlePreset,
  DebugSettings,
  DisplaySettings,
  DisplaySettingsNumericKey,
  HeadingAlign,
  DocThemePreset,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  DocumentTheme,
  DocumentTypeWritingModeDefaults,
  Theme,
  UiFont,
  UiLanguageMode,
  UiThemePreset,
  WritingMode,
} from "../../settings/types";
import {
  deriveUiThemeTokens,
  UI_THEME_TOKEN_KEYS,
} from "../../theme/deriveUiThemeTokens";
import {
  type CaretColorMode,
  normalizeCaretColorMode,
  normalizeCaretColorCustom,
  resolveCaretColor,
} from "../../theme/caretColor";
import {
  nextDocActivePresetIdForChange,
  nextUiActivePresetIdForChange,
} from "../themePresetPolicy";
import { formatDocumentTypeNoticeMessage } from "../utils/documentTypePresentation";
import { detectRuntimePlatform } from "../utils/platform";
import {
  resolveDirtyState,
  resolveDirtyStateFromDocChangeSignal,
} from "./dirtyTracking";
import {
  areHeadingListsEqual,
  arePositionSetsEqual,
} from "./headingUiState";

const MAX_LOGS = 120;
const INITIAL_TAB_ID = "tab-main";
const IS_DEV = import.meta.env.DEV;

export const EMPTY_COMMAND_AVAILABILITY: CommandAvailability = {
  hasSelection: false,
  hasNonAnchorTextSelection: false,
  canBold: false,
  canItalic: false,
  canStrike: false,
  canHighlight: false,
  canUnderline: false,
  canInlineCode: false,
  canClearFormat: false,
  canBlockTransforms: false,
  canUndo: false,
  canRedo: false,
  canInsertRuby: false,
  canParagraphPlain: false,
  canToggleTcy: false,
  canCopy: false,
  canCut: false,
  canPaste: false,
  canSelectAll: false,
  canMoveListUp: false,
  canMoveListDown: false,
  isHeading: false,
  isBold: false,
  isItalic: false,
  isStrike: false,
  isHighlight: false,
  isUnderline: false,
  isInlineCode: false,
  isBulletList: false,
  isOrderedList: false,
  isChecklist: false,
  isBlockquote: false,
  isCodeBlock: false,
  canBlockDirective: false,
  blockDirectiveToken: null,
  canDeletePageBreak: false,
  noteAnchorContextId: null,
  touchesNoteAnchor: false,
  canShowNoteInPanel: false,
  canDeleteNoteAnchor: false,
};

export type RightPaneTab = "outline" | "document" | "notes" | "project" | "theme";

export type EditorTab = {
  id: string;
  title: string;
  dirty: boolean;
  filePath: string | null;
  /** Markdown content snapshot for non-active tabs. Active tab uses the live editor. */
  markdownSnapshot: string;
  /** Last saved / loaded markdown used as the clean-state baseline. */
  cleanMarkdownSnapshot: string;
  /** Per-tab frontmatter parsed from the markdown. */
  frontmatterFields: FrontmatterFields;
  /** Effective per-document Markdown options used by the active runtime. */
  documentMarkdownOptions: MarkdownDocumentOptions;
  /** Per-tab character count of the document body. */
  characterCount: number;
  /** BETA-IO1: File stat baseline for external edit conflict detection. null for untitled. */
  savedStat: SavedFileStat;
  /** Per-tab writing mode. Initialized from app default for new tabs. */
  writingMode: WritingMode;
  /** Whether the tab currently follows the document type recommendation for writing mode. */
  writingModeFollowsTypeRecommendation: boolean;
  /** Per-tab line break policy (raw setting). Initialized from app default for new tabs. */
  lineBreakPolicy: LineBreakPolicy;
  /** BETA-SP11: 読み込み時に検出した改行種別。保存時に復元する。 */
  eol: "lf" | "crlf";
  /** Per-tab editor surface scroll state for same-document restore. */
  scrollTop: number;
  scrollLeft: number;
  /**
   * Layout-independent viewport anchor (textOffset + PM pos) captured on
   * tab leave / writing-mode toggle / Source Mode enter. Used to restore the
   * visible region across writing-mode changes and Source Mode round-trips.
   */
  viewportAnchorPmPos: number | null;
  viewportAnchorTextOffset: number | null;
  viewportAnchorTextTotal: number | null;
  /**
   * Source Mode scroll offset captured while the Source Mode overlay was
   * visible. Used to restore near the same Markdown location when returning
   * to WYSIWYG, and to re-enter Source Mode at the same offset next time.
   */
  sourceModeTopOffset: number | null;
  /** Built-in read-only help tab (not file-backed, not saved). */
  internalDocId?: InternalDocId;
  /** Locale bundle for shortcut-reference tab only (which static MD is shown). */
  internalShortcutBundleKey?: "ja" | "en";
};

export type ActiveTabPatch = Partial<
  Pick<
    EditorTab,
    | "title"
    | "dirty"
    | "filePath"
    | "markdownSnapshot"
    | "cleanMarkdownSnapshot"
    | "frontmatterFields"
    | "documentMarkdownOptions"
    | "characterCount"
    | "savedStat"
    | "writingMode"
    | "writingModeFollowsTypeRecommendation"
    | "lineBreakPolicy"
    | "eol"
    | "scrollTop"
    | "scrollLeft"
    | "viewportAnchorPmPos"
    | "viewportAnchorTextOffset"
    | "viewportAnchorTextTotal"
    | "sourceModeTopOffset"
    | "internalDocId"
    | "internalShortcutBundleKey"
  >
>;

export type LineBreakPolicyTargetTab = Pick<
  EditorTab,
  "id" | "frontmatterFields" | "lineBreakPolicy"
>;

type EnsureSafeLineBreakPolicyBeforeDocumentLoadOptions = {
  targetTabId?: string;
  targetTabSnapshot?: LineBreakPolicyTargetTab;
};

export type LineBreakPolicyLockReason = "frontmatter" | "type" | null;

let untitledCounter = 0;

export function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateUntitledName(): string {
  untitledCounter += 1;
  return `untitled-${untitledCounter}.md`;
}

const INITIAL_TAB_TITLE = generateUntitledName();

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveEffectiveLineBreakPolicyForTab(
  tab: Pick<EditorTab, "frontmatterFields" | "lineBreakPolicy">,
): LineBreakPolicy {
  const fmPolicy = tab.frontmatterFields.nyozeLineBreakPolicy;
  if (fmPolicy === "obsidian-paragraph" || fmPolicy === "commonmark-strict") {
    return fmPolicy;
  }
  const typeDerivedPolicy = resolveTypeDerivedLineBreakPolicy(
    resolveDocumentType(tab.frontmatterFields),
  );
  if (typeDerivedPolicy) {
    return typeDerivedPolicy;
  }
  return tab.lineBreakPolicy;
}

function resolveLineBreakPolicyLockReasonForTab(
  tab: Pick<EditorTab, "frontmatterFields" | "lineBreakPolicy">,
): LineBreakPolicyLockReason {
  const fmPolicy = tab.frontmatterFields.nyozeLineBreakPolicy;
  if (fmPolicy === "obsidian-paragraph" || fmPolicy === "commonmark-strict") {
    return "frontmatter";
  }
  return resolveTypeDerivedLineBreakPolicy(resolveDocumentType(tab.frontmatterFields))
    ? "type"
    : null;
}

type ImeProfilerDebugConfig = {
  enabled: boolean;
  showHud: boolean;
  logSummary: boolean;
  phaseAEnabled: boolean;
  phaseAMinSyncIntervalMs: number;
  phaseBRubySuspendEnabled: boolean;
  saveJson: boolean;
  benchmarkDocumentId: string | null;
  benchmarkInputChars: number | null;
};

function normalizeImeProfilerDebugConfig(
  value: unknown,
): ImeProfilerDebugConfig {
  const parsed =
    value && typeof value === "object" ? (value as DebugSettings) : null;
  const rawMinSyncInterval = Number(parsed?.imePhaseAMinSyncIntervalMs ?? 400);
  const phaseAMinSyncIntervalMs = clampNumber(
    Number.isFinite(rawMinSyncInterval) ? rawMinSyncInterval : 400,
    300,
    500,
  );
  const rawBenchmarkDocumentId = parsed?.imeProfilerBenchmarkDocumentId;
  const benchmarkDocumentId =
    typeof rawBenchmarkDocumentId === "string" &&
    rawBenchmarkDocumentId.trim().length > 0
      ? rawBenchmarkDocumentId.trim()
      : null;
  const rawBenchmarkInputChars = Number(
    parsed?.imeProfilerBenchmarkInputChars ?? NaN,
  );
  const benchmarkInputChars =
    Number.isFinite(rawBenchmarkInputChars) && rawBenchmarkInputChars >= 0
      ? Math.round(rawBenchmarkInputChars)
      : null;
  return {
    enabled: parsed?.imeProfilerEnabled === true,
    showHud: parsed?.imeProfilerShowHud === true,
    logSummary: parsed?.imeProfilerLogSummary !== false,
    phaseAEnabled: parsed?.imePhaseAEnabled === true,
    phaseAMinSyncIntervalMs,
    phaseBRubySuspendEnabled: parsed?.imePhaseBRubySuspendEnabled === true,
    saveJson: parsed?.imeProfilerSaveJson === true,
    benchmarkDocumentId,
    benchmarkInputChars,
  };
}

function formatMarkdownPreview(value: string): string {
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function buildMarkdownComparisonDebugInfo(before: string, after: string) {
  const changed = before !== after;
  const beforeLines = before.length === 0 ? 0 : before.split("\n").length;
  const afterLines = after.length === 0 ? 0 : after.split("\n").length;
  if (!changed) {
    return {
      changed: false,
      beforeLength: before.length,
      afterLength: after.length,
      beforeLines,
      afterLines,
    };
  }
  const minLength = Math.min(before.length, after.length);
  let firstDiffIndex = 0;
  while (
    firstDiffIndex < minLength &&
    before[firstDiffIndex] === after[firstDiffIndex]
  ) {
    firstDiffIndex += 1;
  }
  const contextStart = Math.max(0, firstDiffIndex - 20);
  const contextEndBefore = Math.min(before.length, firstDiffIndex + 60);
  const contextEndAfter = Math.min(after.length, firstDiffIndex + 60);
  return {
    changed: true,
    beforeLength: before.length,
    afterLength: after.length,
    beforeLines,
    afterLines,
    firstDiffIndex,
    beforePreview: formatMarkdownPreview(
      before.slice(contextStart, contextEndBefore),
    ),
    afterPreview: formatMarkdownPreview(
      after.slice(contextStart, contextEndAfter),
    ),
  };
}

function normalizeDocumentTheme(value: unknown): DocumentTheme | null {
  if (
    value === "ui-linked" ||
    value === "paper-light" ||
    value === "paper-dark" ||
    value === "bow" ||
    value === "wob" ||
    value === "soft-neutral"
  ) {
    return value;
  }
  if (value === "paper-custom") return "ui-linked";
  return null;
}

function normalizeDocHeadingFont(value: unknown): DocumentHeadingFont | null {
  if (value === "same-as-body" || value === "mincho" || value === "gothic") {
    return value;
  }
  if (typeof value !== "string" || !value.startsWith("custom:")) return null;
  return value.slice("custom:".length).trim().length > 0
    ? (value as DocumentHeadingFont)
    : null;
}

function normalizeUiFont(value: unknown): UiFont | null {
  if (value === "mincho" || value === "gothic") return value;
  if (typeof value !== "string" || !value.startsWith("custom:")) return null;
  return value.slice("custom:".length).trim().length > 0
    ? (value as UiFont)
    : null;
}

function normalizeUiTextPrimary(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function normalizeToolbarIconStroke(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clampNumber(value, MIN_TOOLBAR_ICON_STROKE, MAX_TOOLBAR_ICON_STROKE);
}

function normalizeToolbarScale(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clampNumber(value, MIN_TOOLBAR_SCALE, MAX_TOOLBAR_SCALE);
}

function normalizeAppTitlePreset(value: unknown): AppTitlePreset | null {
  if (
    value === "nyoze" ||
    value === "nyoze-upper" ||
    value === "nyoze-kanji" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}

function normalizeAppTitleCustom(value: unknown): string {
  return normalizeAppTitleCustomValue(value);
}

function normalizeAppTitleFont(value: unknown): AppTitleFont | null {
  if (value === "ui-default" || value === "mincho" || value === "gothic")
    return value;
  if (typeof value !== "string" || !value.startsWith("custom:")) return null;
  return value.slice("custom:".length).trim().length > 0
    ? (value as AppTitleFont)
    : null;
}

function normalizeDocFontPreset(value: unknown): DocumentFontPreset | null {
  if (value === "ui-linked" || value === "mincho" || value === "gothic") {
    return value;
  }
  if (typeof value !== "string" || !value.startsWith("custom:")) return null;
  return value.slice("custom:".length).trim().length > 0
    ? (value as DocumentFontPreset)
    : null;
}

function generatePresetId(prefix: "ui" | "doc"): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `${prefix}-${random}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizePresetName(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function ensureUniqueName(
  name: string,
  existingNames: string[],
  excludeName?: string,
): string {
  const occupied = new Set(
    existingNames.filter((n) => n !== excludeName).map((n) => n.toLowerCase()),
  );
  if (!occupied.has(name.toLowerCase())) return name;
  let i = 2;
  while (occupied.has(`${name} (${i})`.toLowerCase())) {
    i += 1;
  }
  return `${name} (${i})`;
}

function isUiPresetSystem(preset: UiThemePreset): boolean {
  if (preset.kind) return preset.kind === "system";
  return preset.id.startsWith("preset-ui-");
}

function isDocPresetSystem(preset: DocThemePreset): boolean {
  if (preset.kind) return preset.kind === "system";
  return preset.id.startsWith("preset-doc-");
}

function isSameDocumentColors(
  a: DocumentColorSettings,
  b: DocumentColorSettings,
): boolean {
  return (
    a.pageColor === b.pageColor &&
    a.textColor === b.textColor &&
    a.headingColor === b.headingColor
  );
}

type UseAppUiStateOptions = {
  coreRef: RefObject<EditorCoreHandle | null>;
};

export function useAppUiState({ coreRef }: UseAppUiStateOptions) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [editorInlineHintMessage, setEditorInlineHintMessage] = useState<
    string | null
  >(null);
  const editorInlineHintTimerRef = useRef<number | null>(null);
  const [lineBreakPolicyNoticeMessage, setLineBreakPolicyNoticeMessage] =
    useState<string | null>(null);
  const [lineBreakPolicyNoticeIsDirty, setLineBreakPolicyNoticeIsDirty] =
    useState(false);
  const lineBreakPolicyNoticeTimerRef = useRef<number | null>(null);
  const [commonmarkBadgeEmphasis, setCommonmarkBadgeEmphasis] = useState(false);
  const commonmarkBadgeEmphasisTimerRef = useRef<number | null>(null);
  const [imeProfilerEnabled, setImeProfilerEnabled] = useState(false);
  const [imeProfilerShowHud, setImeProfilerShowHud] = useState(false);
  const [imeProfilerLogSummary, setImeProfilerLogSummary] = useState(true);
  const [imePhaseAEnabled, setImePhaseAEnabled] = useState(false);
  const [imePhaseAMinSyncIntervalMs, setImePhaseAMinSyncIntervalMs] =
    useState(400);
  const [imePhaseBRubySuspendEnabled, setImePhaseBRubySuspendEnabled] =
    useState(false);
  const [imeProfilerSaveJson, setImeProfilerSaveJson] = useState(false);
  const [imeProfilerBenchmarkDocumentId, setImeProfilerBenchmarkDocumentId] =
    useState<string | null>(null);
  const [imeProfilerBenchmarkInputChars, setImeProfilerBenchmarkInputChars] =
    useState<number | null>(null);
  const [rubyVisible, setRubyVisible] = useState(() => loadRubyVisibility());
  const [frontmatterVisible, setFrontmatterVisible] = useState(
    DEFAULT_FRONTMATTER_VISIBLE,
  );
  const [frontmatterShowAuthors, setFrontmatterShowAuthors] = useState(
    DEFAULT_FRONTMATTER_SHOW_AUTHORS,
  );
  const [frontmatterShowTranslators, setFrontmatterShowTranslators] = useState(
    DEFAULT_FRONTMATTER_SHOW_TRANSLATORS,
  );
  const [frontmatterShowRoleLabels, setFrontmatterShowRoleLabels] = useState(
    DEFAULT_FRONTMATTER_SHOW_ROLE_LABELS,
  );
  const [frontmatterShowInProjectFiles, setFrontmatterShowInProjectFiles] =
    useState(DEFAULT_FRONTMATTER_SHOW_IN_PROJECT_FILES);
  const [frontmatterProjectShowTitle, setFrontmatterProjectShowTitle] =
    useState(DEFAULT_FRONTMATTER_PROJECT_SHOW_TITLE);
  const [frontmatterProjectShowAuthors, setFrontmatterProjectShowAuthors] =
    useState(DEFAULT_FRONTMATTER_PROJECT_SHOW_AUTHORS);
  const [displaySettingsOpen, _setDisplaySettingsOpen] = useState(false);
  const [displaySettingsExpandSectionKey, setDisplaySettingsExpandSectionKey] =
    useState<DisplaySettingsSectionKey | null>(null);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() =>
    loadDisplaySettings(),
  );
  const initialWritingMode = useRef<WritingMode>(loadWritingMode());
  const initialLineBreakPolicy = useRef<LineBreakPolicy>(
    DEFAULT_LINE_BREAK_POLICY,
  );
  const [lineBreakPolicy, setLineBreakPolicy] = useState<LineBreakPolicy>(
    initialLineBreakPolicy.current,
  );
  const [pendingLineBreakPolicy, setPendingLineBreakPolicy] =
    useState<LineBreakPolicy | null>(null);
  const clearLineBreakPolicyNotice = useCallback(() => {
    if (lineBreakPolicyNoticeTimerRef.current !== null) {
      window.clearTimeout(lineBreakPolicyNoticeTimerRef.current);
      lineBreakPolicyNoticeTimerRef.current = null;
    }
    setLineBreakPolicyNoticeMessage(null);
    setLineBreakPolicyNoticeIsDirty(false);
  }, []);
  const setDisplaySettingsOpen = useCallback(
    (
      open: boolean,
      options?: {
        expandSection?: DisplaySettingsSectionKey;
      },
    ) => {
      if (open) {
        setDisplaySettingsExpandSectionKey(options?.expandSection ?? null);
      } else {
        clearLineBreakPolicyNotice();
        setDisplaySettingsExpandSectionKey(null);
      }
      _setDisplaySettingsOpen(open);
    },
    [clearLineBreakPolicyNotice],
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [defaultWritingMode, _setDefaultWritingMode] = useState<WritingMode>(
    () => loadWritingMode(),
  );

  // Document Type 別の既定表示方向（settings.json）。frontmatter `writingMode` が無い文書にだけ効く。
  const [documentTypeWritingModeDefaults, _setDocumentTypeWritingModeDefaults] =
    useState<DocumentTypeWritingModeDefaults>(
      () => DEFAULT_DOCUMENT_TYPE_WRITING_MODE_DEFAULTS,
    );
  const setDocumentTypeWritingModeDefaults = useCallback(
    (patch: Partial<DocumentTypeWritingModeDefaults>) =>
      _setDocumentTypeWritingModeDefaults((prev) => ({ ...prev, ...patch })),
    [],
  );

  const [fullPlainEditActive, setFullPlainEditActive] = useState(false);
  const [fullPlainEditValue, setFullPlainEditValue] = useState("");
  const [fullPlainEditError, setFullPlainEditError] = useState("");
  const [paragraphPlainModeActive, setParagraphPlainModeActive] =
    useState(false);
  const [tabs, setTabs] = useState<EditorTab[]>([
    {
      id: INITIAL_TAB_ID,
      title: INITIAL_TAB_TITLE,
      dirty: false,
      filePath: null,
      markdownSnapshot: "",
      cleanMarkdownSnapshot: "",
      frontmatterFields: {},
      documentMarkdownOptions: { preserveEmptyParagraphs: false },
      characterCount: 0,
      savedStat: null,
      writingMode: initialWritingMode.current,
      writingModeFollowsTypeRecommendation: true,
      lineBreakPolicy: initialLineBreakPolicy.current,
      eol: "lf",
      scrollTop: 0,
      scrollLeft: 0,
      viewportAnchorPmPos: null,
      viewportAnchorTextOffset: null,
      viewportAnchorTextTotal: null,
      sourceModeTopOffset: null,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(INITIAL_TAB_ID);
  const activeTabIdRef = useRef(INITIAL_TAB_ID);
  const lineBreakPolicyApplyInProgressRef = useRef(false);
  const suppressNextDirtyRef = useRef(false);
  // null = 初回 mount（書字方向変化と見なさない）
  const prevEffectiveWritingModeRef = useRef<string | null>(null);

  const [rightPaneTab, setRightPaneTab] = useState<RightPaneTab>("outline");
  const [headings, setHeadings] = useState<HeadingInfo[]>([]);
  const [activeHeadingIndex, setActiveHeadingIndex] = useState(-1);
  const [foldedHeadingPositions, setFoldedHeadingPositions] = useState<
    Set<number>
  >(() => new Set());

  const [theme, _setTheme] = useState(loadUiTheme);
  const [uiFont, _setUiFont] = useState<UiFont>(() => loadUiFont());
  const [uiLanguageMode, setUiLanguageMode] = useState<UiLanguageMode>(() =>
    loadUiLanguageMode(),
  );
  const [uiTextPrimary, _setUiTextPrimary] = useState<string | null>(() =>
    loadUiTextPrimary(),
  );
  const [uiFontScale, _setUiFontScale] = useState<number>(() =>
    loadUiFontScale(),
  );
  const [toolbarIconColor, _setToolbarIconColor] = useState<string | null>(() =>
    loadToolbarIconColor(),
  );
  const [toolbarIconStroke, _setToolbarIconStroke] = useState<number>(() =>
    loadToolbarIconStroke(),
  );
  const [toolbarScale, _setToolbarScale] = useState<number>(() =>
    loadToolbarScale(),
  );
  const [appTitleVisible, _setAppTitleVisible] = useState<boolean>(() =>
    loadAppTitleVisible(),
  );
  const [appTitlePreset, _setAppTitlePreset] = useState<AppTitlePreset>(() =>
    loadAppTitlePreset(),
  );
  const [appTitleCustom, _setAppTitleCustom] = useState<string>(() =>
    loadAppTitleCustom(),
  );
  const [appTitleColor, _setAppTitleColor] = useState<string | null>(() =>
    loadAppTitleColor(),
  );
  const [appTitleFont, _setAppTitleFont] = useState<AppTitleFont>(() =>
    loadAppTitleFont(),
  );
  const [documentTheme, _setDocumentTheme] = useState<DocumentTheme>(() =>
    loadDocumentTheme(),
  );
  const [docFontPreset, _setDocFontPreset] = useState<DocumentFontPreset>(() =>
    loadDocFontPreset(),
  );
  const [docHeadingFont, _setDocHeadingFont] = useState<DocumentHeadingFont>(
    () => loadDocHeadingFont(),
  );
  const [docColorSettings, _setDocColorSettings] =
    useState<DocumentColorSettings>(() => loadDocColorSettings());
  const [registeredFonts, setRegisteredFonts] = useState<string[]>(() =>
    loadRegisteredFonts(),
  );
  const [selectedFont, _setSelectedFont] = useState<string | null>(() =>
    loadSelectedFont(),
  );
  const [settingsSyncReady, setSettingsSyncReady] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(() =>
    loadToolbarVisible(),
  );

  // Phase5-H Slice1: theme presets
  const [uiThemePresets, setUiThemePresets] = useState<UiThemePreset[]>([]);
  const [activeUiThemePresetId, _setActiveUiThemePresetId] = useState<
    string | null
  >(null);
  const [docThemePresets, setDocThemePresets] = useState<DocThemePreset[]>([]);
  const [activeDocThemePresetId, _setActiveDocThemePresetId] = useState<
    string | null
  >(null);
  const [toolbarOffset, setToolbarOffset] = useState(() => loadToolbarOffset());

  // BETA-DISP1: caret color settings
  const [caretColorMode, _setCaretColorMode] = useState<CaretColorMode>(() =>
    loadCaretColorMode(),
  );
  const [caretColorCustom, _setCaretColorCustom] = useState<string | null>(() =>
    loadCaretColorCustom(),
  );
  const [useEditorArrowPointer, _setUseEditorArrowPointer] = useState<boolean>(() =>
    loadUseEditorArrowPointer(),
  );
  const [paragraphPlainBehavior, _setParagraphPlainBehavior] =
    useState<ParagraphPlainBehavior>(DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR);

  const [typewriterModeEnabled, _setTypewriterModeEnabled] = useState<boolean>(
    () => DEFAULT_TYPEWRITER_MODE_ENABLED,
  );
  const [typewriterOffsetRatio, _setTypewriterOffsetRatio] = useState<number>(
    () => DEFAULT_TYPEWRITER_OFFSET_RATIO,
  );
  const [typewriterFollowBandRatio, _setTypewriterFollowBandRatio] =
    useState<number>(() => DEFAULT_TYPEWRITER_FOLLOW_BAND_RATIO);

  const [visualFocusBlockHighlightEnabled, _setVisualFocusBlockHighlightEnabled] =
    useState<boolean>(() => DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_ENABLED);

  const [visualFocusDimNonFocusedBlocksEnabled, _setVisualFocusDimNonFocusedBlocksEnabled] =
    useState<boolean>(() => DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_ENABLED);

  const [visualFocusBlockHighlightColor, _setVisualFocusBlockHighlightColor] = useState<string>(
    () => DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_COLOR,
  );
  const [visualFocusBlockHighlightOpacity, _setVisualFocusBlockHighlightOpacity] = useState<number>(
    () => DEFAULT_VISUAL_FOCUS_BLOCK_HIGHLIGHT_OPACITY,
  );
  const [visualFocusDimNonFocusedBlocksOpacity, _setVisualFocusDimNonFocusedBlocksOpacity] =
    useState<number>(() => DEFAULT_VISUAL_FOCUS_DIM_NON_FOCUSED_BLOCKS_OPACITY);

  const [visualFocusCurrentLineHighlightEnabled, _setVisualFocusCurrentLineHighlightEnabled] =
    useState<boolean>(() => DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_ENABLED);

  const [visualFocusCurrentLineHighlightColor, _setVisualFocusCurrentLineHighlightColor] =
    useState<string>(() => DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_COLOR);

  const [visualFocusCurrentLineHighlightOpacity, _setVisualFocusCurrentLineHighlightOpacity] =
    useState<number>(() => DEFAULT_VISUAL_FOCUS_CURRENT_LINE_HIGHLIGHT_OPACITY);

  const [macosArrowScrollClampEnabled, _setMacosArrowScrollClampEnabled] =
    useState<boolean>(() => DEFAULT_MACOS_ARROW_SCROLL_CLAMP_ENABLED);

  const [pseudoCaretEnabled, _setPseudoCaretEnabled] =
    useState<boolean>(() => DEFAULT_PSEUDO_CARET_ENABLED);

  const [pseudoCaretThickness, _setPseudoCaretThickness] =
    useState<number>(() => DEFAULT_PSEUDO_CARET_THICKNESS);

  const [pseudoCaretBlinkEnabled, _setPseudoCaretBlinkEnabled] =
    useState<boolean>(() => DEFAULT_PSEUDO_CARET_BLINK_ENABLED);

  // 付箋 (Task 3A-3): 初回説明の確認済みフラグ。設定 UI なし。
  const [noteAnchorNoticeConfirmed, _setNoteAnchorNoticeConfirmed] =
    useState<boolean>(() => DEFAULT_NOTE_ANCHOR_NOTICE_CONFIRMED);

  const platform = detectRuntimePlatform();
  const usesNativeWindowControls =
    platform === "darwin" || platform === "win32" || platform === "linux";

  const activeTab = useMemo(
    () =>
      tabs.find((tab) => tab.id === activeTabId) ??
      tabs[0] ?? {
        id: INITIAL_TAB_ID,
        title: INITIAL_TAB_TITLE,
        dirty: false,
        filePath: null,
        markdownSnapshot: "",
        cleanMarkdownSnapshot: "",
        frontmatterFields: {},
        documentMarkdownOptions: { preserveEmptyParagraphs: false },
        characterCount: 0,
        savedStat: null,
        writingMode: initialWritingMode.current,
        writingModeFollowsTypeRecommendation: true,
        lineBreakPolicy: initialLineBreakPolicy.current,
        eol: "lf",
        scrollTop: 0,
        scrollLeft: 0,
        viewportAnchorPmPos: null,
        viewportAnchorTextOffset: null,
        viewportAnchorTextTotal: null,
        sourceModeTopOffset: null,
      },
    [tabs, activeTabId],
  );

  const effectiveLineBreakPolicy: LineBreakPolicy =
    resolveEffectiveLineBreakPolicyForTab(activeTab);
  const lineBreakPolicyLockReason =
    resolveLineBreakPolicyLockReasonForTab(activeTab);
  const isLineBreakPolicyLocked = lineBreakPolicyLockReason !== null;
  const isLineBreakPolicyOverridden =
    lineBreakPolicyLockReason === "frontmatter";
  // 実効表示方向の優先順位: 手動切替 > frontmatter writingMode > Document Type 別の既定表示方向。
  const effectiveWritingMode = resolveEffectiveWritingMode({
    frontmatter: activeTab.frontmatterFields,
    tabWritingMode: activeTab.writingMode,
    followsTypeRecommendation: activeTab.writingModeFollowsTypeRecommendation,
    typeDefaults: documentTypeWritingModeDefaults,
  });
  // Document Settings の表示方向サマリ用に、Document Type 別の既定表示方向を解決する。
  const typeRecommendedWritingMode = resolveTypeDefaultWritingMode(
    resolveDocumentType(activeTab.frontmatterFields),
    documentTypeWritingModeDefaults,
  );
  const frontmatterWritingModeResolution = resolveFrontmatterWritingMode(
    activeTab.frontmatterFields,
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      runSettingsMigration();
      await migrateToSettingsJson();
      await migrateToThemePresets();

      const settings = await loadSettingsJson();
      if (cancelled) return;

      const normalizedTheme = normalizeTheme(settings.uiTheme);
      if (normalizedTheme) _setTheme(normalizedTheme);
      const normalizedUiFont = normalizeUiFont(settings.uiFont);
      if (normalizedUiFont) _setUiFont(normalizedUiFont);
      const normalizedUiLanguageMode = normalizeUiLanguageMode(
        settings.uiLanguageMode,
      );
      if (normalizedUiLanguageMode) setUiLanguageMode(normalizedUiLanguageMode);
      if (settings.uiTextPrimary !== undefined) {
        _setUiTextPrimary(normalizeUiTextPrimary(settings.uiTextPrimary));
      }
      if (typeof settings.uiFontScale === "number") {
        _setUiFontScale(clampNumber(settings.uiFontScale, 0.9, 1.3));
      }
      if (settings.toolbarIconColor !== undefined) {
        _setToolbarIconColor(normalizeUiTextPrimary(settings.toolbarIconColor));
      }
      if (settings.toolbarIconStroke !== undefined) {
        const normalizedStroke = normalizeToolbarIconStroke(
          settings.toolbarIconStroke,
        );
        if (normalizedStroke !== null) _setToolbarIconStroke(normalizedStroke);
      }
      if (settings.toolbarScale !== undefined) {
        const normalizedScale = normalizeToolbarScale(settings.toolbarScale);
        if (normalizedScale !== null) _setToolbarScale(normalizedScale);
      }
      if (settings.appTitleVisible !== undefined) {
        _setAppTitleVisible(settings.appTitleVisible !== false);
      }
      if (settings.appTitlePreset !== undefined) {
        const normalizedAppTitlePreset = normalizeAppTitlePreset(
          settings.appTitlePreset,
        );
        if (normalizedAppTitlePreset)
          _setAppTitlePreset(normalizedAppTitlePreset);
      }
      if (settings.appTitleCustom !== undefined) {
        _setAppTitleCustom(normalizeAppTitleCustom(settings.appTitleCustom));
      }
      if (settings.appTitleColor !== undefined) {
        _setAppTitleColor(normalizeUiTextPrimary(settings.appTitleColor));
      }
      if (settings.appTitleFont !== undefined) {
        const normalizedAppTitleFont = normalizeAppTitleFont(
          settings.appTitleFont,
        );
        if (normalizedAppTitleFont) _setAppTitleFont(normalizedAppTitleFont);
      }
      if (settings.displaySettings) {
        setDisplaySettings(normalizeDisplaySettings(settings.displaySettings));
      }
      const normalizedDocumentTheme = normalizeDocumentTheme(
        settings.documentTheme,
      );
      if (normalizedDocumentTheme) _setDocumentTheme(normalizedDocumentTheme);
      const normalizedDocFontPreset = normalizeDocFontPreset(
        settings.docFontPreset,
      );
      if (normalizedDocFontPreset) _setDocFontPreset(normalizedDocFontPreset);
      const normalizedDocHeadingFont = normalizeDocHeadingFont(
        settings.docHeadingFont,
      );
      if (normalizedDocHeadingFont)
        _setDocHeadingFont(normalizedDocHeadingFont);
      if (settings.docColorSettings)
        _setDocColorSettings(settings.docColorSettings);
      if (settings.registeredFonts !== undefined) {
        setRegisteredFonts(settings.registeredFonts);
      }
      if (settings.selectedFont !== undefined) {
        _setSelectedFont(settings.selectedFont ?? null);
      }
      if (typeof settings.rubyVisible === "boolean") {
        setRubyVisible(settings.rubyVisible);
      }
      if (typeof settings.frontmatterVisible === "boolean") {
        setFrontmatterVisible(settings.frontmatterVisible);
      }
      if (typeof settings.frontmatterShowAuthors === "boolean") {
        setFrontmatterShowAuthors(settings.frontmatterShowAuthors);
      }
      if (typeof settings.frontmatterShowTranslators === "boolean") {
        setFrontmatterShowTranslators(settings.frontmatterShowTranslators);
      }
      if (typeof settings.frontmatterShowRoleLabels === "boolean") {
        setFrontmatterShowRoleLabels(settings.frontmatterShowRoleLabels);
      }
      if (typeof settings.frontmatterShowInProjectFiles === "boolean") {
        setFrontmatterShowInProjectFiles(settings.frontmatterShowInProjectFiles);
      }
      if (typeof settings.frontmatterProjectShowTitle === "boolean") {
        setFrontmatterProjectShowTitle(settings.frontmatterProjectShowTitle);
      }
      if (typeof settings.frontmatterProjectShowAuthors === "boolean") {
        setFrontmatterProjectShowAuthors(settings.frontmatterProjectShowAuthors);
      }
      if (settings.caretColorMode !== undefined) {
        _setCaretColorMode(normalizeCaretColorMode(settings.caretColorMode));
      }
      if (settings.caretColorCustom !== undefined) {
        _setCaretColorCustom(normalizeCaretColorCustom(settings.caretColorCustom));
      }
      if (typeof settings.useEditorArrowPointer === "boolean") {
        _setUseEditorArrowPointer(settings.useEditorArrowPointer);
      }
      const nextParagraphPlainBehavior = normalizeParagraphPlainBehavior(
        settings.paragraphPlainBehavior,
      );
      _setParagraphPlainBehavior(nextParagraphPlainBehavior);
      setParagraphPlainFormalBehaviorRuntime(nextParagraphPlainBehavior);

      if (settings.typewriterModeEnabled !== undefined) {
        _setTypewriterModeEnabled(
          normalizeTypewriterModeEnabled(settings.typewriterModeEnabled),
        );
      }
      if (settings.typewriterOffsetRatio !== undefined) {
        _setTypewriterOffsetRatio(
          normalizeTypewriterOffsetRatio(settings.typewriterOffsetRatio),
        );
      }
      if (settings.typewriterFollowBandRatio !== undefined) {
        _setTypewriterFollowBandRatio(
          normalizeTypewriterFollowBandRatio(settings.typewriterFollowBandRatio),
        );
      }
      if (settings.visualFocusBlockHighlightEnabled !== undefined) {
        _setVisualFocusBlockHighlightEnabled(
          normalizeVisualFocusBlockHighlightEnabled(settings.visualFocusBlockHighlightEnabled),
        );
      }
      if (settings.visualFocusDimNonFocusedBlocksEnabled !== undefined) {
        _setVisualFocusDimNonFocusedBlocksEnabled(
          normalizeVisualFocusDimNonFocusedBlocksEnabled(settings.visualFocusDimNonFocusedBlocksEnabled),
        );
      }
      if (settings.visualFocusBlockHighlightColor !== undefined) {
        _setVisualFocusBlockHighlightColor(
          normalizeVisualFocusBlockHighlightColor(settings.visualFocusBlockHighlightColor),
        );
      }
      if (settings.visualFocusBlockHighlightOpacity !== undefined) {
        _setVisualFocusBlockHighlightOpacity(
          normalizeVisualFocusBlockHighlightOpacity(settings.visualFocusBlockHighlightOpacity),
        );
      }
      if (settings.visualFocusDimNonFocusedBlocksOpacity !== undefined) {
        _setVisualFocusDimNonFocusedBlocksOpacity(
          normalizeVisualFocusDimNonFocusedBlocksOpacity(settings.visualFocusDimNonFocusedBlocksOpacity),
        );
      }
      if (settings.visualFocusCurrentLineHighlightEnabled !== undefined) {
        _setVisualFocusCurrentLineHighlightEnabled(
          normalizeVisualFocusCurrentLineHighlightEnabled(settings.visualFocusCurrentLineHighlightEnabled),
        );
      }
      if (settings.visualFocusCurrentLineHighlightColor !== undefined) {
        _setVisualFocusCurrentLineHighlightColor(
          normalizeVisualFocusCurrentLineHighlightColor(settings.visualFocusCurrentLineHighlightColor),
        );
      }
      if (settings.visualFocusCurrentLineHighlightOpacity !== undefined) {
        _setVisualFocusCurrentLineHighlightOpacity(
          normalizeVisualFocusCurrentLineHighlightOpacity(settings.visualFocusCurrentLineHighlightOpacity),
        );
      }
      if (settings.macosArrowScrollClampEnabled !== undefined) {
        _setMacosArrowScrollClampEnabled(
          normalizeMacosArrowScrollClampEnabled(settings.macosArrowScrollClampEnabled),
        );
      }
      if (settings.pseudoCaretEnabled !== undefined) {
        _setPseudoCaretEnabled(
          normalizePseudoCaretEnabled(settings.pseudoCaretEnabled),
        );
      }
      if (settings.pseudoCaretThickness !== undefined) {
        _setPseudoCaretThickness(
          normalizePseudoCaretThickness(settings.pseudoCaretThickness),
        );
      }
      if (settings.pseudoCaretBlinkEnabled !== undefined) {
        _setPseudoCaretBlinkEnabled(
          normalizePseudoCaretBlinkEnabled(settings.pseudoCaretBlinkEnabled),
        );
      }
      if (settings.noteAnchorNoticeConfirmed !== undefined) {
        _setNoteAnchorNoticeConfirmed(
          normalizeNoteAnchorNoticeConfirmed(settings.noteAnchorNoticeConfirmed),
        );
      }

      const loadedWritingModeDefaults =
        resolveDocumentTypeWritingModeDefaultsFromSettings(settings);
      if (loadedWritingModeDefaults) {
        _setDocumentTypeWritingModeDefaults(loadedWritingModeDefaults);
      }

      if (settings.lineBreakPolicy === DEFAULT_LINE_BREAK_POLICY) {
        setLineBreakPolicy(DEFAULT_LINE_BREAK_POLICY);
      }
      const imeProfilerDebug = normalizeImeProfilerDebugConfig(settings.debug);
      setImeProfilerEnabled(imeProfilerDebug.enabled);
      setImeProfilerShowHud(imeProfilerDebug.showHud);
      setImeProfilerLogSummary(imeProfilerDebug.logSummary);
      setImePhaseAEnabled(imeProfilerDebug.phaseAEnabled);
      setImePhaseAMinSyncIntervalMs(imeProfilerDebug.phaseAMinSyncIntervalMs);
      setImePhaseBRubySuspendEnabled(imeProfilerDebug.phaseBRubySuspendEnabled);
      setImeProfilerSaveJson(imeProfilerDebug.saveJson);
      setImeProfilerBenchmarkDocumentId(imeProfilerDebug.benchmarkDocumentId);
      setImeProfilerBenchmarkInputChars(imeProfilerDebug.benchmarkInputChars);

      // Phase5-H Slice1: load presets
      const validatedUiPresets = validateUiThemePresets(
        settings.uiThemePresets,
      );
      if (validatedUiPresets.length > 0) {
        setUiThemePresets(validatedUiPresets);
        const activeId = settings.activeUiThemePresetId ?? null;
        if (activeId) {
          const activePreset = validatedUiPresets.find(
            (p) => p.id === activeId,
          );
          if (activePreset) {
            _setActiveUiThemePresetId(activeId);
            // Apply derived tokens so preset colors win over data-theme CSS rules
            const tokens = deriveUiThemeTokens(activePreset.colors);
            for (const [key, value] of Object.entries(tokens)) {
              document.documentElement.style.setProperty(key, value);
            }
          }
        }
      }
      const validatedDocPresets = validateDocThemePresets(
        settings.docThemePresets,
      );
      if (validatedDocPresets.length > 0) {
        setDocThemePresets(validatedDocPresets);
        if (settings.activeDocThemePresetId) {
          _setActiveDocThemePresetId(settings.activeDocThemePresetId);
        }
      }
      if (settings.themePresetSchemaVersion !== 1) {
        void patchSettingsJson({ themePresetSchemaVersion: 1 });
      }

      setSettingsSyncReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-platform", platform);
    saveUiTheme(theme);
    if (settingsSyncReady) {
      void patchSettingsJson({ uiTheme: theme });
    }
  }, [theme, platform, settingsSyncReady]);

  useEffect(() => {
    const fontFamily = (() => {
      if (uiFont === "mincho") return "var(--font-stack-mincho)";
      if (uiFont === "gothic") return "var(--font-stack-ui-gothic)";
      return uiFont.slice("custom:".length);
    })();
    document.documentElement.style.setProperty("--ui-font-family", fontFamily);
    saveUiFont(uiFont);
    if (settingsSyncReady) {
      void patchSettingsJson({ uiFont });
    }
  }, [uiFont, settingsSyncReady]);

  useEffect(() => {
    saveUiLanguageMode(uiLanguageMode);
    if (settingsSyncReady) {
      void patchSettingsJson({ uiLanguageMode });
    }
  }, [uiLanguageMode, settingsSyncReady]);

  useEffect(() => {
    if (uiTextPrimary === null) {
      document.documentElement.style.removeProperty("--text-primary");
      document.documentElement.style.removeProperty("--text-secondary");
      document.documentElement.style.removeProperty("--text-muted");
    } else {
      document.documentElement.style.setProperty(
        "--text-primary",
        uiTextPrimary,
      );
      document.documentElement.style.setProperty(
        "--text-secondary",
        "color-mix(in srgb, var(--text-primary) 78%, var(--bg-panel) 22%)",
      );
      document.documentElement.style.setProperty(
        "--text-muted",
        "color-mix(in srgb, var(--text-primary) 58%, var(--bg-panel) 42%)",
      );
    }
    saveUiTextPrimary(uiTextPrimary);
    if (settingsSyncReady) {
      void patchSettingsJson({ uiTextPrimary });
    }
  }, [uiTextPrimary, settingsSyncReady]);

  useEffect(() => {
    const normalized = clampNumber(uiFontScale, 0.9, 1.3);
    document.documentElement.style.setProperty(
      "--ui-font-scale",
      `${normalized}`,
    );
    saveUiFontScale(normalized);
    if (settingsSyncReady) {
      void patchSettingsJson({ uiFontScale: normalized });
    }
  }, [uiFontScale, settingsSyncReady]);

  useEffect(() => {
    if (toolbarIconColor === null) {
      document.documentElement.style.removeProperty("--toolbar-icon-color");
    } else {
      document.documentElement.style.setProperty(
        "--toolbar-icon-color",
        toolbarIconColor,
      );
    }
    saveToolbarIconColor(toolbarIconColor);
    if (settingsSyncReady) {
      void patchSettingsJson({ toolbarIconColor });
    }
  }, [toolbarIconColor, settingsSyncReady]);

  useEffect(() => {
    const normalized = clampNumber(
      toolbarIconStroke,
      MIN_TOOLBAR_ICON_STROKE,
      MAX_TOOLBAR_ICON_STROKE,
    );
    document.documentElement.style.setProperty(
      "--toolbar-icon-stroke",
      `${normalized}`,
    );
    saveToolbarIconStroke(normalized);
    if (settingsSyncReady) {
      void patchSettingsJson({ toolbarIconStroke: normalized });
    }
  }, [toolbarIconStroke, settingsSyncReady]);

  useEffect(() => {
    const normalized = clampNumber(
      toolbarScale,
      MIN_TOOLBAR_SCALE,
      MAX_TOOLBAR_SCALE,
    );
    document.documentElement.style.setProperty(
      "--toolbar-scale",
      `${normalized}`,
    );
    saveToolbarScale(normalized);
    if (settingsSyncReady) {
      void patchSettingsJson({ toolbarScale: normalized });
    }
  }, [toolbarScale, settingsSyncReady]);

  useEffect(() => {
    const effectiveColor = appTitleColor ?? APP_TITLE_COLOR_PRESETS[theme];
    document.documentElement.style.setProperty(
      "--app-title-color",
      effectiveColor,
    );
    saveAppTitleColor(appTitleColor);
    if (settingsSyncReady) {
      void patchSettingsJson({ appTitleColor });
    }
  }, [appTitleColor, theme, settingsSyncReady]);

  useEffect(() => {
    const fontFamily = (() => {
      if (appTitleFont === "ui-default") return "var(--ui-font-family)";
      if (appTitleFont === "mincho") return "var(--font-stack-mincho)";
      if (appTitleFont === "gothic") return "var(--font-stack-ui-gothic)";
      return appTitleFont.slice("custom:".length);
    })();
    document.documentElement.style.setProperty(
      "--app-title-font-family",
      fontFamily,
    );
    saveAppTitleFont(appTitleFont);
    if (settingsSyncReady) {
      void patchSettingsJson({ appTitleFont });
    }
  }, [appTitleFont, settingsSyncReady]);

  useEffect(() => {
    saveAppTitleVisible(appTitleVisible);
    if (settingsSyncReady) {
      void patchSettingsJson({ appTitleVisible });
    }
  }, [appTitleVisible, settingsSyncReady]);

  useEffect(() => {
    saveAppTitlePreset(appTitlePreset);
    if (settingsSyncReady) {
      void patchSettingsJson({ appTitlePreset });
    }
  }, [appTitlePreset, settingsSyncReady]);

  useEffect(() => {
    saveAppTitleCustom(appTitleCustom);
    if (settingsSyncReady) {
      void patchSettingsJson({ appTitleCustom });
    }
  }, [appTitleCustom, settingsSyncReady]);

  useEffect(() => {
    saveDocumentTheme(documentTheme);
    if (settingsSyncReady) {
      void patchSettingsJson({ documentTheme });
    }
  }, [documentTheme, settingsSyncReady]);

  useEffect(() => {
    saveDocFontPreset(docFontPreset);
    if (settingsSyncReady) {
      void patchSettingsJson({ docFontPreset });
    }
  }, [docFontPreset, settingsSyncReady]);

  useEffect(() => {
    if (selectedFont === null) return;
    const customPreset = `custom:${selectedFont}` as DocumentFontPreset;
    _setDocFontPreset((prev) => (prev === customPreset ? prev : customPreset));
    _setSelectedFont(null);
  }, [selectedFont]);

  useEffect(() => {
    saveDocHeadingFont(docHeadingFont);
    if (settingsSyncReady) {
      void patchSettingsJson({ docHeadingFont });
    }
  }, [docHeadingFont, settingsSyncReady]);

  useEffect(() => {
    saveDocColorSettings(docColorSettings);
    if (settingsSyncReady) {
      void patchSettingsJson({ docColorSettings });
    }
  }, [docColorSettings, settingsSyncReady]);

  useEffect(() => {
    saveRegisteredFonts(registeredFonts);
    if (settingsSyncReady) {
      void patchSettingsJson({ registeredFonts });
    }
  }, [registeredFonts, settingsSyncReady]);

  useEffect(() => {
    saveSelectedFont(selectedFont);
    if (settingsSyncReady) {
      void patchSettingsJson({ selectedFont });
    }
  }, [selectedFont, settingsSyncReady]);

  useEffect(() => {
    saveRubyVisibility(rubyVisible);
    if (settingsSyncReady) {
      void patchSettingsJson({ rubyVisible });
    }
  }, [rubyVisible, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterVisible });
  }, [frontmatterVisible, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterShowAuthors });
  }, [frontmatterShowAuthors, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterShowTranslators });
  }, [frontmatterShowTranslators, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterShowRoleLabels });
  }, [frontmatterShowRoleLabels, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterShowInProjectFiles });
  }, [frontmatterShowInProjectFiles, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterProjectShowTitle });
  }, [frontmatterProjectShowTitle, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ frontmatterProjectShowAuthors });
  }, [frontmatterProjectShowAuthors, settingsSyncReady]);

  useEffect(() => {
    saveDisplaySettings(displaySettings);
    if (settingsSyncReady) {
      void patchSettingsJson({ displaySettings });
    }
  }, [displaySettings, settingsSyncReady]);

  // Persist the global default (new-tab default) to storage
  useEffect(() => {
    saveLineBreakPolicy(lineBreakPolicy);
    if (settingsSyncReady) {
      void patchSettingsJson({ lineBreakPolicy });
    }
  }, [lineBreakPolicy, settingsSyncReady]);

  // BETA-DISP1: persist caret color settings
  useEffect(() => {
    saveCaretColorMode(caretColorMode);
    if (settingsSyncReady) {
      void patchSettingsJson({ caretColorMode });
    }
  }, [caretColorMode, settingsSyncReady]);

  useEffect(() => {
    saveCaretColorCustom(caretColorCustom);
    if (settingsSyncReady) {
      void patchSettingsJson({ caretColorCustom });
    }
  }, [caretColorCustom, settingsSyncReady]);

  useEffect(() => {
    saveUseEditorArrowPointer(useEditorArrowPointer);
    if (settingsSyncReady) {
      void patchSettingsJson({ useEditorArrowPointer });
    }
  }, [useEditorArrowPointer, settingsSyncReady]);

  useEffect(() => {
    setParagraphPlainFormalBehaviorRuntime(paragraphPlainBehavior);
    if (settingsSyncReady) {
      void patchSettingsJson({ paragraphPlainBehavior });
    }
  }, [paragraphPlainBehavior, settingsSyncReady]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({
      typewriterModeEnabled,
      typewriterOffsetRatio,
      typewriterFollowBandRatio,
    });
  }, [
    settingsSyncReady,
    typewriterModeEnabled,
    typewriterOffsetRatio,
    typewriterFollowBandRatio,
  ]);

  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({
      visualFocusBlockHighlightEnabled,
      visualFocusDimNonFocusedBlocksEnabled,
      visualFocusBlockHighlightColor,
      visualFocusBlockHighlightOpacity,
      visualFocusDimNonFocusedBlocksOpacity,
      visualFocusCurrentLineHighlightEnabled,
      visualFocusCurrentLineHighlightColor,
      visualFocusCurrentLineHighlightOpacity,
    });
  }, [
    settingsSyncReady,
    visualFocusBlockHighlightEnabled,
    visualFocusDimNonFocusedBlocksEnabled,
    visualFocusBlockHighlightColor,
    visualFocusBlockHighlightOpacity,
    visualFocusDimNonFocusedBlocksOpacity,
    visualFocusCurrentLineHighlightEnabled,
    visualFocusCurrentLineHighlightColor,
    visualFocusCurrentLineHighlightOpacity,
  ]);

  // Pseudo caret (Task 2-2/2-4): settings.json ON/OFF + thickness persistence.
  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({
      pseudoCaretEnabled,
      pseudoCaretThickness,
      pseudoCaretBlinkEnabled,
    });
  }, [settingsSyncReady, pseudoCaretEnabled, pseudoCaretThickness, pseudoCaretBlinkEnabled]);

  // 付箋 (Task 3A-3): 初回説明の確認済みフラグ persistence.
  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({ noteAnchorNoticeConfirmed });
  }, [settingsSyncReady, noteAnchorNoticeConfirmed]);

  // Document Type 別の既定表示方向 persistence（frontmatter へは書き込まない）。
  useEffect(() => {
    if (!settingsSyncReady) return;
    void patchSettingsJson({
      defaultNovelWritingMode: documentTypeWritingModeDefaults.novel,
      defaultArticleWritingMode: documentTypeWritingModeDefaults.article,
      defaultUnsetDocumentWritingMode: documentTypeWritingModeDefaults.unset,
    });
  }, [settingsSyncReady, documentTypeWritingModeDefaults]);

  // Sync effective policy to editor core on tab switch / frontmatter change
  useEffect(() => {
    coreRef.current?.setLineBreakPolicy(effectiveLineBreakPolicy);
  }, [coreRef, effectiveLineBreakPolicy]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-writing-mode",
      effectiveWritingMode,
    );
    // 書字方向が実際に変わった瞬間のみ Paragraph Plain を終了させる。
    // prevEffectiveWritingModeRef が null の間は初回 mount なので発火しない。
    // Source Mode (fullPlainEditActive) はここでは触らない。
    if (
      prevEffectiveWritingModeRef.current !== null &&
      prevEffectiveWritingModeRef.current !== effectiveWritingMode
    ) {
      coreRef.current?.setParagraphPlainMode(false);
      setParagraphPlainModeActive(false);
    }
    prevEffectiveWritingModeRef.current = effectiveWritingMode;
  }, [effectiveWritingMode, coreRef]);

  useEffect(() => {
    saveWritingMode(defaultWritingMode);
  }, [defaultWritingMode]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-font-size",
      `${displaySettings.fontSize}px`,
    );
    document.documentElement.style.setProperty(
      "--editor-line-height",
      `${displaySettings.lineHeight}`,
    );
    document.documentElement.style.setProperty(
      "--editor-content-padding-top",
      `${displaySettings.paddingTop}px`,
    );
    document.documentElement.style.setProperty(
      "--editor-content-padding-bottom",
      `${displaySettings.paddingBottom}px`,
    );
    document.documentElement.style.setProperty(
      "--editor-ruby-size",
      `${displaySettings.rubySize}em`,
    );
    document.documentElement.style.setProperty(
      "--editor-ruby-offset",
      `${displaySettings.rubyOffset}em`,
    );
    document.documentElement.style.setProperty(
      "--editor-heading-margin-after",
      `${displaySettings.headingMarginAfter}em`,
    );
    document.documentElement.style.setProperty(
      "--editor-heading-divider-h1",
      displaySettings.headingDividerLevels.h1 ? "1" : "0",
    );
    document.documentElement.style.setProperty(
      "--editor-heading-divider-h2",
      displaySettings.headingDividerLevels.h2 ? "1" : "0",
    );
    document.documentElement.style.setProperty(
      "--editor-heading-divider-h3",
      displaySettings.headingDividerLevels.h3 ? "1" : "0",
    );
    document.documentElement.style.setProperty(
      "--editor-heading-divider-h4",
      displaySettings.headingDividerLevels.h4 ? "1" : "0",
    );
    document.documentElement.style.setProperty(
      "--editor-heading-divider-h5",
      displaySettings.headingDividerLevels.h5 ? "1" : "0",
    );
    document.documentElement.style.setProperty(
      "--editor-heading-divider-h6",
      displaySettings.headingDividerLevels.h6 ? "1" : "0",
    );
    document.documentElement.style.setProperty(
      "--editor-heading-align-h",
      displaySettings.headingAlignHorizontal,
    );
    document.documentElement.style.setProperty(
      "--editor-heading-align-v",
      displaySettings.headingAlignVertical,
    );
    syncHeadingAlignDataset(
      document.documentElement,
      displaySettings.headingAlignHorizontal,
      displaySettings.headingAlignVertical,
    );
  }, [displaySettings]);

  useEffect(() => {
    saveToolbarVisible(toolbarVisible);
  }, [toolbarVisible]);

  useEffect(() => {
    saveToolbarOffset(toolbarOffset);
  }, [toolbarOffset]);

  useEffect(
    () => () => {
      if (editorInlineHintTimerRef.current !== null) {
        window.clearTimeout(editorInlineHintTimerRef.current);
        editorInlineHintTimerRef.current = null;
      }
      if (lineBreakPolicyNoticeTimerRef.current !== null) {
        window.clearTimeout(lineBreakPolicyNoticeTimerRef.current);
        lineBreakPolicyNoticeTimerRef.current = null;
      }
      if (commonmarkBadgeEmphasisTimerRef.current !== null) {
        window.clearTimeout(commonmarkBadgeEmphasisTimerRef.current);
        commonmarkBadgeEmphasisTimerRef.current = null;
      }
    },
    [],
  );

  const showEditorInlineHint = useCallback(
    (message: string, durationMs = 2600) => {
      if (editorInlineHintTimerRef.current !== null) {
        window.clearTimeout(editorInlineHintTimerRef.current);
        editorInlineHintTimerRef.current = null;
      }
      setEditorInlineHintMessage(message);
      editorInlineHintTimerRef.current = window.setTimeout(() => {
        setEditorInlineHintMessage(null);
        editorInlineHintTimerRef.current = null;
      }, durationMs);
    },
    [],
  );

  const showLineBreakPolicyNotice = useCallback(
    (message: string, isDirty: boolean, durationMs = 4200) => {
      if (lineBreakPolicyNoticeTimerRef.current !== null) {
        window.clearTimeout(lineBreakPolicyNoticeTimerRef.current);
        lineBreakPolicyNoticeTimerRef.current = null;
      }
      setLineBreakPolicyNoticeMessage(message);
      setLineBreakPolicyNoticeIsDirty(isDirty);
      lineBreakPolicyNoticeTimerRef.current = window.setTimeout(() => {
        setLineBreakPolicyNoticeMessage(null);
        setLineBreakPolicyNoticeIsDirty(false);
        lineBreakPolicyNoticeTimerRef.current = null;
      }, durationMs);
    },
    [],
  );

  const pulseCommonmarkBadge = useCallback((durationMs = 1200) => {
    if (commonmarkBadgeEmphasisTimerRef.current !== null) {
      window.clearTimeout(commonmarkBadgeEmphasisTimerRef.current);
      commonmarkBadgeEmphasisTimerRef.current = null;
    }
    setCommonmarkBadgeEmphasis(true);
    commonmarkBadgeEmphasisTimerRef.current = window.setTimeout(() => {
      setCommonmarkBadgeEmphasis(false);
      commonmarkBadgeEmphasisTimerRef.current = null;
    }, durationMs);
  }, []);

  const toggleToolbarVisible = useCallback(() => {
    setToolbarVisible((prev) => !prev);
  }, []);

  const resetToolbarOffset = useCallback(() => {
    setToolbarOffset(0);
  }, []);

  const patchActiveTab = useCallback((patch: ActiveTabPatch) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === activeTabIdRef.current ? { ...tab, ...patch } : tab,
      ),
    );
  }, []);

  const addTab = useCallback((tab: EditorTab) => {
    setTabs((prev) => [...prev, tab]);
  }, []);

  const removeTab = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
  }, []);

  const patchTab = useCallback((tabId: string, patch: ActiveTabPatch) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)),
    );
  }, []);

  const toggleWritingMode = useCallback(() => {
    const nextMode: WritingMode =
      effectiveWritingMode === "vertical-rl" ? "horizontal-tb" : "vertical-rl";
    patchActiveTab({
      writingMode: nextMode,
      writingModeFollowsTypeRecommendation: false,
    });
  }, [effectiveWritingMode, patchActiveTab]);

  const resetWritingModeToTypeRecommendation = useCallback(() => {
    if (!typeRecommendedWritingMode) return;
    patchActiveTab({ writingModeFollowsTypeRecommendation: true });
  }, [patchActiveTab, typeRecommendedWritingMode]);

  const setSuppressNextDirty = useCallback((value: boolean) => {
    suppressNextDirtyRef.current = value;
    if (!value) return;
    queueMicrotask(() => {
      suppressNextDirtyRef.current = false;
    });
  }, []);

  const closePlainEditModes = useCallback(() => {
    coreRef.current?.setParagraphPlainMode(false);
    setParagraphPlainModeActive(false);
    setFullPlainEditActive(false);
    setFullPlainEditError("");
  }, [coreRef]);

  const refreshHeadings = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;
    const snapshot = core.getHeadingSnapshot();
    setHeadings((prev) =>
      areHeadingListsEqual(prev, snapshot.headings) ? prev : snapshot.headings,
    );
    setActiveHeadingIndex((prev) =>
      prev === snapshot.activeHeadingIndex ? prev : snapshot.activeHeadingIndex,
    );
    setFoldedHeadingPositions((prev) =>
      arePositionSetsEqual(prev, snapshot.foldedHeadingPositions)
        ? prev
        : snapshot.foldedHeadingPositions,
    );
  }, [coreRef]);

  const markDirtyFalse = useCallback(
    (markdown: string) => {
      patchActiveTab({
        dirty: false,
        markdownSnapshot: markdown,
        cleanMarkdownSnapshot: markdown,
      });
    },
    [patchActiveTab],
  );

  const markDirtyFalseForTab = useCallback(
    (tabId: string, markdown: string) => {
      patchTab(tabId, {
        dirty: false,
        markdownSnapshot: markdown,
        cleanMarkdownSnapshot: markdown,
      });
    },
    [patchTab],
  );

  /** Re-evaluate dirty from core content. Used after discarding Full Plain edits. */
  const recalcDirtyFromCore = useCallback(() => {
    const currentMarkdown = coreRef.current?.peekMarkdown();
    if (currentMarkdown === undefined) return;
    setTabs((prev) => {
      const activeId = activeTabIdRef.current;
      const activeTab = prev.find((tab) => tab.id === activeId);
      const nextDirty = resolveDirtyState(activeTab, currentMarkdown);
      if (nextDirty === null) return prev;
      return prev.map((tab) =>
        tab.id === activeId ? { ...tab, dirty: nextDirty } : tab,
      );
    });
  }, [coreRef]);

  const applyLineBreakPolicyWithImmediateConversion = useCallback(
    (nextTabPolicy: LineBreakPolicy) => {
      const core = coreRef.current;
      if (!core) {
        patchActiveTab({ lineBreakPolicy: nextTabPolicy });
        return;
      }
      const beforeMarkdown = core.saveMarkdown();
      const dirtyBefore = activeTab.dirty;
      lineBreakPolicyApplyInProgressRef.current = true;
      try {
        patchActiveTab({ lineBreakPolicy: nextTabPolicy });

        // Compute effective: explicit frontmatter > type-derived > tab setting
        const currentEffective = effectiveLineBreakPolicy;
        const nextEffective = resolveEffectiveLineBreakPolicyForTab({
          frontmatterFields: activeTab.frontmatterFields,
          lineBreakPolicy: nextTabPolicy,
        });

        if (currentEffective !== nextEffective) {
          core.setLineBreakPolicy(nextEffective);
          core.applyLineBreakPolicyNow(nextEffective);
          const afterMarkdown = core.saveMarkdown();
          const changed = beforeMarkdown !== afterMarkdown;
          const dirtyAfter = dirtyBefore || changed;
          if (nextEffective === "commonmark-strict") {
            const comparison = buildMarkdownComparisonDebugInfo(
              beforeMarkdown,
              afterMarkdown,
            );
            console.info(
              "[Nyoze][lineBreakPolicy] commonmark-strict comparison",
              comparison,
            );
            showLineBreakPolicyNotice(
              formatDocumentTypeNoticeMessage(
                resolveDocumentType(activeTab.frontmatterFields),
                {
                  changed,
                  dirty: dirtyAfter,
                },
              ),
              dirtyAfter,
            );
            pulseCommonmarkBadge();
          } else {
            clearLineBreakPolicyNotice();
            setCommonmarkBadgeEmphasis(false);
          }
          patchActiveTab({ dirty: dirtyAfter });
        }
      } finally {
        lineBreakPolicyApplyInProgressRef.current = false;
      }
    },
    [
      coreRef,
      activeTab,
      effectiveLineBreakPolicy,
      patchActiveTab,
      showLineBreakPolicyNotice,
      pulseCommonmarkBadge,
      clearLineBreakPolicyNotice,
    ],
  );

  const setDisplayNumber = useCallback(
    (
      key: DisplaySettingsNumericKey,
      value: number,
      min: number,
      max: number,
    ) => {
      const nextValue = clampNumber(value, min, max);
      setDisplaySettings((prev) => {
        if (key === "autoTcyMinDigits" || key === "autoTcyMaxDigits") {
          const nextRange = resolveAutoTcyDigitRange({
            autoTcyMinDigits:
              key === "autoTcyMinDigits" ? Math.trunc(nextValue) : prev.autoTcyMinDigits,
            autoTcyMaxDigits:
              key === "autoTcyMaxDigits" ? Math.trunc(nextValue) : prev.autoTcyMaxDigits,
          });
          return {
            ...prev,
            autoTcyMinDigits: nextRange.minDigits,
            autoTcyMaxDigits: nextRange.maxDigits,
          };
        }
        return {
          ...prev,
          [key]: nextValue,
        };
      });
    },
    [],
  );

  const setAutoTcyEnabled = useCallback((enabled: boolean) => {
    setDisplaySettings((prev) => ({ ...prev, autoTcyEnabled: enabled }));
  }, []);

  const setAutoTcyNumbersOnly = useCallback((numbersOnly: boolean) => {
    setDisplaySettings((prev) => ({ ...prev, autoTcyNumbersOnly: numbersOnly }));
  }, []);

  const setHeadingDividerLevel = useCallback(
    (
      level: keyof DisplaySettings["headingDividerLevels"],
      enabled: boolean,
    ) => {
      setDisplaySettings((prev) => ({
        ...prev,
        headingDividerLevels: {
          ...prev.headingDividerLevels,
          [level]: enabled,
        },
      }));
    },
    [],
  );

  const setHeadingAlignHorizontal = useCallback((value: HeadingAlign) => {
    setDisplaySettings((prev) => ({ ...prev, headingAlignHorizontal: value }));
  }, []);

  const setHeadingAlignVertical = useCallback((value: HeadingAlign) => {
    setDisplaySettings((prev) => ({ ...prev, headingAlignVertical: value }));
  }, []);

  /**
   * Prepare the editor core to parse the next document with the target tab's
   * effective policy. Accepts an optional target-tab snapshot so the incoming
   * document's frontmatter-derived policy can be applied before React state is
   * committed.
   */
  const ensureSafeLineBreakPolicyBeforeDocumentLoad = useCallback(
    (options?: EnsureSafeLineBreakPolicyBeforeDocumentLoadOptions) => {
      setPendingLineBreakPolicy(null);

      const tabId =
        options?.targetTabSnapshot?.id ??
        options?.targetTabId ??
        activeTabIdRef.current;
      const targetTab =
        options?.targetTabSnapshot ?? tabs.find((t) => t.id === tabId);
      if (!targetTab) return false;

      const tabEffective = resolveEffectiveLineBreakPolicyForTab(targetTab);
      clearLineBreakPolicyNotice();
      setCommonmarkBadgeEmphasis(false);
      if (coreRef.current?.getLineBreakPolicy() === tabEffective) {
        return false;
      }
      coreRef.current?.setLineBreakPolicy(tabEffective);
      console.info(
        "[Nyoze][lineBreakPolicy] prepare before load",
        `target=${tabEffective}`,
      );
      return true;
    },
    [coreRef, tabs, clearLineBreakPolicyNotice],
  );

  const requestLineBreakPolicyChange = useCallback(
    (nextPolicy: LineBreakPolicy) => {
      if (isLineBreakPolicyLocked) {
        // Document-controlled: explicit frontmatter or type controls effective policy.
        // No conversion needed for this document.
        return;
      }

      if (nextPolicy === activeTab.lineBreakPolicy) return;

      if (nextPolicy === "commonmark-strict") {
        setPendingLineBreakPolicy(nextPolicy);
        return;
      }
      applyLineBreakPolicyWithImmediateConversion(nextPolicy);
    },
    [
      activeTab.lineBreakPolicy,
      isLineBreakPolicyLocked,
      applyLineBreakPolicyWithImmediateConversion,
    ],
  );

  const confirmLineBreakPolicyChange = useCallback(() => {
    if (pendingLineBreakPolicy) {
      applyLineBreakPolicyWithImmediateConversion(pendingLineBreakPolicy);
    }
    setPendingLineBreakPolicy(null);
  }, [applyLineBreakPolicyWithImmediateConversion, pendingLineBreakPolicy]);

  const cancelLineBreakPolicyChange = useCallback(() => {
    setPendingLineBreakPolicy(null);
  }, []);

  /** Change the new-tab default line break policy (from Display Settings). */
  const setDefaultLineBreakPolicy = useCallback(
    (nextPolicy: LineBreakPolicy) => {
      setLineBreakPolicy(nextPolicy);
    },
    [],
  );

  const setParagraphPlainBehavior = useCallback((next: ParagraphPlainBehavior) => {
    _setParagraphPlainBehavior(normalizeParagraphPlainBehavior(next));
  }, []);

  const handleFullPlainEditChange = useCallback(
    (value: string) => {
      if (fullPlainEditError) setFullPlainEditError("");
      setTabs((prev) => {
        const activeId = activeTabIdRef.current;
        const activeTab = prev.find((tab) => tab.id === activeId);
        const nextDirty = resolveDirtyState(activeTab, value);
        if (nextDirty === null) return prev;
        return prev.map((tab) =>
          tab.id === activeId ? { ...tab, dirty: nextDirty } : tab,
        );
      });
    },
    [fullPlainEditError],
  );

  const onCoreLog = useCallback(
    (entry: LogEntry) => {
      // Skip high-frequency IME events from React state to avoid unnecessary re-renders.
      // compositionupdate and input fire on every keystroke during IME composition.
      const isHighFrequencyEvent =
        entry.event === "compositionupdate" || entry.event === "input";
      if (!isHighFrequencyEvent) {
        setLogs((prev) => [entry, ...prev].slice(0, MAX_LOGS));
      }
      if (
        entry.event === "lineBreakGuard" &&
        entry.detail === "blocked Shift+Enter in regular paragraph/heading"
      ) {
        showEditorInlineHint(
          "現在の文書タイプでは通常段落の Shift+Enter は無効です",
          1600,
        );
      }
      if (IS_DEV && !isHighFrequencyEvent) {
        console.info(`[core:${entry.event}]`, entry.detail);
      }
    },
    [showEditorInlineHint],
  );

  const onCoreSelectionUpdate = useCallback(() => {
    const core = coreRef.current;
    if (core) setActiveHeadingIndex(core.getActiveHeadingIndex());
  }, [coreRef]);

  const onCoreParagraphPlainModeChange = useCallback((active: boolean) => {
    setParagraphPlainModeActive(active);
  }, []);

  const onCoreLineBreakPolicyChange = useCallback(() => {
    // This is fired when the core changes it internally, but the source of truth is UI state.
    // If the core reports a change, it might just be confirming our prop. We can ignore it
    // or only sync it back if we want two-way. But we are one-way (React -> PM).
    // The previous implementation synced it back, but that overrides the global state when we just want to override effective.
  }, []);

  const onCoreUpdateLight = useCallback(() => {
    if (lineBreakPolicyApplyInProgressRef.current) {
      return;
    }
    if (suppressNextDirtyRef.current) {
      suppressNextDirtyRef.current = false;
      return;
    }
    setTabs((prev) => {
      const activeId = activeTabIdRef.current;
      const activeTab = prev.find((tab) => tab.id === activeId);
      // Light sync runs only while IME composition is active.  Avoid full
      // markdown serialization here and mark the doc dirty optimistically.
      // Full sync on compositionend recomputes the exact dirty state.
      const nextDirty = resolveDirtyStateFromDocChangeSignal(activeTab);
      if (nextDirty === null) return prev;
      return prev.map((tab) =>
        tab.id === activeId ? { ...tab, dirty: nextDirty } : tab,
      );
    });
  }, []);

  const onCoreUpdate = useCallback((currentMarkdownOverride?: string) => {
    if (lineBreakPolicyApplyInProgressRef.current) {
      refreshHeadings();
      return;
    }
    if (suppressNextDirtyRef.current) {
      suppressNextDirtyRef.current = false;
      refreshHeadings();
      return;
    }
    const currentMarkdown =
      currentMarkdownOverride ?? coreRef.current?.peekMarkdown();
    if (currentMarkdown === undefined) {
      refreshHeadings();
      return;
    }
    setTabs((prev) => {
      const activeId = activeTabIdRef.current;
      const activeTab = prev.find((tab) => tab.id === activeId);
      const nextDirty = resolveDirtyState(activeTab, currentMarkdown);
      if (nextDirty === null) return prev;
      return prev.map((tab) =>
        tab.id === activeId ? { ...tab, dirty: nextDirty } : tab,
      );
    });
    refreshHeadings();
  }, [coreRef, refreshHeadings]);

  const onCoreFoldChange = useCallback(() => {
    refreshHeadings();
  }, [refreshHeadings]);

  const onCoreReady = useCallback((core: EditorCoreHandle) => {
    setParagraphPlainModeActive(core.isParagraphPlainModeActive());
    const snapshot = core.getHeadingSnapshot();
    setHeadings(snapshot.headings);
    setActiveHeadingIndex(snapshot.activeHeadingIndex);
    setFoldedHeadingPositions(snapshot.foldedHeadingPositions);
  }, []);

  // Phase5-H Slice1: theme studio API

  const clearUiPresetInlineOverrides = useCallback(() => {
    for (const key of UI_THEME_TOKEN_KEYS) {
      document.documentElement.style.removeProperty(key);
    }
  }, []);

  const detachActiveUiPreset = useCallback(() => {
    if (!activeUiThemePresetId) return;
    clearUiPresetInlineOverrides();
    _setActiveUiThemePresetId(null);
    if (settingsSyncReady) {
      void patchSettingsJson({ activeUiThemePresetId: null });
    }
  }, [activeUiThemePresetId, clearUiPresetInlineOverrides, settingsSyncReady]);

  const detachActiveDocPreset = useCallback(() => {
    if (!activeDocThemePresetId) return;
    _setActiveDocThemePresetId(null);
    if (settingsSyncReady) {
      void patchSettingsJson({ activeDocThemePresetId: null });
    }
  }, [activeDocThemePresetId, settingsSyncReady]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      if (
        nextUiActivePresetIdForChange(activeUiThemePresetId, "theme") === null
      ) {
        detachActiveUiPreset();
      }
      _setTheme(nextTheme);
    },
    [activeUiThemePresetId, detachActiveUiPreset],
  );

  // BETA-T1: font is independent of presets — no detach on font change.
  const setUiFont = useCallback((nextFont: UiFont) => {
    _setUiFont(nextFont);
  }, []);

  const setUiTextPrimary = useCallback(
    (value: string | null) => {
      if (
        nextUiActivePresetIdForChange(activeUiThemePresetId, "textPrimary") ===
        null
      ) {
        detachActiveUiPreset();
      }
      _setUiTextPrimary(value);
    },
    [activeUiThemePresetId, detachActiveUiPreset],
  );

  // BETA-T1: font scale is independent of presets — no detach on scale change.
  const setUiFontScale = useCallback((value: number) => {
    _setUiFontScale(value);
  }, []);

  const setToolbarIconColor = useCallback((value: string | null) => {
    _setToolbarIconColor(normalizeUiTextPrimary(value));
  }, []);

  const setToolbarIconStroke = useCallback((value: number) => {
    _setToolbarIconStroke(
      clampNumber(value, MIN_TOOLBAR_ICON_STROKE, MAX_TOOLBAR_ICON_STROKE),
    );
  }, []);

  const setToolbarScale = useCallback((value: number) => {
    _setToolbarScale(clampNumber(value, MIN_TOOLBAR_SCALE, MAX_TOOLBAR_SCALE));
  }, []);

  const setAppTitleVisible = useCallback((value: boolean) => {
    _setAppTitleVisible(value);
  }, []);

  const setAppTitlePreset = useCallback((value: AppTitlePreset) => {
    _setAppTitlePreset(value);
  }, []);

  const setAppTitleCustom = useCallback((value: string) => {
    _setAppTitleCustom(normalizeAppTitleCustom(value));
  }, []);

  const setAppTitleColor = useCallback((value: string | null) => {
    _setAppTitleColor(normalizeUiTextPrimary(value));
  }, []);

  const setAppTitleFont = useCallback((value: AppTitleFont) => {
    const normalized = normalizeAppTitleFont(value);
    if (!normalized) return;
    _setAppTitleFont(normalized);
  }, []);

  const setDocumentTheme = useCallback(
    (value: DocumentTheme) => {
      if (
        nextDocActivePresetIdForChange(
          activeDocThemePresetId,
          "documentTheme",
        ) === null
      ) {
        detachActiveDocPreset();
      }
      _setDocumentTheme(value);
    },
    [activeDocThemePresetId, detachActiveDocPreset],
  );

  // BETA-DISP1: caret color setters
  const setCaretColorMode = useCallback(
    (value: CaretColorMode) => {
      const mode = normalizeCaretColorMode(value);
      _setCaretColorMode(mode);
      // custom に切り替えたとき caretColorCustom が null なら、現在の auto 実効色で埋める
      if (mode === "custom") {
        _setCaretColorCustom((prev) => {
          if (prev !== null) return prev;
          return resolveCaretColor("auto", null, docColorSettings.pageColor);
        });
      }
    },
    [docColorSettings.pageColor],
  );

  const setCaretColorCustom = useCallback((value: string | null) => {
    _setCaretColorCustom(normalizeCaretColorCustom(value));
  }, []);

  const setUseEditorArrowPointer = useCallback((value: boolean) => {
    _setUseEditorArrowPointer(value === true);
  }, []);

  const setTypewriterModeEnabled = useCallback((value: boolean) => {
    _setTypewriterModeEnabled(value === true);
  }, []);

  const setTypewriterOffsetRatio = useCallback((value: number) => {
    _setTypewriterOffsetRatio(normalizeTypewriterOffsetRatio(value));
  }, []);

  const setTypewriterFollowBandRatio = useCallback((value: number) => {
    _setTypewriterFollowBandRatio(normalizeTypewriterFollowBandRatio(value));
  }, []);

  const setVisualFocusBlockHighlightEnabled = useCallback((value: boolean) => {
    _setVisualFocusBlockHighlightEnabled(
      normalizeVisualFocusBlockHighlightEnabled(value),
    );
  }, []);

  const setVisualFocusDimNonFocusedBlocksEnabled = useCallback((value: boolean) => {
    _setVisualFocusDimNonFocusedBlocksEnabled(
      normalizeVisualFocusDimNonFocusedBlocksEnabled(value),
    );
  }, []);

  const setVisualFocusBlockHighlightColor = useCallback((value: string) => {
    _setVisualFocusBlockHighlightColor(normalizeVisualFocusBlockHighlightColor(value));
  }, []);

  const setVisualFocusBlockHighlightOpacity = useCallback((value: number) => {
    _setVisualFocusBlockHighlightOpacity(normalizeVisualFocusBlockHighlightOpacity(value));
  }, []);

  const setVisualFocusDimNonFocusedBlocksOpacity = useCallback((value: number) => {
    _setVisualFocusDimNonFocusedBlocksOpacity(
      normalizeVisualFocusDimNonFocusedBlocksOpacity(value),
    );
  }, []);

  const setVisualFocusCurrentLineHighlightEnabled = useCallback((value: boolean) => {
    _setVisualFocusCurrentLineHighlightEnabled(
      normalizeVisualFocusCurrentLineHighlightEnabled(value),
    );
  }, []);

  const setVisualFocusCurrentLineHighlightColor = useCallback((value: string) => {
    _setVisualFocusCurrentLineHighlightColor(normalizeVisualFocusCurrentLineHighlightColor(value));
  }, []);

  const setVisualFocusCurrentLineHighlightOpacity = useCallback((value: number) => {
    _setVisualFocusCurrentLineHighlightOpacity(
      normalizeVisualFocusCurrentLineHighlightOpacity(value),
    );
  }, []);

  const setPseudoCaretEnabled = useCallback((value: boolean) => {
    _setPseudoCaretEnabled(normalizePseudoCaretEnabled(value));
  }, []);

  const setPseudoCaretThickness = useCallback((value: number) => {
    _setPseudoCaretThickness(normalizePseudoCaretThickness(value));
  }, []);

  const setPseudoCaretBlinkEnabled = useCallback((value: boolean) => {
    _setPseudoCaretBlinkEnabled(normalizePseudoCaretBlinkEnabled(value));
  }, []);

  const setNoteAnchorNoticeConfirmed = useCallback((value: boolean) => {
    _setNoteAnchorNoticeConfirmed(normalizeNoteAnchorNoticeConfirmed(value));
  }, []);

  // BETA-T1: doc font is independent of presets — no detach on font change.
  const setDocFontPreset = useCallback((value: DocumentFontPreset) => {
    _setDocFontPreset(value);
  }, []);

  // BETA-T1: heading font is independent of presets — no detach on font change.
  const setDocHeadingFont = useCallback((value: DocumentHeadingFont) => {
    _setDocHeadingFont(value);
  }, []);

  const setDocColorSettings = useCallback(
    (value: DocumentColorSettings) => {
      if (
        nextDocActivePresetIdForChange(activeDocThemePresetId, "docColors") ===
        null
      ) {
        detachActiveDocPreset();
      }
      _setDocColorSettings(value);
    },
    [activeDocThemePresetId, detachActiveDocPreset],
  );

  /**
   * Update document colors without detaching active doc preset.
   * Used by linked/system synchronization paths.
   */
  const syncDocColorSettings = useCallback((value: DocumentColorSettings) => {
    _setDocColorSettings((prev) =>
      isSameDocumentColors(prev, value) ? prev : { ...value },
    );
  }, []);

  const setSelectedFont = useCallback(
    (value: string | null) => {
      if (value === null) {
        _setSelectedFont(null);
        return;
      }
      detachActiveDocPreset();
      _setDocFontPreset(`custom:${value}`);
      _setSelectedFont(null);
    },
    [detachActiveDocPreset],
  );

  const previewUiThemeDraft = useCallback((draft: UiThemePreset) => {
    _setTheme((prev) => (prev === draft.baseTheme ? prev : draft.baseTheme));
    const themeDefaultText = UI_THEME_MAIN_COLORS[draft.baseTheme].textPrimary;
    _setUiTextPrimary((prev) => {
      // Keep "theme default" semantics when the current value is inherited.
      if (prev === null && draft.colors.textPrimary === themeDefaultText)
        return prev;
      return prev === draft.colors.textPrimary
        ? prev
        : draft.colors.textPrimary;
    });
    const tokens = deriveUiThemeTokens(draft.colors);
    for (const [key, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(key, value);
    }
  }, []);

  const previewDocThemeDraft = useCallback((draft: DocThemePreset) => {
    _setDocumentTheme((prev) =>
      prev === draft.baseDocTheme ? prev : draft.baseDocTheme,
    );
    _setDocColorSettings((prev) =>
      isSameDocumentColors(prev, draft.colors) ? prev : { ...draft.colors },
    );
  }, []);

  /**
   * Activate a UI preset immediately: sets individual state vars and applies
   * derived CSS token overrides so the preset palette takes effect at once.
   */
  const setActiveUiThemePresetId = useCallback(
    (id: string) => {
      const preset = uiThemePresets.find((p) => p.id === id);
      if (!preset) return;
      _setActiveUiThemePresetId(id);
      _setTheme(preset.baseTheme);
      _setUiTextPrimary(preset.colors.textPrimary);
      const tokens = deriveUiThemeTokens(preset.colors);
      for (const [key, value] of Object.entries(tokens)) {
        document.documentElement.style.setProperty(key, value);
      }
      void patchSettingsJson({ activeUiThemePresetId: id });
    },
    [uiThemePresets],
  );

  /**
   * Activate a doc preset immediately: sets individual state vars which flow
   * to Workspace.tsx via props (inline styles on .editor-panel).
   */
  const setActiveDocThemePresetId = useCallback(
    (id: string) => {
      const preset = docThemePresets.find((p) => p.id === id);
      if (!preset) return;
      _setActiveDocThemePresetId(id);
      _setDocumentTheme(preset.baseDocTheme);
      _setDocColorSettings(preset.colors);
      void patchSettingsJson({ activeDocThemePresetId: id });
    },
    [docThemePresets],
  );

  /** Save as new custom UI preset (existing presets are immutable). */
  const saveUiThemePreset = useCallback(
    (updated: UiThemePreset) => {
      const fallback = `カスタムUIテーマ ${uiThemePresets.length + 1}`;
      const baseName = normalizePresetName(updated.name, fallback);
      const uniqueName = ensureUniqueName(
        baseName,
        uiThemePresets.map((p) => p.name),
      );
      const newPreset: UiThemePreset = {
        ...updated,
        id: generatePresetId("ui"),
        name: uniqueName,
        kind: "custom",
        createdAt: new Date().toISOString(),
      };
      const next = [...uiThemePresets, newPreset];
      setUiThemePresets(next);
      _setActiveUiThemePresetId(newPreset.id);
      _setTheme(newPreset.baseTheme);
      _setUiTextPrimary(newPreset.colors.textPrimary);
      const tokens = deriveUiThemeTokens(newPreset.colors);
      for (const [key, value] of Object.entries(tokens)) {
        document.documentElement.style.setProperty(key, value);
      }
      void patchSettingsJson({
        uiThemePresets: next,
        activeUiThemePresetId: newPreset.id,
      });
    },
    [uiThemePresets],
  );

  /** Save as new custom doc preset (existing presets are immutable). */
  const saveDocThemePreset = useCallback(
    (updated: DocThemePreset) => {
      const fallback = `カスタム文書テーマ ${docThemePresets.length + 1}`;
      const baseName = normalizePresetName(updated.name, fallback);
      const uniqueName = ensureUniqueName(
        baseName,
        docThemePresets.map((p) => p.name),
      );
      const newPreset: DocThemePreset = {
        ...updated,
        id: generatePresetId("doc"),
        name: uniqueName,
        kind: "custom",
        createdAt: new Date().toISOString(),
      };
      const next = [...docThemePresets, newPreset];
      setDocThemePresets(next);
      _setActiveDocThemePresetId(newPreset.id);
      _setDocumentTheme(newPreset.baseDocTheme);
      _setDocColorSettings(newPreset.colors);
      void patchSettingsJson({
        docThemePresets: next,
        activeDocThemePresetId: newPreset.id,
      });
    },
    [docThemePresets],
  );

  /** Overwrite an existing custom UI preset in-place. */
  const overwriteUiThemePreset = useCallback(
    (id: string, updated: UiThemePreset) => {
      const target = uiThemePresets.find((p) => p.id === id);
      if (!target || isUiPresetSystem(target)) return;
      const nextPreset: UiThemePreset = {
        ...target,
        baseTheme: updated.baseTheme,
        colors: { ...updated.colors },
      };
      const next = uiThemePresets.map((preset) =>
        preset.id === id ? nextPreset : preset,
      );
      setUiThemePresets(next);
      _setActiveUiThemePresetId(id);
      _setTheme(nextPreset.baseTheme);
      _setUiTextPrimary(nextPreset.colors.textPrimary);
      const tokens = deriveUiThemeTokens(nextPreset.colors);
      for (const [key, value] of Object.entries(tokens)) {
        document.documentElement.style.setProperty(key, value);
      }
      void patchSettingsJson({
        uiThemePresets: next,
        activeUiThemePresetId: id,
      });
    },
    [uiThemePresets],
  );

  /** Overwrite an existing custom document preset in-place. */
  const overwriteDocThemePreset = useCallback(
    (id: string, updated: DocThemePreset) => {
      const target = docThemePresets.find((p) => p.id === id);
      if (!target || isDocPresetSystem(target)) return;
      const nextPreset: DocThemePreset = {
        ...target,
        baseDocTheme: updated.baseDocTheme,
        colors: { ...updated.colors },
      };
      const next = docThemePresets.map((preset) =>
        preset.id === id ? nextPreset : preset,
      );
      setDocThemePresets(next);
      _setActiveDocThemePresetId(id);
      _setDocumentTheme(nextPreset.baseDocTheme);
      _setDocColorSettings(nextPreset.colors);
      void patchSettingsJson({
        docThemePresets: next,
        activeDocThemePresetId: id,
      });
    },
    [docThemePresets],
  );

  const renameUiThemePreset = useCallback(
    (id: string, nextNameRaw: string) => {
      const target = uiThemePresets.find((p) => p.id === id);
      if (!target || isUiPresetSystem(target)) return;
      const baseName = normalizePresetName(nextNameRaw, target.name);
      const uniqueName = ensureUniqueName(
        baseName,
        uiThemePresets.map((p) => p.name),
        target.name,
      );
      const next = uiThemePresets.map((p) =>
        p.id === id ? { ...p, name: uniqueName } : p,
      );
      setUiThemePresets(next);
      void patchSettingsJson({ uiThemePresets: next });
    },
    [uiThemePresets],
  );

  const renameDocThemePreset = useCallback(
    (id: string, nextNameRaw: string) => {
      const target = docThemePresets.find((p) => p.id === id);
      if (!target || isDocPresetSystem(target)) return;
      const baseName = normalizePresetName(nextNameRaw, target.name);
      const uniqueName = ensureUniqueName(
        baseName,
        docThemePresets.map((p) => p.name),
        target.name,
      );
      const next = docThemePresets.map((p) =>
        p.id === id ? { ...p, name: uniqueName } : p,
      );
      setDocThemePresets(next);
      void patchSettingsJson({ docThemePresets: next });
    },
    [docThemePresets],
  );

  const duplicateUiThemePreset = useCallback(
    (id: string) => {
      const source = uiThemePresets.find((p) => p.id === id);
      if (!source) return;
      const duplicatedName = ensureUniqueName(
        `${source.name} コピー`,
        uiThemePresets.map((p) => p.name),
      );
      const clone: UiThemePreset = {
        ...source,
        id: generatePresetId("ui"),
        name: duplicatedName,
        kind: "custom",
        createdAt: new Date().toISOString(),
      };
      const next = [...uiThemePresets, clone];
      setUiThemePresets(next);
      _setActiveUiThemePresetId(clone.id);
      _setTheme(clone.baseTheme);
      _setUiTextPrimary(clone.colors.textPrimary);
      const tokens = deriveUiThemeTokens(clone.colors);
      for (const [key, value] of Object.entries(tokens)) {
        document.documentElement.style.setProperty(key, value);
      }
      void patchSettingsJson({
        uiThemePresets: next,
        activeUiThemePresetId: clone.id,
      });
    },
    [uiThemePresets],
  );

  const duplicateDocThemePreset = useCallback(
    (id: string) => {
      const source = docThemePresets.find((p) => p.id === id);
      if (!source) return;
      const duplicatedName = ensureUniqueName(
        `${source.name} コピー`,
        docThemePresets.map((p) => p.name),
      );
      const clone: DocThemePreset = {
        ...source,
        id: generatePresetId("doc"),
        name: duplicatedName,
        kind: "custom",
        createdAt: new Date().toISOString(),
      };
      const next = [...docThemePresets, clone];
      setDocThemePresets(next);
      _setActiveDocThemePresetId(clone.id);
      _setDocumentTheme(clone.baseDocTheme);
      _setDocColorSettings(clone.colors);
      void patchSettingsJson({
        docThemePresets: next,
        activeDocThemePresetId: clone.id,
      });
    },
    [docThemePresets],
  );

  const deleteUiThemePreset = useCallback(
    (id: string) => {
      const target = uiThemePresets.find((p) => p.id === id);
      if (!target || isUiPresetSystem(target)) return;
      const next = uiThemePresets.filter((p) => p.id !== id);
      const fallback = next.find(isUiPresetSystem) ?? next[0] ?? null;
      const nextActiveId =
        activeUiThemePresetId === id
          ? (fallback?.id ?? null)
          : activeUiThemePresetId;
      setUiThemePresets(next);
      _setActiveUiThemePresetId(nextActiveId ?? null);
      if (nextActiveId) {
        const fallbackPreset = next.find((p) => p.id === nextActiveId);
        if (fallbackPreset) {
          _setTheme(fallbackPreset.baseTheme);
          _setUiTextPrimary(fallbackPreset.colors.textPrimary);
          const tokens = deriveUiThemeTokens(fallbackPreset.colors);
          for (const [key, value] of Object.entries(tokens)) {
            document.documentElement.style.setProperty(key, value);
          }
        }
      } else {
        clearUiPresetInlineOverrides();
      }
      void patchSettingsJson({
        uiThemePresets: next,
        activeUiThemePresetId: nextActiveId ?? null,
      });
    },
    [uiThemePresets, activeUiThemePresetId, clearUiPresetInlineOverrides],
  );

  const deleteDocThemePreset = useCallback(
    (id: string) => {
      const target = docThemePresets.find((p) => p.id === id);
      if (!target || isDocPresetSystem(target)) return;
      const next = docThemePresets.filter((p) => p.id !== id);
      const fallback = next.find(isDocPresetSystem) ?? next[0] ?? null;
      const nextActiveId =
        activeDocThemePresetId === id
          ? (fallback?.id ?? null)
          : activeDocThemePresetId;
      setDocThemePresets(next);
      _setActiveDocThemePresetId(nextActiveId ?? null);
      if (nextActiveId) {
        const fallbackPreset = next.find((p) => p.id === nextActiveId);
        if (fallbackPreset) {
          _setDocumentTheme(fallbackPreset.baseDocTheme);
          _setDocColorSettings(fallbackPreset.colors);
        }
      }
      void patchSettingsJson({
        docThemePresets: next,
        activeDocThemePresetId: nextActiveId ?? null,
      });
    },
    [docThemePresets, activeDocThemePresetId],
  );

  const appTitleText =
    appTitlePreset === "custom"
      ? appTitleCustom
      : APP_TITLE_PRESET_TEXTS[appTitlePreset];

  return {
    platform,
    usesNativeWindowControls,
    initialLineBreakPolicy: initialLineBreakPolicy.current,
    activeTab,
    logs,
    editorInlineHintMessage,
    lineBreakPolicyNoticeMessage,
    lineBreakPolicyNoticeIsDirty,
    commonmarkBadgeEmphasis,
    imeProfilerEnabled,
    imeProfilerShowHud,
    imeProfilerLogSummary,
    imePhaseAEnabled,
    imePhaseAMinSyncIntervalMs,
    imePhaseBRubySuspendEnabled,
    imeProfilerSaveJson,
    imeProfilerBenchmarkDocumentId,
    imeProfilerBenchmarkInputChars,
    rubyVisible,
    setRubyVisible,
    frontmatterVisible,
    setFrontmatterVisible,
    frontmatterShowAuthors,
    setFrontmatterShowAuthors,
    frontmatterShowTranslators,
    setFrontmatterShowTranslators,
    frontmatterShowRoleLabels,
    setFrontmatterShowRoleLabels,
    frontmatterShowInProjectFiles,
    setFrontmatterShowInProjectFiles,
    frontmatterProjectShowTitle,
    setFrontmatterProjectShowTitle,
    frontmatterProjectShowAuthors,
    setFrontmatterProjectShowAuthors,
    displaySettingsOpen,
    displaySettingsExpandSectionKey,
    setDisplaySettingsExpandSectionKey,
    setDisplaySettingsOpen,
    displaySettings,
    setDisplaySettings,
    lineBreakPolicy: activeTab.lineBreakPolicy,
    defaultLineBreakPolicy: lineBreakPolicy,
    setDefaultLineBreakPolicy,
    effectiveLineBreakPolicy,
    lineBreakPolicyLockReason,
    isLineBreakPolicyLocked,
    isLineBreakPolicyOverridden,
    pendingLineBreakPolicy,
    writingMode: effectiveWritingMode,
    tabWritingMode: activeTab.writingMode,
    writingModeFollowsTypeRecommendation:
      activeTab.writingModeFollowsTypeRecommendation,
    typeRecommendedWritingMode,
    documentWritingMode: frontmatterWritingModeResolution.writingMode,
    documentWritingModeUnsupported: frontmatterWritingModeResolution.unsupported,
    defaultWritingMode,
    documentTypeWritingModeDefaults,
    setDocumentTypeWritingModeDefaults,
    toggleWritingMode,
    resetWritingModeToTypeRecommendation,
    fullPlainEditActive,
    setFullPlainEditActive,
    fullPlainEditValue,
    setFullPlainEditValue,
    fullPlainEditError,
    setFullPlainEditError,
    handleFullPlainEditChange,
    paragraphPlainModeActive,
    setParagraphPlainModeActive,
    tabs,
    setTabs,
    addTab,
    removeTab,
    patchTab,
    patchActiveTab,
    markDirtyFalse,
    markDirtyFalseForTab,
    recalcDirtyFromCore,
    setSuppressNextDirty,
    activeTabId,
    setActiveTabId,
    rightPaneTab,
    setRightPaneTab,
    headings,
    setHeadings,
    activeHeadingIndex,
    setActiveHeadingIndex,
    foldedHeadingPositions,
    setFoldedHeadingPositions,
    theme,
    setTheme,
    uiFont,
    setUiFont,
    uiLanguageMode,
    setUiLanguageMode,
    uiTextPrimary,
    setUiTextPrimary,
    uiFontScale,
    setUiFontScale,
    toolbarIconColor,
    setToolbarIconColor,
    toolbarIconStroke,
    setToolbarIconStroke,
    toolbarScale,
    setToolbarScale,
    appTitleVisible,
    setAppTitleVisible,
    appTitlePreset,
    setAppTitlePreset,
    appTitleCustom,
    setAppTitleCustom,
    appTitleColor,
    setAppTitleColor,
    appTitleFont,
    setAppTitleFont,
    appTitleText,
    documentTheme,
    setDocumentTheme,
    docFontPreset,
    setDocFontPreset,
    docHeadingFont,
    setDocHeadingFont,
    docColorSettings,
    setDocColorSettings,
    syncDocColorSettings,
    caretColorMode,
    setCaretColorMode,
    caretColorCustom,
    setCaretColorCustom,
    useEditorArrowPointer,
    setUseEditorArrowPointer,
    paragraphPlainBehavior,
    setParagraphPlainBehavior,
    typewriterModeEnabled,
    setTypewriterModeEnabled,
    typewriterOffsetRatio,
    setTypewriterOffsetRatio,
    typewriterFollowBandRatio,
    setTypewriterFollowBandRatio,
    visualFocusBlockHighlightEnabled,
    setVisualFocusBlockHighlightEnabled,
    visualFocusDimNonFocusedBlocksEnabled,
    setVisualFocusDimNonFocusedBlocksEnabled,
    visualFocusBlockHighlightColor,
    setVisualFocusBlockHighlightColor,
    visualFocusBlockHighlightOpacity,
    setVisualFocusBlockHighlightOpacity,
    visualFocusDimNonFocusedBlocksOpacity,
    setVisualFocusDimNonFocusedBlocksOpacity,
    visualFocusCurrentLineHighlightEnabled,
    setVisualFocusCurrentLineHighlightEnabled,
    visualFocusCurrentLineHighlightColor,
    setVisualFocusCurrentLineHighlightColor,
    visualFocusCurrentLineHighlightOpacity,
    setVisualFocusCurrentLineHighlightOpacity,
    macosArrowScrollClampEnabled,
    pseudoCaretEnabled,
    setPseudoCaretEnabled,
    pseudoCaretThickness,
    setPseudoCaretThickness,
    pseudoCaretBlinkEnabled,
    setPseudoCaretBlinkEnabled,
    noteAnchorNoticeConfirmed,
    setNoteAnchorNoticeConfirmed,
    registeredFonts,
    setRegisteredFonts,
    selectedFont,
    setSelectedFont,
    toolbarVisible,
    toggleToolbarVisible,
    toolbarOffset,
    setToolbarOffset,
    resetToolbarOffset,
    closePlainEditModes,
    showEditorInlineHint,
    refreshHeadings,
    setDisplayNumber,
    setAutoTcyEnabled,
    setAutoTcyNumbersOnly,
    setHeadingDividerLevel,
    setHeadingAlignHorizontal,
    setHeadingAlignVertical,
    showLineBreakPolicyNotice,
    pulseCommonmarkBadge,
    clearLineBreakPolicyNotice,
    ensureSafeLineBreakPolicyBeforeDocumentLoad,
    requestLineBreakPolicyChange,
    confirmLineBreakPolicyChange,
    cancelLineBreakPolicyChange,
    onCoreLog,
    onCoreSelectionUpdate,
    onCoreParagraphPlainModeChange,
    onCoreLineBreakPolicyChange,
    onCoreUpdateLight,
    onCoreUpdate,
    onCoreFoldChange,
    onCoreReady,
    // Phase5-H Slice1: theme studio
    uiThemePresets,
    activeUiThemePresetId,
    docThemePresets,
    activeDocThemePresetId,
    setActiveUiThemePresetId,
    setActiveDocThemePresetId,
    detachActiveDocThemePreset: detachActiveDocPreset,
    saveUiThemePreset,
    saveDocThemePreset,
    overwriteUiThemePreset,
    overwriteDocThemePreset,
    previewUiThemeDraft,
    previewDocThemeDraft,
    renameUiThemePreset,
    renameDocThemePreset,
    duplicateUiThemePreset,
    duplicateDocThemePreset,
    deleteUiThemePreset,
    deleteDocThemePreset,
  };
}

export { DEFAULT_DISPLAY_SETTINGS };
