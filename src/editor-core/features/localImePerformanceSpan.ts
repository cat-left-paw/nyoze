/** Existing editor dispatch spans retained after legacy strategy retirement. */
export const LOCAL_IME_PERFORMANCE_SPANS = [
  'markdown-serialize',
  'app-derived-ui',
  'ruby-punctuation',
  'ruby-decoration-map',
  'auto-tcy',
] as const

export type LocalImePerfSpan = (typeof LOCAL_IME_PERFORMANCE_SPANS)[number]
