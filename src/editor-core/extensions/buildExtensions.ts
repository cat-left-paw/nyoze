import Bold from '@tiptap/extension-bold'
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
import { RubyPunctuationNowrap } from './rubyPunctuationNowrap'
import { SpecialInlineBoundarySentinel } from './specialInlineBoundarySentinel'
import { NoteAnchorProtection } from './noteAnchorProtection'
import { VisualFocusBlockDecoration } from './visualFocusBlockDecoration'
import type { VisualFocusBlockDecorationOptions } from './visualFocusBlockDecoration'

export const DEFAULT_EDITOR_CONTENT = `
  <p></p>
`.trim()

export type BuildExtensionsOptions = {
  autoTcy?: {
    isEnabled: () => boolean
    getDigitRange: () => { minDigits: number; maxDigits: number }
    getNumbersOnly?: () => boolean
  }
  visualFocus?: VisualFocusBlockDecorationOptions
}

export function buildExtensions(options?: BuildExtensionsOptions) {
  return [
    StarterKit.configure({
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      link: false,
      listItem: false,
      code: {
        HTMLAttributes: {
          class: 'tategaki-md-code',
        },
      },
      codeBlock: false,
    }),
    Bold.extend({
      inclusive() {
        return false
      },
    }),
    Italic.extend({
      inclusive() {
        return false
      },
    }),
    Strike.extend({
      inclusive() {
        return false
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
    RubyPunctuationNowrap,
    options?.autoTcy ? AutoTcyDecoration.configure(options.autoTcy) : AutoTcyDecoration,
    HeadingFold,
    SearchHighlight,
    ...(options?.visualFocus
      ? [VisualFocusBlockDecoration.configure(options.visualFocus)]
      : []),
  ]
}
