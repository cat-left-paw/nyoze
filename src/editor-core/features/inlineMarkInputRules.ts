import {
  InputRule,
  commands as tiptapCommands,
  createChainableState,
  getTextContentFromNodes,
  isRegExp,
  markInputRule,
} from '@tiptap/core'
import {
  starInputRegex as boldStarInputRegex,
  underscoreInputRegex as boldUnderscoreInputRegex,
} from '@tiptap/extension-bold'
import { inputRegexMatch as codeInputRegexMatch } from '@tiptap/extension-code'
import {
  starInputRegex as italicStarInputRegex,
  underscoreInputRegex as italicUnderscoreInputRegex,
} from '@tiptap/extension-italic'
import { inputRegex as strikeInputRegex } from '@tiptap/extension-strike'
import type { MarkType, Schema } from '@tiptap/pm/model'
import { Plugin, type Command, type EditorState, type Transaction } from '@tiptap/pm/state'

/**
 * LOCAL-WINDOW-INLINE-CAP1: markの直接記号入力ruleの **単一の仕様と意味論**。
 *
 *   共有 specification / semantics（このmodule）
 *     ├─ host側の薄いadapter: `buildInlineMarkInputRulesForMark()` を
 *     │  `buildExtensions()` の `addInputRules()` から返すだけ
 *     └─ raw local PM側の薄いadapter: `createInlineMarkInputRulesPlugin()`
 *
 * regexは vendor extension が公開している finder をそのまま参照し、変換意味論は
 * vendor `markInputRule()` をそのまま使う。host / localへ同じregexや同じ変換を
 * 書き写さない。
 *
 * host監査結果（2026-08-20）:
 * - bold `**…**` / `__…__`、italic `*…*` / `_…_`、strike `~~…~~`、code `` `…` `` は
 *   hostで直接記号入力が成立する。
 * - highlight `==…==` と underline `||…||` は Markdown parse / serialize だけの構文で、
 *   hostに live input ruleが無い。よって local にも足さない（parity維持）。
 * - link は `addPasteRules()` だけで input ruleを持たない。typed Markdown linkは
 *   本スライスで新規追加しない。
 */
export type InlineMarkInputRuleSpec = {
  markName: string
  find: InputRule['find']
}

export const INLINE_MARK_INPUT_RULE_SPECS: readonly InlineMarkInputRuleSpec[] = [
  { markName: 'bold', find: boldStarInputRegex },
  { markName: 'bold', find: boldUnderscoreInputRegex },
  { markName: 'italic', find: italicStarInputRegex },
  { markName: 'italic', find: italicUnderscoreInputRegex },
  { markName: 'strike', find: strikeInputRegex },
  { markName: 'code', find: codeInputRegexMatch },
]

/** input ruleを持たない（＝hostでも直接記号入力しない）whitelisted mark。 */
export const INLINE_MARKS_WITHOUT_INPUT_RULE: readonly string[] = [
  'highlight',
  'underline',
  'link',
]

/** host adapter。`this.name` / `this.type` を渡すだけの薄いglue。 */
export function buildInlineMarkInputRulesForMark(
  markName: string,
  type: MarkType,
): InputRule[] {
  return INLINE_MARK_INPUT_RULE_SPECS.filter((spec) => spec.markName === markName).map((spec) =>
    markInputRule({ find: spec.find, type }),
  )
}

/** local adapter用。schemaに存在するmarkの分だけ共有specからruleを作る。 */
export function buildInlineMarkInputRules(schema: Schema): InputRule[] {
  return INLINE_MARK_INPUT_RULE_SPECS.flatMap((spec) => {
    const type = schema.marks[spec.markName]
    return type ? [markInputRule({ find: spec.find, type })] : []
  })
}

type InlineMarkInputRuleUndoable = {
  transform: Transaction
  from: number
  to: number
  text: string
}

/**
 * `@tiptap/core`の`inputRuleMatcherHandler`はexportされていないため、matcher部分だけ
 * raw local PM adapterへ移植する。regexと変換意味論は共有側（vendor finder /
 * vendor `markInputRule`）のままで、ここではmatch配列の組み立てだけを行う。
 */
function matchInlineMarkInputRule(
  text: string,
  find: InputRule['find'],
): RegExpMatchArray | null {
  if (isRegExp(find)) return find.exec(text)
  const found = find(text)
  if (!found) return null
  const result = [found.text] as unknown as RegExpMatchArray & { data?: unknown }
  result.index = found.index
  result.input = text
  result.data = found.data
  if (found.replaceWith) result.push(found.replaceWith)
  return result
}

/**
 * markInputRuleのhandlerは`state` / `range` / `match`しか読まない。CommandManagerは
 * Tiptap Editorを要求するため、raw local PMでは到達し得ないaccessorとして明示的に
 * throwさせる（fake Tiptap Editorを構築しない）。
 */
function unreachableCommandManagerAccess(): never {
  throw new Error('inline-mark-input-rule-command-manager-unavailable')
}

const COMMAND_MANAGER_STUB = {
  get commands(): never {
    return unreachableCommandManagerAccess()
  },
  get chain(): never {
    return unreachableCommandManagerAccess()
  },
  get can(): never {
    return unreachableCommandManagerAccess()
  },
}

export type InlineMarkInputRuleRunInput = {
  state: EditorState
  dispatch: (transaction: Transaction) => void
  composing: boolean
  from: number
  to: number
  text: string
}

export type InlineMarkInputRulesRuntime = {
  plugin: Plugin<InlineMarkInputRuleUndoable | null>
  rules: readonly InputRule[]
  /** `handleTextInput`相当。`EditorView`ではなくstate / dispatchだけを取る。 */
  run: (input: InlineMarkInputRuleRunInput) => boolean
}

function runInlineMarkInputRules(
  input: InlineMarkInputRuleRunInput & {
    rules: readonly InputRule[]
    plugin: Plugin<InlineMarkInputRuleUndoable | null>
  },
): boolean {
  const { state, dispatch, composing, from, to, text, rules, plugin } = input
  // composition preedit途中では一切変換しない。
  if (composing) return false
  let $from
  try {
    $from = state.doc.resolve(from)
  } catch {
    return false
  }
  if ($from.parent.type.spec.code) return false
  const adjacentCode = ($from.nodeBefore ?? $from.nodeAfter)?.marks.some(
    (mark) => mark.type.spec.code,
  )
  if (adjacentCode) return false
  const textBefore = getTextContentFromNodes($from) + text
  for (const rule of rules) {
    const match = matchInlineMarkInputRule(textBefore, rule.find)
    if (!match) continue
    const transaction = state.tr
    const chainableState = createChainableState({ state, transaction })
    const range = { from: from - (match[0].length - text.length), to }
    let handled: unknown
    try {
      // getterを起動しないよう prototype 経由で渡す（spreadすると即時評価される）。
      handled = rule.handler(
        Object.assign(Object.create(COMMAND_MANAGER_STUB), {
          state: chainableState,
          range,
          match,
        }) as never,
      )
    } catch {
      return false
    }
    if (handled === null || transaction.steps.length === 0) continue
    if (rule.undoable) {
      transaction.setMeta(plugin, { transform: transaction, from, to, text })
    }
    dispatch(transaction)
    return true
  }
  return false
}

/**
 * raw local PM adapter。Tiptap `Editor`を作らず、`handleTextInput`だけを入口にする。
 * mark input ruleのfinderはすべて`$`終端のため、Enterやcompositionendで再評価しても
 * 追加のmatchは生まれない。よって timer / setTimeout による post-composition retryは
 * 持たず、composition中は常にfalseを返す。
 */
export function createInlineMarkInputRulesRuntime(schema: Schema): InlineMarkInputRulesRuntime {
  const rules = buildInlineMarkInputRules(schema)
  const plugin: Plugin<InlineMarkInputRuleUndoable | null> = new Plugin<
    InlineMarkInputRuleUndoable | null
  >({
    state: {
      init: () => null,
      apply(transaction, previous) {
        const stored = transaction.getMeta(plugin) as InlineMarkInputRuleUndoable | undefined
        if (stored) return stored
        return transaction.selectionSet || transaction.docChanged ? null : previous
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        return runInlineMarkInputRules({
          state: view.state,
          dispatch: (transaction) => view.dispatch(transaction),
          composing: view.composing,
          from,
          to,
          text,
          rules,
          plugin,
        })
      },
    },
    // `undoInputRule` はこのflagでinput rule pluginを識別する。
    isInputRules: true,
  } as ConstructorParameters<typeof Plugin<InlineMarkInputRuleUndoable | null>>[0])
  return {
    plugin,
    rules,
    run: (input) => runInlineMarkInputRules({ ...input, rules, plugin }),
  }
}

export function createInlineMarkInputRulesPlugin(
  schema: Schema,
): Plugin<InlineMarkInputRuleUndoable | null> {
  return createInlineMarkInputRulesRuntime(schema).plugin
}

/**
 * Backspaceのinput-rule undo。hostのKeymap extensionと同じ vendor `undoInputRule`
 * 意味論をそのまま使い、raw PM `Command`へ包むだけ。
 */
export const undoInlineMarkInputRule: Command = (state, dispatch) => {
  const transaction = state.tr
  const chainableState = createChainableState({ state, transaction })
  const run = tiptapCommands.undoInputRule() as unknown as (props: {
    state: EditorState
    dispatch?: () => void
  }) => boolean
  const handled = run({
    state: chainableState,
    dispatch: dispatch ? () => undefined : undefined,
  })
  if (!handled) return false
  if (dispatch && transaction.steps.length > 0) dispatch(transaction)
  return true
}
