/**
 * R3.5-1: CommonMark-safe escaping helpers for Markdown serialization.
 *
 * These helpers produce Markdown output that is resilient against breaking
 * characters (parens, quotes, brackets, backticks) so that a saved document
 * parses back into the same logical structure.
 *
 * Pure functions with no I/O; renderer-safe.
 */

const URL_NEEDS_ANGLE_BRACKETS = /[\s()<>]/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g

/**
 * Escape a Markdown link destination (href/src) for `[text](dest)` form.
 *
 * Prefer inline form with backslash escapes. If the URL contains whitespace
 * or characters the inline form cannot carry safely, fall back to angle
 * bracket form `<dest>` where `<`/`>`/`\` are backslash-escaped.
 */
export function escapeMarkdownUrlDestination(url: string): string {
  if (!url) return ''
  // Strip control characters defensively; they cannot survive a Markdown
  // roundtrip intact and upstream validators already reject them for links.
  const safe = url.replace(CONTROL_CHARS, '')
  if (URL_NEEDS_ANGLE_BRACKETS.test(safe)) {
    const escaped = safe
      .replace(/\\/g, '\\\\')
      .replace(/</g, '\\<')
      .replace(/>/g, '\\>')
    return `<${escaped}>`
  }
  return safe.replace(/\\/g, '\\\\')
}

/**
 * Escape a Markdown link/image title for the `"..."` form.
 *
 * Backslashes and double quotes are backslash-escaped; other characters
 * are kept verbatim.
 */
export function escapeMarkdownTitle(title: string): string {
  return title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Escape plain text for use inside `[...]` (link text or image alt).
 *
 * Backslash and brackets must be escaped so the closing `]` cannot be
 * misaligned.
 */
export function escapeMarkdownBracketText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

/**
 * Choose a backtick fence long enough to wrap a code block body without
 * the body closing it prematurely.
 *
 * Returns a string of at least 3 backticks, one longer than the longest
 * contiguous backtick run inside `body`.
 */
export function chooseCodeFence(body: string): string {
  const matches = body.match(/`+/g)
  let longest = 0
  if (matches) {
    for (const run of matches) {
      if (run.length > longest) longest = run.length
    }
  }
  const length = Math.max(3, longest + 1)
  return '`'.repeat(length)
}
