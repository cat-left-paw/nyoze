import { THEME_LABELS } from "../../settings/defaults";
import type { Theme, UiThemePreset } from "../../settings/types";
import { UI_THEME_VALUES } from "../../settings/themeUtils";

export type UiThemePresetGroup = {
  label: string;
  presets: UiThemePreset[];
};

export function buildBundledUiPresetGroups(
  presets: UiThemePreset[],
  curatedLabel: string,
): UiThemePresetGroup[] {
  const presetsByTheme = new Map<Theme, UiThemePreset[]>();

  for (const preset of presets) {
    const existing = presetsByTheme.get(preset.baseTheme);
    if (existing) {
      existing.push(preset);
      continue;
    }
    presetsByTheme.set(preset.baseTheme, [preset]);
  }

  return UI_THEME_VALUES.flatMap((theme) => {
    const themePresets = presetsByTheme.get(theme);
    if (!themePresets || themePresets.length === 0) return [];
    return [
      {
        label: `${curatedLabel} / ${THEME_LABELS[theme]}`,
        presets: [...themePresets].sort((a, b) =>
          a.name.localeCompare(b.name, "ja"),
        ),
      },
    ];
  });
}
