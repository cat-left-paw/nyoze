import { Node } from '@tiptap/core'
import {
  formatDirectiveToken,
  isBuiltinStyleId,
  NYOZE_DIRECTIVE_NODE_NAME,
  type DirectiveAttrs,
  type DirectiveKind,
} from '../io/customBlockDirective'

/**
 * Nyoze 独自ブロック装飾 node。
 *
 * Markdown 上の fenced directive block (`:::align-center` 等) を 1 directive =
 * 1 wrapper として保持する block node。parse / serialize は parseMarkdown /
 * serializeMarkdown が担当し、ここでは WYSIWYG 表示用の wrapper DOM だけを定義する。
 *
 * attrs:
 *   - kind:  'align' | 'indent' | 'style'
 *   - name:  align は 'center'|'end' / indent は level digit / style は style id
 *   - level: indent のみ 1..6
 *
 * 装飾は CSS class / data attr で表現し、本文 Markdown には font / color の
 * 直接値を書かない。未知 style id も class / data attr として保持する。
 */
export const NyozeDirectiveBlock = Node.create({
  name: NYOZE_DIRECTIVE_NODE_NAME,
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      // 表示は node renderHTML 側で制御するため、attr の自動 DOM 出力は行わない。
      kind: { default: 'style', rendered: false },
      name: { default: '', rendered: false },
      level: { default: null, rendered: false },
    }
  },

  parseHTML() {
    // Markdown からの parse は parseMarkdown が担当する。
    return []
  },

  renderHTML({ node }) {
    const kind = (node.attrs.kind as DirectiveKind) ?? 'style'
    const name = (node.attrs.name as string) ?? ''
    const level = (node.attrs.level as number | null) ?? null
    const token = formatDirectiveToken({ kind, name, level } satisfies DirectiveAttrs)

    const classes = ['nyoze-directive-block', `nyoze-directive-block--${token}`]
    const attrs: Record<string, string> = {
      'data-nyoze-directive': token,
      'data-nyoze-kind': kind,
    }

    if (kind === 'indent' && level !== null) {
      attrs['data-nyoze-indent-level'] = String(level)
    }
    if (kind === 'style') {
      attrs['data-nyoze-style-id'] = name
      if (!isBuiltinStyleId(name)) {
        classes.push('nyoze-directive-block--style-unknown')
      }
    }

    attrs.class = classes.join(' ')
    return ['div', attrs, 0]
  },
})
