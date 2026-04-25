import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowsMoveHorizontal,
  IconBrandGithub,
  IconChevronRight,
  IconDeviceImacHeart,
  IconDiamond,
  IconFileText,
  IconHeading,
  IconHighlight,
  IconNumbers,
  IconThumbUp,
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
  HeadingAlign,
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
  THEME_LABELS,
  UI_THEME_FONT_PRESETS,
  UI_THEME_TEXT_PRIMARY_PRESETS,
} from "../../settings/defaults";
import { getAppTitleCustomDisplayWidth } from "../../settings/appTitleCustom";
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
import { buildBundledUiPresetGroups } from "../utils/themePresetGrouping";
import { DisplayNumberSlider } from "./DisplayNumberSlider";
import {
  createDefaultDisplaySettingsSectionOpenState,
  resolveDisplaySettingsSectionOpenStateForVisibilityChange,
  type DisplaySettingsSectionKey,
  type DisplaySettingsSectionOpenState,
} from "./displaySettingsSectionState";

type DisplaySettingsModalProps = {
  open: boolean;
  displaySettings: DisplaySettings;
  writingMode: WritingMode;
  uiLanguageMode: UiLanguageMode;
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
  caretColorMode: CaretColorMode;
  caretColorCustom: string | null;
  onCaretColorModeChange: (mode: CaretColorMode) => void;
  onCaretColorCustomChange: (color: string | null) => void;
  /** Phase5-H Slice1: open the Theme Studio modal */
  onOpenThemeStudio: () => void;
  onSendBugReport: () => void;
  onSendFeedback: () => void;
  onOpenRepository: () => void;
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
  uiLanguageMode,
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
  caretColorMode,
  caretColorCustom,
  onCaretColorModeChange,
  onCaretColorCustomChange,
  onOpenThemeStudio,
  onSendBugReport,
  onSendFeedback,
  onOpenRepository,
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
    setSectionOpenState((currentState) =>
      resolveDisplaySettingsSectionOpenStateForVisibilityChange(
        previousOpenRef.current,
        open,
        currentState,
      ),
    );
    previousOpenRef.current = open;
  }, [open]);

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
  const bundledUiPresetGroups = buildBundledUiPresetGroups(
    bundledUiThemePresets,
    t("common.curated"),
  );

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
                        {t("settings.uiLanguageMode.option.ja")}
                      </option>
                      <option value="en">
                        {t("settings.uiLanguageMode.option.en")}
                      </option>
                      <option value="mixed">
                        {t("settings.uiLanguageMode.option.mixed")}
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
                        {docHeadingFontLabels["same-as-body"]}
                      </option>
                      <option value="mincho">
                        {docHeadingFontLabels.mincho}
                      </option>
                      <option value="gothic">
                        {docHeadingFontLabels.gothic}
                      </option>
                      {isCustomHeadingFont && !hasHeadingCustomFontOption && (
                        <option value={docHeadingFont}>
                          {headingCustomFontName}
                        </option>
                      )}
                      {registeredFonts.map((font) => (
                        <option key={font} value={`custom:${font}`}>
                          {font}
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

          {/* ── Section 7: フロントマター表示 ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.frontmatter")}
              icon={IconFileText}
              isOpen={sectionOpenState.frontmatter}
              onToggle={() => toggleSection("frontmatter")}
            />
            {sectionOpenState.frontmatter && (
              <div className="settings-section-body">
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
                    <select
                      className="setting-select"
                      value={selectedUiThemeValue}
                      onChange={(e) => handleUiThemeSelect(e.target.value)}
                    >
                      <optgroup label={t("common.standard")}>
                        {UI_THEME_VALUES.map((value) => (
                          <option key={value} value={`theme:${value}`}>
                            {THEME_LABELS[value]}
                          </option>
                        ))}
                      </optgroup>
                      {bundledUiPresetGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.presets.map((preset) => (
                            <option
                              key={preset.id}
                              value={`preset:${preset.id}`}
                            >
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      {customUiThemePresets.length > 0 && (
                        <optgroup label={t("common.custom")}>
                          {customUiThemePresets.map((preset) => (
                            <option
                              key={preset.id}
                              value={`preset:${preset.id}`}
                            >
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
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
                      <option value="mincho">{uiFontLabels.mincho}</option>
                      <option value="gothic">{uiFontLabels.gothic}</option>
                      {isCustomUiFont && !hasUiCustomFontOption && (
                        <option value={uiFont}>{uiCustomFontName}</option>
                      )}
                      {registeredFonts.map((font) => (
                        <option key={font} value={`custom:${font}`}>
                          {font}
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

          {/* ── Section 10: アプリロゴ ── */}
          <div className="settings-section">
            <SectionHeading
              title={t("displaySettings.section.appTitle")}
              icon={IconBrandGithub}
              isOpen={sectionOpenState.appLogo}
              onToggle={() => toggleSection("appLogo")}
            />
            {sectionOpenState.appLogo && (
              <div className="settings-section-body">
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
                              {appTitlePresetLabels[preset]}
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
                            {t("displaySettings.sameAsUiFont")}
                          </option>
                          <option value="mincho">{uiFontLabels.mincho}</option>
                          <option value="gothic">{uiFontLabels.gothic}</option>
                          {isCustomAppTitleFont &&
                            !hasAppTitleCustomFontOption && (
                              <option value={appTitleFont}>
                                {appTitleCustomFontName}
                              </option>
                            )}
                          {registeredFonts.map((font) => (
                            <option key={font} value={`custom:${font}`}>
                              {font}
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
                    <select
                      className="setting-select"
                      value={selectedDocThemeValue}
                      onChange={(e) => handleDocumentThemeSelect(e.target.value)}
                    >
                      <optgroup label={t("common.standard")}>
                        {(
                          [
                            "ui-linked",
                            "paper-light",
                            "paper-dark",
                            "bow",
                            "wob",
                            "soft-neutral",
                          ] as const
                        ).map((value) => (
                          <option key={value} value={`theme:${value}`}>
                            {documentThemeLabels[value]}
                          </option>
                        ))}
                      </optgroup>
                      {bundledDocThemePresets.length > 0 && (
                        <optgroup label={t("common.curated")}>
                          {bundledDocThemePresets.map((preset) => (
                            <option
                              key={preset.id}
                              value={`preset:${preset.id}`}
                            >
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {customDocThemePresets.length > 0 && (
                        <optgroup label={t("common.custom")}>
                          {customDocThemePresets.map((preset) => (
                            <option
                              key={preset.id}
                              value={`preset:${preset.id}`}
                            >
                              {preset.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
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

                {/* BETA-DISP1: キャレット色 */}
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
                        {t("displaySettings.caretColorAuto")}
                      </option>
                      <option value="custom">
                        {t("displaySettings.caretColorCustom")}
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
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.support.updateCheck")}
                    </div>
                    <div className="setting-item-desc">
                      最新版かどうかを確認します
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
                <div className="setting-item">
                  <div className="setting-item-info">
                    <div className="setting-item-name">
                      {t("displaySettings.support.repository")}
                    </div>
                    <div className="setting-item-desc">
                      プロジェクトのリポジトリページを開きます
                      <br />
                      ※NYOZEの最新版の配布物は Releases
                      ページからダウンロードできます
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

        <div className="prompt-buttons">
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
      </section>
    </div>
  );
}
