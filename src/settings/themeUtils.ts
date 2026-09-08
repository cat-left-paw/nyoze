import type { DocumentTheme, Theme } from './types'

export const UI_THEME_VALUES: readonly Theme[] = [
  'mist',
  'taupe',
  'linen',
  'dove',
  'clay',
  'olive',
  'custom',
  'light',
  'sakura',
  'harbor',
  'sage',
  'dark',
  'moss',
  'slate',
  'merlot',
  'graphite',
  'dark-gpt',
]

export function normalizeTheme(value: unknown): Theme | null {
  if (typeof value !== 'string') return null
  return UI_THEME_VALUES.includes(value as Theme) ? (value as Theme) : null
}

export const DOCUMENT_THEME_VALUES: readonly DocumentTheme[] = [
  'ui-linked',
  'paper-light',
  'paper-dark',
  'bow',
  'wob',
  'soft-neutral',
]

export function normalizeDocumentTheme(value: unknown): DocumentTheme | null {
  if (typeof value !== 'string') return null
  return DOCUMENT_THEME_VALUES.includes(value as DocumentTheme)
    ? (value as DocumentTheme)
    : null
}
