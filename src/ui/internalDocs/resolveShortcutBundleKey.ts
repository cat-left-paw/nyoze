import type { UiLanguageMode } from "../../settings/types";

/** Which bundled shortcut Markdown is shown for the internal shortcut tab. */
export type ShortcutBundleKey = "ja" | "en";

export function resolveShortcutBundleKey(
  uiLanguageMode: UiLanguageMode,
): ShortcutBundleKey {
  if (uiLanguageMode === "en") return "en";
  return "ja";
}
