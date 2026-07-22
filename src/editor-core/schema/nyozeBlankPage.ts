import { Node } from '@tiptap/core'
import { NYOZE_BLANK_PAGE_NODE_NAME } from '../io/customBlockDirective'

/**
 * Nyoze 独自空白ページ marker node。
 *
 * Markdown 上の fenced empty directive (`:::blank-page` / `:::blank-page-N` /
 * `:::`) を表す専用 block atom。`nyozePageBreak`（次の有効 block の
 * `breakBefore` として扱う制御命令）とは意味が異なり、その位置に意図的な
 * 空白ページを `count` 枚挿入する固定ページ要素として扱う
 * （`docs/page-break-render-model-spec-2026-07.md` §2 / §3.2 参照）。
 *
 * parse / serialize は parseMarkdown / serializeMarkdown が担当し、ここでは
 * WYSIWYG 表示専用の marker DOM だけを定義する。編集不可
 * (contenteditable=false) の表示専用 block で、本文操作を妨げない。
 *
 * toolbar / 右クリックメニューからの挿入・枚数指定 UI は今回のスライスでは
 * 実装しない（Source Mode での直接入力・既存 NodeSelection の Delete /
 * Backspace による削除だけをサポートする）。
 */
export const NyozeBlankPage = Node.create({
  name: NYOZE_BLANK_PAGE_NODE_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      count: { default: 1 },
    }
  },

  parseHTML() {
    // Markdown からの parse は parseMarkdown が担当する。
    return []
  },

  renderHTML({ node }) {
    const count = (node.attrs.count as number) ?? 1
    const label = count > 1 ? `空白ページ x ${count}` : '空白ページ'
    return [
      'div',
      {
        class: 'nyoze-blank-page',
        'data-nyoze-blank-page': '',
        contenteditable: 'false',
      },
      ['span', { class: 'nyoze-blank-page__label' }, label],
    ]
  },
})
