import { Node } from '@tiptap/core'

/**
 * Inline atom node for preserving unknown raw HTML.
 * Rendered as a placeholder badge in the editor.
 * On serialization, attrs.raw is emitted verbatim.
 */
export const HtmlInlineAtom = Node.create({
  name: 'html_inline_atom',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      raw: {
        default: '',
      },
    }
  },

  parseHTML() {
    // Parsing from HTML is handled by the Markdown parser,
    // not by TipTap's built-in HTML parser.
    return []
  },

  renderHTML({ HTMLAttributes }) {
    const raw = (HTMLAttributes.raw as string) ?? ''
    // Truncate display to first 30 chars for readability
    const label = raw.length > 30 ? raw.slice(0, 30) + '…' : raw
    return ['span', {
      class: 'html-inline-atom',
      'data-html-inline-atom': '',
      title: raw,
      contenteditable: 'false',
    }, label]
  },
})
