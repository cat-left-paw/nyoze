import type { UiLanguageMode } from "../../settings/types";
import shortcutsEn from "../../../nyoze_shortcuts_en.md?raw";
import shortcutsJa from "../../../nyoze_shortcuts_ja.md?raw";
import {
  resolveShortcutBundleKey,
  type ShortcutBundleKey,
} from "./resolveShortcutBundleKey";

export type ShortcutReferenceContent = {
  markdown: string;
  bundleKey: ShortcutBundleKey;
};

export function getShortcutReferenceContent(
  uiLanguageMode: UiLanguageMode,
): ShortcutReferenceContent {
  const bundleKey = resolveShortcutBundleKey(uiLanguageMode);
  const markdown = bundleKey === "en" ? shortcutsEn : shortcutsJa;
  return { markdown, bundleKey };
}
