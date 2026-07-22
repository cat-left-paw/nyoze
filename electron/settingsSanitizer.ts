/**
 * SEC-6: Main-side settings sanitizer.
 *
 * Validates and normalizes a settings.json object field-by-field.
 * Invalid or out-of-range values are replaced with safe defaults.
 * Unknown keys are stripped to prevent schema drift.
 *
 * This module runs in the main process (Node) and has no renderer deps.
 */
import { resolveAutoTcyDigitRange } from "../src/editor-core/features/autoTcy";
import { normalizeParagraphPlainBehavior } from "../src/settings/paragraphPlainBehavior";
import {
  normalizeTypewriterFollowBandRatio,
  normalizeTypewriterModeEnabled,
  normalizeTypewriterOffsetRatio,
} from "../src/settings/typewriterModeSettings";
import {
  normalizeVisualFocusBlockHighlightEnabled,
  normalizeVisualFocusCurrentLineHighlightEnabled,
  normalizeVisualFocusDimNonFocusedBlocksEnabled,
} from "../src/settings/visualFocusSettings";
import {
  normalizeVisualFocusBlockHighlightColor,
  normalizeVisualFocusBlockHighlightOpacity,
  normalizeVisualFocusCurrentLineHighlightColor,
  normalizeVisualFocusCurrentLineHighlightOpacity,
  normalizeVisualFocusDimNonFocusedBlocksOpacity,
} from "../src/settings/visualFocusAppearance";
import { normalizeUiLanguageMode } from "../src/settings/uiLanguageMode";
import {
  normalizePseudoCaretBlinkEnabled,
  normalizePseudoCaretThickness,
} from "../src/settings/pseudoCaretSettings";
import {
  normalizePageViewerBreakBeforeHeading,
  normalizePageViewerBreakBeforeHeadingMaxLevel,
} from "../src/settings/pageViewerHeadingPaginationSettings";
import {
  normalizePageViewerReadingFooterAlign,
  normalizePageViewerReadingFooterEnabled,
  normalizePageViewerReadingHeaderAlign,
  normalizePageViewerReadingHeaderContent,
  normalizePageViewerReadingHeaderEnabled,
  normalizePageViewerReadingMarginBottom,
  normalizePageViewerReadingMarginInline,
  normalizePageViewerReadingMarginTop,
  normalizePageViewerReadingPaperFrame,
  normalizePageViewerReadingSimpleCoverEnabled,
  normalizePageViewerReadingSimpleCoverLayout,
  normalizePageViewerReadingSimpleCoverWritingMode,
} from "../src/settings/pageViewerReadingSurfaceSettings";
import { isWritingMode } from "../src/settings/writingModeDefaults";
import { normalizeExternalExportOptionsDefaults } from "../src/settings/externalExportOptionsDefaults";

// ---- Constants ----

/** Max file size for settings.json on disk (512 KB). */
export const MAX_SETTINGS_FILE_SIZE = 512 * 1024;

/** Max number of theme presets per category. */
const MAX_PRESET_COUNT = 50;

/** Max length for a string-type custom font value (after "custom:" prefix). */
const MAX_CUSTOM_FONT_LENGTH = 200;

/** Max number of registered fonts. */
const MAX_REGISTERED_FONTS = 200;

/** Max length for appTitleCustom. */
const MAX_APP_TITLE_CUSTOM_LENGTH = 40;

/** Max length for preset name. */
const MAX_PRESET_NAME_LENGTH = 100;

/** Max length for preset id. */
const MAX_PRESET_ID_LENGTH = 100;

/** Max length for benchmarkDocumentId. */
const MAX_BENCHMARK_DOC_ID_LENGTH = 200;

// ---- Helpers ----

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

const CSS_HEX_RE = /^#[0-9a-fA-F]{6}$/;

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && CSS_HEX_RE.test(v);
}

function hexColorOrNull(v: unknown): string | null {
  return isHexColor(v) ? v : null;
}

const VALID_THEMES = new Set([
  "mist",
  "taupe",
  "linen",
  "dove",
  "clay",
  "olive",
  "custom",
  "light",
  "sakura",
  "harbor",
  "sage",
  "dark",
  "moss",
  "slate",
  "merlot",
  "graphite",
  "dark-gpt",
]);

const VALID_APP_TITLE_PRESETS = new Set([
  "nyoze",
  "nyoze-upper",
  "nyoze-kanji",
  "custom",
]);

const VALID_DOC_THEMES = new Set(["ui-linked", "paper-light", "paper-dark"]);

const VALID_LINE_BREAK_POLICIES = new Set([
  "obsidian-paragraph",
  "commonmark-strict",
]);

function isValidTheme(v: unknown): boolean {
  return typeof v === "string" && VALID_THEMES.has(v);
}

function isValidCustomFontString(v: unknown): boolean {
  if (typeof v !== "string") return false;
  if (!v.startsWith("custom:")) return false;
  const name = v.slice("custom:".length).trim();
  return name.length > 0 && name.length <= MAX_CUSTOM_FONT_LENGTH;
}

function isValidUiFont(v: unknown): boolean {
  return v === "mincho" || v === "gothic" || isValidCustomFontString(v);
}

function isValidAppTitleFont(v: unknown): boolean {
  return v === "ui-default" || isValidUiFont(v);
}

function isValidDocFontPreset(v: unknown): boolean {
  return (
    v === "ui-linked" ||
    v === "mincho" ||
    v === "gothic" ||
    isValidCustomFontString(v)
  );
}

function isValidDocHeadingFont(v: unknown): boolean {
  return (
    v === "same-as-body" ||
    v === "mincho" ||
    v === "gothic" ||
    isValidCustomFontString(v)
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ---- Sub-sanitizers ----

type HeadingAlignSanitized = "start" | "center" | "end";

type SanitizedDisplaySettings = {
  fontSize: number;
  lineHeight: number;
  paddingTop: number;
  paddingBottom: number;
  rubySize: number;
  rubyOffset: number;
  autoTcyEnabled: boolean;
  autoTcyNumbersOnly: boolean;
  autoTcyMinDigits: number;
  autoTcyMaxDigits: number;
  headingMarginAfter: number;
  headingDividerLevels: Record<string, boolean>;
  headingAlignHorizontal: HeadingAlignSanitized;
  headingAlignVertical: HeadingAlignSanitized;
};

function sanitizeHeadingAlign(
  v: unknown,
  fallback: HeadingAlignSanitized,
): HeadingAlignSanitized {
  if (v === "start" || v === "center" || v === "end") return v;
  return fallback;
}

function sanitizeDisplaySettings(v: unknown): SanitizedDisplaySettings {
  const d = isPlainObject(v) ? v : {};
  const autoTcyDigitRange = resolveAutoTcyDigitRange(d);
  return {
    fontSize: clamp(Number(d.fontSize ?? 20), 14, 36),
    lineHeight: clamp(Number(d.lineHeight ?? 1.9), 1.2, 2.8),
    paddingTop: clamp(Number(d.paddingTop ?? 22), 22, 120),
    paddingBottom: clamp(Number(d.paddingBottom ?? 20), 8, 120),
    rubySize: clamp(Number(d.rubySize ?? 0.5), 0.3, 1.2),
    rubyOffset: clamp(Number(d.rubyOffset ?? 0), -1.5, 1.5),
    autoTcyEnabled: typeof d.autoTcyEnabled === "boolean" ? d.autoTcyEnabled : false,
    autoTcyNumbersOnly:
      typeof d.autoTcyNumbersOnly === "boolean" ? d.autoTcyNumbersOnly : false,
    autoTcyMinDigits: autoTcyDigitRange.minDigits,
    autoTcyMaxDigits: autoTcyDigitRange.maxDigits,
    headingMarginAfter: clamp(Number(d.headingMarginAfter ?? 0.45), 0, 1.5),
    headingDividerLevels: sanitizeHeadingDividerLevels(d.headingDividerLevels),
    headingAlignHorizontal: sanitizeHeadingAlign(
      d.headingAlignHorizontal,
      "start",
    ),
    headingAlignVertical: sanitizeHeadingAlign(d.headingAlignVertical, "start"),
  };
}

function sanitizeHeadingDividerLevels(
  v: unknown,
): Record<string, boolean> {
  const d = isPlainObject(v) ? v : {};
  return {
    h1: typeof d.h1 === "boolean" ? d.h1 : true,
    h2: typeof d.h2 === "boolean" ? d.h2 : true,
    h3: typeof d.h3 === "boolean" ? d.h3 : false,
    h4: typeof d.h4 === "boolean" ? d.h4 : false,
    h5: typeof d.h5 === "boolean" ? d.h5 : false,
    h6: typeof d.h6 === "boolean" ? d.h6 : false,
  };
}

function sanitizeDocColorSettings(
  v: unknown,
): { pageColor: string; textColor: string; headingColor: string } | undefined {
  if (!isPlainObject(v)) return undefined;
  if (!isHexColor(v.pageColor) || !isHexColor(v.textColor) || !isHexColor(v.headingColor)) {
    return undefined;
  }
  return {
    pageColor: v.pageColor as string,
    textColor: v.textColor as string,
    headingColor: v.headingColor as string,
  };
}

type SanitizedDebugSettings = Record<string, unknown>;

function sanitizeDebugSettings(v: unknown): SanitizedDebugSettings | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: SanitizedDebugSettings = {};

  const boolKeys = [
    "imeProfilerEnabled",
    "imeProfilerShowHud",
    "imeProfilerLogSummary",
    "imePhaseAEnabled",
    "imePhaseBRubySuspendEnabled",
    "imeProfilerSaveJson",
  ];
  for (const key of boolKeys) {
    if (typeof v[key] === "boolean") out[key] = v[key];
  }

  if (typeof v.imePhaseAMinSyncIntervalMs === "number") {
    out.imePhaseAMinSyncIntervalMs = clamp(
      v.imePhaseAMinSyncIntervalMs as number,
      0,
      5000,
    );
  }
  if (typeof v.imeProfilerBenchmarkInputChars === "number") {
    out.imeProfilerBenchmarkInputChars = clamp(
      v.imeProfilerBenchmarkInputChars as number,
      0,
      100000,
    );
  }
  if (typeof v.imeProfilerBenchmarkDocumentId === "string") {
    const id = v.imeProfilerBenchmarkDocumentId as string;
    if (id.length <= MAX_BENCHMARK_DOC_ID_LENGTH) {
      out.imeProfilerBenchmarkDocumentId = id;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

// ---- Preset sanitizers ----

function sanitizeUiThemePreset(d: unknown): Record<string, unknown> | null {
  if (!isPlainObject(d)) return null;
  if (typeof d.id !== "string" || !d.id || (d.id as string).length > MAX_PRESET_ID_LENGTH)
    return null;
  if (typeof d.name !== "string" || (d.name as string).length > MAX_PRESET_NAME_LENGTH)
    return null;
  if (!isValidTheme(d.baseTheme)) return null;
  if (!isPlainObject(d.colors)) return null;
  const c = d.colors as Record<string, unknown>;
  if (
    !isHexColor(c.baseBg) ||
    !isHexColor(c.surfaceBg) ||
    !isHexColor(c.textPrimary) ||
    !isHexColor(c.accent) ||
    !isHexColor(c.border) ||
    !isHexColor(c.scrollbarBase)
  )
    return null;
  // BETA-T1: font fields removed from preset; old data accepted but stripped.
  const out: Record<string, unknown> = {
    id: d.id,
    name: d.name,
    baseTheme: d.baseTheme,
    colors: {
      baseBg: c.baseBg,
      surfaceBg: c.surfaceBg,
      textPrimary: c.textPrimary,
      accent: c.accent,
      border: c.border,
      paneBorder: isHexColor(c.paneBorder) ? c.paneBorder : c.border,
      scrollbarBase: c.scrollbarBase,
      ...(isHexColor(c.paneBg) ? { paneBg: c.paneBg } : {}),
    },
  };
  if (d.kind === "system" || d.kind === "custom") out.kind = d.kind;
  if (typeof d.createdAt === "string") out.createdAt = d.createdAt;
  return out;
}

function sanitizeDocThemePreset(d: unknown): Record<string, unknown> | null {
  if (!isPlainObject(d)) return null;
  if (typeof d.id !== "string" || !d.id || (d.id as string).length > MAX_PRESET_ID_LENGTH)
    return null;
  if (typeof d.name !== "string" || (d.name as string).length > MAX_PRESET_NAME_LENGTH)
    return null;
  if (
    typeof d.baseDocTheme !== "string" ||
    !VALID_DOC_THEMES.has(d.baseDocTheme as string)
  )
    return null;
  if (!isPlainObject(d.colors)) return null;
  const c = d.colors as Record<string, unknown>;
  if (
    !isHexColor(c.pageColor) ||
    !isHexColor(c.textColor) ||
    !isHexColor(c.headingColor)
  )
    return null;
  // BETA-T1: font fields removed from preset; old data accepted but stripped.
  const out: Record<string, unknown> = {
    id: d.id,
    name: d.name,
    baseDocTheme: d.baseDocTheme,
    colors: { pageColor: c.pageColor, textColor: c.textColor, headingColor: c.headingColor },
  };
  if (d.kind === "system" || d.kind === "custom") out.kind = d.kind;
  if (typeof d.createdAt === "string") out.createdAt = d.createdAt;
  return out;
}

function sanitizePresetArray(
  v: unknown,
  validator: (item: unknown) => Record<string, unknown> | null,
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const result: Record<string, unknown>[] = [];
  for (const item of v) {
    if (result.length >= MAX_PRESET_COUNT) break;
    const sanitized = validator(item);
    if (sanitized) result.push(sanitized);
  }
  return result.length > 0 ? result : undefined;
}

function sanitizeRegisteredFonts(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const result: string[] = [];
  for (const item of v) {
    if (result.length >= MAX_REGISTERED_FONTS) break;
    if (
      typeof item === "string" &&
      item.length > 0 &&
      item.length <= MAX_CUSTOM_FONT_LENGTH
    ) {
      result.push(item);
    }
  }
  return result.length > 0 ? result : undefined;
}

// ---- Main entry point ----

/**
 * Sanitize a parsed settings.json object.
 *
 * Returns a new object with only known keys, each validated and clamped.
 * Invalid values are silently replaced with safe defaults or omitted.
 *
 * If input is null/undefined (file missing or parse error), returns null
 * so the renderer can use its own defaults.
 */
export function sanitizeSettingsJson(
  raw: unknown,
): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;

  const out: Record<string, unknown> = {};

  // --- Theme enums ---
  if (isValidTheme(raw.uiTheme)) out.uiTheme = raw.uiTheme;
  if (isValidUiFont(raw.uiFont)) out.uiFont = raw.uiFont;
  const uiLanguageMode = normalizeUiLanguageMode(raw.uiLanguageMode);
  if (uiLanguageMode) out.uiLanguageMode = uiLanguageMode;
  if (
    typeof raw.documentTheme === "string" &&
    VALID_DOC_THEMES.has(raw.documentTheme)
  )
    out.documentTheme = raw.documentTheme;
  if (isValidDocFontPreset(raw.docFontPreset))
    out.docFontPreset = raw.docFontPreset;
  if (isValidDocHeadingFont(raw.docHeadingFont))
    out.docHeadingFont = raw.docHeadingFont;

  // --- Color strings ---
  const textPrimary = hexColorOrNull(raw.uiTextPrimary);
  if (textPrimary !== null) out.uiTextPrimary = textPrimary;
  const toolbarIconColor = hexColorOrNull(raw.toolbarIconColor);
  if (toolbarIconColor !== null) out.toolbarIconColor = toolbarIconColor;
  const appTitleColor = hexColorOrNull(raw.appTitleColor);
  if (appTitleColor !== null) out.appTitleColor = appTitleColor;

  // --- Numeric values ---
  if (typeof raw.uiFontScale === "number")
    out.uiFontScale = clamp(raw.uiFontScale as number, 0.5, 2);
  if (typeof raw.toolbarIconStroke === "number")
    out.toolbarIconStroke = clamp(raw.toolbarIconStroke as number, 0.9, 1.8);
  if (typeof raw.toolbarScale === "number")
    out.toolbarScale = clamp(raw.toolbarScale as number, 0.85, 1.15);

  // --- Booleans ---
  if (typeof raw.appTitleVisible === "boolean")
    out.appTitleVisible = raw.appTitleVisible;
  if (typeof raw.rubyVisible === "boolean")
    out.rubyVisible = raw.rubyVisible;
  if (typeof raw.frontmatterVisible === "boolean")
    out.frontmatterVisible = raw.frontmatterVisible;
  if (typeof raw.frontmatterShowAuthors === "boolean")
    out.frontmatterShowAuthors = raw.frontmatterShowAuthors;
  if (typeof raw.frontmatterShowTranslators === "boolean")
    out.frontmatterShowTranslators = raw.frontmatterShowTranslators;
  if (typeof raw.frontmatterShowRoleLabels === "boolean")
    out.frontmatterShowRoleLabels = raw.frontmatterShowRoleLabels;
  if (typeof raw.frontmatterShowInProjectFiles === "boolean")
    out.frontmatterShowInProjectFiles = raw.frontmatterShowInProjectFiles;
  if (typeof raw.frontmatterProjectShowTitle === "boolean")
    out.frontmatterProjectShowTitle = raw.frontmatterProjectShowTitle;
  if (typeof raw.frontmatterProjectShowAuthors === "boolean")
    out.frontmatterProjectShowAuthors = raw.frontmatterProjectShowAuthors;
  if (typeof raw.useEditorArrowPointer === "boolean")
    out.useEditorArrowPointer = raw.useEditorArrowPointer;

  if (raw.typewriterModeEnabled !== undefined) {
    out.typewriterModeEnabled = normalizeTypewriterModeEnabled(
      raw.typewriterModeEnabled,
    );
  }
  if (raw.typewriterOffsetRatio !== undefined) {
    out.typewriterOffsetRatio = normalizeTypewriterOffsetRatio(
      raw.typewriterOffsetRatio,
    );
  }
  if (raw.typewriterFollowBandRatio !== undefined) {
    out.typewriterFollowBandRatio = normalizeTypewriterFollowBandRatio(
      raw.typewriterFollowBandRatio,
    );
  }

  if (raw.visualFocusBlockHighlightEnabled !== undefined) {
    out.visualFocusBlockHighlightEnabled = normalizeVisualFocusBlockHighlightEnabled(
      raw.visualFocusBlockHighlightEnabled,
    );
  }

  if (raw.visualFocusDimNonFocusedBlocksEnabled !== undefined) {
    out.visualFocusDimNonFocusedBlocksEnabled = normalizeVisualFocusDimNonFocusedBlocksEnabled(
      raw.visualFocusDimNonFocusedBlocksEnabled,
    );
  }

  if (raw.visualFocusBlockHighlightColor !== undefined) {
    out.visualFocusBlockHighlightColor = normalizeVisualFocusBlockHighlightColor(
      raw.visualFocusBlockHighlightColor,
    );
  }
  if (raw.visualFocusBlockHighlightOpacity !== undefined) {
    out.visualFocusBlockHighlightOpacity = normalizeVisualFocusBlockHighlightOpacity(
      raw.visualFocusBlockHighlightOpacity,
    );
  }
  if (raw.visualFocusDimNonFocusedBlocksOpacity !== undefined) {
    out.visualFocusDimNonFocusedBlocksOpacity = normalizeVisualFocusDimNonFocusedBlocksOpacity(
      raw.visualFocusDimNonFocusedBlocksOpacity,
    );
  }

  if (raw.visualFocusCurrentLineHighlightEnabled !== undefined) {
    out.visualFocusCurrentLineHighlightEnabled = normalizeVisualFocusCurrentLineHighlightEnabled(
      raw.visualFocusCurrentLineHighlightEnabled,
    );
  }
  if (raw.visualFocusCurrentLineHighlightColor !== undefined) {
    out.visualFocusCurrentLineHighlightColor = normalizeVisualFocusCurrentLineHighlightColor(
      raw.visualFocusCurrentLineHighlightColor,
    );
  }
  if (raw.visualFocusCurrentLineHighlightOpacity !== undefined) {
    out.visualFocusCurrentLineHighlightOpacity = normalizeVisualFocusCurrentLineHighlightOpacity(
      raw.visualFocusCurrentLineHighlightOpacity,
    );
  }

  if (
    typeof raw.macosArrowScrollClampEnabled === "boolean"
  ) {
    out.macosArrowScrollClampEnabled = raw.macosArrowScrollClampEnabled;
  }

  if (typeof raw.pseudoCaretEnabled === "boolean") {
    out.pseudoCaretEnabled = raw.pseudoCaretEnabled;
  }

  if (raw.pseudoCaretThickness !== undefined) {
    out.pseudoCaretThickness = normalizePseudoCaretThickness(
      raw.pseudoCaretThickness,
    );
  }

  if (raw.pseudoCaretBlinkEnabled !== undefined) {
    out.pseudoCaretBlinkEnabled = normalizePseudoCaretBlinkEnabled(
      raw.pseudoCaretBlinkEnabled,
    );
  }

  // 付箋 (Task 3A-3): 初回説明の確認済みフラグ。boolean のみ受け付ける。
  if (typeof raw.noteAnchorNoticeConfirmed === "boolean") {
    out.noteAnchorNoticeConfirmed = raw.noteAnchorNoticeConfirmed;
  }

  if (typeof raw.paragraphPlainBehavior === "string") {
    const v = raw.paragraphPlainBehavior.trim();
    if (
      v === "fast" ||
      v === "comfortable" ||
      v === "comfortable-no-scroll-reposition"
    ) {
      out.paragraphPlainBehavior = normalizeParagraphPlainBehavior(v);
    }
  }

  // --- App title ---
  if (
    typeof raw.appTitlePreset === "string" &&
    VALID_APP_TITLE_PRESETS.has(raw.appTitlePreset)
  )
    out.appTitlePreset = raw.appTitlePreset;
  if (typeof raw.appTitleCustom === "string") {
    out.appTitleCustom = (raw.appTitleCustom as string).slice(
      0,
      MAX_APP_TITLE_CUSTOM_LENGTH,
    );
  }
  if (isValidAppTitleFont(raw.appTitleFont))
    out.appTitleFont = raw.appTitleFont;

  // --- Display settings ---
  if (raw.displaySettings !== undefined)
    out.displaySettings = sanitizeDisplaySettings(raw.displaySettings);

  // --- Doc color settings ---
  const docColors = sanitizeDocColorSettings(raw.docColorSettings);
  if (docColors) out.docColorSettings = docColors;

  // --- Line break policy ---
  if (
    typeof raw.lineBreakPolicy === "string" &&
    VALID_LINE_BREAK_POLICIES.has(raw.lineBreakPolicy)
  )
    out.lineBreakPolicy = raw.lineBreakPolicy;

  // --- Document Type 別の既定表示方向 ---
  // 未設定文書を含め vertical-rl / horizontal-tb のみ受理する。
  if (isWritingMode(raw.defaultNovelWritingMode))
    out.defaultNovelWritingMode = raw.defaultNovelWritingMode;
  if (isWritingMode(raw.defaultArticleWritingMode))
    out.defaultArticleWritingMode = raw.defaultArticleWritingMode;
  if (isWritingMode(raw.defaultUnsetDocumentWritingMode))
    out.defaultUnsetDocumentWritingMode = raw.defaultUnsetDocumentWritingMode;

  // --- Fonts ---
  const registeredFonts = sanitizeRegisteredFonts(raw.registeredFonts);
  if (registeredFonts) out.registeredFonts = registeredFonts;
  if (
    raw.selectedFont === null ||
    (typeof raw.selectedFont === "string" &&
      (raw.selectedFont as string).length <= MAX_CUSTOM_FONT_LENGTH)
  )
    out.selectedFont = raw.selectedFont;

  // --- Theme presets ---
  const uiPresets = sanitizePresetArray(raw.uiThemePresets, sanitizeUiThemePreset);
  if (uiPresets) out.uiThemePresets = uiPresets;
  if (
    raw.activeUiThemePresetId === null ||
    (typeof raw.activeUiThemePresetId === "string" &&
      (raw.activeUiThemePresetId as string).length <= MAX_PRESET_ID_LENGTH)
  )
    out.activeUiThemePresetId = raw.activeUiThemePresetId;

  const docPresets = sanitizePresetArray(raw.docThemePresets, sanitizeDocThemePreset);
  if (docPresets) out.docThemePresets = docPresets;
  if (
    raw.activeDocThemePresetId === null ||
    (typeof raw.activeDocThemePresetId === "string" &&
      (raw.activeDocThemePresetId as string).length <= MAX_PRESET_ID_LENGTH)
  )
    out.activeDocThemePresetId = raw.activeDocThemePresetId;

  if (typeof raw.themePresetSchemaVersion === "number") {
    out.themePresetSchemaVersion = clamp(
      Math.floor(raw.themePresetSchemaVersion as number),
      0,
      1000,
    );
  }

  // --- Caret color (BETA-DISP1) ---
  if (raw.caretColorMode === "auto" || raw.caretColorMode === "custom" || raw.caretColorMode === "highlight")
    out.caretColorMode = raw.caretColorMode;
  if (raw.caretColorCustom === null) {
    out.caretColorCustom = null;
  } else {
    const caretCustom = hexColorOrNull(raw.caretColorCustom);
    if (caretCustom !== null) out.caretColorCustom = caretCustom;
  }

  // --- Debug settings ---
  const debug = sanitizeDebugSettings(raw.debug);
  if (debug) out.debug = debug;

  // --- PV-SET-4A: Page Viewer heading pagination default ---
  if (raw.pageViewerBreakBeforeHeading !== undefined) {
    out.pageViewerBreakBeforeHeading = normalizePageViewerBreakBeforeHeading(
      raw.pageViewerBreakBeforeHeading,
    );
  }
  if (raw.pageViewerBreakBeforeHeadingMaxLevel !== undefined) {
    out.pageViewerBreakBeforeHeadingMaxLevel = normalizePageViewerBreakBeforeHeadingMaxLevel(
      raw.pageViewerBreakBeforeHeadingMaxLevel,
    );
  }

  // --- PV-READ-1: Page Viewer reading surface (margins / paper frame) ---
  if (raw.pageViewerReadingMarginTop !== undefined) {
    out.pageViewerReadingMarginTop = normalizePageViewerReadingMarginTop(
      raw.pageViewerReadingMarginTop,
    );
  }
  if (raw.pageViewerReadingMarginBottom !== undefined) {
    out.pageViewerReadingMarginBottom = normalizePageViewerReadingMarginBottom(
      raw.pageViewerReadingMarginBottom,
    );
  }
  if (raw.pageViewerReadingMarginInline !== undefined) {
    out.pageViewerReadingMarginInline = normalizePageViewerReadingMarginInline(
      raw.pageViewerReadingMarginInline,
    );
  }
  if (raw.pageViewerReadingPaperFrame !== undefined) {
    out.pageViewerReadingPaperFrame = normalizePageViewerReadingPaperFrame(
      raw.pageViewerReadingPaperFrame,
    );
  }

  // --- PV-READ-2: Page Viewer reading furniture (header / footer) ---
  if (raw.pageViewerReadingHeaderEnabled !== undefined) {
    out.pageViewerReadingHeaderEnabled = normalizePageViewerReadingHeaderEnabled(
      raw.pageViewerReadingHeaderEnabled,
    );
  }
  if (raw.pageViewerReadingHeaderAlign !== undefined) {
    out.pageViewerReadingHeaderAlign = normalizePageViewerReadingHeaderAlign(
      raw.pageViewerReadingHeaderAlign,
    );
  }
  if (raw.pageViewerReadingHeaderContent !== undefined) {
    out.pageViewerReadingHeaderContent = normalizePageViewerReadingHeaderContent(
      raw.pageViewerReadingHeaderContent,
    );
  }
  if (raw.pageViewerReadingFooterEnabled !== undefined) {
    out.pageViewerReadingFooterEnabled = normalizePageViewerReadingFooterEnabled(
      raw.pageViewerReadingFooterEnabled,
    );
  }
  if (raw.pageViewerReadingFooterAlign !== undefined) {
    out.pageViewerReadingFooterAlign = normalizePageViewerReadingFooterAlign(
      raw.pageViewerReadingFooterAlign,
    );
  }
  if (raw.pageViewerReadingSimpleCoverEnabled !== undefined) {
    out.pageViewerReadingSimpleCoverEnabled = normalizePageViewerReadingSimpleCoverEnabled(
      raw.pageViewerReadingSimpleCoverEnabled,
    );
  }
  if (raw.pageViewerReadingSimpleCoverWritingMode !== undefined) {
    out.pageViewerReadingSimpleCoverWritingMode = normalizePageViewerReadingSimpleCoverWritingMode(
      raw.pageViewerReadingSimpleCoverWritingMode,
    );
  }
  if (raw.pageViewerReadingSimpleCoverLayout !== undefined) {
    out.pageViewerReadingSimpleCoverLayout = normalizePageViewerReadingSimpleCoverLayout(
      raw.pageViewerReadingSimpleCoverLayout,
    );
  }

  if (raw.externalExportOptionsDefaults !== undefined) {
    const externalExportOptionsDefaults = normalizeExternalExportOptionsDefaults(
      raw.externalExportOptionsDefaults,
    );
    if (Object.keys(externalExportOptionsDefaults).length > 0) {
      out.externalExportOptionsDefaults = externalExportOptionsDefaults;
    }
  }

  return out;
}
