import { DEFAULT_DISABLE_RENDERER_ACCESSIBILITY_ON_WINDOWS } from './defaults'

/**
 * WINDOWS-RENDERER-ACCESSIBILITY-COMPAT1: settings 値の正規化。
 *
 * boolean 以外（欠損 / 文字列 / 数値 / null / object / 旧 settings）はすべて
 * 既定の `false` へ落とす。設定リセットも同じ既定へ戻る。
 */
export function normalizeDisableRendererAccessibilityOnWindows(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return DEFAULT_DISABLE_RENDERER_ACCESSIBILITY_ON_WINDOWS
}

/**
 * settings.json hydration 時に「state をどうするか」を決める pure helper。
 *
 * settings.json が正本だが、**field 欠損は「OFF」ではなく「未知」**として扱う。
 * 前回の settings write 失敗や、この field を持たない既存 settings.json では、
 * localStorage 由来の値（`storedValue`）を維持しないと ON が消え、次回起動でも
 * switch が適用されなくなる。
 *
 * main 側 sanitizer が boolean 以外を落とすため renderer に届くのは
 * boolean か欠損だけだが、防御的に非 boolean も「欠損」と同じ扱いにする。
 *
 * `needsSettingsBackfill` が true のときは、`settingsSyncReady` 後の persistence
 * effect が `storedValue` を settings.json へ書き戻して両者を一致させる。
 */
export function resolveDisableRendererAccessibilityHydration(options: {
  /** localStorage 由来の現在値（state の初期値）。 */
  storedValue: boolean
  /** settings.json から読めた値。欠損なら `undefined`。 */
  settingsValue: unknown
}): { value: boolean; needsSettingsBackfill: boolean } {
  if (typeof options.settingsValue === 'boolean') {
    return { value: options.settingsValue, needsSettingsBackfill: false }
  }
  return { value: options.storedValue, needsSettingsBackfill: true }
}

/**
 * この platform で Windows 互換性設定を扱ってよいか。
 *
 * UI section の表示条件と、起動時 switch の platform gate の**共通の正本**。
 * macOS / Linux では常に false（section も出さない、switch も付けない）。
 */
export function isWindowsRendererAccessibilityPlatform(platform: string): boolean {
  return platform === 'win32'
}

/**
 * Windows 互換性 section を表示してよいか（UI 側の唯一の判定）。
 */
export function isWindowsCompatibilitySectionVisible(platform: string): boolean {
  return isWindowsRendererAccessibilityPlatform(platform)
}
