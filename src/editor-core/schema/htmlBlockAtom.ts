import { Node } from '@tiptap/core'

/**
 * Block atom node for preserving unknown raw HTML blocks.
 * Rendered as a placeholder box in the editor.
 * On serialization, attrs.raw is emitted verbatim.
 */
export const HtmlBlockAtom = Node.create({
  name: 'html_block_atom',
  group: 'block',
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
    const label = raw.length > 60 ? raw.slice(0, 60) + '…' : raw
    return ['div', {
      class: 'html-block-atom',
      'data-html-block-atom': '',
      title: raw,
      contenteditable: 'false',
    }, label]
  },
})
