import type { DocThemePreset, UiThemePreset } from "../types";

import {
  EDITORIAL_DOC_PRESETS,
  EDITORIAL_DOC_PRESETS_SUPPLEMENTAL,
  EDITORIAL_UI_PRESETS,
  EDITORIAL_UI_PRESETS_SUPPLEMENTAL,
} from "./editorial-pack";
import {
  NOCTURNE_DOC_PRESETS,
  NOCTURNE_DOC_PRESETS_SUPPLEMENTAL,
  NOCTURNE_UI_PRESETS,
  NOCTURNE_UI_PRESETS_SUPPLEMENTAL,
} from "./nocturne-pack";
import {
  QUIET_LITERARY_DOC_PRESETS,
  QUIET_LITERARY_DOC_PRESETS_SUPPLEMENTAL,
  QUIET_LITERARY_UI_PRESETS,
  QUIET_LITERARY_UI_PRESETS_SUPPLEMENTAL,
} from "./quiet-literary-pack";

export const STANDARD_UI_THEME_PRESET_ID_PREFIX = "preset-ui-";
export const STANDARD_DOC_THEME_PRESET_ID_PREFIX = "preset-doc-";
export const CURATED_UI_THEME_PRESET_ID_PREFIX = "curated-ui-";
export const CURATED_DOC_THEME_PRESET_ID_PREFIX = "curated-doc-";

/**
 * Bundled curated presets live here.
 *
 * Add future candidate packs through this registry so theme additions stay
 * localized to preset data and selection UI.
 */
export const BUNDLED_UI_THEME_PRESETS: UiThemePreset[] = [
  ...QUIET_LITERARY_UI_PRESETS,
  ...QUIET_LITERARY_UI_PRESETS_SUPPLEMENTAL,
  ...EDITORIAL_UI_PRESETS,
  ...EDITORIAL_UI_PRESETS_SUPPLEMENTAL,
  ...NOCTURNE_UI_PRESETS,
  ...NOCTURNE_UI_PRESETS_SUPPLEMENTAL,
];
export const BUNDLED_DOC_THEME_PRESETS: DocThemePreset[] = [
  ...QUIET_LITERARY_DOC_PRESETS,
  ...QUIET_LITERARY_DOC_PRESETS_SUPPLEMENTAL,
  ...EDITORIAL_DOC_PRESETS,
  ...EDITORIAL_DOC_PRESETS_SUPPLEMENTAL,
  ...NOCTURNE_DOC_PRESETS,
  ...NOCTURNE_DOC_PRESETS_SUPPLEMENTAL,
];

type PresetLike = {
  id: string;
  kind?: "system" | "custom";
};

export function isStandardUiThemePresetId(id: string): boolean {
  return id.startsWith(STANDARD_UI_THEME_PRESET_ID_PREFIX);
}

export function isStandardDocThemePresetId(id: string): boolean {
  return id.startsWith(STANDARD_DOC_THEME_PRESET_ID_PREFIX);
}

export function isCuratedUiThemePresetId(id: string): boolean {
  return id.startsWith(CURATED_UI_THEME_PRESET_ID_PREFIX);
}

export function isCuratedDocThemePresetId(id: string): boolean {
  return id.startsWith(CURATED_DOC_THEME_PRESET_ID_PREFIX);
}

export function isSystemUiThemePreset(preset: PresetLike): boolean {
  if (preset.kind) return preset.kind === "system";
  return isStandardUiThemePresetId(preset.id) || isCuratedUiThemePresetId(preset.id);
}

export function isSystemDocThemePreset(preset: PresetLike): boolean {
  if (preset.kind) return preset.kind === "system";
  return isStandardDocThemePresetId(preset.id) || isCuratedDocThemePresetId(preset.id);
}

export function isBundledUiThemePreset(preset: PresetLike): boolean {
  return isSystemUiThemePreset(preset) && !isStandardUiThemePresetId(preset.id);
}

export function isBundledDocThemePreset(preset: PresetLike): boolean {
  return isSystemDocThemePreset(preset) && !isStandardDocThemePresetId(preset.id);
}
