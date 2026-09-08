import { Node } from '@tiptap/core'

/**
 * TCY body の製品制約（1-4 chars from `[A-Za-z0-9!?]`）の単一の正本。
 * `EditorCore` の toggle 判定と Local Window の capability 判定が共有する。
 */
export const AOZORA_TCY_BODY_PATTERN = /^[A-Za-z0-9!?]{1,4}$/

/**
 * Inline node for tate-chu-yoko (horizontal-in-vertical text).
 *
 * Syntax: ｟body｠
 * Constraint: body must be 1-4 chars from [A-Za-z0-9!?]
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
