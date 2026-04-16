import { Node } from '@tiptap/core'

/**
 * Inline node for Aozora-bunko ruby annotation.
 *
 * Rendered as pseudo-ruby DOM (not native <ruby><rt>) to avoid
 * caret navigation issues inside contenteditable.
 *
 * attrs:
 *   ruby: the ruby (furigana) text
 *   hasDelimiter: whether the original syntax used ｜ prefix
 */
export const AozoraRuby = Node.create({
  name: 'aozoraRuby',

  inline: true,
  group: 'inline',
  content: 'text*',
  selectable: true,

  addAttributes() {
    return {
      ruby: {
        default: '',
      },
      hasDelimiter: {
        default: false,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span.tategaki-aozora-ruby[data-aozora-ruby]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          const rubyText = element.querySelector(
            '.tategaki-aozora-ruby-rt',
          )?.textContent
          const ruby = rubyText ?? ''
          const hasDelimiter =
            element.getAttribute('data-aozora-delimiter') === '1'
          return { ruby, hasDelimiter }
        },
        contentElement: (element) =>
          (element as HTMLElement).querySelector(
            'span[data-aozora-base]',
          ) as HTMLElement,
      },
    ]
  },

  renderHTML({ node }) {
    return [
      'span',
      {
        class: 'tategaki-aozora-ruby',
        'data-aozora-ruby': '1',
        'data-aozora-delimiter': node.attrs.hasDelimiter ? '1' : '0',
      },
      ['span', { 'data-aozora-base': '1' }, 0],
      [
        'span',
        {
          class: 'tategaki-aozora-ruby-rt',
          'data-pm-ignore': 'true',
          contenteditable: 'false',
          draggable: 'false',
          'aria-hidden': 'true',
        },
        node.attrs.ruby ?? '',
      ],
    ]
  },
})
