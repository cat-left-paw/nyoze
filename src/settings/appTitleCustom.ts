import { APP_TITLE_CUSTOM_MAX_LENGTH, DEFAULT_APP_TITLE_CUSTOM } from './defaults'

const HALF_WIDTH_CHAR_RE = /^[\u0020-\u007E\uFF61-\uFF9F]$/

function charDisplayWidth(char: string): number {
  return HALF_WIDTH_CHAR_RE.test(char) ? 1 : 2
}

export function getAppTitleCustomDisplayWidth(value: string): number {
  let width = 0
  for (const ch of value) {
    width += charDisplayWidth(ch)
  }
  return width
}

export function clampAppTitleCustom(value: string): string {
  const trimmed = value.trim()
  let width = 0
  let out = ''
  for (const ch of trimmed) {
    const next = charDisplayWidth(ch)
    if (width + next > APP_TITLE_CUSTOM_MAX_LENGTH) break
    out += ch
    width += next
  }
  return out
}

export function normalizeAppTitleCustomValue(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_APP_TITLE_CUSTOM
  return clampAppTitleCustom(value)
}
