import { Node } from '@tiptap/core'

/**
 * Inline node for tate-chu-yoko (horizontal-in-vertical text).
 *
 * Syntax: ｟body｠
 * Constraint: body must be 2-4 chars from [A-Za-z0-9!?]
 * Invalid bodies are not converted to this node (remain as plain text).
 */
export const AozoraTcy = Node.create({
  name: 'aozoraTcy',

  inline: true,
  group: 'inline',
  atom: true,
  content: 'text*',
  selectable: true,

  parseHTML() {
    return [
      {
        tag: 'span.tategaki-md-tcy[data-tategaki-tcy]',
      },
      {
        tag: 'span[data-tategaki-tcy]',
      },
    ]
  },

  renderHTML() {
    return [
      'span',
      {
        class: 'tategaki-md-tcy',
        'data-tategaki-tcy': '1',
        contenteditable: 'false',
        draggable: 'false',
      },
      0,
    ]
  },
})
