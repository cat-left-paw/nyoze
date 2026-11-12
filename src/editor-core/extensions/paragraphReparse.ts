import { Extension } from '@tiptap/core'
import {
  createParagraphReparsePlugin,
  type ParagraphReparsePluginOptions,
} from '../features/paragraphReparse/reparsePlugin'

/**
 * EDITOR-PARAGRAPH-REPARSE1: 段落を離れたとき、直前まで編集していた段落の記法を読み直す plugin（案 1）。
 * editor の生成のときに登録する（`registerPlugin` は plugin view を作り直し、sentinel の帳簿などを失うので使わない）。
 * `buildExtensions` に options を渡したときだけ登録する（schema だけを作る呼び出しには入らない）。
 */
export const ParagraphReparse = Extension.create<ParagraphReparsePluginOptions>({
  name: 'paragraphReparse',

  addOptions() {
    return {
      getContext: () => ({ lineBreakPolicy: 'obsidian-paragraph', enableRuby: true, preserveEmptyParagraphs: false }),
      canReparseNow: () => false,
      serializeDocument: () => '',
    }
  },

  addProseMirrorPlugins() {
    return [createParagraphReparsePlugin(this.options)]
  },
})
