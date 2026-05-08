import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'
import {
  collectDimTextblockDecorations,
  resolveVisualFocusActiveTextblockRange,
} from './visualFocusDecorationHelpers'

const ACTIVE_BLOCK_CLASS = 'nyoze-visual-focus-active-block'

export const visualFocusBlockDecorationKey = new PluginKey('nyozeVisualFocusBlock')

export type VisualFocusBlockDecorationOptions = {
  getBlockHighlightEnabled: () => boolean
  getDimNonFocusedBlocksEnabled: () => boolean
  getSourceModeActive: () => boolean
  getParagraphPlainActive: () => boolean
  /**
   * Live IME composition (PM/DOM). Used only to treat composition-range selection like collapsed:
   * conversion underline spans are non-empty selections but should keep active block / dimming.
   */
  getComposing: () => boolean
}

export function buildVisualFocusBlockDecorations(
  state: EditorState,
  options: VisualFocusBlockDecorationOptions,
): DecorationSet {
  if (!options.getBlockHighlightEnabled() && !options.getDimNonFocusedBlocksEnabled()) {
    return DecorationSet.empty
  }

  const activeRange = resolveVisualFocusActiveTextblockRange(state, {
    getSourceModeActive: options.getSourceModeActive,
    getParagraphPlainActive: options.getParagraphPlainActive,
    getComposing: options.getComposing,
  })
  if (!activeRange) {
    return DecorationSet.empty
  }

  const pieces: Decoration[] = []

  if (options.getBlockHighlightEnabled()) {
    pieces.push(
      Decoration.node(activeRange.from, activeRange.to, {
        class: ACTIVE_BLOCK_CLASS,
        'data-visual-focus-active-block': 'true',
      }),
    )
  }

  if (options.getDimNonFocusedBlocksEnabled()) {
    pieces.push(...collectDimTextblockDecorations(state.doc, activeRange))
  }

  return DecorationSet.create(state.doc, pieces)
}

function createVisualFocusBlockDecorationPlugin(
  options: VisualFocusBlockDecorationOptions,
): Plugin {
  return new Plugin({
    key: visualFocusBlockDecorationKey,
    props: {
      decorations(state) {
        return buildVisualFocusBlockDecorations(state, options)
      },
    },
  })
}

export const VisualFocusBlockDecoration = Extension.create<VisualFocusBlockDecorationOptions>({
  name: 'visualFocusBlockDecoration',

  addOptions() {
    return {
      getBlockHighlightEnabled: () => false,
      getDimNonFocusedBlocksEnabled: () => false,
      getSourceModeActive: () => false,
      getParagraphPlainActive: () => false,
      getComposing: () => false,
    }
  },

  addProseMirrorPlugins() {
    return [createVisualFocusBlockDecorationPlugin(this.options)]
  },
})
