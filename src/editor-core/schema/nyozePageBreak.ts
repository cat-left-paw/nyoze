import { Node } from '@tiptap/core'
import { NYOZE_PAGE_BREAK_NODE_NAME } from '../io/customBlockDirective'

/**
 * Nyoze 独自改ページ marker node。
 *
 * Markdown 上の fenced empty directive (`:::page-break` / `:::`) を表す
 * 専用 block atom。`nyozeDirectiveBlock` (block+ content の wrapper) とは
 * 別の独立 node で、本文テキスト/子 block を一切持たない。
 *
 * parse / serialize は parseMarkdown / serializeMarkdown が担当し、
 * ここでは WYSIWYG 表示専用の marker DOM だけを定義する。
 * 編集不可 (contenteditable=false) の表示専用 block で、本文操作を妨げない。
 */
export const NyozePageBreak = Node.create({
  name: NYOZE_PAGE_BREAK_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    // Markdown からの parse は parseMarkdown が担当する。
    return []
  },

  renderHTML() {
    return [
      'div',
      {
        class: 'nyoze-page-break',
        'data-nyoze-page-break': '',
        contenteditable: 'false',
      },
      ['span', { class: 'nyoze-page-break__label' }, '改ページ'],
    ]
  },
})
