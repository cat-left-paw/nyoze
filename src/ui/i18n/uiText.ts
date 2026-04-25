import type { UiLanguageMode } from '../../settings/types'
import {
  UI_TEXT_REGISTRY,
  type UiTextEntry,
  type UiTextKey,
  type UiTextLocale,
  type UiTextVariant,
} from './uiTextRegistry'

export type { UiTextKey, UiTextLocale, UiTextVariant } from './uiTextRegistry'

export function resolveUiTextLocale(
  mode: UiLanguageMode,
  variant: UiTextVariant,
): UiTextLocale {
  if (mode === 'ja') return 'ja'
  if (mode === 'en') return 'en'
  return variant === 'helper' ? 'ja' : 'en'
}

export function getUiText(
  mode: UiLanguageMode,
  key: UiTextKey,
  variant: UiTextVariant = 'label',
): string {
  const entry = UI_TEXT_REGISTRY[key] as UiTextEntry
  const localized = entry[variant] ?? entry.label
  return localized[resolveUiTextLocale(mode, variant)]
}

export function createUiTextGetter(mode: UiLanguageMode) {
  return (key: UiTextKey, variant: UiTextVariant = 'label'): string =>
    getUiText(mode, key, variant)
}
