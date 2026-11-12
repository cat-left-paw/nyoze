import { Mark } from '@tiptap/core'
import { isValidSourceSpellingRaw, SOURCE_SPELLING_MARK_NAME } from '../io/sourceSpelling'

const RAW_ATTRIBUTE = 'data-nyoze-source-spelling'

/**
 * MD-ESCAPE-EXPLICIT1: 「この文字は、ファイルでは `raw`（`\*` や `&amp;`）の綴りだった」を覚える mark。
 *
 * 表示には何も出ない（属性だけの span。見た目を変えない）。読み込みが付け（`io/sourceSpelling.ts`）、
 * 保存が `raw` で書く。打った `\` + 記号の入力規則（`features/inlineMarkInputRules.ts`）も付ける。
 * ほかの mark（太字など）と重なってよい。`inclusive: false` なので、綴りのある文字の隣に打った文字へは
 * 引き継がれない。Nyoze の中のコピー（HTML）でも属性として残る。外から来た HTML の属性は、`raw` が
 * 有効な綴りのときだけ読む（保存は、文字と `raw` が対応しなければ mark を無視する）。
 */
export const SourceSpelling = Mark.create({
  name: SOURCE_SPELLING_MARK_NAME,

  inclusive() {
    return false
  },

  keepOnSplit: false,

  addAttributes() {
    return {
      raw: {
        default: '',
        validate: 'string',
        parseHTML: (element: HTMLElement) => element.getAttribute(RAW_ATTRIBUTE),
        renderHTML: (attributes: Record<string, unknown>) => ({ [RAW_ATTRIBUTE]: attributes.raw }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: `span[${RAW_ATTRIBUTE}]`,
        getAttrs: (element: HTMLElement | string) =>
          typeof element !== 'string' && isValidSourceSpellingRaw(element.getAttribute(RAW_ATTRIBUTE)) ? null : false,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },
})
