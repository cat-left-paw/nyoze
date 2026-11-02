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
import { NyozeImage } from '../schema/nyozeImage'
import { AutoTcyDecoration } from './autoTcyDecoration'
import { HeadingFold } from './headingFold'
import { SearchHighlight } from './searchHighlight'
import { SpecialInlineBoundarySentinel } from './specialInlineBoundarySentinel'
import { NoteAnchorProtection } from './noteAnchorProtection'
import { LocalImeLocalWindowReservation } from './localImeLocalWindowReservationDecoration'
import { ViewDescIdentity } from './viewDescIdentity'
import { VisualFocusBlockDecoration } from './visualFocusBlockDecoration'
import type { VisualFocusBlockDecorationOptions } from './visualFocusBlockDecoration'
import { buildInlineMarkInputRulesForMark } from '../features/inlineMarkInputRules'
import { isInputSurfaceCapable } from '../features/inputSurface/inputSurfaceGate'
import { InputSurfaceFocus } from '../features/inputSurface/focusCommand'

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
}

export function buildExtensions(options?: BuildExtensionsOptions) {
  return [
    // commandの差し替えはeditorの生成時にしか登録できない。portがない・ineligibleなら元のfocusへ委譲する。
    ...(isInputSurfaceCapable() ? [InputSurfaceFocus] : []),
    StarterKit.configure({
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      link: false,
      listItem: false,
      // input rule の仕様・意味論は `inlineMarkInputRules` を単一の正本にするため、
      // StarterKit 同梱の Code を無効化して直後に同じ Code を明示登録する
      // （mark 登録順は変えない: StarterKit が提供する mark は元から code だけ）。
      code: false,
      codeBlock: false,
    }),
    Code.configure({
      HTMLAttributes: {
        class: 'tategaki-md-code',
      },
    }).extend({
      addInputRules() {
        return buildInlineMarkInputRulesForMark(this.name, this.type)
      },
    }),
    Bold.extend({
      inclusive() {
        return false
      },
      addInputRules() {
        return buildInlineMarkInputRulesForMark(this.name, this.type)
      },
    }),
    Italic.extend({
      inclusive() {
        return false
      },
      addInputRules() {
        return buildInlineMarkInputRulesForMark(this.name, this.type)
      },
    }),
    Strike.extend({
      inclusive() {
        return false
      },
      addInputRules() {
        return buildInlineMarkInputRulesForMark(this.name, this.type)
      },
    }),
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
    NyozeCodeBlockHighlight,
    Highlight,
    Underline,
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
    // EDITOR-VIEWDESC-IDENTITY-PERF1: view の更新の後に、block の desc の node を文書の node と
    // 同じ object に保つ（state・props・decoration を持たない）。
    ViewDescIdentity,
    ...(options?.visualFocus
      ? [VisualFocusBlockDecoration.configure(options.visualFocus)]
      : []),
    // LOCAL-WINDOW-RESERVATION-PLUGIN-LIFETIME1: Local Window の source / reservation
    // Decoration は host の**固定** plugin 構成に含める。Start / Stop で
    // `state.reconfigure()` しないため、host の全 plugin view が再生成されない。
    // 旧方式は `state.plugins` の末尾へ動的追加していたので、Decoration 合成順を
    // 変えないよう **必ず最後**（VisualFocusBlockDecoration より後）に置くこと。
    LocalImeLocalWindowReservation,
  ]
}
