import {
  DOCUMENT_THEME_COLOR_PRESETS,
  DOCUMENT_THEME_LABELS,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  UI_THEME_DOC_COLOR_PRESETS,
  UI_THEME_MAIN_COLORS,
  UI_THEME_STORAGE_KEY,
} from './defaults'
import {
  loadAppTitleColor,
  loadAppTitleCustom,
  loadAppTitleFont,
  loadAppTitlePreset,
  loadAppTitleVisible,
  loadDisplaySettings,
  loadDocColorSettings,
  loadDocHeadingFont,
  loadDocFontPreset,
  loadDocumentTheme,
  loadLineBreakPolicy,
  loadRegisteredFonts,
  loadRubyVisibility,
  loadSelectedFont,
  loadSettingsJson,
  loadUiFontScale,
  loadUiTextPrimary,
  loadUiFont,
  loadUiTheme,
  patchSettingsJson,
  saveSettingsJson,
  validateDocThemePresets,
  validateUiThemePresets,
} from './storage'
import { UI_THEME_VALUES } from './themeUtils'
// Note: loadUiFont, loadUiFontScale, loadDocFontPreset, loadDocHeadingFont are still
// used for migrateToSettingsJson (individual settings persistence), not for presets.
import type { DocThemePreset, DocumentTheme, SettingsJson, Theme, UiThemePreset } from './types'
const DOCUMENT_THEME_VALUES: DocumentTheme[] = [
  'ui-linked',
  'paper-light',
  'paper-dark',
  'bow',
  'wob',
  'soft-neutral',
]

function isValidUiThemeValue(value: unknown): value is Theme {
  return UI_THEME_VALUES.includes(value as Theme)
}

function isSameUiPresetColors(a: UiThemePreset['colors'], b: UiThemePreset['colors']): boolean {
  return (
    a.baseBg === b.baseBg &&
    a.surfaceBg === b.surfaceBg &&
    a.textPrimary === b.textPrimary &&
    (a.paneBg ?? undefined) === (b.paneBg ?? undefined) &&
    a.accent === b.accent &&
    a.border === b.border &&
    a.paneBorder === b.paneBorder &&
    a.scrollbarBase === b.scrollbarBase
  )
}

function isSameUiPreset(a: UiThemePreset, b: UiThemePreset): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.baseTheme === b.baseTheme &&
    isSameUiPresetColors(a.colors, b.colors)
  )
}

function areUiPresetListsEquivalent(a: UiThemePreset[], b: UiThemePreset[]): boolean {
  if (a.length !== b.length) return false
  const byId = new Map(b.map((preset) => [preset.id, preset]))
  for (const preset of a) {
    const other = byId.get(preset.id)
    if (!other) return false
    if (!isSameUiPreset(preset, other)) return false
  }
  return true
}

function isSystemUiPreset(preset: UiThemePreset): boolean {
  if (preset.kind) return preset.kind === 'system'
  return preset.id.startsWith('preset-ui-')
}

function isSystemDocPreset(preset: DocThemePreset): boolean {
  if (preset.kind) return preset.kind === 'system'
  return preset.id.startsWith('preset-doc-')
}

function buildSystemUiPreset(theme: Theme, overrides?: Partial<UiThemePreset>): UiThemePreset {
  const mainColors = UI_THEME_MAIN_COLORS[theme]
  return {
    id: `preset-ui-${theme}`,
    name: THEME_LABELS[theme],
    kind: 'system',
    createdAt: new Date().toISOString(),
    baseTheme: theme,
    colors: {
      baseBg: mainColors.baseBg,
      surfaceBg: mainColors.surfaceBg,
      textPrimary: mainColors.textPrimary,
      accent: mainColors.accent,
      border: mainColors.border,
      paneBorder: mainColors.paneBorder,
      scrollbarBase: mainColors.scrollbarBase,
    },
    ...overrides,
  }
}

function buildSystemDocPreset(
  docTheme: DocumentTheme,
  uiTheme: Theme,
  overrides?: Partial<DocThemePreset>,
): DocThemePreset {
  const colors = docTheme === 'ui-linked'
    ? UI_THEME_DOC_COLOR_PRESETS[uiTheme]
    : DOCUMENT_THEME_COLOR_PRESETS[docTheme]

  return {
    id: `preset-doc-${docTheme}`,
    name: DOCUMENT_THEME_LABELS[docTheme],
    kind: 'system',
    createdAt: new Date().toISOString(),
    baseDocTheme: docTheme,
    colors: {
      pageColor: colors.pageColor,
      textColor: colors.textColor,
      headingColor: colors.headingColor,
    },
    ...overrides,
  }
}

/**
 * Phase5-H: migrate legacy `nyoze.theme` → `nyoze.uiTheme`.
 *
 * - If `nyoze.uiTheme` already exists, do nothing (migration already ran).
 * - If `nyoze.theme` exists but `nyoze.uiTheme` doesn't, copy the value.
 * - The legacy key is NOT removed so that a rollback scenario remains safe.
 * - `nyoze.documentTheme` defaults to 'ui-linked' (handled by loadDocumentTheme).
 */
export function runSettingsMigration(): void {
  try {
    const hasNewKey = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (hasNewKey !== null) return // already migrated

    const legacy = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (legacy) {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, legacy)
    }
  } catch {
    // ignore — localStorage may be unavailable in tests
  }
}

/**
 * Phase5-H Slice 3: migrate localStorage settings → settings.json.
 *
 * On first launch (when settings.json is empty/missing), consolidate all
 * existing localStorage display-related values into settings.json so that
 * the IPC-based persistence layer becomes the primary source of truth.
 *
 * This is a one-shot migration: once settings.json has content, it will
 * not overwrite anything.
 */
export async function migrateToSettingsJson(): Promise<void> {
  try {
    const existing = await loadSettingsJson()
    // If settings.json already has any keys, migration was already done
    if (Object.keys(existing).length > 0) return

    const patch: SettingsJson = {
      uiTheme: loadUiTheme(),
      uiFont: loadUiFont(),
      uiTextPrimary: loadUiTextPrimary(),
      uiFontScale: loadUiFontScale(),
      appTitleVisible: loadAppTitleVisible(),
      appTitlePreset: loadAppTitlePreset(),
      appTitleCustom: loadAppTitleCustom(),
      appTitleColor: loadAppTitleColor(),
      appTitleFont: loadAppTitleFont(),
      displaySettings: loadDisplaySettings(),
      documentTheme: loadDocumentTheme(),
      docFontPreset: loadDocFontPreset(),
      docHeadingFont: loadDocHeadingFont(),
      docColorSettings: loadDocColorSettings(),
      registeredFonts: loadRegisteredFonts(),
      selectedFont: loadSelectedFont(),
      rubyVisible: loadRubyVisibility(),
      lineBreakPolicy: loadLineBreakPolicy(),
    }
    await saveSettingsJson(patch)
  } catch (err) {
    console.warn('migrateToSettingsJson failed:', err)
  }
}

/**
 * Phase5-H Slice1: migrate existing individual settings → theme presets.
 *
 * One-shot: runs only when preset collections are missing.
 * Builds full system presets for UI and document themes and maps the current
 * selected themes to active preset ids.
 * Existing individual settings keys are NOT removed (rollback safety).
 */
export async function migrateToThemePresets(): Promise<void> {
  try {
    const existing = await loadSettingsJson()
    const existingUiPresets = validateUiThemePresets(existing.uiThemePresets)
    const allDocPresets = validateDocThemePresets(existing.docThemePresets)
    const existingDocPresets = allDocPresets.filter((preset) => preset.id !== 'preset-doc-default')
    const removedLegacyDefault = existingDocPresets.length !== allDocPresets.length
    const hasUiPresets = existingUiPresets.length > 0
    const hasDocPresets = existingDocPresets.length > 0

    const loadedTheme = loadUiTheme()
    const baseTheme = isValidUiThemeValue(existing.uiTheme) ? existing.uiTheme : loadedTheme

    const systemUiPresets = UI_THEME_VALUES.map((theme) =>
      buildSystemUiPreset(
        theme,
        theme === baseTheme
          ? {
              colors: {
                ...UI_THEME_MAIN_COLORS[theme],
                textPrimary: existing.uiTextPrimary ?? UI_THEME_MAIN_COLORS[theme].textPrimary,
              },
            }
          : undefined,
      ),
    )

    const baseDocTheme = existing.documentTheme ?? loadDocumentTheme()
    const docColorSettings = existing.docColorSettings ?? loadDocColorSettings()
    const systemDocPresets = DOCUMENT_THEME_VALUES.map((docTheme) =>
      buildSystemDocPreset(
        docTheme,
        baseTheme,
        docTheme === baseDocTheme
          ? {
              colors: {
                pageColor: docColorSettings.pageColor,
                textColor: docColorSettings.textColor,
                headingColor: docColorSettings.headingColor,
              },
            }
          : undefined,
      ),
    )

    const patch: Partial<SettingsJson> = {}
    if (existing.themePresetSchemaVersion !== 1) {
      patch.themePresetSchemaVersion = 1
    }
    const customUiPresets = existingUiPresets.filter((preset) => !isSystemUiPreset(preset))
    const nextUiPresets = [...systemUiPresets, ...customUiPresets]
    if (!hasUiPresets || !areUiPresetListsEquivalent(existingUiPresets, nextUiPresets)) {
      patch.uiThemePresets = nextUiPresets
    }
    const activeUiPresetId = existing.activeUiThemePresetId ?? null
    if (
      activeUiPresetId === null ||
      !nextUiPresets.some((preset) => preset.id === activeUiPresetId)
    ) {
      patch.activeUiThemePresetId = `preset-ui-${baseTheme}`
    }
    if (!hasDocPresets) {
      patch.docThemePresets = systemDocPresets
      patch.activeDocThemePresetId = `preset-doc-${baseDocTheme}`
    } else {
      const systemDocThemes = new Set(
        existingDocPresets.filter(isSystemDocPreset).map((preset) => preset.baseDocTheme),
      )
      const missingSystemDocPresets = DOCUMENT_THEME_VALUES
        .filter((docTheme) => !systemDocThemes.has(docTheme))
        .map((docTheme) => buildSystemDocPreset(docTheme, baseTheme))
      const nextDocPresets = [
        ...existingDocPresets,
        ...missingSystemDocPresets,
      ]
      if (removedLegacyDefault || missingSystemDocPresets.length > 0) {
        patch.docThemePresets = nextDocPresets
      }
      const activeDocPresetId = existing.activeDocThemePresetId ?? null
      if (
        activeDocPresetId === null ||
        activeDocPresetId === 'preset-doc-default' ||
        (activeDocPresetId !== null && !nextDocPresets.some((preset) => preset.id === activeDocPresetId))
      ) {
        patch.activeDocThemePresetId = `preset-doc-${baseDocTheme}`
      }
    }

    if (Object.keys(patch).length > 0) {
      await patchSettingsJson(patch)
    }
  } catch (err) {
    console.warn('migrateToThemePresets failed:', err)
  }
}
