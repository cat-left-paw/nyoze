/**
 * Code block language alias normalization.
 *
 * Maps common short aliases to canonical language names recognized by lowlight/highlight.js.
 * Used by the lowlight code-block extension so that `py`, `js`, etc. resolve correctly.
 */

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  html: 'xml',
  htm: 'xml',
  yml: 'yaml',
  rs: 'rust',
  md: 'markdown',
  jsonc: 'json',
}

/**
 * Normalize a language string to its canonical lowlight name.
 *
 * Returns the canonical name if an alias mapping exists, otherwise returns
 * the original value lowercased.
 * Returns `undefined` for empty / nullish input.
 */
export function normalizeCodeBlockLanguage(language: string | null | undefined): string | undefined {
  if (!language) return undefined
  const lower = language.trim().toLowerCase()
  if (lower.length === 0) return undefined
  return LANGUAGE_ALIASES[lower] ?? lower
}
