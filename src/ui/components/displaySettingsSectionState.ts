export type DisplaySettingsSectionKey =
  | 'basic'
  | 'writingDirection'
  | 'tcy'
  | 'font'
  | 'ruby'
  | 'heading'
  | 'spacing'
  | 'frontmatter'
  | 'uiTheme'
  | 'toolbar'
  | 'documentTheme'
  | 'caret'
  | 'paragraphPlain'
  | 'typewriter'
  | 'support'

export type DisplaySettingsSectionOpenState = Record<DisplaySettingsSectionKey, boolean>

export const DEFAULT_DISPLAY_SETTINGS_SECTION_OPEN_STATE: DisplaySettingsSectionOpenState = {
  basic: false,
  writingDirection: false,
  tcy: false,
  font: false,
  ruby: false,
  heading: false,
  spacing: false,
  frontmatter: false,
  uiTheme: false,
  toolbar: false,
  documentTheme: false,
  caret: false,
  paragraphPlain: false,
  typewriter: false,
  support: false,
}

export function createDefaultDisplaySettingsSectionOpenState(): DisplaySettingsSectionOpenState {
  return { ...DEFAULT_DISPLAY_SETTINGS_SECTION_OPEN_STATE }
}

export function resolveDisplaySettingsSectionOpenStateForVisibilityChange(
  previousOpen: boolean,
  open: boolean,
  currentState: DisplaySettingsSectionOpenState,
): DisplaySettingsSectionOpenState {
  if (!previousOpen && open) {
    return createDefaultDisplaySettingsSectionOpenState()
  }
  return currentState
}
