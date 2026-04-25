/**
 * Phase5-H Slice2: ThemeStudioPanel (right pane tab)
 *
 * - Standard/custom split
 * - Custom management: duplicate/delete + search/sort
 * - Live preview while editing
 * - Save flows: new-save (name modal) / overwrite-save (custom only)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  IconArrowBackUp,
  IconCopy,
  IconDeviceFloppy,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type {
  DocThemePreset,
  DisplaySettings,
  DocumentColorSettings,
  DocumentFontPreset,
  DocumentHeadingFont,
  DocumentTheme,
  Theme,
  UiFont,
  UiLanguageMode,
  UiThemePreset,
} from "../../settings/types";
import {
  DOCUMENT_THEME_LABELS,
  THEME_LABELS,
  UI_THEME_MAIN_COLORS,
} from "../../settings/defaults";
import {
  isBundledDocThemePreset,
  isBundledUiThemePreset,
  isStandardDocThemePresetId,
  isStandardUiThemePresetId,
} from "../../settings/theme-packs";
import { UI_THEME_VALUES } from "../../settings/themeUtils";
import { createUiTextGetter } from "../i18n/uiText";
import {
  isDocPresetDirty,
  isSameDocPresetColors,
  isSameUiPresetColors,
  isUiPresetDirty,
} from "../themePresetPolicy";
import { buildBundledUiPresetGroups } from "../utils/themePresetGrouping";
import { DisplayNumberSlider } from "./DisplayNumberSlider";

type StudioTab = "ui" | "doc";
type PresetSort = "newest" | "oldest" | "name";

type ThemeStudioPanelProps = {
  uiLanguageMode: UiLanguageMode;
  uiThemePresets: UiThemePreset[];
  activeUiThemePresetId: string | null;
  currentUiTheme: Theme;
  currentUiFont: UiFont;
  currentUiFontScale: number;
  currentUiTextPrimary: string | null;
  docThemePresets: DocThemePreset[];
  activeDocThemePresetId: string | null;
  currentDocColorSettings: DocumentColorSettings;
  currentDocTheme: DocumentTheme;
  currentDocFontPreset: DocumentFontPreset;
  currentDocHeadingFont: DocumentHeadingFont;
  displaySettings: DisplaySettings;
  registeredFonts: string[];
  onSetActiveUiThemePresetId: (id: string) => void;
  onSetActiveDocThemePresetId: (id: string) => void;
  onDetachActiveDocThemePreset: () => void;
  onSaveUiThemePreset: (preset: UiThemePreset) => void;
  onSaveDocThemePreset: (preset: DocThemePreset) => void;
  onOverwriteUiThemePreset: (id: string, preset: UiThemePreset) => void;
  onOverwriteDocThemePreset: (id: string, preset: DocThemePreset) => void;
  onPreviewUiThemeDraft: (preset: UiThemePreset) => void;
  onPreviewDocThemeDraft: (preset: DocThemePreset) => void;
  onRenameUiThemePreset: (id: string, name: string) => void;
  onRenameDocThemePreset: (id: string, name: string) => void;
  onDuplicateUiThemePreset: (id: string) => void;
  onDuplicateDocThemePreset: (id: string) => void;
  onDeleteUiThemePreset: (id: string) => void;
  onDeleteDocThemePreset: (id: string) => void;
  onSetUiFont: (font: UiFont) => void;
  onSetUiFontScale: (scale: number) => void;
  onSetDocFontPreset: (preset: DocumentFontPreset) => void;
  onSetDocHeadingFont: (font: DocumentHeadingFont) => void;
  onSetDisplayNumber: (
    key: "fontSize" | "lineHeight",
    value: number,
    min: number,
    max: number,
  ) => void;
};

type NewSaveDialogState =
  | { open: false }
  | { open: true; kind: "ui" | "doc"; name: string };

type RenameDialogState =
  | { open: false }
  | { open: true; kind: "ui" | "doc"; id: string; name: string };

type ActionTone = "default" | "accent" | "danger";

type ActionIconChipButtonProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: ActionTone;
};

const UI_DETACHED_PRESET_VALUE = "__ui-detached__";
const DOC_DETACHED_PRESET_VALUE = "__doc-detached__";
const ACTION_ICON_SIZE = 18;
const ACTION_ICON_STROKE = 1.9;

function ActionIconChipButton({
  label,
  icon,
  onClick,
  disabled = false,
  tone = "default",
}: ActionIconChipButtonProps) {
  return (
    <div className={`theme-icon-chip-action${disabled ? " is-disabled" : ""}`}>
      <button
        type="button"
        className={`theme-icon-btn theme-icon-btn--${tone}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>
      <span className={`theme-action-chip theme-action-chip--${tone}`}>
        {label}
      </span>
    </div>
  );
}

function NewSaveTablerIcon() {
  return (
    <span className="theme-save-add-icon" aria-hidden="true">
      <IconDeviceFloppy size={ACTION_ICON_SIZE} stroke={ACTION_ICON_STROKE} />
      <span className="theme-save-add-plus-badge">
        <IconPlus size={10} stroke={2.4} />
      </span>
    </span>
  );
}

function getUiPresetKind(preset: UiThemePreset): "system" | "custom" {
  if (preset.kind) return preset.kind;
  return preset.id.startsWith("preset-ui-") ? "system" : "custom";
}

function getDocPresetKind(preset: DocThemePreset): "system" | "custom" {
  if (preset.kind) return preset.kind;
  return preset.id.startsWith("preset-doc-") ? "system" : "custom";
}

function createdAtMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortUiPresets(
  items: UiThemePreset[],
  sort: PresetSort,
): UiThemePreset[] {
  const next = [...items];
  if (sort === "name")
    return next.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  if (sort === "oldest") {
    return next.sort(
      (a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt),
    );
  }
  return next.sort(
    (a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt),
  );
}

function sortDocPresets(
  items: DocThemePreset[],
  sort: PresetSort,
): DocThemePreset[] {
  const next = [...items];
  if (sort === "name")
    return next.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  if (sort === "oldest") {
    return next.sort(
      (a, b) => createdAtMs(a.createdAt) - createdAtMs(b.createdAt),
    );
  }
  return next.sort(
    (a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt),
  );
}

function blendHex(bg: string, fg: string, bgWeight: number): string {
  const parse = (hex: string) => ({
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  });
  const b = parse(bg);
  const f = parse(fg);
  const mix = (x: number, y: number) =>
    Math.round(x * bgWeight + y * (1 - bgWeight));
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(mix(b.r, f.r))}${toHex(mix(b.g, f.g))}${toHex(mix(b.b, f.b))}`;
}

function resolveAutoPaneBg(baseBg: string, textPrimary: string): string {
  return blendHex(baseBg, textPrimary, 0.92);
}

function resolveCurrentUiColors(
  theme: Theme,
  textPrimary: string | null,
): UiThemePreset["colors"] {
  const base = UI_THEME_MAIN_COLORS[theme];
  return {
    ...base,
    textPrimary: textPrimary ?? base.textPrimary,
  };
}

export function ThemeStudioPanel({
  uiLanguageMode,
  uiThemePresets,
  activeUiThemePresetId,
  currentUiTheme,
  currentUiFont,
  currentUiFontScale,
  currentUiTextPrimary,
  docThemePresets,
  activeDocThemePresetId,
  currentDocColorSettings,
  currentDocTheme,
  currentDocFontPreset,
  currentDocHeadingFont,
  displaySettings,
  registeredFonts,
  onSetActiveUiThemePresetId,
  onSetActiveDocThemePresetId,
  onDetachActiveDocThemePreset,
  onSaveUiThemePreset,
  onSaveDocThemePreset,
  onOverwriteUiThemePreset,
  onOverwriteDocThemePreset,
  onPreviewUiThemeDraft,
  onPreviewDocThemeDraft,
  onRenameUiThemePreset,
  onRenameDocThemePreset,
  onDuplicateUiThemePreset,
  onDuplicateDocThemePreset,
  onDeleteUiThemePreset,
  onDeleteDocThemePreset,
  onSetUiFont,
  onSetUiFontScale,
  onSetDocFontPreset,
  onSetDocHeadingFont,
  onSetDisplayNumber,
}: ThemeStudioPanelProps) {
  const t = createUiTextGetter(uiLanguageMode);
  const uiFontLabels = {
    mincho: t("font.mincho"),
    gothic: t("font.gothic"),
  } as const;
  const docHeadingFontLabels = {
    "same-as-body": t("font.sameAsBody"),
    mincho: uiFontLabels.mincho,
    gothic: uiFontLabels.gothic,
  } as const;
  const [tab, setTab] = useState<StudioTab>("ui");
  const [uiSearch, setUiSearch] = useState("");
  const [docSearch, setDocSearch] = useState("");
  const [uiSort, setUiSort] = useState<PresetSort>("newest");
  const [docSort, setDocSort] = useState<PresetSort>("newest");
  const [newSaveDialog, setNewSaveDialog] = useState<NewSaveDialogState>({
    open: false,
  });
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
    open: false,
  });
  const newSaveOverlayRef = useRef<HTMLDivElement>(null);
  const renameOverlayRef = useRef<HTMLDivElement>(null);
  useFocusTrap(newSaveOverlayRef, newSaveDialog.open);
  useFocusTrap(renameOverlayRef, renameDialog.open);
  const [uiPreviewOpen, setUiPreviewOpen] = useState(false);

  const activeUiPreset =
    uiThemePresets.find((p) => p.id === activeUiThemePresetId) ??
    uiThemePresets[0];
  const activeDocPreset =
    docThemePresets.find((p) => p.id === activeDocThemePresetId) ??
    docThemePresets[0];

  const [uiBaseTheme, setUiBaseTheme] = useState<Theme>(currentUiTheme);
  const [uiColors, setUiColors] = useState(
    resolveCurrentUiColors(currentUiTheme, currentUiTextPrimary),
  );
  const [docColors, setDocColors] = useState<DocumentColorSettings>(() => ({
    ...currentDocColorSettings,
  }));
  const skipNextUiPreviewRef = useRef(false);
  const skipNextDocPreviewRef = useRef(false);
  const skipNextDocSyncRef = useRef(false);
  const syncedUiPresetIdRef = useRef<string | null>(null);

  const docBodyCustomFontName = currentDocFontPreset.startsWith("custom:")
    ? currentDocFontPreset.slice("custom:".length)
    : null;
  const hasDocBodyCustomOption =
    docBodyCustomFontName !== null &&
    registeredFonts.includes(docBodyCustomFontName);
  const docHeadingCustomFontName = currentDocHeadingFont.startsWith("custom:")
    ? currentDocHeadingFont.slice("custom:".length)
    : null;
  const hasDocHeadingCustomOption =
    docHeadingCustomFontName !== null &&
    registeredFonts.includes(docHeadingCustomFontName);

  const uiSystemPresets = useMemo(
    () => uiThemePresets.filter((p) => getUiPresetKind(p) === "system"),
    [uiThemePresets],
  );
  const uiStandardPresets = useMemo(
    () => uiSystemPresets.filter((p) => isStandardUiThemePresetId(p.id)),
    [uiSystemPresets],
  );
  const uiBundledPresets = useMemo(
    () => uiSystemPresets.filter((p) => isBundledUiThemePreset(p)),
    [uiSystemPresets],
  );
  const uiBundledPresetGroups = useMemo(
    () => buildBundledUiPresetGroups(uiBundledPresets, t("common.curated")),
    [uiBundledPresets, t],
  );
  const uiCustomPresets = useMemo(
    () => uiThemePresets.filter((p) => getUiPresetKind(p) === "custom"),
    [uiThemePresets],
  );
  const docSystemPresets = useMemo(
    () => docThemePresets.filter((p) => getDocPresetKind(p) === "system"),
    [docThemePresets],
  );
  const docStandardPresets = useMemo(
    () => docSystemPresets.filter((p) => isStandardDocThemePresetId(p.id)),
    [docSystemPresets],
  );
  const docBundledPresets = useMemo(
    () => docSystemPresets.filter((p) => isBundledDocThemePreset(p)),
    [docSystemPresets],
  );
  const docCustomPresets = useMemo(
    () => docThemePresets.filter((p) => getDocPresetKind(p) === "custom"),
    [docThemePresets],
  );

  const filteredUiCustomPresets = useMemo(() => {
    const query = uiSearch.trim().toLowerCase();
    const filtered =
      query.length === 0
        ? uiCustomPresets
        : uiCustomPresets.filter((p) => p.name.toLowerCase().includes(query));
    return sortUiPresets(filtered, uiSort);
  }, [uiCustomPresets, uiSearch, uiSort]);

  const filteredDocCustomPresets = useMemo(() => {
    const query = docSearch.trim().toLowerCase();
    const filtered =
      query.length === 0
        ? docCustomPresets
        : docCustomPresets.filter((p) => p.name.toLowerCase().includes(query));
    return sortDocPresets(filtered, docSort);
  }, [docCustomPresets, docSearch, docSort]);

  useEffect(() => {
    if (activeUiThemePresetId === null || !activeUiPreset) {
      syncedUiPresetIdRef.current = null;
      return;
    }
    if (syncedUiPresetIdRef.current === activeUiThemePresetId) return;
    // Sync local editor fields only when active preset selection changes.
    syncedUiPresetIdRef.current = activeUiThemePresetId;
    skipNextUiPreviewRef.current = true;
    setUiBaseTheme((prev) =>
      prev === activeUiPreset.baseTheme ? prev : activeUiPreset.baseTheme,
    );
    setUiColors((prev) =>
      isSameUiPresetColors(prev, activeUiPreset.colors)
        ? prev
        : { ...activeUiPreset.colors },
    );
  }, [activeUiThemePresetId, activeUiPreset]);

  useEffect(() => {
    if (activeUiThemePresetId !== null) return;
    // Pull external UI changes (Display settings) into local draft without bouncing back.
    skipNextUiPreviewRef.current = true;
    const resolved = resolveCurrentUiColors(
      currentUiTheme,
      currentUiTextPrimary,
    );
    setUiBaseTheme((prev) => (prev === currentUiTheme ? prev : currentUiTheme));
    setUiColors((prev) =>
      isSameUiPresetColors(prev, resolved) ? prev : { ...resolved },
    );
  }, [activeUiThemePresetId, currentUiTheme, currentUiTextPrimary]);

  useEffect(() => {
    if (skipNextDocSyncRef.current) {
      skipNextDocSyncRef.current = false;
      return;
    }
    skipNextDocPreviewRef.current = true;
    setDocColors((prev) =>
      isSameDocPresetColors(prev, currentDocColorSettings)
        ? prev
        : { ...currentDocColorSettings },
    );
  }, [currentDocColorSettings]);

  useEffect(() => {
    if (!activeUiPreset) return;
    if (skipNextUiPreviewRef.current) {
      skipNextUiPreviewRef.current = false;
      return;
    }
    if (activeUiThemePresetId === null) {
      const resolvedCurrent = resolveCurrentUiColors(
        currentUiTheme,
        currentUiTextPrimary,
      );
      const isInSync =
        uiBaseTheme === currentUiTheme &&
        isSameUiPresetColors(uiColors, resolvedCurrent);
      if (isInSync) return;
    }
    onPreviewUiThemeDraft({
      ...activeUiPreset,
      baseTheme: uiBaseTheme,
      colors: uiColors,
    });
  }, [
    activeUiPreset,
    activeUiThemePresetId,
    uiBaseTheme,
    uiColors,
    currentUiTheme,
    currentUiTextPrimary,
    onPreviewUiThemeDraft,
  ]);

  useEffect(() => {
    if (!activeDocPreset) return;
    if (skipNextDocPreviewRef.current) {
      skipNextDocPreviewRef.current = false;
      return;
    }
    const isInSync = isSameDocPresetColors(docColors, currentDocColorSettings);
    if (isInSync) return;
    onPreviewDocThemeDraft({
      ...activeDocPreset,
      baseDocTheme:
        activeDocThemePresetId !== null
          ? activeDocPreset.baseDocTheme
          : currentDocTheme,
      colors: docColors,
    });
  }, [
    activeDocPreset,
    activeDocThemePresetId,
    currentDocTheme,
    docColors,
    currentDocColorSettings,
    onPreviewDocThemeDraft,
  ]);

  const buildUiDraft = useCallback(
    (name: string): UiThemePreset => ({
      id: activeUiPreset?.id ?? "ui-preset-base",
      name,
      baseTheme: uiBaseTheme,
      colors: { ...uiColors },
    }),
    [activeUiPreset, uiBaseTheme, uiColors],
  );

  const buildDocDraft = useCallback(
    (name: string): DocThemePreset => ({
      id: activeDocPreset?.id ?? "doc-preset-base",
      name,
      baseDocTheme:
        activeDocThemePresetId !== null
          ? activeDocPreset.baseDocTheme
          : currentDocTheme,
      colors: { ...docColors },
    }),
    [activeDocPreset, activeDocThemePresetId, currentDocTheme, docColors],
  );

  const openNewSaveDialog = useCallback(
    (kind: "ui" | "doc") => {
      const baseName =
        kind === "ui" ? activeUiPreset?.name : activeDocPreset?.name;
      const suggested = `${baseName ?? ""}`.trim();
      setNewSaveDialog({
        open: true,
        kind,
        name: suggested ? `${suggested} コピー` : "",
      });
    },
    [activeUiPreset, activeDocPreset],
  );

  const closeNewSaveDialog = useCallback(() => {
    setNewSaveDialog({ open: false });
  }, []);

  const handleConfirmNewSave = useCallback(() => {
    if (!newSaveDialog.open) return;
    const name = newSaveDialog.name.trim();
    if (!name) return;
    if (newSaveDialog.kind === "ui") {
      onSaveUiThemePreset(buildUiDraft(name));
    } else {
      onSaveDocThemePreset(buildDocDraft(name));
    }
    setNewSaveDialog({ open: false });
  }, [
    newSaveDialog,
    onSaveUiThemePreset,
    onSaveDocThemePreset,
    buildUiDraft,
    buildDocDraft,
  ]);

  const handleOverwriteUi = useCallback(() => {
    if (!activeUiPreset || getUiPresetKind(activeUiPreset) !== "custom") return;
    if (
      !window.confirm(
        `「${activeUiPreset.name}」を上書き保存します。よろしいですか？`,
      )
    )
      return;
    onOverwriteUiThemePreset(
      activeUiPreset.id,
      buildUiDraft(activeUiPreset.name),
    );
  }, [activeUiPreset, onOverwriteUiThemePreset, buildUiDraft]);

  const handleResetUiDraft = useCallback(() => {
    setUiBaseTheme(activeUiPreset.baseTheme);
    setUiColors({ ...activeUiPreset.colors });
  }, [activeUiPreset]);

  const handleResetDocDraft = useCallback(() => {
    setDocColors({ ...activeDocPreset.colors });
  }, [activeDocPreset]);

  const handleOverwriteDoc = useCallback(() => {
    if (!activeDocPreset || getDocPresetKind(activeDocPreset) !== "custom")
      return;
    if (
      !window.confirm(
        `「${activeDocPreset.name}」を上書き保存します。よろしいですか？`,
      )
    )
      return;
    onOverwriteDocThemePreset(
      activeDocPreset.id,
      buildDocDraft(activeDocPreset.name),
    );
  }, [activeDocPreset, onOverwriteDocThemePreset, buildDocDraft]);

  const handleUiBaseThemeChange = useCallback((nextTheme: Theme) => {
    setUiBaseTheme(nextTheme);
    // Ensure immediate visual feedback when base theme changes.
    setUiColors({ ...UI_THEME_MAIN_COLORS[nextTheme] });
  }, []);

  const openRenameDialog = useCallback(
    (kind: "ui" | "doc", id: string, currentName: string) => {
      setRenameDialog({
        open: true,
        kind,
        id,
        name: currentName,
      });
    },
    [],
  );

  const closeRenameDialog = useCallback(() => {
    setRenameDialog({ open: false });
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (!renameDialog.open) return;
    const nextName = renameDialog.name.trim();
    if (!nextName) return;
    if (renameDialog.kind === "ui") {
      onRenameUiThemePreset(renameDialog.id, nextName);
    } else {
      onRenameDocThemePreset(renameDialog.id, nextName);
    }
    setRenameDialog({ open: false });
  }, [renameDialog, onRenameUiThemePreset, onRenameDocThemePreset]);

  const handleDeleteUi = useCallback(() => {
    if (!activeUiPreset || getUiPresetKind(activeUiPreset) !== "custom") return;
    if (!window.confirm(`「${activeUiPreset.name}」を削除しますか？`)) return;
    onDeleteUiThemePreset(activeUiPreset.id);
  }, [activeUiPreset, onDeleteUiThemePreset]);

  const handleDeleteDoc = useCallback(() => {
    if (!activeDocPreset || getDocPresetKind(activeDocPreset) !== "custom")
      return;
    if (!window.confirm(`「${activeDocPreset.name}」を削除しますか？`)) return;
    onDeleteDocThemePreset(activeDocPreset.id);
  }, [activeDocPreset, onDeleteDocThemePreset]);

  if (!activeUiPreset || !activeDocPreset) {
    return <p className="pane-placeholder">{t("themeStudio.preparing")}</p>;
  }

  const uiCustomFonts = registeredFonts;
  const activeUiKind = getUiPresetKind(activeUiPreset);
  const activeDocKind = getDocPresetKind(activeDocPreset);
  const hasActiveUiPreset = activeUiThemePresetId !== null;
  const hasActiveDocPreset = activeDocThemePresetId !== null;
  const uiPresetSelectValue = hasActiveUiPreset
    ? activeUiPreset.id
    : UI_DETACHED_PRESET_VALUE;
  const docPresetSelectValue = hasActiveDocPreset
    ? activeDocPreset.id
    : DOC_DETACHED_PRESET_VALUE;
  const detachedDocPresetLabel =
    currentDocTheme === "ui-linked"
      ? t("themeStudio.currentUnsavedCustom")
      : t("themeStudio.currentNoPreset");
  const ensureActiveDocPresetForDraft = () => {
    if (activeDocThemePresetId !== null) return;
    // Keep ui-linked edits detached so they can become an unsaved custom draft.
    if (currentDocTheme === "ui-linked") return;
    const exact = docThemePresets.find(
      (preset) =>
        preset.baseDocTheme === currentDocTheme &&
        isSameDocPresetColors(preset.colors, currentDocColorSettings),
    );
    const byStateOnly = docThemePresets.find((preset) =>
      isSameDocPresetColors(preset.colors, currentDocColorSettings),
    );
    const sameThemeSystem = docThemePresets.find(
      (preset) =>
        getDocPresetKind(preset) === "system" &&
        preset.baseDocTheme === currentDocTheme,
    );
    const sameThemeAny = docThemePresets.find(
      (preset) => preset.baseDocTheme === currentDocTheme,
    );
    const nextPresetId =
      exact?.id ??
      byStateOnly?.id ??
      sameThemeSystem?.id ??
      sameThemeAny?.id ??
      activeDocPreset?.id ??
      null;
    if (!nextPresetId) return;
    skipNextDocSyncRef.current = true;
    onSetActiveDocThemePresetId(nextPresetId);
  };
  const detachUiLinkedSystemPresetForDocDraft = () => {
    if (activeDocThemePresetId === null) return;
    if (activeDocKind !== "system") return;
    if (activeDocPreset.baseDocTheme !== "ui-linked") return;
    skipNextDocSyncRef.current = true;
    onDetachActiveDocThemePreset();
  };
  const uiPresetDirty =
    activeUiThemePresetId !== null &&
    isUiPresetDirty(activeUiPreset, uiBaseTheme, uiColors);
  const uiPresetBaseLabel = (preset: UiThemePreset): string =>
    getUiPresetKind(preset) === "system" &&
    isStandardUiThemePresetId(preset.id)
      ? THEME_LABELS[preset.baseTheme]
      : preset.name;
  const renderUiPresetLabel = (preset: UiThemePreset): string =>
    hasActiveUiPreset && preset.id === activeUiPreset.id && uiPresetDirty
      ? `${uiPresetBaseLabel(preset)} (${t("themeStudio.unsaved")})`
      : uiPresetBaseLabel(preset);
  const autoPaneBg = resolveAutoPaneBg(uiColors.baseBg, uiColors.textPrimary);
  const effectivePaneBg = uiColors.paneBg ?? autoPaneBg;
  const docPresetDirty =
    activeDocThemePresetId !== null &&
    isDocPresetDirty(activeDocPreset, docColors);
  const displayedDocFontPreset: DocumentFontPreset =
    currentDocFontPreset === "ui-linked" ? "mincho" : currentDocFontPreset;
  const renderDocPresetLabel = (preset: DocThemePreset): string =>
    hasActiveDocPreset && preset.id === activeDocPreset.id && docPresetDirty
      ? `${
          getDocPresetKind(preset) === "system" &&
          isStandardDocThemePresetId(preset.id)
            ? DOCUMENT_THEME_LABELS[preset.baseDocTheme]
            : preset.name
        } (${t("themeStudio.unsaved")})`
      : getDocPresetKind(preset) === "system" &&
          isStandardDocThemePresetId(preset.id)
        ? DOCUMENT_THEME_LABELS[preset.baseDocTheme]
        : preset.name;

  return (
    <section className="theme-studio-panel">
      <div className="theme-studio-header">
        <h2 className="theme-studio-title">{t("themeStudio.title")}</h2>
        <div className="theme-studio-tabs">
          <button
            type="button"
            className={`theme-studio-tab${tab === "ui" ? " theme-studio-tab--active" : ""}`}
            onClick={() => setTab("ui")}
          >
            {t("themeStudio.tab.ui")}
          </button>
          <button
            type="button"
            className={`theme-studio-tab${tab === "doc" ? " theme-studio-tab--active" : ""}`}
            onClick={() => setTab("doc")}
          >
            {t("themeStudio.tab.doc")}
          </button>
        </div>
      </div>

      <div className="theme-studio-body">
        {tab === "ui" && (
          <div className="theme-studio-pane">
            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t("themeStudio.preset")}
                </div>
              </div>
              <div className="setting-item-control">
                <select
                  className="setting-select"
                  value={uiPresetSelectValue}
                  onChange={(e) => {
                    if (e.target.value === UI_DETACHED_PRESET_VALUE) return;
                    onSetActiveUiThemePresetId(e.target.value);
                  }}
                >
                  {!hasActiveUiPreset && (
                    <option value={UI_DETACHED_PRESET_VALUE}>
                      {t("themeStudio.currentNoPreset")}
                    </option>
                  )}
                  {uiStandardPresets.length > 0 && (
                    <optgroup label={t("common.standard")}>
                      {uiStandardPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {renderUiPresetLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {uiBundledPresetGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {renderUiPresetLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {uiCustomPresets.length > 0 && (
                    <optgroup label={t("common.custom")}>
                      {sortUiPresets(uiCustomPresets, "name").map((p) => (
                        <option key={p.id} value={p.id}>
                          {renderUiPresetLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            <div className="theme-preset-actions">
              <ActionIconChipButton
                label={t("themeStudio.duplicate")}
                icon={
                  <IconCopy
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={() => onDuplicateUiThemePreset(activeUiPreset.id)}
                disabled={!hasActiveUiPreset}
              />
              <ActionIconChipButton
                label={t("common.delete")}
                icon={
                  <IconTrash
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={handleDeleteUi}
                disabled={!hasActiveUiPreset || activeUiKind !== "custom"}
                tone="danger"
              />
            </div>

            <div className="theme-preset-list-controls">
              <input
                type="text"
                className="setting-text-input"
                placeholder={t("themeStudio.searchCustom")}
                value={uiSearch}
                onChange={(e) => setUiSearch(e.target.value)}
              />
              <select
                className="setting-select theme-preset-sort"
                value={uiSort}
                onChange={(e) => setUiSort(e.target.value as PresetSort)}
              >
                <option value="newest">{t("themeStudio.sort.newest")}</option>
                <option value="oldest">{t("themeStudio.sort.oldest")}</option>
                <option value="name">{t("themeStudio.sort.name")}</option>
              </select>
            </div>
            <div className="theme-preset-list">
              {filteredUiCustomPresets.length === 0 && (
                <div className="theme-preset-empty">
                  {t("themeStudio.emptyCustom")}
                </div>
              )}
              {filteredUiCustomPresets.map((p) => {
                const isActive =
                  hasActiveUiPreset && p.id === activeUiPreset.id;
                const isDirty = isActive && uiPresetDirty;
                return (
                  <div
                    key={p.id}
                    className={`theme-preset-item${isActive ? " is-active" : ""}${isDirty ? " is-dirty" : ""}`}
                  >
                    <div className="theme-preset-item-row">
                      <button
                        type="button"
                        className="theme-preset-item-name"
                        onClick={() => onSetActiveUiThemePresetId(p.id)}
                      >
                        <span className="theme-preset-item-name-text">
                          {p.name}
                        </span>
                        {isDirty && (
                          <span className="theme-preset-dirty-tag">
                            {t("themeStudio.unsaved")}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="theme-preset-item-rename"
                        onClick={() => openRenameDialog("ui", p.id, p.name)}
                        aria-label={t("themeStudio.renameTheme")}
                        title={t("themeStudio.renameTheme")}
                      >
                        <IconPencil
                          className="theme-preset-item-rename-icon"
                          size={14}
                          stroke={ACTION_ICON_STROKE}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t("themeStudio.baseTheme")}
                </div>
                {hasActiveUiPreset && activeUiKind === "system" && (
                  <div className="setting-item-desc">
                    {t("themeStudio.fixedInSystemPreset")}
                  </div>
                )}
              </div>
              <div className="setting-item-control">
                {hasActiveUiPreset && activeUiKind === "system" ? (
                  <div className="setting-readonly">
                    {THEME_LABELS[uiBaseTheme]}
                  </div>
                ) : (
                  <select
                    className="setting-select"
                    value={uiBaseTheme}
                    onChange={(e) =>
                      handleUiBaseThemeChange(e.target.value as Theme)
                    }
                  >
                    {UI_THEME_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {THEME_LABELS[v]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="settings-section">
              <h4 className="settings-subsection-heading">
                {t("themeStudio.mainColors")}
              </h4>
              <ColorRow
                label={t("themeStudio.color.panelBg")}
                value={uiColors.baseBg}
                onChange={(v) => setUiColors((c) => ({ ...c, baseBg: v }))}
              />
              <ColorRow
                label={t("themeStudio.color.surfaceBg")}
                value={uiColors.surfaceBg}
                onChange={(v) => setUiColors((c) => ({ ...c, surfaceBg: v }))}
              />
              <ColorRow
                label={t("themeStudio.color.text")}
                value={uiColors.textPrimary}
                onChange={(v) => setUiColors((c) => ({ ...c, textPrimary: v }))}
              />
              <ColorRow
                label={t("themeStudio.color.accent")}
                value={uiColors.accent}
                onChange={(v) => setUiColors((c) => ({ ...c, accent: v }))}
              />
              <ColorRow
                label={t("themeStudio.color.border")}
                value={uiColors.border}
                onChange={(v) => setUiColors((c) => ({ ...c, border: v }))}
              />
              <ColorRow
                label={t("themeStudio.color.paneBorder")}
                value={uiColors.paneBorder}
                onChange={(v) => setUiColors((c) => ({ ...c, paneBorder: v }))}
              />
              <div className="setting-item">
                <div className="setting-item-info">
                  <div className="setting-item-name">
                    {t("themeStudio.color.paneBgOptional")}
                  </div>
                </div>
                <div className="setting-item-control">
                  <div className="color-control">
                    <input
                      type="color"
                      value={effectivePaneBg}
                      onChange={(e) =>
                        setUiColors((c) => ({ ...c, paneBg: e.target.value }))
                      }
                    />
                    <span className="color-hex">{effectivePaneBg}</span>
                  </div>
                  <button
                    type="button"
                    className="font-register-btn"
                    onClick={() =>
                      setUiColors((c) => ({ ...c, paneBg: undefined }))
                    }
                    disabled={uiColors.paneBg === undefined}
                  >
                    {t("themeStudio.resetToAuto")}
                  </button>
                </div>
              </div>
              <ColorRow
                label={t("themeStudio.color.scrollbar")}
                value={uiColors.scrollbarBase}
                onChange={(v) =>
                  setUiColors((c) => ({ ...c, scrollbarBase: v }))
                }
              />
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">{t("themeStudio.uiFont")}</div>
              </div>
              <div className="setting-item-control">
                <select
                  className="setting-select"
                  value={currentUiFont}
                  onChange={(e) => onSetUiFont(e.target.value as UiFont)}
                >
                  <option value="mincho">{uiFontLabels.mincho}</option>
                  <option value="gothic">{uiFontLabels.gothic}</option>
                  {uiCustomFonts.map((f) => (
                    <option key={f} value={`custom:${f}`}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">{t("themeStudio.uiScale")}</div>
              </div>
              <div className="setting-item-control">
                <div className="slider-control">
                  <input
                    type="range"
                    min={0.9}
                    max={1.3}
                    step={0.05}
                    value={currentUiFontScale}
                    onChange={(e) => onSetUiFontScale(Number(e.target.value))}
                  />
                  <span className="slider-value">
                    {currentUiFontScale.toFixed(2)}x
                  </span>
                </div>
              </div>
            </div>

            <div className="theme-studio-save-row">
              <ActionIconChipButton
                label={t("themeStudio.discardChanges")}
                icon={
                  <IconArrowBackUp
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={handleResetUiDraft}
                disabled={!uiPresetDirty}
              />
              <ActionIconChipButton
                label={t("themeStudio.saveNew")}
                icon={<NewSaveTablerIcon />}
                onClick={() => openNewSaveDialog("ui")}
                tone="accent"
              />
              <ActionIconChipButton
                label={t("themeStudio.saveOverwrite")}
                icon={
                  <IconDeviceFloppy
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={handleOverwriteUi}
                disabled={!hasActiveUiPreset || activeUiKind !== "custom"}
                tone="accent"
              />
            </div>

            <div className="theme-preview-toggle-row">
              <ActionIconChipButton
                label={
                  uiPreviewOpen
                    ? t("themeStudio.hideSample")
                    : t("themeStudio.showSample")
                }
                icon={
                  uiPreviewOpen ? (
                    <IconEyeOff
                      size={ACTION_ICON_SIZE}
                      stroke={ACTION_ICON_STROKE}
                    />
                  ) : (
                    <IconEye
                      size={ACTION_ICON_SIZE}
                      stroke={ACTION_ICON_STROKE}
                    />
                  )
                }
                onClick={() => setUiPreviewOpen((prev) => !prev)}
              />
            </div>
          </div>
        )}

        {tab === "doc" && (
          <div className="theme-studio-pane">
            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t("themeStudio.preset")}
                </div>
              </div>
              <div className="setting-item-control">
                <select
                  className="setting-select"
                  value={docPresetSelectValue}
                  onChange={(e) => {
                    if (e.target.value === DOC_DETACHED_PRESET_VALUE) return;
                    onSetActiveDocThemePresetId(e.target.value);
                  }}
                >
                  {!hasActiveDocPreset && (
                    <option value={DOC_DETACHED_PRESET_VALUE}>
                      {detachedDocPresetLabel}
                    </option>
                  )}
                  {docStandardPresets.length > 0 && (
                    <optgroup label={t("common.standard")}>
                      {docStandardPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {renderDocPresetLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {docBundledPresets.length > 0 && (
                    <optgroup label={t("common.curated")}>
                      {docBundledPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {renderDocPresetLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {docCustomPresets.length > 0 && (
                    <optgroup label={t("common.custom")}>
                      {sortDocPresets(docCustomPresets, "name").map((p) => (
                        <option key={p.id} value={p.id}>
                          {renderDocPresetLabel(p)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            <div className="theme-preset-actions">
              <ActionIconChipButton
                label={t("themeStudio.duplicate")}
                icon={
                  <IconCopy
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={() => onDuplicateDocThemePreset(activeDocPreset.id)}
                disabled={!hasActiveDocPreset}
              />
              <ActionIconChipButton
                label={t("common.delete")}
                icon={
                  <IconTrash
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={handleDeleteDoc}
                disabled={!hasActiveDocPreset || activeDocKind !== "custom"}
                tone="danger"
              />
            </div>

            <div className="theme-preset-list-controls">
              <input
                type="text"
                className="setting-text-input"
                placeholder={t("themeStudio.searchCustom")}
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
              />
              <select
                className="setting-select theme-preset-sort"
                value={docSort}
                onChange={(e) => setDocSort(e.target.value as PresetSort)}
              >
                <option value="newest">{t("themeStudio.sort.newest")}</option>
                <option value="oldest">{t("themeStudio.sort.oldest")}</option>
                <option value="name">{t("themeStudio.sort.name")}</option>
              </select>
            </div>
            <div className="theme-preset-list">
              {filteredDocCustomPresets.length === 0 && (
                <div className="theme-preset-empty">
                  {t("themeStudio.emptyCustom")}
                </div>
              )}
              {filteredDocCustomPresets.map((p) => {
                const isActive =
                  hasActiveDocPreset && p.id === activeDocPreset.id;
                const isDirty = isActive && docPresetDirty;
                return (
                  <div
                    key={p.id}
                    className={`theme-preset-item${isActive ? " is-active" : ""}${isDirty ? " is-dirty" : ""}`}
                  >
                    <div className="theme-preset-item-row">
                      <button
                        type="button"
                        className="theme-preset-item-name"
                        onClick={() => onSetActiveDocThemePresetId(p.id)}
                      >
                        <span className="theme-preset-item-name-text">
                          {p.name}
                        </span>
                        {isDirty && (
                          <span className="theme-preset-dirty-tag">
                            {t("themeStudio.unsaved")}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="theme-preset-item-rename"
                        onClick={() => openRenameDialog("doc", p.id, p.name)}
                        aria-label={t("themeStudio.renameTheme")}
                        title={t("themeStudio.renameTheme")}
                      >
                        <IconPencil
                          className="theme-preset-item-rename-icon"
                          size={14}
                          stroke={ACTION_ICON_STROKE}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="settings-section">
              <h4 className="settings-subsection-heading">
                {t("themeStudio.mainColors")}
              </h4>
              <ColorRow
                label={t("themeStudio.color.pageBg")}
                value={docColors.pageColor}
                onChange={(v) => {
                  detachUiLinkedSystemPresetForDocDraft();
                  ensureActiveDocPresetForDraft();
                  setDocColors((c) => ({ ...c, pageColor: v }));
                }}
              />
              <ColorRow
                label={t("themeStudio.color.bodyText")}
                value={docColors.textColor}
                onChange={(v) => {
                  detachUiLinkedSystemPresetForDocDraft();
                  ensureActiveDocPresetForDraft();
                  setDocColors((c) => ({ ...c, textColor: v }));
                }}
              />
              <ColorRow
                label={t("themeStudio.color.headingText")}
                value={docColors.headingColor}
                onChange={(v) => {
                  detachUiLinkedSystemPresetForDocDraft();
                  ensureActiveDocPresetForDraft();
                  setDocColors((c) => ({ ...c, headingColor: v }));
                }}
              />
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t("themeStudio.documentFont")}
                </div>
              </div>
              <div className="setting-item-control">
                <select
                  className="setting-select"
                  value={displayedDocFontPreset}
                  onChange={(e) => {
                    // BETA-T1: font is independent of presets — no draft/detach needed.
                    onSetDocFontPreset(e.target.value as DocumentFontPreset);
                  }}
                >
                  {(["mincho", "gothic"] as const).map((v) => (
                    <option key={v} value={v}>
                      {uiFontLabels[v]}
                    </option>
                  ))}
                  {registeredFonts.map((font) => (
                    <option key={`doc-font-${font}`} value={`custom:${font}`}>
                      {font}
                    </option>
                  ))}
                  {!hasDocBodyCustomOption && docBodyCustomFontName && (
                    <option value={currentDocFontPreset}>
                      {docBodyCustomFontName}
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-item-info">
                <div className="setting-item-name">
                  {t("themeStudio.headingFont")}
                </div>
              </div>
              <div className="setting-item-control">
                <select
                  className="setting-select"
                  value={currentDocHeadingFont}
                  onChange={(e) => {
                    // BETA-T1: font is independent of presets — no draft/detach needed.
                    onSetDocHeadingFont(e.target.value as DocumentHeadingFont);
                  }}
                >
                  {(["same-as-body", "mincho", "gothic"] as const).map((v) => (
                    <option key={v} value={v}>
                      {docHeadingFontLabels[v]}
                    </option>
                  ))}
                  {registeredFonts.map((font) => (
                    <option
                      key={`doc-heading-font-${font}`}
                      value={`custom:${font}`}
                    >
                      {font}
                    </option>
                  ))}
                  {!hasDocHeadingCustomOption && docHeadingCustomFontName && (
                    <option value={currentDocHeadingFont}>
                      {docHeadingCustomFontName}
                    </option>
                  )}
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

            <p className="setting-item-note">
              {t("themeStudio.displaySettingsNote")}
            </p>

            <div className="theme-studio-save-row">
              <ActionIconChipButton
                label={t("themeStudio.discardChanges")}
                icon={
                  <IconArrowBackUp
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={handleResetDocDraft}
                disabled={!docPresetDirty}
              />
              <ActionIconChipButton
                label={t("themeStudio.saveNew")}
                icon={<NewSaveTablerIcon />}
                onClick={() => openNewSaveDialog("doc")}
                tone="accent"
              />
              <ActionIconChipButton
                label={t("themeStudio.saveOverwrite")}
                icon={
                  <IconDeviceFloppy
                    size={ACTION_ICON_SIZE}
                    stroke={ACTION_ICON_STROKE}
                  />
                }
                onClick={handleOverwriteDoc}
                disabled={!hasActiveDocPreset || activeDocKind !== "custom"}
                tone="accent"
              />
            </div>
          </div>
        )}
      </div>

      {newSaveDialog.open && (
        <div
          ref={newSaveOverlayRef}
          className="prompt-overlay"
          onClick={closeNewSaveDialog}
        >
          <section
            className="theme-name-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-title">
              {newSaveDialog.kind === "ui"
                ? t("themeStudio.newSave.uiTitle")
                : t("themeStudio.newSave.docTitle")}
            </div>
            <label
              className="theme-name-dialog-label"
              htmlFor="theme-name-input"
            >
              {t("themeStudio.themeName")}
            </label>
            <input
              id="theme-name-input"
              type="text"
              className="setting-text-input"
              value={newSaveDialog.name}
              onChange={(e) =>
                setNewSaveDialog((prev) =>
                  prev.open ? { ...prev, name: e.target.value } : prev,
                )
              }
              maxLength={40}
              autoFocus
            />
            <div className="theme-name-dialog-actions">
              <button
                type="button"
                className="font-register-btn"
                onClick={closeNewSaveDialog}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="theme-studio-save-btn"
                onClick={handleConfirmNewSave}
                disabled={newSaveDialog.name.trim().length === 0}
              >
                {t("common.save")}
              </button>
            </div>
          </section>
        </div>
      )}

      {renameDialog.open && (
        <div
          ref={renameOverlayRef}
          className="prompt-overlay"
          onClick={closeRenameDialog}
        >
          <section
            className="theme-name-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-title">
              {renameDialog.kind === "ui"
                ? t("themeStudio.rename.uiTitle")
                : t("themeStudio.rename.docTitle")}
            </div>
            <label
              className="theme-name-dialog-label"
              htmlFor="theme-rename-input"
            >
              {t("themeStudio.themeName")}
            </label>
            <input
              id="theme-rename-input"
              type="text"
              className="setting-text-input"
              value={renameDialog.name}
              onChange={(e) =>
                setRenameDialog((prev) =>
                  prev.open ? { ...prev, name: e.target.value } : prev,
                )
              }
              maxLength={40}
              autoFocus
            />
            <div className="theme-name-dialog-actions">
              <button
                type="button"
                className="font-register-btn"
                onClick={closeRenameDialog}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="theme-studio-save-btn"
                onClick={handleConfirmRename}
                disabled={renameDialog.name.trim().length === 0}
              >
                {t("common.save")}
              </button>
            </div>
          </section>
        </div>
      )}

      {uiPreviewOpen && (
        <UiThemePreviewSandbox onClose={() => setUiPreviewOpen(false)} />
      )}
    </section>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">{label}</div>
      </div>
      <div className="setting-item-control">
        <div className="color-control">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="color-hex">{value}</span>
        </div>
      </div>
    </div>
  );
}

function UiThemePreviewSandbox({ onClose }: { onClose: () => void }) {
  return (
    <div className="theme-preview-floating-root">
      <section className="theme-preview-window">
        <div className="theme-preview-topbar">
          <span className="theme-preview-title">UIサンプルウィンドウ</span>
          <div className="theme-preview-window-actions">
            <span className="theme-preview-window-dot" />
            <span className="theme-preview-window-dot" />
            <span className="theme-preview-window-dot" />
            <button
              type="button"
              className="theme-preview-close-btn"
              onClick={onClose}
              aria-label="サンプルモーダルを閉じる"
              title="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        <div className="theme-preview-main">
          <aside className="theme-preview-pane">
            <div className="theme-preview-pane-title">メニュー</div>
            <button type="button" className="theme-preview-pane-item is-active">
              ダッシュボード
            </button>
            <button type="button" className="theme-preview-pane-item">
              ノート
            </button>
            <button type="button" className="theme-preview-pane-item">
              設定
            </button>
          </aside>

          <div className="theme-preview-divider" />

          <div className="theme-preview-content">
            <div className="theme-preview-controls">
              <button type="button" className="theme-preview-btn">
                標準ボタン
              </button>
              <button
                type="button"
                className="theme-preview-btn theme-preview-btn--accent"
              >
                アクセント
              </button>
              <input
                type="text"
                className="theme-preview-input"
                defaultValue="Input sample"
              />
              <select className="theme-preview-select" defaultValue="medium">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div className="theme-preview-scroll">
              <div className="theme-preview-scroll-inner">
                <div className="theme-preview-scroll-heading">
                  スクロールバー確認
                </div>
                {Array.from({ length: 12 }, (_, index) => (
                  <div key={index} className="theme-preview-list-row">
                    Item {index + 1} / Theme Token Preview
                  </div>
                ))}
                <div className="theme-preview-wide-row">
                  Horizontal Preview: Lorem ipsum dolor sit amet, consectetur
                  adipiscing elit, sed do eiusmod tempor incididunt ut labore et
                  dolore magna aliqua.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
