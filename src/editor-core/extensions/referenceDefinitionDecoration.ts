import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import {
  applyReferenceDefinitionDecorationTransaction,
  buildReferenceDefinitionDecorationState,
  type ReferenceDefinitionDecorationState,
} from '../features/referenceDefinitionDecorationState'

export const referenceDefinitionDecorationPluginKey = new PluginKey<ReferenceDefinitionDecorationState>(
  'nyozeReferenceDefinitionDecoration',
)

/**
 * MD-ESCAPE-EXPLICIT1（§3.5）: リンクの定義の行の `[注]:` を薄く表示する（Obsidian と同じ見え方）。
 * 表示専用の装飾で、行の文字は元のまま。
 */
export const ReferenceDefinitionDecoration = Extension.create({
  name: 'referenceDefinitionDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin<ReferenceDefinitionDecorationState>({
        key: referenceDefinitionDecorationPluginKey,
        state: {
          init: (_config, state) => buildReferenceDefinitionDecorationState(state.doc),
          apply: (tr, previous) => applyReferenceDefinitionDecorationTransaction(previous, tr),
        },
        props: {
          decorations: (state) => referenceDefinitionDecorationPluginKey.getState(state)?.decorations ?? null,
        },
      }),
    ]
  },
})
