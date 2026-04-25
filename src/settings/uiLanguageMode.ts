import type { UiLanguageMode } from './types'

export const UI_LANGUAGE_MODE_VALUES = ['ja', 'en', 'mixed'] as const satisfies readonly UiLanguageMode[]

export function isUiLanguageMode(value: unknown): value is UiLanguageMode {
  return (
    value === UI_LANGUAGE_MODE_VALUES[0] ||
    value === UI_LANGUAGE_MODE_VALUES[1] ||
    value === UI_LANGUAGE_MODE_VALUES[2]
  )
}

export function normalizeUiLanguageMode(value: unknown): UiLanguageMode | null {
  return isUiLanguageMode(value) ? value : null
}

export function resolveDefaultUiLanguageMode(
  preferredLanguages: readonly string[] | null | undefined,
): UiLanguageMode {
  if (Array.isArray(preferredLanguages)) {
    for (const language of preferredLanguages) {
      if (typeof language !== 'string') continue
      if (/^ja(?:[-_]|$)/i.test(language.trim())) return 'ja'
    }
  }
  return 'mixed'
}
