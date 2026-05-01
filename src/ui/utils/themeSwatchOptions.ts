import type {
  DocThemePreset,
  DocumentColorSettings,
  DocumentTheme,
  Theme,
  UiThemePreset,
} from "../../settings/types";
import {
  DOCUMENT_THEME_COLOR_PRESETS,
  UI_THEME_DOC_COLOR_PRESETS,
  UI_THEME_MAIN_COLORS,
} from "../../settings/defaults";

/**
 * UI theme / document theme 選択用に、未選択でも色味を比較できる軽い swatch を作る helper。
 * native `<select>` の option では色チップを描けないので、custom menu 用に分離している。
 */

export type ThemeSwatchOption<V extends string = string> = {
  value: V;
  label: string;
  swatches: string[];
  kind?: "system" | "custom";
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

function pushSwatch(target: string[], color: string | null | undefined): void {
  if (!color) return;
  if (typeof color !== "string") return;
  if (!HEX_COLOR_PATTERN.test(color)) return;
  if (target.includes(color)) return;
  target.push(color);
}

/** UI theme カラーから 2 色 swatch を作る (base / accent) */
export function getUiThemeSwatches(theme: Theme): string[] {
  const colors = UI_THEME_MAIN_COLORS[theme];
  const swatches: string[] = [];
  pushSwatch(swatches, colors.baseBg);
  pushSwatch(swatches, colors.accent);
  return swatches.slice(0, 2);
}

/** UI preset カラーから 2 色 swatch を作る (base / accent) */
export function getUiPresetSwatches(preset: UiThemePreset): string[] {
  const colors = preset.colors;
  const swatches: string[] = [];
  pushSwatch(swatches, colors.baseBg);
  pushSwatch(swatches, colors.accent);
  return swatches.slice(0, 2);
}

/**
 * Document theme から 2 色 swatch を作る (page / text)。
 * `ui-linked` のときは適用結果と一致させるため、active UI preset があれば
 * その `surfaceBg` / `textPrimary` を優先する（`resolveDocThemeColors()` と同じ規則）。
 */
export function getDocumentThemeSwatches(
  theme: DocumentTheme,
  uiTheme: Theme,
  activeUiPreset?: Pick<UiThemePreset, "colors"> | null,
): string[] {
  let settings: DocumentColorSettings;
  if (theme === "ui-linked") {
    if (activeUiPreset) {
      settings = {
        pageColor: activeUiPreset.colors.surfaceBg,
        textColor: activeUiPreset.colors.textPrimary,
        headingColor: activeUiPreset.colors.textPrimary,
      };
    } else {
      settings = UI_THEME_DOC_COLOR_PRESETS[uiTheme];
    }
  } else {
    settings = DOCUMENT_THEME_COLOR_PRESETS[theme];
  }
  const swatches: string[] = [];
  pushSwatch(swatches, settings.pageColor);
  pushSwatch(swatches, settings.textColor);
  return swatches.slice(0, 2);
}

/** Document preset から 2 色 swatch を作る (page / text) */
export function getDocumentPresetSwatches(preset: DocThemePreset): string[] {
  const swatches: string[] = [];
  pushSwatch(swatches, preset.colors.pageColor);
  pushSwatch(swatches, preset.colors.textColor);
  return swatches.slice(0, 2);
}
