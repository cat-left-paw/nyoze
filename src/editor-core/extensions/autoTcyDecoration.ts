import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  collectAutoTcyRanges,
  resolveAutoTcyDigitRange,
  resolveAutoTcyNumbersOnly,
  type AutoTcyDigitRange,
} from '../features/autoTcy'

export interface AutoTcyDecorationOptions {
  isEnabled: () => boolean
  getDigitRange: () => AutoTcyDigitRange
  getNumbersOnly?: () => boolean
}

const autoTcyDecorationPluginKey = new PluginKey('nyozeAutoTcyDecoration')

export function buildAutoTcyDecorations(
  doc: ProseMirrorNode,
  digitRange: AutoTcyDigitRange,
  numbersOnly = false,
): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText) return true

    const text = node.text ?? ''
    if (!text) return true
    if (node.marks.some((mark) => mark.type.name === 'link' || mark.type.name === 'code')) {
      return true
    }

    const $pos = doc.resolve(pos)
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const nodeName = $pos.node(depth).type.name
      if (nodeName === 'aozoraTcy' || nodeName === 'aozoraRuby' || nodeName === 'codeBlock') {
        return true
      }
    }

    const ranges = collectAutoTcyRanges(text, { ...digitRange, numbersOnly })
    for (const range of ranges) {
      if (range.from >= range.to) continue
      decorations.push(
        Decoration.inline(pos + range.from, pos + range.to, {
          class: 'tategaki-md-tcy',
          'data-tategaki-auto-tcy': '1',
        }),
      )
    }
    return true
  })

  return DecorationSet.create(doc, decorations)
}

export function createAutoTcyDecorationPlugin(
  options: AutoTcyDecorationOptions,
): Plugin {
  let cachedDoc: ProseMirrorNode | null = null
  let cachedEnabled = false
  let cachedDigitRange: AutoTcyDigitRange | null = null
  let cachedNumbersOnly = false
  let cachedDecorations: DecorationSet | null = null

  return new Plugin({
    key: autoTcyDecorationPluginKey,
    props: {
      decorations(state) {
        const enabled = options.isEnabled()
        const digitRange = options.getDigitRange()
        const numbersOnly = resolveAutoTcyNumbersOnly({
          numbersOnly: options.getNumbersOnly?.() ?? false,
        })

        if (!enabled) {
          cachedDoc = state.doc
          cachedEnabled = false
          cachedDigitRange = digitRange
          cachedNumbersOnly = numbersOnly
          cachedDecorations = null
          return null
        }

        if (
          cachedDecorations &&
          cachedDoc === state.doc &&
          cachedEnabled === enabled &&
          cachedDigitRange?.minDigits === digitRange.minDigits &&
          cachedDigitRange?.maxDigits === digitRange.maxDigits &&
          cachedNumbersOnly === numbersOnly
        ) {
          return cachedDecorations
        }

        cachedDecorations = buildAutoTcyDecorations(state.doc, digitRange, numbersOnly)
        cachedDoc = state.doc
        cachedEnabled = enabled
        cachedDigitRange = digitRange
        cachedNumbersOnly = numbersOnly
        return cachedDecorations
      },
    },
  })
}

export const AutoTcyDecoration = Extension.create<AutoTcyDecorationOptions>({
  name: 'autoTcyDecoration',

  addOptions() {
    return {
      isEnabled: () => false,
      getDigitRange: () => resolveAutoTcyDigitRange(),
      getNumbersOnly: () => false,
    }
  },

  addProseMirrorPlugins() {
    return [createAutoTcyDecorationPlugin(this.options)]
  },
})
