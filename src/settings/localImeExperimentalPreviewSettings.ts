import { DEFAULT_EXPERIMENTAL_LOCAL_IME_ENABLED } from './defaults'
import type { SettingsJson } from './types'

export type ExperimentalLocalImeSettingResolution = {
  enabled: boolean
  source: 'current' | 'legacy-paragraph-overlay' | 'default-off' | 'malformed-off'
  shouldPersistMigration: boolean
}

/**
 * PUBLIC-ENTRY1 setting migration.
 *
 * Presence and validity are separate: a present malformed current value must
 * fail closed and must never revive a legacy ON value. The legacy field is a
 * read-only migration source and is intentionally not removed here.
 */
export function resolveExperimentalLocalImeEnabledSetting(input: {
  currentPresent: boolean
  currentValue: unknown
  legacyParagraphOverlayValue: unknown
}): ExperimentalLocalImeSettingResolution {
  if (input.currentPresent) {
    return typeof input.currentValue === 'boolean'
      ? {
          enabled: input.currentValue,
          source: 'current',
          shouldPersistMigration: false,
        }
      : {
          enabled: DEFAULT_EXPERIMENTAL_LOCAL_IME_ENABLED,
          source: 'malformed-off',
          shouldPersistMigration: true,
        }
  }
  if (typeof input.legacyParagraphOverlayValue === 'boolean') {
    return {
      enabled: input.legacyParagraphOverlayValue,
      source: 'legacy-paragraph-overlay',
      shouldPersistMigration: true,
    }
  }
  return {
    enabled: DEFAULT_EXPERIMENTAL_LOCAL_IME_ENABLED,
    source: 'default-off',
    shouldPersistMigration: false,
  }
}

/**
 * どのsettings writeが先行してもlegacy opt-inを失わないwrite boundary。
 * 現行fieldが無いときだけ旧booleanを移し、旧key自体は必ず除去する。
 */
export function migrateExperimentalLocalImeSettingForWrite(
  settings: SettingsJson,
): SettingsJson {
  const migrated: SettingsJson = { ...settings }
  const resolution = resolveExperimentalLocalImeEnabledSetting({
    currentPresent: Object.prototype.hasOwnProperty.call(
      migrated,
      'experimentalLocalImeEnabled',
    ),
    currentValue: migrated.experimentalLocalImeEnabled,
    legacyParagraphOverlayValue:
      migrated.experimentalLocalImeParagraphOverlayEnabled,
  })
  if (resolution.source === 'legacy-paragraph-overlay') {
    migrated.experimentalLocalImeEnabled = resolution.enabled
  }
  delete migrated.experimentalLocalImeParagraphOverlayEnabled
  return migrated
}
