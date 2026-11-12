import Bold from '@tiptap/extension-bold'
import { Code } from '@tiptap/extension-code'
import Link from '@tiptap/extension-link'
import Italic from '@tiptap/extension-italic'
import ListItem from '@tiptap/extension-list-item'
import Strike from '@tiptap/extension-strike'
import StarterKit from '@tiptap/starter-kit'
import { NyozeCodeBlockHighlight } from './codeBlockHighlight'
import { HtmlInlineAtom } from '../schema/htmlInlineAtom'
import { HtmlBlockAtom } from '../schema/htmlBlockAtom'
import { NoteAnchor } from '../schema/noteAnchor'
import { NyozeDirectiveBlock } from '../schema/nyozeDirectiveBlock'
import { NyozePageBreak } from '../schema/nyozePageBreak'
import { NyozeBlankPage } from '../schema/nyozeBlankPage'
import { AozoraRuby } from '../schema/aozoraRuby'
import { AozoraTcy } from '../schema/aozoraTcy'
import { Highlight } from '../schema/highlight'
import { Underline } from '../schema/underline'
import { SourceSpelling } from '../schema/sourceSpelling'
import { NyozeImage } from '../schema/nyozeImage'
import { AutoTcyDecoration } from './autoTcyDecoration'
import { HeadingFold } from './headingFold'
import { SearchHighlight } from './searchHighlight'
import { ReferenceDefinitionDecoration } from './referenceDefinitionDecoration'
import { SpecialInlineBoundarySentinel } from './specialInlineBoundarySentinel'
import { NoteAnchorProtection } from './noteAnchorProtection'
import { LocalImeLocalWindowReservation } from './localImeLocalWindowReservationDecoration'
import { ViewDescIdentity } from './viewDescIdentity'
import { VisualFocusBlockDecoration } from './visualFocusBlockDecoration'
import type { VisualFocusBlockDecorationOptions } from './visualFocusBlockDecoration'
import { InlineMarkInputRulesHost } from './inlineMarkInputRulesHost'
import { ParagraphReparse } from './paragraphReparse'
import type { ParagraphReparsePluginOptions } from '../features/paragraphReparse/reparsePlugin'
import { isInputSurfaceCapable } from '../features/inputSurface/inputSurfaceGate'
import { InputSurfaceFocus } from '../features/inputSurface/focusCommand'
import { withSourceSpellingInputRuleGuard } from './sourceSpellingInputRuleGuard'

export const DEFAULT_EDITOR_CONTENT = `
  <p></p>
`.trim()

export type BuildExtensionsOptions = {
  autoTcy?: {
    isEnabled: () => boolean
    getDigitRange: () => { minDigits: number; maxDigits: number }
    getNumbersOnly?: () => boolean
    beginPerfSpan?: () => (() => void) | null
  }
  visualFocus?: VisualFocusBlockDecorationOptions
  /** EDITOR-PARAGRAPH-REPARSE1: 渡したときだけ、段落を離れたときの読み直しの plugin を editor の生成時に登録する。 */
  paragraphReparse?: ParagraphReparsePluginOptions
}

export function buildExtensions(options?: BuildExtensionsOptions) {
  return [
    // commandの差し替えはeditorの生成時にしか登録できない。portがない・ineligibleなら元のfocusへ委譲する。
    ...(isInputSurfaceCapable() ? [InputSurfaceFocus] : []),
    // MD-ESCAPE-EXPLICIT1: StarterKit の入力規則（見出し・引用・リスト・水平線）は、綴りのある文字（ファイルの `\#` など）を
    // 含む範囲では何もしない。子の拡張は名前・順序を変えず、規則だけを包む。
    StarterKit.extend({
      addExtensions() {
        return (this.parent?.() ?? []).map(withSourceSpellingInputRuleGuard)
      },
    }).configure({
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      link: false,
      listItem: false,
      // Code を StarterKit から外して直後に同じ Code を明示登録する（mark 登録順は変えない:
      // StarterKit が提供する mark は元から code だけ）。mark の入力規則は、Tiptap の input rule の
      // 仕組みから外して `InlineMarkInputRulesHost` の plugin に移した（下の各 mark の
      // `addInputRules()` は `[]`。override を消すと vendor の既定の規則が戻る）。
      code: false,
      codeBlock: false,
    }),
    Code.configure({
      HTMLAttributes: {
        class: 'tategaki-md-code',
      },
    }).extend({
      addInputRules() {
        return []
      },
    }),
    Bold.extend({
      inclusive() {
        return false
      },
      addInputRules() {
        return []
      },
    }),
    Italic.extend({
      inclusive() {
        return false
      },
      addInputRules() {
        return []
      },
    }),
    Strike.extend({
      inclusive() {
        return false
      },
      addInputRules() {
        return []
      },
    }),
    // EDITOR-INPUT-RULE-INLINE-NODE1: mark の入力規則（共有の run を使う plugin）。
    InlineMarkInputRulesHost,
    ListItem.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          checked: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const val = element.getAttribute('data-checked')
              if (val === 'true') return true
              if (val === 'false') return false
              return null
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              if (attributes.checked === null || attributes.checked === undefined) return {}
              return { 'data-checked': String(attributes.checked) }
            },
          },
        }
      },
    }),
    Link.extend({
      inclusive() {
        return false
      },
      addAttributes() {
        return {
          ...this.parent?.(),
          title: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute('title'),
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.title) return {}
              return { title: attributes.title }
            },
          },
        }
      },
    }).configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
    }),
    withSourceSpellingInputRuleGuard(NyozeCodeBlockHighlight),
    Highlight,
    Underline,
    // MD-ESCAPE-EXPLICIT1: 文字の元の綴り（`\*` `&amp;`）を覚える、表示に出ない mark。
    SourceSpelling,
    NyozeImage,
    HtmlInlineAtom,
    HtmlBlockAtom,
    NoteAnchor,
    NoteAnchorProtection,
    NyozeDirectiveBlock,
    NyozePageBreak,
    NyozeBlankPage,
    AozoraRuby,
    AozoraTcy,
    SpecialInlineBoundarySentinel,
    options?.autoTcy ? AutoTcyDecoration.configure(options.autoTcy) : AutoTcyDecoration,
    HeadingFold,
    SearchHighlight,
    // MD-ESCAPE-EXPLICIT1: リンクの定義の行（`[注]: 説明`）の `[注]:` を薄く表示する。
    ReferenceDefinitionDecoration,
    // EDITOR-VIEWDESC-IDENTITY-PERF1: view の更新の後に、block の desc の node を文書の node と
    // 同じ object に保つ（state・props・decoration を持たない）。
    ViewDescIdentity,
    ...(options?.visualFocus
      ? [VisualFocusBlockDecoration.configure(options.visualFocus)]
      : []),
    // EDITOR-PARAGRAPH-REPARSE1: 段落を離れたときの読み直し（Decoration を持たないので、合成順の注記の対象外）。
    ...(options?.paragraphReparse ? [ParagraphReparse.configure(options.paragraphReparse)] : []),
    // LOCAL-WINDOW-RESERVATION-PLUGIN-LIFETIME1: Local Window の source / reservation
    // Decoration は host の**固定** plugin 構成に含める。Start / Stop で
    // `state.reconfigure()` しないため、host の全 plugin view が再生成されない。
    // 旧方式は `state.plugins` の末尾へ動的追加していたので、Decoration 合成順を
    // 変えないよう **必ず最後**（VisualFocusBlockDecoration より後）に置くこと。
    LocalImeLocalWindowReservation,
  ]
}
