/**
 * WINDOWS-RENDERER-ACCESSIBILITY-COMPAT1: 起動時だけ必要な判定。
 *
 * 一部の Windows 環境で、DeepL など一部の常駐アプリと併用したときに Nyoze の
 * 長文編集が著しく重くなる事例を確認している。同一環境で
 * `--disable-renderer-accessibility` 起動では再現せず、DeepL のテキスト置き換えも
 * 引き続き利用できた。原因カテゴリとして Chromium の renderer accessibility との
 * 相互作用が強く疑われる、という証拠境界であり、すべての Windows / DeepL 環境で
 * 起きる一般的な事実とは断定しない。
 *
 * この module は `app.whenReady()` より前・renderer 生成より前に呼ばれるため、
 * 非同期 IPC（`settings:read`）は使えない。よって settings.json を同期読みするが、
 * **schema の正本は既存の `sanitizeSettingsJson()`** で、ここには第二 schema を
 * 作らない。読み込みに失敗した場合（欠損・破損 JSON・巨大ファイル・権限）は
 * 常に安全側の OFF へ倒す。
 *
 * switch の解除は行わない。設定 OFF のときは何も追加しないだけなので、利用者が
 * コマンドラインで明示した switch はそのまま残る。runtime 中の解除・再適用も
 * しない（Chromium switch は起動時にしか効かないため）。
 */
import fs from "node:fs";

import {
  isWindowsRendererAccessibilityPlatform,
  normalizeDisableRendererAccessibilityOnWindows,
} from "../src/settings/rendererAccessibilitySettings";
import {
  MAX_SETTINGS_FILE_SIZE,
  sanitizeSettingsJson,
} from "./settingsSanitizer";

/** `app.commandLine.appendSwitch()` に渡す Chromium switch 名。 */
export const DISABLE_RENDERER_ACCESSIBILITY_SWITCH =
  "disable-renderer-accessibility";

/**
 * pure: platform と設定値から switch を付けるかどうかだけを決める。
 *
 * - Windows 以外は設定値に関わらず常に false
 * - Windows でも boolean `true` のときだけ true（欠損 / 不正値は false）
 */
export function resolveDisableRendererAccessibilitySwitch(options: {
  platform: string;
  settingValue: unknown;
}): boolean {
  if (!isWindowsRendererAccessibilityPlatform(options.platform)) return false;
  return normalizeDisableRendererAccessibilityOnWindows(options.settingValue);
}

/**
 * 起動時に profile の settings.json を同期読みし、opt-in の boolean だけを返す。
 *
 * 呼び出し側は userData path の dev / E2E 切り替えを**確定した後**の path を渡す。
 * サイズ上限・JSON parse・sanitizer・boolean 検証のどれかで失敗したら false。
 */
export function readDisableRendererAccessibilityOnWindowsSetting(
  settingsJsonPath: string,
): boolean {
  try {
    const stat = fs.statSync(settingsJsonPath);
    if (!stat.isFile()) return false;
    if (stat.size > MAX_SETTINGS_FILE_SIZE) return false;
    const sanitized = sanitizeSettingsJson(
      JSON.parse(fs.readFileSync(settingsJsonPath, "utf-8")),
    );
    if (!sanitized) return false;
    return normalizeDisableRendererAccessibilityOnWindows(
      sanitized.disableRendererAccessibilityOnWindows,
    );
  } catch {
    return false;
  }
}

/**
 * 起動時の最終判定。Windows でなければ settings.json を読みにも行かない。
 */
export function resolveStartupDisableRendererAccessibility(options: {
  platform: string;
  settingsJsonPath: string;
}): boolean {
  if (!isWindowsRendererAccessibilityPlatform(options.platform)) return false;
  return resolveDisableRendererAccessibilitySwitch({
    platform: options.platform,
    settingValue: readDisableRendererAccessibilityOnWindowsSetting(
      options.settingsJsonPath,
    ),
  });
}
