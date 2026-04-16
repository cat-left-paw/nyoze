import type {
  DocThemePreset,
  DocumentColorSettings,
  Theme,
  UiThemePreset,
} from '../settings/types'

export type UiPresetChangeKind = 'theme' | 'font' | 'textPrimary' | 'fontScale'
export type DocPresetChangeKind = 'documentTheme' | 'docFontPreset' | 'docHeadingFont' | 'docColors'

export function nextUiActivePresetIdForChange(
  activePresetId: string | null,
  change: UiPresetChangeKind,
): string | null {
  if (activePresetId === null) return null
  return change === 'theme' || change === 'textPrimary' ? null : activePresetId
}

export function nextDocActivePresetIdForChange(
  activePresetId: string | null,
  change: DocPresetChangeKind,
): string | null {
  if (activePresetId === null) return null
  return change === 'documentTheme' || change === 'docColors' ? null : activePresetId
}

export function isSameUiPresetColors(
  a: UiThemePreset['colors'],
  b: UiThemePreset['colors'],
): boolean {
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

export function isSameDocPresetColors(
  a: DocThemePreset['colors'],
  b: DocumentColorSettings,
): boolean {
  return (
    a.pageColor === b.pageColor &&
    a.textColor === b.textColor &&
    a.headingColor === b.headingColor
  )
}

export function isUiPresetDirty(
  preset: UiThemePreset,
  draftBaseTheme: Theme,
  draftColors: UiThemePreset['colors'],
): boolean {
  return preset.baseTheme !== draftBaseTheme || !isSameUiPresetColors(preset.colors, draftColors)
}

export function isDocPresetDirty(
  preset: DocThemePreset,
  draftColors: DocumentColorSettings,
): boolean {
  return !isSameDocPresetColors(preset.colors, draftColors)
}
