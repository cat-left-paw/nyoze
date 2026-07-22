import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconAlignBoxLeftMiddle,
  IconArrowsMoveHorizontal,
  IconArrowsVertical,
  IconColumns,
  IconChevronRight,
  IconDeviceImacHeart,
  IconDiamond,
  IconFileText,
  IconHeading,
  IconHighlight,
  IconLicense,
  IconNumbers,
  IconPencilStar,
  IconShadowOff,
  IconThumbUp,
  IconCursorText,
  IconTool,
  IconTypography,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type {
  AppTitleFont,
  AppTitlePreset,
  DisplaySettings,
  DisplaySettingsNumericKey,
  DocThemePreset,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  DocumentTheme,
  DocumentTypeWritingModeDefaults,
  HeadingAlign,
  ParagraphPlainBehavior,
  Theme,
  UiFont,
  UiLanguageMode,
  UiThemePreset,
  WritingMode,
} from "../../settings/types";
import {
  APP_TITLE_COLOR_PRESETS,
  APP_TITLE_CUSTOM_MAX_LENGTH,
  APP_TITLE_PRESET_LABELS,
  DEFAULT_TOOLBAR_ICON_STROKE,
  DEFAULT_TOOLBAR_SCALE,
  MAX_TOOLBAR_ICON_STROKE,
  MAX_TOOLBAR_SCALE,
  MIN_TOOLBAR_ICON_STROKE,
  MIN_TOOLBAR_SCALE,
  PSEUDO_CARET_THICKNESS_MAX,
  PSEUDO_CARET_THICKNESS_MIN,
  PSEUDO_CARET_THICKNESS_STEP,
  THEME_LABELS,
  TYPEWRITER_FOLLOW_BAND_RATIO_MAX,
  TYPEWRITER_FOLLOW_BAND_RATIO_MIN,
  TYPEWRITER_OFFSET_RATIO_MAX,
  TYPEWRITER_OFFSET_RATIO_MIN,
  UI_THEME_FONT_PRESETS,
  UI_THEME_TEXT_PRIMARY_PRESETS,
} from "../../settings/defaults";
import { getAppTitleCustomDisplayWidth } from "../../settings/appTitleCustom";
import { expandHexForColorInput, expandHexForCurrentLineColorInput } from "../../settings/visualFocusAppearance";
import {
  isBundledDocThemePreset,
  isBundledUiThemePreset,
  isStandardDocThemePresetId,
  isSystemUiThemePreset,
} from "../../settings/theme-packs";
import { UI_THEME_VALUES } from "../../settings/themeUtils";
import type { CaretColorMode } from "../../theme/caretColor";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { createUiTextGetter } from "../i18n/uiText";
import { DisplayNumberSlider } from "./DisplayNumberSlider";
import {
  createDefaultDisplaySettingsSectionOpenState,
  resolveDisplaySettingsSectionOpenStateForVisibilityChange,
  type DisplaySettingsSectionKey,
  type DisplaySettingsSectionOpenState,
} from "./displaySettingsSectionState";
import { formatNativeSelectOptionLabel } from "../utils/nativeSelectOptionLabel";
import { ThemeSwatchSelect } from "./ThemeSwatchSelect";
import {
  getDocumentPresetSwatches,
  getDocumentThemeSwatches,
  getUiPresetSwatches,
  getUiThemeSwatches,
} from "../utils/themeSwatchOptions";
import type { ThemeSwatchOption } from "../utils/themeSwatchOptions";

type DisplaySettingsModalProps = {
  open: boolean;
  displaySettings: DisplaySettings;
  writingMode: WritingMode;
  /** Document Type 別の既定表示方向（frontmatter `writingMode` 無しの文書にだけ効く）。 */
  documentTypeWritingModeDefaults: DocumentTypeWritingModeDefaults;
  onChangeDocumentTypeWritingModeDefault: (
    patch: Partial<DocumentTypeWritingModeDefaults>,
  ) => void;
  uiLanguageMode: UiLanguageMode;
  /** process.platform と同じ値（Electron） */
  platform: string;
  theme: Theme;
  uiThemePresets: UiThemePreset[];
  activeUiThemePresetId: string | null;
  uiFont: UiFont;
  uiTextPrimary: string | null;
  uiFontScale: number;
  toolbarIconColor: string | null;
  toolbarIconStroke: number;
  toolbarScale: number;
  appTitleVisible: boolean;
  appTitlePreset: AppTitlePreset;
  appTitleCustom: string;
  appTitleColor: string | null;
  appTitleFont: AppTitleFont;
  documentTheme: DocumentTheme;
  docThemePresets: DocThemePreset[];
  activeDocThemePresetId: string | null;
  docFontPreset: DocumentFontPreset;
  docHeadingFont: DocumentHeadingFont;
  docColorSettings: DocumentColorSettings;
  registeredFonts: string[];
  selectedFont: string | null;
  frontmatterVisible: boolean;
  frontmatterShowAuthors: boolean;
  frontmatterShowTranslators: boolean;
  frontmatterShowRoleLabels: boolean;
  frontmatterShowInProjectFiles: boolean;
  frontmatterProjectShowTitle: boolean;
  frontmatterProjectShowAuthors: boolean;
  onClose: () => void;
  onReset: () => void;
  onSetDisplayNumber: (
    key: DisplaySettingsNumericKey,
    value: number,
    min: number,
    max: number,
  ) => void;
  onAutoTcyEnabledChange: (enabled: boolean) => void;
  onAutoTcyNumbersOnlyChange: (numbersOnly: boolean) => void;
  onSetHeadingDividerLevel: (
    level: keyof DisplaySettings["headingDividerLevels"],
    enabled: boolean,
  ) => void;
  onSetHeadingAlignHorizontal: (value: HeadingAlign) => void;
  onSetHeadingAlignVertical: (value: HeadingAlign) => void;
  onThemeChange: (theme: Theme) => void;
  onSetActiveUiThemePresetId: (id: string) => void;
  onUiFontChange: (value: UiFont) => void;
  onUiLanguageModeChange: (value: UiLanguageMode) => void;
  onUiTextPrimaryChange: (value: string | null) => void;
  onUiFontScaleChange: (value: number) => void;
  onToolbarIconColorChange: (value: string | null) => void;
  onToolbarIconStrokeChange: (value: number) => void;
  onToolbarScaleChange: (value: number) => void;
  onAppTitleVisibleChange: (value: boolean) => void;
  onAppTitlePresetChange: (value: AppTitlePreset) => void;
  onAppTitleCustomChange: (value: string) => void;
  onAppTitleColorChange: (value: string | null) => void;
  onAppTitleFontChange: (value: AppTitleFont) => void;
  onDocumentThemeChange: (docTheme: DocumentTheme) => void;
  onSetActiveDocThemePresetId: (id: string) => void;
  onDocFontPresetChange: (preset: DocumentFontPreset) => void;
  onDocHeadingFontChange: (value: DocumentHeadingFont) => void;
  onDocColorSettingsChange: (settings: DocumentColorSettings) => void;
  onSelectedFontChange: (font: string | null) => void;
  onRegisteredFontsChange: (fonts: string[]) => void;
  onFrontmatterVisibleChange: (value: boolean) => void;
  onFrontmatterShowAuthorsChange: (value: boolean) => void;
  onFrontmatterShowTranslatorsChange: (value: boolean) => void;
  onFrontmatterShowRoleLabelsChange: (value: boolean) => void;
  onFrontmatterShowInProjectFilesChange: (value: boolean) => void;
  onFrontmatterProjectShowTitleChange: (value: boolean) => void;
  onFrontmatterProjectShowAuthorsChange: (value: boolean) => void;
  caretColorMode: CaretColorMode;
  caretColorCustom: string | null;
  useEditorArrowPointer: boolean;
  onCaretColorModeChange: (mode: CaretColorMode) => void;
  onCaretColorCustomChange: (color: string | null) => void;
  onUseEditorArrowPointerChange: (value: boolean) => void;
  /** Task 2-4: pseudo caret ON/OFF + short-axis thickness (px). */
  pseudoCaretEnabled: boolean;
  onPseudoCaretEnabledChange: (value: boolean) => void;
  pseudoCaretThickness: number;
  onPseudoCaretThicknessChange: (value: number) => void;
  pseudoCaretBlinkEnabled: boolean;
  onPseudoCaretBlinkEnabledChange: (value: boolean) => void;
  paragraphPlainBehavior: ParagraphPlainBehavior;
  onParagraphPlainBehaviorChange: (value: ParagraphPlainBehavior) => void;
  typewriterModeEnabled: boolean;
  typewriterOffsetRatio: number;
  typewriterFollowBandRatio: number;
  onTypewriterModeEnabledChange: (enabled: boolean) => void;
  onTypewriterOffsetRatioChange: (value: number) => void;
  onTypewriterFollowBandRatioChange: (value: number) => void;
  visualFocusBlockHighlightEnabled: boolean;
  onVisualFocusBlockHighlightEnabledChange: (enabled: boolean) => void;
  visualFocusDimNonFocusedBlocksEnabled: boolean;
  onVisualFocusDimNonFocusedBlocksEnabledChange: (enabled: boolean) => void;
  visualFocusBlockHighlightColor: string;
  onVisualFocusBlockHighlightColorChange: (color: string) => void;
  visualFocusBlockHighlightOpacity: number;
  onVisualFocusBlockHighlightOpacityChange: (value: number) => void;
  visualFocusDimNonFocusedBlocksOpacity: number;
  onVisualFocusDimNonFocusedBlocksOpacityChange: (value: number) => void;
  visualFocusCurrentLineHighlightEnabled: boolean;
  onVisualFocusCurrentLineHighlightEnabledChange: (enabled: boolean) => void;
  visualFocusCurrentLineHighlightColor: string;
  onVisualFocusCurrentLineHighlightColorChange: (color: string) => void;
  visualFocusCurrentLineHighlightOpacity: number;
  onVisualFocusCurrentLineHighlightOpacityChange: (value: number) => void;
  /** Phase5-H Slice1: open the Theme Studio modal */
  onOpenThemeStudio: () => void;
  /** 表示設定を閉じたうえで書庫管理 modal を開く（App 側 handler） */
  onOpenLibraryManager: () => void;
  onSendBugReport: () => void;
  onSendFeedback: () => void;
  onOpenRepository: () => void;
  /** 表示設定を開く直前の要求: 該当セクションを展開（ツールバー Typewriter 導線など） */
  expandSectionOnOpen?: DisplaySettingsSectionKey | null;
  onExpandSectionOnOpenConsumed?: () => void;
};

type SectionHeadingProps = {
  title: string;
  icon: TablerIcon;
  isOpen: boolean;
  onToggle: () => void;
};

function SectionHeading({
  title,
  icon: Icon,
  isOpen,
  onToggle,
}: SectionHeadingProps) {
  return (
    <button
      type="button"
      className="settings-section-toggle"
      onClick={onToggle}
      aria-expanded={isOpen}
    >
      <span className="settings-section-heading-leading">
        <IconChevronRight
          className={`settings-section-chevron${isOpen ? " is-open" : ""}`}
          size={17}
          stroke={1.8}
          aria-hidden="true"
        />
        <Icon
          className="settings-section-icon"
          size={17}
          stroke={1.8}
          aria-hidden="true"
        />
        <span className="settings-section-heading-text">{title}</span>
      </span>
    </button>
  );
}

export function DisplaySettingsModal({
  open,
  displaySettings,
  writingMode,
  documentTypeWritingModeDefaults,
  onChangeDocumentTypeWritingModeDefault,
  uiLanguageMode,
  platform,
  theme,
  uiThemePresets,
  activeUiThemePresetId,
  uiFont,
  uiTextPrimary,
  uiFontScale,
  toolbarIconColor,
  toolbarIconStroke,
  toolbarScale,
  appTitleVisible,
  appTitlePreset,
  appTitleCustom,
  appTitleColor,
  appTitleFont,
  documentTheme,
  docThemePresets,
  activeDocThemePresetId,
  docFontPreset,
  docHeadingFont,
  docColorSettings,
  registeredFonts,
  selectedFont,
  frontmatterVisible,
  frontmatterShowAuthors,
  frontmatterShowTranslators,
  frontmatterShowRoleLabels,
  frontmatterShowInProjectFiles,
  frontmatterProjectShowTitle,
  frontmatterProjectShowAuthors,
  onClose,
  onReset,
  onSetDisplayNumber,
  onAutoTcyEnabledChange,
  onAutoTcyNumbersOnlyChange,
  onSetHeadingDividerLevel,
  onSetHeadingAlignHorizontal,
  onSetHeadingAlignVertical,
  onThemeChange,
  onSetActiveUiThemePresetId,
  onUiFontChange,
  onUiLanguageModeChange,
  onUiTextPrimaryChange,
  onUiFontScaleChange,
  onToolbarIconColorChange,
  onToolbarIconStrokeChange,
  onToolbarScaleChange,
  onAppTitleVisibleChange,
  onAppTitlePresetChange,
  onAppTitleCustomChange,
  onAppTitleColorChange,
  onAppTitleFontChange,
  onDocumentThemeChange,
  onSetActiveDocThemePresetId,
  onDocFontPresetChange,
  onDocHeadingFontChange,
  onDocColorSettingsChange,
  onSelectedFontChange,
  onRegisteredFontsChange,
  onFrontmatterVisibleChange,
  onFrontmatterShowAuthorsChange,
  onFrontmatterShowTranslatorsChange,
  onFrontmatterShowRoleLabelsChange,
  onFrontmatterShowInProjectFilesChange,
  onFrontmatterProjectShowTitleChange,
  onFrontmatterProjectShowAuthorsChange,
  caretColorMode,
  caretColorCustom,
  useEditorArrowPointer,
  onCaretColorModeChange,
  onCaretColorCustomChange,
  onUseEditorArrowPointerChange,
  pseudoCaretEnabled,
  onPseudoCaretEnabledChange,
  pseudoCaretThickness,
  onPseudoCaretThicknessChange,
  pseudoCaretBlinkEnabled,
  onPseudoCaretBlinkEnabledChange,
  paragraphPlainBehavior,
  onParagraphPlainBehaviorChange,
  typewriterModeEnabled,
  typewriterOffsetRatio,
  typewriterFollowBandRatio,
  onTypewriterModeEnabledChange,
  onTypewriterOffsetRatioChange,
  onTypewriterFollowBandRatioChange,
  visualFocusBlockHighlightEnabled,
  onVisualFocusBlockHighlightEnabledChange,
  visualFocusDimNonFocusedBlocksEnabled,
  onVisualFocusDimNonFocusedBlocksEnabledChange,
  visualFocusBlockHighlightColor,
  onVisualFocusBlockHighlightColorChange,
  visualFocusBlockHighlightOpacity,
  onVisualFocusBlockHighlightOpacityChange,
  visualFocusDimNonFocusedBlocksOpacity,
  onVisualFocusDimNonFocusedBlocksOpacityChange,
  visualFocusCurrentLineHighlightEnabled,
  onVisualFocusCurrentLineHighlightEnabledChange,
  visualFocusCurrentLineHighlightColor,
  onVisualFocusCurrentLineHighlightColorChange,
  visualFocusCurrentLineHighlightOpacity,
  onVisualFocusCurrentLineHighlightOpacityChange,
  onOpenThemeStudio,
  onOpenLibraryManager,
  onSendBugReport,
  onSendFeedback,
  onOpenRepository,
  expandSectionOnOpen,
  onExpandSectionOnOpenConsumed,
}: DisplaySettingsModalProps) {
  const t = createUiTextGetter(uiLanguageMode);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousOpenRef = useRef(open);
  useFocusTrap(overlayRef, open);

  const [fontInput, setFontInput] = useState("");
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  const [systemFontsLoading, setSystemFontsLoading] = useState(false);
  const [draggingFont, setDraggingFont] = useState<string | null>(null);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<string | null>(
    null,
  );
  const [sectionOpenState, setSectionOpenState] =
    useState<DisplaySettingsSectionOpenState>(
      createDefaultDisplaySettingsSectionOpenState,
    );

  const handleAddFont = useCallback(() => {
    const trimmed = fontInput.trim();
    if (!trimmed) return;
    if (registeredFonts.includes(trimmed)) {
      setFontInput("");
      return;
    }
    onRegisteredFontsChange([...registeredFonts, trimmed]);
    setFontInput("");
  }, [fontInput, registeredFonts, onRegisteredFontsChange]);

  const handleRemoveFont = useCallback(
    (font: string) => {
      onRegisteredFontsChange(registeredFonts.filter((f) => f !== font));
      const isActiveCustomFont =
        docFontPreset === `custom:${font}` ||
        (docFontPreset === "ui-linked" && selectedFont === font);
      if (isActiveCustomFont) {
        onDocFontPresetChange("mincho");
      }
      if (selectedFont === font) {
        onSelectedFontChange(null);
      }
    },
    [
      docFontPreset,
      registeredFonts,
      selectedFont,
      onRegisteredFontsChange,
      onDocFontPresetChange,
      onSelectedFontChange,
    ],
  );

  const handleFetchSystemFonts = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (window as any).nyozeBridge?.fonts as
      | { getSystemFonts: () => Promise<string[]> }
      | undefined;
    if (!api) return;
    setSystemFontsLoading(true);
    try {
      const fonts = await api.getSystemFonts();
      setSystemFonts(fonts);
    } catch (err) {
      console.warn("getSystemFonts failed:", err);
    } finally {
      setSystemFontsLoading(false);
    }
  }, []);

  const handleAddSystemFont = useCallback(
    (font: string) => {
      if (registeredFonts.includes(font)) return;
      onRegisteredFontsChange([...registeredFonts, font]);
    },
    [registeredFonts, onRegisteredFontsChange],
  );

  const handleDropOnFont = useCallback(
    (targetFont: string) => {
      if (!draggingFont || draggingFont === targetFont) return;
      const fromIndex = registeredFonts.indexOf(draggingFont);
      const toIndex = registeredFonts.indexOf(targetFont);
      if (fromIndex < 0 || toIndex < 0) return;

      const reordered = [...registeredFonts];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      onRegisteredFontsChange(reordered);
    },
    [draggingFont, registeredFonts, onRegisteredFontsChange],
  );

  const activeUiPreset =
    activeUiThemePresetId === null
      ? null
      : (uiThemePresets.find((preset) => preset.id === activeUiThemePresetId) ??
        null);
  const bundledUiThemePresets = uiThemePresets
    .filter((preset) => isBundledUiThemePreset(preset));
  const flatUiThemePresets = [
    ...UI_THEME_VALUES.map((value) => ({
      key: value,
      value: `theme:${value}`,
      label: THEME_LABELS[value],
      swatches: getUiThemeSwatches(value),
    })),
    ...bundledUiThemePresets.map((preset) => ({
      key: preset.id,
      value: `preset:${preset.id}`,
      label: preset.name,
      swatches: getUiPresetSwatches(preset),
    })),
  ];
  const customUiThemePresets = uiThemePresets
    .filter((preset) => !isSystemUiThemePreset(preset))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const selectedUiThemeValue =
    activeUiPreset && !activeUiPreset.id.startsWith("preset-ui-")
      ? `preset:${activeUiPreset.id}`
      : `theme:${theme}`;
  const activeDocPreset =
    activeDocThemePresetId === null
      ? null
      : (docThemePresets.find((preset) => preset.id === activeDocThemePresetId) ??
        null);
  const bundledDocThemePresets = docThemePresets
    .filter((preset) => isBundledDocThemePreset(preset))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const customDocThemePresets = docThemePresets
    .filter(
      (preset) =>
        !isStandardDocThemePresetId(preset.id) &&
        !isBundledDocThemePreset(preset),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const selectedDocThemeValue =
    activeDocPreset && !isStandardDocThemePresetId(activeDocPreset.id)
      ? `preset:${activeDocPreset.id}`
      : `theme:${documentTheme}`;

  const handleUiThemeSelect = useCallback(
    (value: string) => {
      if (value.startsWith("preset:")) {
        const id = value.slice("preset:".length);
        if (id) onSetActiveUiThemePresetId(id);
        return;
      }
      if (!value.startsWith("theme:")) return;
      const nextTheme = value.slice("theme:".length) as Theme;
      const systemPreset = uiThemePresets.find(
        (preset) =>
          isSystemUiThemePreset(preset) && preset.baseTheme === nextTheme,
      );
      if (systemPreset) {
        onSetActiveUiThemePresetId(systemPreset.id);
        return;
      }
      onThemeChange(nextTheme);
    },
    [onSetActiveUiThemePresetId, onThemeChange, uiThemePresets],
  );
  const handleDocumentThemeSelect = useCallback(
    (value: string) => {
      if (value.startsWith("preset:")) {
        const id = value.slice("preset:".length);
        if (id) onSetActiveDocThemePresetId(id);
        return;
      }
      if (!value.startsWith("theme:")) return;
      onDocumentThemeChange(value.slice("theme:".length) as DocumentTheme);
    },
    [onDocumentThemeChange, onSetActiveDocThemePresetId],
  );

  useEffect(() => {
    const previousWasOpen = previousOpenRef.current;
    setSectionOpenState((currentState) => {
      let next = resolveDisplaySettingsSectionOpenStateForVisibilityChange(
        previousWasOpen,
        open,
        currentState,
      );
      if (!previousWasOpen && open && expandSectionOnOpen) {
        next = { ...next, [expandSectionOnOpen]: true };
      }
      return next;
    });
    if (!previousWasOpen && open && expandSectionOnOpen) {
      onExpandSectionOnOpenConsumed?.();
    }
    previousOpenRef.current = open;
  }, [open, expandSectionOnOpen, onExpandSectionOnOpenConsumed]);

  const toggleSection = useCallback((key: DisplaySettingsSectionKey) => {
    setSectionOpenState((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    const api = window.nyozeBridge?.update;
    if (!api) {
      setUpdateCheckResult("確認できませんでした");
      return;
    }
    setUpdateCheckLoading(true);
    setUpdateCheckResult(null);
    try {
      const result = await api.checkForUpdate();
      if (!result.ok) {
        setUpdateCheckResult("確認できませんでした");
      } else if (result.hasUpdate) {
        setUpdateCheckResult("新しいバージョンがあります");
      } else {
        setUpdateCheckResult("最新版です");
      }
    } catch {
      setUpdateCheckResult("確認できませんでした");
    } finally {
      setUpdateCheckLoading(false);
    }
  }, []);

  if (!open) return null;
  const isWindowsStoreBuild = Boolean(window.nyozeBridge?.appInfo?.windowsStore);
  const TOP_PADDING_BASE = 22;
  const paddingTopUiValue = Math.max(
    0,
    Math.round(displaySettings.paddingTop - TOP_PADDING_BASE),
  );
  const paddingTopUiMax = 120 - TOP_PADDING_BASE;
  const effectiveDocFontPreset: DocumentFontPreset =
    docFontPreset === "ui-linked"
      ? selectedFont
        ? `custom:${selectedFont}`
        : "mincho"
      : docFontPreset;
  const isCustomHeadingFont = docHeadingFont.startsWith("custom:");
  const headingCustomFontName = isCustomHeadingFont
    ? docHeadingFont.slice("custom:".length)
    : null;
  const hasHeadingCustomFontOption =
    headingCustomFontName !== null &&
    registeredFonts.includes(headingCustomFontName);
  const isCustomUiFont = uiFont.startsWith("custom:");
  const uiCustomFontName = isCustomUiFont
    ? uiFont.slice("custom:".length)
    : null;
  const hasUiCustomFontOption =
    uiCustomFontName !== null && registeredFonts.includes(uiCustomFontName);
  const isCustomAppTitleFont = appTitleFont.startsWith("custom:");
  const appTitleCustomFontName = isCustomAppTitleFont
    ? appTitleFont.slice("custom:".length)
    : null;
  const hasAppTitleCustomFontOption =
    appTitleCustomFontName !== null &&
    registeredFonts.includes(appTitleCustomFontName);
  const appTitleCustomWidth = getAppTitleCustomDisplayWidth(appTitleCustom);
  const effectiveUiTextPrimary =
    uiTextPrimary ?? UI_THEME_TEXT_PRIMARY_PRESETS[theme];
  const effectiveToolbarIconColor = toolbarIconColor ?? effectiveUiTextPrimary;
  const effectiveAppTitleColor =
    appTitleColor ?? APP_TITLE_COLOR_PRESETS[theme];
  const uiFontLabels = {
    mincho: t("font.mincho"),
    gothic: t("font.gothic"),
  } as const;
  const docHeadingFontLabels = {
    "same-as-body": t("font.sameAsBody"),
    mincho: uiFontLabels.mincho,
    gothic: uiFontLabels.gothic,
  } as const;
  const documentThemeLabels = {
    "ui-linked": t("displaySettings.documentTheme.uiLinked"),
    "paper-light": t("displaySettings.documentTheme.paperLight"),
    "paper-dark": t("displaySettings.documentTheme.paperDark"),
    bow: t("displaySettings.documentTheme.bow"),
    wob: t("displaySettings.documentTheme.wob"),
    "soft-neutral": t("displaySettings.documentTheme.softNeutral"),
  } as const;
  const appTitlePresetLabels = {
    ...APP_TITLE_PRESET_LABELS,
    custom: t("displaySettings.appTitlePreset.custom"),
  };

  const headingAlignLabels: Record<HeadingAlign, string> =
    writingMode === "horizontal-tb"
      ? {
          start: t("displaySettings.align.left"),
          center: t("displaySettings.align.center"),
          end: t("displaySettings.align.right"),
        }
      : {
          start: t("displaySettings.align.top"),
          center: t("displaySettings.align.center"),
          end: t("displaySettings.align.bottom"),
        };
  const currentDocHeadingAlign: HeadingAlign =
    writingMode === "horizontal-tb"
      ? displaySettings.headingAlignHorizontal
      : displaySettings.headingAlignVertical;
  const setDocHeadingAlign = (value: HeadingAlign) => {
    if (writingMode === "horizontal-tb") onSetHeadingAlignHorizontal(value);
    else onSetHeadingAlignVertical(value);
  };

  return (
    <div ref={overlayRef} className="prompt-overlay" onClick={onClose}>
      <section
        className="display-settings-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-title">{t("displaySettings.title")}</div>

        <div className="settings-scroll-container">
          {/* ── Section 1: 基本 ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.basic")}
              icon={IconAdjustmentsHorizontal}
              isOpen={sectionOpenState.basic}
              onToggle={() => toggleSection("basic")}
            />
            {sectionOpenState.basic && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("settings.uiLanguageMode")}
                    </div>
                    {uiLanguageMode === "mixed" && (
                      <div className="setting-item-desc">
                        {t("settings.uiLanguageMode.option.mixed", "helper")}
                      </div>
                    )}
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={uiLanguageMode}
                      onChange={(e) =>
                        onUiLanguageModeChange(e.target.value as UiLanguageMode)
                      }
                    >
                      <option value="ja">
                        {formatNativeSelectOptionLabel(
                          t("settings.uiLanguageMode.option.ja"),
                          uiLanguageMode === "ja",
                          platform,
                        )}
                      </option>
                      <option value="en">
                        {formatNativeSelectOptionLabel(
                          t("settings.uiLanguageMode.option.en"),
                          uiLanguageMode === "en",
                          platform,
                        )}
                      </option>
                      <option value="mixed">
                        {formatNativeSelectOptionLabel(
                          t("settings.uiLanguageMode.option.mixed"),
                          uiLanguageMode === "mixed",
                          platform,
                        )}
                      </option>
                    </select>
                  </div>
                </div>

                <DisplayNumberSlider
                  label={t("displaySettings.fontSize")}
                  min={14}
                  max={36}
                  step={1}
                  value={displaySettings.fontSize}
                  valueText={`${displaySettings.fontSize}px`}
                  onChange={(value) =>
                    onSetDisplayNumber("fontSize", value, 14, 36)
                  }
                />

                <DisplayNumberSlider
                  label={t("displaySettings.lineHeight")}
                  min={1.2}
                  max={2.8}
                  step={0.05}
                  value={displaySettings.lineHeight}
                  valueText={displaySettings.lineHeight.toFixed(2)}
                  onChange={(value) =>
                    onSetDisplayNumber("lineHeight", value, 1.2, 2.8)
                  }
                />
              </div>
            )}
          </div>

          {/* ── Section: 文書タイプ別の既定表示方向 ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.writingDirection")}
              icon={IconColumns}
              isOpen={sectionOpenState.writingDirection}
              onToggle={() => toggleSection("writingDirection")}
            />
            {sectionOpenState.writingDirection && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.section.writingDirection")}
                    </div>
                    <div className="setting-item-desc">
                      {t("displaySettings.section.writingDirection", "helper")}
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.writingDirection.novel")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={documentTypeWritingModeDefaults.novel}
                      onChange={(e) =>
                        onChangeDocumentTypeWritingModeDefault({
                          novel: e.target.value as WritingMode,
                        })
                      }
                    >
                      <option value="vertical-rl">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.writingDirection.option.vertical"),
                          documentTypeWritingModeDefaults.novel === "vertical-rl",
                          platform,
                        )}
                      </option>
                      <option value="horizontal-tb">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.writingDirection.option.horizontal"),
                          documentTypeWritingModeDefaults.novel === "horizontal-tb",
                          platform,
                        )}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.writingDirection.article")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={documentTypeWritingModeDefaults.article}
                      onChange={(e) =>
                        onChangeDocumentTypeWritingModeDefault({
                          article: e.target.value as WritingMode,
                        })
                      }
                    >
                      <option value="horizontal-tb">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.writingDirection.option.horizontal"),
                          documentTypeWritingModeDefaults.article === "horizontal-tb",
                          platform,
                        )}
                      </option>
                      <option value="vertical-rl">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.writingDirection.option.vertical"),
                          documentTypeWritingModeDefaults.article === "vertical-rl",
                          platform,
                        )}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.writingDirection.unset")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={documentTypeWritingModeDefaults.unset}
                      onChange={(e) =>
                        onChangeDocumentTypeWritingModeDefault({
                          unset: e.target.value as WritingMode,
                        })
                      }
                    >
                      <option value="vertical-rl">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.writingDirection.option.vertical"),
                          documentTypeWritingModeDefaults.unset === "vertical-rl",
                          platform,
                        )}
                      </option>
                      <option value="horizontal-tb">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.writingDirection.option.horizontal"),
                          documentTypeWritingModeDefaults.unset === "horizontal-tb",
                          platform,
                        )}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 2: TCY ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.tcy")}
              icon={IconNumbers}
              isOpen={sectionOpenState.tcy}
              onToggle={() => toggleSection("tcy")}
            />
            {sectionOpenState.tcy && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-desc">
                      {t("displaySettings.section.tcy", "helper")}
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.autoTcy")}
                    </div>
                    <div className="setting-item-desc">
                      {t("displaySettings.autoTcy", "helper")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <label className="setting-checkbox-label">
                      <input
                        type="checkbox"
                        checked={displaySettings.autoTcyEnabled}
                        onChange={(e) =>
                          onAutoTcyEnabledChange(e.target.checked)
                        }
                      />
                      {t("displaySettings.autoTcyVerticalWysiwyg")}
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.autoTcyTarget")}
                    </div>
                    <div className="setting-item-desc">
                      {t("displaySettings.autoTcyTarget", "helper")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <label className="setting-checkbox-label">
                      <input
                        type="checkbox"
                        checked={displaySettings.autoTcyNumbersOnly}
                        disabled={!displaySettings.autoTcyEnabled}
                        onChange={(e) =>
                          onAutoTcyNumbersOnlyChange(e.target.checked)
                        }
                      />
                      {t("displaySettings.autoTcyDigitsOnly")}
                    </label>
                  </div>
                </div>

                <DisplayNumberSlider
                  label={t("displaySettings.minDigits")}
                  min={1}
                  max={4}
                  step={1}
                  value={displaySettings.autoTcyMinDigits}
                  valueText={String(displaySettings.autoTcyMinDigits)}
                  description={t("displaySettings.minDigits", "helper")}
                  disabled={!displaySettings.autoTcyEnabled}
                  onChange={(value) =>
                    onSetDisplayNumber("autoTcyMinDigits", value, 1, 4)
                  }
                />

                <DisplayNumberSlider
                  label={t("displaySettings.maxDigits")}
                  min={1}
                  max={4}
                  step={1}
                  value={displaySettings.autoTcyMaxDigits}
                  valueText={String(displaySettings.autoTcyMaxDigits)}
                  disabled={!displaySettings.autoTcyEnabled}
                  onChange={(value) =>
                    onSetDisplayNumber("autoTcyMaxDigits", value, 1, 4)
                  }
                />
              </div>
            )}
          </div>

          {/* ── Section 3: フォント ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.font")}
              icon={IconTypography}
              isOpen={sectionOpenState.font}
              onToggle={() => toggleSection("font")}
            />
            {sectionOpenState.font && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.documentFont")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="setting-options">
                      {(["mincho", "gothic"] as const).map((value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="docFontPresetSelector"
                            checked={effectiveDocFontPreset === value}
                            onChange={() => {
                              onSelectedFontChange(null);
                              onDocFontPresetChange(value);
                            }}
                          />
                          {uiFontLabels[value]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="font-register-section">
                  <div className="font-register-heading">
                    {t("displaySettings.customFonts")}
                  </div>
                  <div className="font-register-input-row">
                    <input
                      type="text"
                      className="font-register-input"
                      placeholder={t("displaySettings.fontNamePlaceholder")}
                      value={fontInput}
                      onChange={(e) => setFontInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddFont();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={handleAddFont}
                      disabled={!fontInput.trim()}
                    >
                      {t("common.register")}
                    </button>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={handleFetchSystemFonts}
                      disabled={systemFontsLoading}
                    >
                      {systemFontsLoading
                        ? t("displaySettings.fetchingSystemFonts")
                        : t("displaySettings.fetchSystemFonts")}
                    </button>
                  </div>

                  {registeredFonts.length > 0 && (
                    <div className="registered-font-list">
                      {registeredFonts.map((font) => (
                        <div
                          key={font}
                          className={`registered-font-item${draggingFont === font ? " is-dragging" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            setDraggingFont(font);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", font);
                          }}
                          onDragEnd={() => setDraggingFont(null)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDropOnFont(font);
                            setDraggingFont(null);
                          }}
                        >
                          <span className="font-drag-handle" aria-hidden="true">
                            ::
                          </span>
                          <label className="registered-font-item-label">
                            <input
                              type="radio"
                              name="selectedFontSelector"
                              checked={
                                effectiveDocFontPreset === `custom:${font}`
                              }
                              onChange={() => {
                                onSelectedFontChange(null);
                                onDocFontPresetChange(
                                  `custom:${font}` as DocumentFontPreset,
                                );
                              }}
                            />
                            <span style={{ fontFamily: font }}>{font}</span>
                          </label>
                          <button
                            type="button"
                            className="font-remove-btn"
                            onClick={() => handleRemoveFont(font)}
                            title={t("common.remove")}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {systemFonts !== null && (
                    <div className="system-font-list">
                      <div className="system-font-list-header">
                        <span>
                          {t("displaySettings.systemFonts")}（{systemFonts.length}
                          件）
                        </span>
                        <button
                          type="button"
                          className="font-remove-btn"
                          onClick={() => setSystemFonts(null)}
                          title={t("common.close")}
                        >
                          ×
                        </button>
                      </div>
                      <div className="system-font-list-scroll">
                        {systemFonts.map((font) => (
                          <button
                            key={font}
                            type="button"
                            className={`system-font-item${registeredFonts.includes(font) ? " already-registered" : ""}`}
                            onClick={() => handleAddSystemFont(font)}
                            disabled={registeredFonts.includes(font)}
                          >
                            <span style={{ fontFamily: font }}>{font}</span>
                            {registeredFonts.includes(font) && (
                              <span className="system-font-registered-badge">
                                {t("displaySettings.registered")}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 4: ルビ ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.ruby")}
              icon={IconDiamond}
              isOpen={sectionOpenState.ruby}
              onToggle={() => toggleSection("ruby")}
            />
            {sectionOpenState.ruby && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.rubySize")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={0.3}
                        max={1.2}
                        step={0.05}
                        value={displaySettings.rubySize}
                        onChange={(e) =>
                          onSetDisplayNumber(
                            "rubySize",
                            Number(e.target.value),
                            0.3,
                            1.2,
                          )
                        }
                      />
                      <span className="slider-value">
                        {displaySettings.rubySize.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.rubyOffset")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={-1.5}
                        max={1.5}
                        step={0.05}
                        value={displaySettings.rubyOffset}
                        onChange={(e) =>
                          onSetDisplayNumber(
                            "rubyOffset",
                            Number(e.target.value),
                            -1.5,
                            1.5,
                          )
                        }
                      />
                      <span className="slider-value">
                        {displaySettings.rubyOffset.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 5: 見出し設定 ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.heading")}
              icon={IconHeading}
              isOpen={sectionOpenState.heading}
              onToggle={() => toggleSection("heading")}
            />
            {sectionOpenState.heading && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.headingFont")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={docHeadingFont}
                      onChange={(e) =>
                        onDocHeadingFontChange(
                          e.target.value as DocumentHeadingFont,
                        )
                      }
                    >
                      <option value="same-as-body">
                        {formatNativeSelectOptionLabel(
                          docHeadingFontLabels["same-as-body"],
                          docHeadingFont === "same-as-body",
                          platform,
                        )}
                      </option>
                      <option value="mincho">
                        {formatNativeSelectOptionLabel(
                          docHeadingFontLabels.mincho,
                          docHeadingFont === "mincho",
                          platform,
                        )}
                      </option>
                      <option value="gothic">
                        {formatNativeSelectOptionLabel(
                          docHeadingFontLabels.gothic,
                          docHeadingFont === "gothic",
                          platform,
                        )}
                      </option>
                      {isCustomHeadingFont && !hasHeadingCustomFontOption && (
                        <option value={docHeadingFont}>
                          {formatNativeSelectOptionLabel(
                            headingCustomFontName ?? "",
                            Boolean(
                              headingCustomFontName !== null &&
                                isCustomHeadingFont &&
                                !hasHeadingCustomFontOption,
                            ),
                            platform,
                          )}
                        </option>
                      )}
                      {registeredFonts.map((font) => (
                        <option key={font} value={`custom:${font}`}>
                          {formatNativeSelectOptionLabel(
                            font,
                            docHeadingFont === `custom:${font}`,
                            platform,
                          )}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.headingColor")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="color-control">
                      <input
                        type="color"
                        value={docColorSettings.headingColor}
                        onChange={(e) =>
                          onDocColorSettingsChange({
                            ...docColorSettings,
                            headingColor: e.target.value,
                          })
                        }
                      />
                      <span className="color-hex">
                        {docColorSettings.headingColor}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={() =>
                        onDocColorSettingsChange({
                          ...docColorSettings,
                          headingColor: docColorSettings.textColor,
                        })
                      }
                    >
                      {t("displaySettings.resetToBodyColor")}
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.headingAlign")}
                    </div>
                    <div className="setting-item-desc">
                      {writingMode === "horizontal-tb"
                        ? t("displaySettings.headingAlignHorizontal")
                        : t("displaySettings.headingAlignVertical")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="setting-options">
                      {(["start", "center", "end"] as const).map((value) => (
                        <label key={value}>
                          <input
                            type="radio"
                            name="docHeadingAlign"
                            checked={currentDocHeadingAlign === value}
                            onChange={() => setDocHeadingAlign(value)}
                          />
                          {headingAlignLabels[value]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.headingMarginAfter")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={0}
                        max={1.5}
                        step={0.05}
                        value={displaySettings.headingMarginAfter}
                        onChange={(e) =>
                          onSetDisplayNumber(
                            "headingMarginAfter",
                            Number(e.target.value),
                            0,
                            1.5,
                          )
                        }
                      />
                      <span className="slider-value">
                        {displaySettings.headingMarginAfter.toFixed(2)}em
                      </span>
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.headingDividers")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="setting-options">
                      {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map(
                        (level) => (
                          <label key={level}>
                            <input
                              type="checkbox"
                              checked={
                                displaySettings.headingDividerLevels[level]
                              }
                              onChange={(e) =>
                                onSetHeadingDividerLevel(
                                  level,
                                  e.target.checked,
                                )
                              }
                            />
                            {level.toUpperCase()}
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 6: 余白設定 ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.spacing")}
              icon={IconArrowsMoveHorizontal}
              isOpen={sectionOpenState.spacing}
              onToggle={() => toggleSection("spacing")}
            />
            {sectionOpenState.spacing && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.paddingTop")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={0}
                        max={paddingTopUiMax}
                        step={1}
                        value={paddingTopUiValue}
                        onChange={(e) =>
                          onSetDisplayNumber(
                            "paddingTop",
                            Number(e.target.value) + TOP_PADDING_BASE,
                            TOP_PADDING_BASE,
                            120,
                          )
                        }
                      />
                      <span className="slider-value">
                        {paddingTopUiValue}px
                      </span>
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.paddingBottom")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={8}
                        max={120}
                        step={1}
                        value={displaySettings.paddingBottom}
                        onChange={(e) =>
                          onSetDisplayNumber(
                            "paddingBottom",
                            Number(e.target.value),
                            8,
                            120,
                          )
                        }
                      />
                      <span className="slider-value">
                        {displaySettings.paddingBottom}px
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 7: タイトル・著者表示 ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.frontmatter")}
              icon={IconFileText}
              isOpen={sectionOpenState.frontmatter}
              onToggle={() => toggleSection("frontmatter")}
            />
            {sectionOpenState.frontmatter && (
              <div className="settings-section-body">
                <div className="settings-subsection settings-subsection-frontmatter-standalone">
                  <div className="setting-item setting-item-subheading">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.frontmatter.standalone.heading")}
                      </div>
                      <div className="setting-item-desc">
                        {t("displaySettings.frontmatter.standalone.heading", "helper")}
                      </div>
                    </div>
                  </div>
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={frontmatterVisible}
                      onChange={(e) =>
                        onFrontmatterVisibleChange(e.target.checked)
                      }
                    />
                    <span>{t("displaySettings.frontmatterVisible")}</span>
                  </label>
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={frontmatterShowAuthors}
                      disabled={!frontmatterVisible}
                      onChange={(e) =>
                        onFrontmatterShowAuthorsChange(e.target.checked)
                      }
                    />
                    <span>{t("displaySettings.frontmatterAuthors")}</span>
                  </label>
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={frontmatterShowTranslators}
                      disabled={!frontmatterVisible}
                      onChange={(e) =>
                        onFrontmatterShowTranslatorsChange(e.target.checked)
                      }
                    />
                    <span>{t("displaySettings.frontmatterTranslators")}</span>
                  </label>
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={frontmatterShowRoleLabels}
                      disabled={!frontmatterVisible}
                      onChange={(e) =>
                        onFrontmatterShowRoleLabelsChange(e.target.checked)
                      }
                    />
                    <span>{t("displaySettings.frontmatterRoleLabels")}</span>
                  </label>
                </div>

                <div className="settings-subsection settings-subsection-frontmatter-project">
                  <div className="setting-item setting-item-subheading">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.frontmatter.project.heading")}
                      </div>
                      <div className="setting-item-desc">
                        {t("displaySettings.frontmatter.project.heading", "helper")}
                      </div>
                    </div>
                  </div>
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={frontmatterShowInProjectFiles}
                      disabled={!frontmatterVisible}
                      onChange={(e) =>
                        onFrontmatterShowInProjectFilesChange(e.target.checked)
                      }
                    />
                    <span>
                      {t("displaySettings.frontmatterShowInProjectFiles")}
                    </span>
                  </label>
                  <label className="settings-toggle-row settings-toggle-row-nested">
                    <input
                      type="checkbox"
                      checked={frontmatterProjectShowTitle}
                      disabled={!frontmatterVisible || !frontmatterShowInProjectFiles}
                      onChange={(e) =>
                        onFrontmatterProjectShowTitleChange(e.target.checked)
                      }
                    />
                    <span>
                      {t("displaySettings.frontmatterProjectShowTitle")}
                    </span>
                  </label>
                  <label className="settings-toggle-row settings-toggle-row-nested">
                    <input
                      type="checkbox"
                      checked={frontmatterProjectShowAuthors}
                      disabled={!frontmatterVisible || !frontmatterShowInProjectFiles}
                      onChange={(e) =>
                        onFrontmatterProjectShowAuthorsChange(e.target.checked)
                      }
                    />
                    <span>
                      {t("displaySettings.frontmatterProjectShowAuthors")}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 8: UIテーマ ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.uiTheme")}
              icon={IconDeviceImacHeart}
              isOpen={sectionOpenState.uiTheme}
              onToggle={() => toggleSection("uiTheme")}
            />
            {sectionOpenState.uiTheme && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.select")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <ThemeSwatchSelect
                      ariaLabel={t("displaySettings.section.uiTheme")}
                      value={selectedUiThemeValue}
                      onChange={handleUiThemeSelect}
                      options={flatUiThemePresets.map((preset) => ({
                        value: preset.value,
                        label: preset.label,
                        swatches: preset.swatches,
                        kind: "system",
                      }))}
                      groups={
                        customUiThemePresets.length > 0
                          ? [
                              {
                                label: t("common.custom"),
                                options: customUiThemePresets.map(
                                  (preset): ThemeSwatchOption => ({
                                    value: `preset:${preset.id}`,
                                    label: preset.name,
                                    swatches: getUiPresetSwatches(preset),
                                    kind: "custom",
                                  }),
                                ),
                              },
                            ]
                          : undefined
                      }
                    />
                  </div>
                </div>
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.uiFont")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={uiFont}
                      onChange={(e) => onUiFontChange(e.target.value as UiFont)}
                    >
                      <option value="mincho">
                        {formatNativeSelectOptionLabel(
                          uiFontLabels.mincho,
                          uiFont === "mincho",
                          platform,
                        )}
                      </option>
                      <option value="gothic">
                        {formatNativeSelectOptionLabel(
                          uiFontLabels.gothic,
                          uiFont === "gothic",
                          platform,
                        )}
                      </option>
                      {isCustomUiFont && !hasUiCustomFontOption && (
                        <option value={uiFont}>
                          {formatNativeSelectOptionLabel(
                            uiCustomFontName ?? "",
                            Boolean(
                              uiCustomFontName !== null &&
                                isCustomUiFont &&
                                !hasUiCustomFontOption,
                            ),
                            platform,
                          )}
                        </option>
                      )}
                      {registeredFonts.map((font) => (
                        <option key={font} value={`custom:${font}`}>
                          {formatNativeSelectOptionLabel(
                            font,
                            uiFont === `custom:${font}`,
                            platform,
                          )}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={() =>
                        onUiFontChange(UI_THEME_FONT_PRESETS[theme])
                      }
                    >
                      {t("common.resetToThemeDefault")}
                    </button>
                  </div>
                </div>
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.uiTextColor")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="color-control">
                      <input
                        type="color"
                        value={effectiveUiTextPrimary}
                        onChange={(e) => onUiTextPrimaryChange(e.target.value)}
                      />
                      <span className="color-hex">
                        {effectiveUiTextPrimary}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={() => onUiTextPrimaryChange(null)}
                    >
                      {t("common.resetToThemeColor")}
                    </button>
                  </div>
                </div>
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.uiFontScale")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={0.9}
                        max={1.3}
                        step={0.05}
                        value={uiFontScale}
                        onChange={(e) =>
                          onUiFontScaleChange(Number(e.target.value))
                        }
                      />
                      <span className="slider-value">
                        {uiFontScale.toFixed(2)}x
                      </span>
                    </div>
                  </div>
                </div>
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.themeManagement")}
                    </div>
                    <div className="setting-item-desc">
                      {t("displaySettings.themeManagement", "helper")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={onOpenThemeStudio}
                    >
                      {t("displaySettings.openThemeStudio")}
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.appTitleVisible")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <label className="setting-checkbox-label">
                      <input
                        type="checkbox"
                        checked={appTitleVisible}
                        onChange={(e) =>
                          onAppTitleVisibleChange(e.target.checked)
                        }
                      />
                      {t("common.show")}
                    </label>
                  </div>
                </div>

                {appTitleVisible && (
                  <>
                    <div className="setting-item">
                      <div className="setting-item-info">
                        <div className="setting-item-name">
                          {t("displaySettings.appTitlePreset")}
                        </div>
                      </div>
                      <div className="setting-item-control">
                        <select
                          className="setting-select"
                          value={appTitlePreset}
                          onChange={(e) =>
                            onAppTitlePresetChange(
                              e.target.value as AppTitlePreset,
                            )
                          }
                        >
                          {(
                            [
                              "nyoze",
                              "nyoze-upper",
                              "nyoze-kanji",
                              "custom",
                            ] as const
                          ).map((preset) => (
                            <option key={preset} value={preset}>
                              {formatNativeSelectOptionLabel(
                                appTitlePresetLabels[preset],
                                appTitlePreset === preset,
                                platform,
                              )}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {appTitlePreset === "custom" && (
                      <div className="setting-item">
                        <div className="setting-item-info">
                          <div className="setting-item-name">
                            {t("displaySettings.appTitleCustom")}
                          </div>
                        </div>
                        <div className="setting-item-control">
                          <input
                            type="text"
                            className="setting-text-input"
                            value={appTitleCustom}
                            placeholder={t("displaySettings.appTitlePlaceholder")}
                            onChange={(e) =>
                              onAppTitleCustomChange(e.target.value)
                            }
                          />
                          <span className="slider-value">
                            {appTitleCustomWidth}/{APP_TITLE_CUSTOM_MAX_LENGTH}
                            （半角20/全角10目安）
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="setting-item">
                      <div className="setting-item-info">
                        <div className="setting-item-name">
                          {t("displaySettings.appTitleColor")}
                        </div>
                      </div>
                      <div className="setting-item-control">
                        <div className="color-control">
                          <input
                            type="color"
                            value={effectiveAppTitleColor}
                            onChange={(e) =>
                              onAppTitleColorChange(e.target.value)
                            }
                          />
                          <span className="color-hex">
                            {effectiveAppTitleColor}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="font-register-btn"
                          onClick={() => onAppTitleColorChange(null)}
                        >
                          {t("common.resetToThemeColor")}
                        </button>
                      </div>
                    </div>

                    <div className="setting-item">
                      <div className="setting-item-info">
                        <div className="setting-item-name">
                          {t("displaySettings.appTitleFont")}
                        </div>
                      </div>
                      <div className="setting-item-control">
                        <select
                          className="setting-select"
                          value={appTitleFont}
                          onChange={(e) =>
                            onAppTitleFontChange(e.target.value as AppTitleFont)
                          }
                        >
                          <option value="ui-default">
                            {formatNativeSelectOptionLabel(
                              t("displaySettings.sameAsUiFont"),
                              appTitleFont === "ui-default",
                              platform,
                            )}
                          </option>
                          <option value="mincho">
                            {formatNativeSelectOptionLabel(
                              uiFontLabels.mincho,
                              appTitleFont === "mincho",
                              platform,
                            )}
                          </option>
                          <option value="gothic">
                            {formatNativeSelectOptionLabel(
                              uiFontLabels.gothic,
                              appTitleFont === "gothic",
                              platform,
                            )}
                          </option>
                          {isCustomAppTitleFont &&
                            !hasAppTitleCustomFontOption && (
                              <option value={appTitleFont}>
                                {formatNativeSelectOptionLabel(
                                  appTitleCustomFontName ?? "",
                                  Boolean(
                                    appTitleCustomFontName !== null &&
                                      isCustomAppTitleFont &&
                                      !hasAppTitleCustomFontOption,
                                  ),
                                  platform,
                                )}
                              </option>
                            )}
                          {registeredFonts.map((font) => (
                            <option key={font} value={`custom:${font}`}>
                              {formatNativeSelectOptionLabel(
                                font,
                                appTitleFont === `custom:${font}`,
                                platform,
                              )}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Section 9: ツールバー ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.toolbar")}
              icon={IconTool}
              isOpen={sectionOpenState.toolbar}
              onToggle={() => toggleSection("toolbar")}
            />
            {sectionOpenState.toolbar && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.toolbarIconColor")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="color-control">
                      <input
                        type="color"
                        value={effectiveToolbarIconColor}
                        onChange={(e) =>
                          onToolbarIconColorChange(e.target.value)
                        }
                      />
                      <span className="color-hex">
                        {effectiveToolbarIconColor}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={() => onToolbarIconColorChange(null)}
                    >
                      {t("displaySettings.resetToNormalColor")}
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.toolbarIconStroke")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={MIN_TOOLBAR_ICON_STROKE}
                        max={MAX_TOOLBAR_ICON_STROKE}
                        step={0.05}
                        value={toolbarIconStroke}
                        onChange={(e) =>
                          onToolbarIconStrokeChange(Number(e.target.value))
                        }
                      />
                      <span className="slider-value">
                        {toolbarIconStroke.toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={() =>
                        onToolbarIconStrokeChange(DEFAULT_TOOLBAR_ICON_STROKE)
                      }
                    >
                      {t("common.resetToDefault")}
                    </button>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.toolbarScale")}
                    </div>
                    <div className="setting-item-desc">
                      トップバー内に収まる範囲で調整します
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="slider-control">
                      <input
                        type="range"
                        min={MIN_TOOLBAR_SCALE}
                        max={MAX_TOOLBAR_SCALE}
                        step={0.05}
                        value={toolbarScale}
                        onChange={(e) =>
                          onToolbarScaleChange(Number(e.target.value))
                        }
                      />
                      <span className="slider-value">
                        {toolbarScale.toFixed(2)}x
                      </span>
                    </div>
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={() =>
                        onToolbarScaleChange(DEFAULT_TOOLBAR_SCALE)
                      }
                    >
                      {t("common.resetToDefault")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section 11: 文書テーマ ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.documentTheme")}
              icon={IconHighlight}
              isOpen={sectionOpenState.documentTheme}
              onToggle={() => toggleSection("documentTheme")}
            />
            {sectionOpenState.documentTheme && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.select")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <ThemeSwatchSelect
                      ariaLabel={t("displaySettings.section.documentTheme")}
                      value={selectedDocThemeValue}
                      onChange={handleDocumentThemeSelect}
                      options={[
                        ...(
                          [
                            "ui-linked",
                            "paper-light",
                            "paper-dark",
                            "bow",
                            "wob",
                            "soft-neutral",
                          ] as const
                        ).map(
                          (value): ThemeSwatchOption => ({
                            value: `theme:${value}`,
                            label: documentThemeLabels[value],
                            swatches: getDocumentThemeSwatches(
                              value,
                              theme,
                              activeUiPreset,
                            ),
                            kind: "system",
                          }),
                        ),
                        ...bundledDocThemePresets.map(
                          (preset): ThemeSwatchOption => ({
                            value: `preset:${preset.id}`,
                            label: preset.name,
                            swatches: getDocumentPresetSwatches(preset),
                            kind: "system",
                          }),
                        ),
                      ]}
                      groups={
                        customDocThemePresets.length > 0
                          ? [
                              {
                                label: t("common.custom"),
                                options: customDocThemePresets.map(
                                  (preset): ThemeSwatchOption => ({
                                    value: `preset:${preset.id}`,
                                    label: preset.name,
                                    swatches: getDocumentPresetSwatches(preset),
                                    kind: "custom",
                                  }),
                                ),
                              },
                            ]
                          : undefined
                      }
                    />
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.pageColor")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="color-control">
                      <input
                        type="color"
                        value={docColorSettings.pageColor}
                        onChange={(e) =>
                          onDocColorSettingsChange({
                            ...docColorSettings,
                            pageColor: e.target.value,
                          })
                        }
                      />
                      <span className="color-hex">
                        {docColorSettings.pageColor}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.bodyColor")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <div className="color-control">
                      <input
                        type="color"
                        value={docColorSettings.textColor}
                        onChange={(e) =>
                          onDocColorSettingsChange({
                            ...docColorSettings,
                            textColor: e.target.value,
                          })
                        }
                      />
                      <span className="color-hex">
                        {docColorSettings.textColor}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Section: キャレット ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.caret")}
              icon={IconCursorText}
              isOpen={sectionOpenState.caret}
              onToggle={() => toggleSection("caret")}
            />
            {sectionOpenState.caret && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.caretColor")}
                    </div>
                    <div className="setting-item-desc">
                      カーソル（キャレット）の色を指定します
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={caretColorMode}
                      onChange={(e) =>
                        onCaretColorModeChange(
                          e.target.value as CaretColorMode,
                        )
                      }
                    >
                      <option value="auto">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.caretColorAuto"),
                          caretColorMode === "auto",
                          platform,
                        )}
                      </option>
                      <option value="highlight">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.caretColorHighlight"),
                          caretColorMode === "highlight",
                          platform,
                        )}
                      </option>
                      <option value="custom">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.caretColorCustom"),
                          caretColorMode === "custom",
                          platform,
                        )}
                      </option>
                    </select>
                  </div>
                </div>

                {caretColorMode === "custom" && (
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.caretColorCustomValue")}
                      </div>
                    </div>
                    <div className="setting-item-control">
                      <div className="color-control">
                        <input
                          type="color"
                          value={caretColorCustom ?? "#1a1a1a"}
                          onChange={(e) =>
                            onCaretColorCustomChange(e.target.value)
                          }
                        />
                        <span className="color-hex">
                          {caretColorCustom ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="setting-item">
                  <div className="setting-item-info">
                    <label className="setting-checkbox-label">
                      <input
                        type="checkbox"
                        checked={pseudoCaretEnabled}
                        onChange={(e) =>
                          onPseudoCaretEnabledChange(e.target.checked)
                        }
                      />
                      {t("displaySettings.pseudoCaret.enabled")}
                    </label>
                    <div className="setting-item-desc">
                      {t("displaySettings.pseudoCaret.heading", "helper")}
                    </div>
                  </div>
                </div>
                <DisplayNumberSlider
                  label={t("displaySettings.pseudoCaret.thickness")}
                  value={pseudoCaretThickness}
                  min={PSEUDO_CARET_THICKNESS_MIN}
                  max={PSEUDO_CARET_THICKNESS_MAX}
                  step={PSEUDO_CARET_THICKNESS_STEP}
                  valueText={`${pseudoCaretThickness}px`}
                  description={t("displaySettings.pseudoCaret.thickness", "helper")}
                  disabled={!pseudoCaretEnabled}
                  onChange={onPseudoCaretThicknessChange}
                />
                <div className="setting-item">
                  <div className="setting-item-info">
                    <label className="setting-checkbox-label">
                      <input
                        type="checkbox"
                        checked={pseudoCaretBlinkEnabled}
                        disabled={!pseudoCaretEnabled}
                        onChange={(e) =>
                          onPseudoCaretBlinkEnabledChange(e.target.checked)
                        }
                      />
                      {t("displaySettings.pseudoCaret.blink")}
                    </label>
                    <div className="setting-item-desc">
                      {t("displaySettings.pseudoCaret.blink", "helper")}
                    </div>
                  </div>
                </div>

                {platform === "win32" && (
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.editorArrowPointer")}
                      </div>
                      <div className="setting-item-desc">
                        {t("displaySettings.editorArrowPointer", "helper")}
                      </div>
                    </div>
                    <div className="setting-item-control">
                      <label className="setting-checkbox-label">
                        <input
                          type="checkbox"
                          checked={useEditorArrowPointer}
                          onChange={(e) =>
                            onUseEditorArrowPointerChange(e.target.checked)
                          }
                        />
                        {t("common.enable")}
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paragraph Plain: app-wide behavior (not per-document) */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.paragraphPlain")}
              icon={IconFileText}
              isOpen={sectionOpenState.paragraphPlain}
              onToggle={() => toggleSection("paragraphPlain")}
            />
            {sectionOpenState.paragraphPlain && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.paragraphPlainBehavior")}
                    </div>
                    <div className="setting-item-desc">
                      {t("displaySettings.paragraphPlainBehavior", "helper")}
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <select
                      className="setting-select"
                      value={paragraphPlainBehavior}
                      onChange={(e) =>
                        onParagraphPlainBehaviorChange(
                          e.target.value as ParagraphPlainBehavior,
                        )
                      }
                    >
                      <option value="fast">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.paragraphPlainBehavior.fast"),
                          paragraphPlainBehavior === "fast",
                          platform,
                        )}
                      </option>
                      <option value="comfortable">
                        {formatNativeSelectOptionLabel(
                          t("displaySettings.paragraphPlainBehavior.comfortable"),
                          paragraphPlainBehavior === "comfortable",
                          platform,
                        )}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Typewriter Mode — Typewriter Scroll + Visual Focus */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.typewriter")}
              icon={IconLicense}
              isOpen={sectionOpenState.typewriter}
              onToggle={() => toggleSection("typewriter")}
            />
            {sectionOpenState.typewriter && (
              <div className="settings-section-body">
                <div className="settings-subsection settings-subsection-typewriter-scroll">
                  <div className="setting-item setting-item-subheading">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.typewriter.scrollHeading")}
                      </div>
                      <div className="setting-item-desc">
                        {t("displaySettings.typewriter.scrollHeading", "helper")}
                      </div>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <label className="setting-checkbox-label">
                        <input
                          type="checkbox"
                          checked={typewriterModeEnabled}
                          onChange={(e) =>
                            onTypewriterModeEnabledChange(e.target.checked)
                          }
                        />
                        <IconArrowsVertical size={16} stroke={1.75} aria-hidden />
                        {t("displaySettings.typewriter.enabled")}
                      </label>
                    </div>
                  </div>
                  <DisplayNumberSlider
                    label={t("displaySettings.typewriter.followPosition")}
                    value={typewriterOffsetRatio}
                    min={TYPEWRITER_OFFSET_RATIO_MIN}
                    max={TYPEWRITER_OFFSET_RATIO_MAX}
                    step={0.01}
                    valueText={typewriterOffsetRatio.toFixed(2)}
                    description={t(
                      "displaySettings.typewriter.followPosition",
                      "helper",
                    )}
                    disabled={!typewriterModeEnabled}
                    onChange={onTypewriterOffsetRatioChange}
                  />
                  <DisplayNumberSlider
                    label={t("displaySettings.typewriter.followBandWidth")}
                    value={typewriterFollowBandRatio}
                    min={TYPEWRITER_FOLLOW_BAND_RATIO_MIN}
                    max={TYPEWRITER_FOLLOW_BAND_RATIO_MAX}
                    step={0.01}
                    valueText={typewriterFollowBandRatio.toFixed(2)}
                    description={t(
                      "displaySettings.typewriter.followBandWidth",
                      "helper",
                    )}
                    disabled={!typewriterModeEnabled}
                    onChange={onTypewriterFollowBandRatioChange}
                  />
                </div>

                <div className="settings-subsection settings-subsection-vf-panel">
                  <div className="setting-item setting-item-subheading">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.section.visualFocus")}
                      </div>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <label className="setting-checkbox-label">
                        <input
                          type="checkbox"
                          checked={visualFocusCurrentLineHighlightEnabled}
                          onChange={(e) =>
                            onVisualFocusCurrentLineHighlightEnabledChange(
                              e.target.checked,
                            )
                          }
                        />
                        <IconPencilStar size={16} stroke={1.75} aria-hidden />
                        {t("displaySettings.visualFocus.currentLineHighlight")}
                      </label>
                      <div className="setting-item-desc">
                        {t("displaySettings.visualFocus.currentLineHighlight", "helper")}
                      </div>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.visualFocus.currentLineColor")}
                      </div>
                      <div className="setting-item-desc">
                        {t("displaySettings.visualFocus.currentLineColor", "helper")}
                      </div>
                    </div>
                    <div className="setting-item-control">
                      <div className="color-control">
                        <input
                          type="color"
                          value={expandHexForCurrentLineColorInput(visualFocusCurrentLineHighlightColor)}
                          onChange={(e) =>
                            onVisualFocusCurrentLineHighlightColorChange(e.target.value)
                          }
                          aria-label={t("displaySettings.visualFocus.currentLineColor")}
                        />
                        <span className="color-hex">
                          {expandHexForCurrentLineColorInput(visualFocusCurrentLineHighlightColor)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <DisplayNumberSlider
                    label={t("displaySettings.visualFocus.currentLineOpacity")}
                    value={visualFocusCurrentLineHighlightOpacity}
                    min={0}
                    max={1}
                    step={0.05}
                    valueText={`${Math.round(visualFocusCurrentLineHighlightOpacity * 100)}%`}
                    description={t(
                      "displaySettings.visualFocus.currentLineOpacity",
                      "helper",
                    )}
                    onChange={onVisualFocusCurrentLineHighlightOpacityChange}
                  />
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <label className="setting-checkbox-label">
                        <input
                          type="checkbox"
                          checked={visualFocusBlockHighlightEnabled}
                          onChange={(e) =>
                            onVisualFocusBlockHighlightEnabledChange(
                              e.target.checked,
                            )
                          }
                        />
                        <IconAlignBoxLeftMiddle size={16} stroke={1.75} aria-hidden />
                        {t("displaySettings.visualFocus.editBlockHighlight")}
                      </label>
                      <div className="setting-item-desc">
                        {t("displaySettings.visualFocus.editBlockHighlight", "helper")}
                      </div>
                    </div>
                  </div>
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.visualFocus.blockHighlightColor")}
                      </div>
                      <div className="setting-item-desc">
                        {t("displaySettings.visualFocus.blockHighlightColor", "helper")}
                      </div>
                    </div>
                    <div className="setting-item-control">
                      <div className="color-control">
                        <input
                          type="color"
                          value={expandHexForColorInput(visualFocusBlockHighlightColor)}
                          onChange={(e) =>
                            onVisualFocusBlockHighlightColorChange(e.target.value)
                          }
                          aria-label={t("displaySettings.visualFocus.blockHighlightColor")}
                        />
                        <span className="color-hex">
                          {expandHexForColorInput(visualFocusBlockHighlightColor)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <DisplayNumberSlider
                    label={t("displaySettings.visualFocus.blockHighlightOpacity")}
                    value={visualFocusBlockHighlightOpacity}
                    min={0}
                    max={1}
                    step={0.05}
                    valueText={`${Math.round(visualFocusBlockHighlightOpacity * 100)}%`}
                    description={t(
                      "displaySettings.visualFocus.blockHighlightOpacity",
                      "helper",
                    )}
                    onChange={onVisualFocusBlockHighlightOpacityChange}
                  />
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <label className="setting-checkbox-label">
                        <input
                          type="checkbox"
                          checked={visualFocusDimNonFocusedBlocksEnabled}
                          onChange={(e) =>
                            onVisualFocusDimNonFocusedBlocksEnabledChange(
                              e.target.checked,
                            )
                          }
                        />
                        <IconShadowOff size={16} stroke={1.75} aria-hidden />
                        {t("displaySettings.visualFocus.dimNonFocusedBlocks")}
                      </label>
                      <div className="setting-item-desc">
                        {t("displaySettings.visualFocus.dimNonFocusedBlocks", "helper")}
                      </div>
                    </div>
                  </div>
                  <DisplayNumberSlider
                    label={t("displaySettings.visualFocus.dimNonFocusedOpacity")}
                    value={visualFocusDimNonFocusedBlocksOpacity}
                    min={0}
                    max={1}
                    step={0.05}
                    valueText={`${Math.round(visualFocusDimNonFocusedBlocksOpacity * 100)}%`}
                    description={t(
                      "displaySettings.visualFocus.dimNonFocusedOpacity",
                      "helper",
                    )}
                    onChange={onVisualFocusDimNonFocusedBlocksOpacityChange}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Section 12: サポート ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.support")}
              icon={IconThumbUp}
              isOpen={sectionOpenState.support}
              onToggle={() => toggleSection("support")}
            />
            {sectionOpenState.support && (
              <div className="settings-section-body">
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.support.bugReport")}
                    </div>
                    <div className="setting-item-desc">
                      不具合報告フォームを開きます
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={onSendBugReport}
                    >
                      {t("displaySettings.support.reportBug")}
                    </button>
                  </div>
                </div>
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.support.feedback")}
                    </div>
                    <div className="setting-item-desc">
                      感想・要望のフィードバックフォームを開きます
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={onSendFeedback}
                    >
                      {t("displaySettings.support.sendFeedback")}
                    </button>
                  </div>
                </div>
                {!isWindowsStoreBuild && (
                  <div className="setting-item">
                    <div className="setting-item-info">
                      <div className="setting-item-name">
                        {t("displaySettings.support.updateCheck")}
                      </div>
                      <div className="setting-item-desc">
                        GitHub Releases の公開版を確認します
                        <br />
                        ※主に GitHub zip 版など、Store 版以外の更新確認向けです
                      </div>
                    </div>
                    <div className="setting-item-control">
                      <button
                        type="button"
                        className="font-register-btn"
                        onClick={() => void handleCheckForUpdate()}
                        disabled={updateCheckLoading}
                      >
                        {updateCheckLoading
                          ? t("displaySettings.support.checking")
                          : t("displaySettings.support.checkNow")}
                      </button>
                      {updateCheckResult && (
                        <span className="slider-value">{updateCheckResult}</span>
                      )}
                    </div>
                  </div>
                )}
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.support.repository")}
                    </div>
                    <div className="setting-item-desc">
                      ソースコードと GitHub 配布ページを開きます
                      <br />
                      ※Microsoft Store 版は Store アプリのライブラリから更新できます
                    </div>
                  </div>
                  <div className="setting-item-control">
                    <button
                      type="button"
                      className="font-register-btn"
                      onClick={onOpenRepository}
                    >
                      {t("displaySettings.support.openRepository")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="prompt-buttons display-settings-dialog-footer">
          <button
            type="button"
            className="display-settings-library-entry-btn"
            onClick={onOpenLibraryManager}
            title={t("library.menuOpen")}
          >
            {t("library.menuOpen")}
          </button>
          <div className="display-settings-dialog-footer-actions">
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "すべての表示設定を初期値に戻します。よろしいですか？",
                  )
                ) {
                  onReset();
                }
              }}
            >
              {t("displaySettings.resetDefaults")}
            </button>
            <button type="button" onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
