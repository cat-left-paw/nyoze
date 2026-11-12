import { InputRule } from '@tiptap/core'
import { rangeHasSourceSpelledChar } from '../features/sourceSpellingInputRule'

/**
 * MD-ESCAPE-EXPLICIT1: Tiptap の入力規則（見出し `# `・引用 `> `・リスト `- ` `1. `・code block・水平線）が、
 * 変換する範囲に綴りのある文字（`sourceSpelling` mark のある文字。ファイルの `\#` など）を含むときは
 * 何もしない。`\# ` は見出しにならない。範囲は、Tiptap の `run()` が規則に渡す `range`（一致した文字の範囲）。
 * mark の入力規則（太字など）は共有の run（`features/inlineMarkInputRules.ts`）が、照合の文字から綴りのある文字を
 * 除くことで同じ性質を持つ。
 */
export function guardInputRulesAgainstSourceSpelling(rules: readonly InputRule[]): InputRule[] {
  return rules.map(
    (rule) =>
      new InputRule({
        find: rule.find,
        undoable: rule.undoable,
        handler: (props) => {
          if (rangeHasSourceSpelledChar(props.state.doc, props.range.from, props.range.to)) return null
          return rule.handler(props)
        },
      }),
  )
}

type GuardableExtension = {
  extend: (config: { addInputRules: (this: { parent?: () => InputRule[] }) => InputRule[] }) => GuardableExtension
  config: { addInputRules?: unknown }
}

/**
 * 入力規則を持つ拡張だけを、規則を `guardInputRulesAgainstSourceSpelling` で包んだ拡張にする。
 * 規則を持たない拡張は同じものを返す（名前・順序・schema は変わらない）。
 */
export function withSourceSpellingInputRuleGuard<T>(extension: T): T {
  const target = extension as unknown as GuardableExtension
  if (typeof target.config?.addInputRules !== 'function') return extension
  return target.extend({
    addInputRules() {
      return guardInputRulesAgainstSourceSpelling(this.parent?.() ?? [])
    },
  }) as unknown as T
}
