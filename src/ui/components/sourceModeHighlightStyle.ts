import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Source Mode markdown highlighting should follow the active document theme.
 *
 * CodeMirror's defaultHighlightStyle ships with fixed colors, which makes
 * markdown punctuation such as `##`, `**`, `-`, `>`, `!`, and backticks hard
 * to read on dark document themes. This custom style keeps the Obsidian-like
 * decorated source presentation while routing colors through Nyoze's theme
 * variables.
 */
export const sourceModeHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.meta, tags.processingInstruction, tags.punctuation, tags.separator],
    color: 'var(--text-muted)',
  },
  {
    tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    color: 'var(--text-heading)',
    fontWeight: '700',
  },
  {
    tag: tags.strong,
    fontWeight: '700',
  },
  {
    tag: tags.emphasis,
    fontStyle: 'italic',
  },
  {
    tag: tags.strikethrough,
    textDecoration: 'line-through',
  },
  {
    tag: [tags.link, tags.url],
    color: 'var(--accent-link)',
    textDecoration: 'underline',
  },
  {
    tag: tags.quote,
    color: 'var(--blockquote-text)',
  },
  {
    tag: [tags.monospace, tags.string],
    color: 'var(--syntax-string)',
  },
])
