import { Extension } from '@tiptap/core'
import { notifyInlineMarkInputRule } from '../features/inlineMarkInputRuleNotice'
import { createInlineMarkInputRulesPlugin } from '../features/inlineMarkInputRules'

/**
 * EDITOR-INPUT-RULE-INLINE-NODE1: host の mark の入力規則（太字・斜体・取り消し線・code・
 * ハイライト・下線）の plugin。
 *
 * Tiptap の input rule の仕組み（`run()`）は、段落の文字を `getTextContentFromNodes()` で作り、
 * 差し替えられない。ルビ・付箋のマーカー・画像などをはさむと、文字の数と文書の位置の数がずれる。
 * そこで host の mark の規則は Tiptap の input rule plugin から外し（`buildExtensions.ts` の
 * `addInputRules()` は `[]`）、Local Window と同じ共有の run を使うこの plugin へ移した。
 *
 * - `handleTextInput`: PIS の `commitText` も `view.someProp('handleTextInput')` で同じ plugin を通る。
 * - `compositionend` の後の `run`（`text: ''`）は Tiptap の input rule plugin と同じ形で持つ
 *   （従来の入力の IME で確定した記号を変換する）。
 * - 見出し・リスト・水平線などの Tiptap の規則は、今までどおり Tiptap の plugin に残る。
 *
 * 通知は、view ごとの受け口（`inlineMarkInputRuleNotice.ts`）へ渡す。
 */
export const InlineMarkInputRulesHost = Extension.create({
  name: 'inlineMarkInputRulesHost',

  addProseMirrorPlugins() {
    return [
      createInlineMarkInputRulesPlugin(this.editor.schema, {
        onNotice: notifyInlineMarkInputRule,
        runAfterComposition: true,
      }),
    ]
  },
})
