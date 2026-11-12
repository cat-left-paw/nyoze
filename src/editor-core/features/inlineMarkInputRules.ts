import {
  type InputRule,
  commands as tiptapCommands,
  createChainableState,
  isRegExp,
} from '@tiptap/core'
import { underscoreInputRegex as boldUnderscoreInputRegex } from '@tiptap/extension-bold'
import { inputRegexMatch as codeInputRegexMatch } from '@tiptap/extension-code'
import type { MarkType, Node as PMNode, ResolvedPos, Schema } from '@tiptap/pm/model'
import {
  EditorState,
  Plugin,
  TextSelection,
  type Command,
  type Transaction,
} from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  buildSourceSpellingInputTransaction,
  expandSpelledCharsToRaw,
  maskSpelledTextNode,
  rangeHasSpelledChar,
} from './sourceSpellingInputRule'

/**
 * LOCAL-WINDOW-INLINE-CAP1: markの直接記号入力ruleの **単一の仕様と意味論**。
 *
 *   共有 specification / semantics（このmodule）
 *     ├─ host側のplugin: `extensions/inlineMarkInputRulesHost.ts` が
 *     │  `createInlineMarkInputRulesPlugin(schema, { onNotice, runAfterComposition })` を
 *     │  editorの生成時に登録するだけ
 *     └─ raw local PM側の薄いadapter: `createInlineMarkInputRulesPlugin(schema)`
 *
 * regexは vendor extension が公開している finder をそのまま参照する（highlight / underline だけは
 * vendor に finder が無いので、このmoduleに定義する）。変換は `applyInlineMarkInputRuleConversion` の
 * 1つで、host / localへ同じregexや同じ変換を書き写さない。
 *
 * EDITOR-INPUT-RULE-INLINE-NODE1: vendor の入力規則は、段落の文字を
 * `getTextContentFromNodes()` で作り、正規表現に合った長さから文書の位置
 * （`range = { from: from - (match[0].length - text.length), to }`）へ戻す。これは
 * 「文字の数と文書の位置の数が1対1」のときだけ正しい。付箋のマーカー・画像・inline HTML
 * （atom。文字6文字の `%leaf%`、位置1）やルビ・縦中横（親文字が `textContent` と子の
 * text で2回数えられ、位置は親文字+2）が記号の間にあると、`range` がずれて関係のない文字が
 * 消えた。また vendor の handler は、開きの記号と中身がすべて文書にあると仮定するので、確定した
 * 文字（`text`）が中身や開きの記号を含む（IME が `**太字**` を一度に確定する）と、caret の後ろの
 * 文字・次の段落を消した。そこで、次の3点で直した。
 *
 * 1. 照合する文字を、文書の位置と1対1にする（`buildPositionFaithfulTextBefore`。text はそのまま、
 *    hardBreak は `\n`、ほかの inline node は位置の数だけ U+FFFC）。`range` の式は vendor と同じで、
 *    正しい位置になる。text と hardBreak だけの段落では、vendor が作る文字と同じになる。
 * 2. 確定した文字が中身や開きの記号を含むときは、先にその文字を挿入してから、挿入後の文書の
 *    `range` で変換する。
 * 3. 変換は vendor の handler を呼ばず、同じ手順の自前の関数（`applyInlineMarkInputRuleConversion`）で
 *    行う。vendor の handler は code の text を含む範囲で `null` を返し、`tr.addMark()` で mark の置き方が
 *    決まっているので、「保存して開き直しても変わらない形」にできないため。
 *
 * 変換した結果は、保存して開き直しても変わらない形で、Source Mode に同じ記号を書いたときと同じ
 * mark の置き方にする（`applyMarkLikeMarkdown`）。ツールバー（`setMark`）の置き方とは違う（ルビの中の
 * text に付ける、画像に付ける、といった、開き直すと形が変わる置き方がある）。
 *
 * EDITOR-INPUT-RULE-MIDSENTENCE1（作者の判断 2026-11-02）: 日本語は単語の間に空白がないので、`(?:^|\s)` で始まる
 * vendor の規則は文の途中（`文章**太字**`）で働かない。次の変更で、打ったときの見た目を、保存して開き直したときの
 * 見た目（Source Mode に同じ記号を書いて読み込んだ結果）にそろえる。
 *
 * 1. `**` `~~` `==` `||` は、行頭・空白の直後の条件を外し、文の途中でも変換する。中身の条件は、読み込みの救済
 *    （`io/fallbackEmphasis.ts` の `INLINE_PATTERN_WITH_EMPHASIS_REGEX`）の同じ分岐にそろえる。開きの記号の直前が
 *    同じ記号の文字のときは当てない（`***強調**` まで打った時点で太字が先に当たり、`*` が1つ残るのを防ぐ）。
 *    `***…***`（太字＋斜体）の規則を足し、`**` より先に試す。
 * 2. 斜体の `_…_` は文の途中では変換しない（Obsidian（CommonMark）とそろえる。語中の `_` は書式の記号にならない）。
 *    入れ子（`**_強調_**` など）のため、ほかの書式の開きの記号の直後だけ当てる。`__` `_` `` ` `` は今どおり。
 *    （斜体の `*…*` は、EDITOR-INPUT-RULE-ITALIC-MIDSENTENCE1 で文の途中でも変換する。下の 4.）
 * 3. 複数の文字を一度に確定したとき（PIS の変換の確定）は、1文字ずつ打った結果と同じにする。1文字ずつ試す形で、
 *    1つの transaction にまとめる（`runTypedSequence`）。
 * 4. EDITOR-INPUT-RULE-ITALIC-MIDSENTENCE1（作者の判断 2026-11-05）: 記号は記法として扱う（`注*1と注*2` は「1と注」が斜体）。
 *    斜体の `*…*` も、読み込みの救済の斜体の分岐と同じ条件にする（場所を問わない。開きの `*` の直前が `*` でない・中身に `*` と
 *    改行を含まない・中身の両端が空白でない）。これで、1文字ずつ打った結果が、同じ文字を Source Mode に書いて読んだ結果と同じに
 *    なる。救済の `(?!\*)`（閉じの後ろが `*` でない）は、打つ時点では分からないので持たない（斜体に変わった直後に `*` を打つ
 *    場面の差は、試験の「既知の差」の表に仕組みとともに置く）。記号を文字のまま残すときは、利用者が `\` を打つ
 *    （綴りのある文字は記号として使わない。MD-ESCAPE-EXPLICIT1）。
 *
 * host監査結果（2026-08-20。highlight / underline は EDITOR-INPUT-RULE-INLINE-NODE1 で追加）:
 * - bold `**…**` / `__…__`、italic `*…*` / `_…_`、strike `~~…~~`、code `` `…` `` は
 *   hostで直接記号入力が成立する。
 * - highlight `==…==` と underline `||…||` は、作者の判断（2026-11-03）で同じ規則に加えた。
 *   ツールバーで付けられる書式を、打った記号でも付けられるようにするため。vendor の finder が無い
 *   ので、vendor の太字と同じ形のregexをこのmoduleに定義する。
 * - link は `addPasteRules()` だけで input ruleを持たない。typed Markdown linkは
 *   本スライスで新規追加しない。
 */
export type InlineMarkInputRuleSpec = {
  markName: string
  /** 同じ変換で、`markName` に重ねて付ける mark（`***…***` の斜体）。 */
  alsoMarkNames?: readonly string[]
  find: InputRule['find']
}

/*
 * 中身の条件は、読み込みの救済（`io/fallbackEmphasis.ts` の `INLINE_PATTERN_WITH_EMPHASIS_REGEX`）の同じ分岐と同じ:
 * 先頭と末尾が空白でなく、区切りの文字と改行を含まない。1文字でもよい。
 */

/** 太字＋斜体（`***…***`）。文の途中でも効く。 */
export const BOLD_ITALIC_STAR_INPUT_REGEX = /\*\*\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*\*\*$/
/** 太字（`**…**`）。文の途中でも効く。開きの記号の直前が `*` のときは当てない。 */
export const BOLD_STAR_INPUT_REGEX = /(?<!\*)\*\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*\*$/
/** 取り消し線（`~~…~~`）。文の途中でも効く。開きの記号の直前が `~` のときは当てない。 */
export const STRIKE_INPUT_REGEX = /(?<!~)~~([^ ~\n][^~\n]*[^ ~\n]|[^ ~\n])~~$/
/** highlight（`==…==`）。文の途中でも効く。読み込みの `==([^=\n]+)==` と同じ中身。 */
export const HIGHLIGHT_INPUT_REGEX = /(?<!=)==([^=\n]+)==$/
/** underline（`||…||`）。文の途中でも効く。読み込みの `\|\|([^|\n]+)\|\|` と同じ中身。 */
export const UNDERLINE_INPUT_REGEX = /(?<!\|)\|\|([^|\n]+)\|\|$/
/**
 * 斜体（`*…*`）。文の途中でも効く（読み込みの救済の斜体の分岐 `(?<!\*)\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*(?!\*)` から、
 * 閉じの後ろの `(?!\*)` だけを除いた形。打つ時点では閉じの後ろの文字が分からない）。開きの記号の直前が `*` のときは当てない
 * （`***強調**` まで打った時点で斜体が先に当たり、`*` が1つ残るのを防ぐ。`***` と `**` の規則が扱う）。
 */
export const ITALIC_STAR_INPUT_REGEX = /(?<!\*)\*([^ *\n][^*\n]*[^ *\n]|[^ *\n])\*$/
/** 斜体（`_…_`）。`*` `~` `=` `|` の直後でも当てる（入れ子 `**_強調_**` のため）。語中の `_` は今までどおり当てない。 */
export const ITALIC_UNDERSCORE_INPUT_REGEX =
  /(?:^|\s|(?<=[*~=|]))(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/

/** 評価順（最初に当たった規則を使う）。`***` は `**` より先。 */
export const INLINE_MARK_INPUT_RULE_SPECS: readonly InlineMarkInputRuleSpec[] = [
  { markName: 'bold', alsoMarkNames: ['italic'], find: BOLD_ITALIC_STAR_INPUT_REGEX },
  { markName: 'bold', find: BOLD_STAR_INPUT_REGEX },
  { markName: 'bold', find: boldUnderscoreInputRegex },
  { markName: 'italic', find: ITALIC_STAR_INPUT_REGEX },
  { markName: 'italic', find: ITALIC_UNDERSCORE_INPUT_REGEX },
  { markName: 'strike', find: STRIKE_INPUT_REGEX },
  { markName: 'code', find: codeInputRegexMatch },
  { markName: 'highlight', find: HIGHLIGHT_INPUT_REGEX },
  { markName: 'underline', find: UNDERLINE_INPUT_REGEX },
]

/** input ruleを持たない（＝hostでも直接記号入力しない）whitelisted mark。 */
export const INLINE_MARKS_WITHOUT_INPUT_RULE: readonly string[] = ['link']

/**
 * 変換しなかった理由（ユーザーへ知らせる）。
 *
 * - `code-inline-node`: code の規則（`` ` ``）で、中身に text・hardBreak 以外の inline node（ルビ・縦中横・
 *   付箋のマーカー・画像・inline HTML など）がある。Markdown のインラインコードは中を文字として読むので、
 *   ルビなどは code の中に置けない（Source Mode で同じ記号を書くと、ルビが記法の文字になり、付箋のマーカーは
 *   付箋でなくなる）。
 */
export type InlineMarkInputRuleNoticeReason = 'code-inline-node'

/** 位置と1対1にするための、text でも hardBreak でもない inline node の文字（Object Replacement Character）。 */
export const INLINE_MARK_INPUT_RULE_NODE_CHAR = '\uFFFC'

/**
 * caret の前の文字を、**文書の位置と1対1**で作る（`getTextContentFromNodes()` の代わり）。
 *
 * - text はそのまま（Tiptap と同じく、右端だけ caret で切る。左端は切らず、最初に重なる node の
 *   先頭から入れる。text と hardBreak だけの段落で、Tiptap が作る文字と一致させるため）。
 * - hardBreak は `\n`（Tiptap と同じ。`\s` に当たるので、改行の直後の記号は今どおり変換される）。
 * - それ以外の inline node（ルビ・縦中横・付箋のマーカー・画像・inline HTML・未知の node）は、
 *   範囲に入る位置の数だけ U+FFFC。node の中身（ルビの親文字など）は記号として見ない。
 *
 * 文字の index の差 ＝ 文書の位置の差が常に成り立つ。`parent.nodesBetween()` は子へ降りない
 * （`false` を返す）ので、見るのは caret の前の 500 位置ほどだけで、文書全体は走査しない。
 */
export function buildPositionFaithfulTextBefore($from: ResolvedPos, maxMatch = 500): string {
  const end = $from.parentOffset
  let text = ''
  $from.parent.nodesBetween(Math.max(0, end - maxMatch), end, (node, pos) => {
    if (node.isText) {
      // MD-ESCAPE-EXPLICIT1: 綴りのある文字（ファイルの `\*` など）は記号として使わない。
      text += maskSpelledTextNode(node, (node.text ?? '').slice(0, Math.max(0, end - pos)))
    } else if (node.type.name === 'hardBreak') {
      text += '\n'
    } else {
      text += INLINE_MARK_INPUT_RULE_NODE_CHAR.repeat(Math.min(node.nodeSize, end - pos))
    }
    return false
  })
  return text
}

const isHardBreak = (node: PMNode) => node.type.name === 'hardBreak'
const hasCodeMark = (node: PMNode) => node.marks.some((mark) => mark.type.spec.code)

/** `[from, to)`（同じ textblock の中）に、text でも hardBreak でもない inline node があるか。 */
function rangeHasNonTextInlineNode(doc: PMNode, from: number, to: number): boolean {
  const $from = doc.resolve(from)
  const base = $from.start()
  const lo = from - base
  const hi = Math.min(to, $from.end()) - base
  if (lo >= hi) return false
  let found = false
  $from.parent.nodesBetween(lo, hi, (node) => {
    if (!node.isText && !isHardBreak(node)) found = true
    // 子へ降りない（ルビの親文字などは node の中身）。
    return false
  })
  return found
}

/**
 * 中身 `[from, to)` へ mark を、Source Mode に同じ記号を書いたときと同じ置き方で付ける。
 * 保存して開き直しても変わらない形になる。
 *
 * - text（code の mark なし）・hardBreak: `tr.addMark`（hardBreak の mark は見た目に出ない。vendor と同じ）
 * - code の mark の text: code の規則以外では何もしない（code だけのまま残す）。code の規則自身は、
 *   vendor と同じく `tr.addMark`。
 *   Source Mode の `**a `c` b**` は code と太字の両方が付くが、装飾の端にある code に太字・斜体・取り消し線を
 *   重ねると、serializer が `**a`c`**後` と書き、CommonMark の right-flanking の規則（閉じの記号が句読点の
 *   直後で、直後に空白でない文字が続くと閉じない）で、開き直すと形が変わる（外側に空白でない文字が続く場面の
 *   18/18 が崩れる。code だけなら 0/60）。「保存して開き直しても変わらない」を優先して重ねない。直すのは
 *   serializer の側（候補）で、直したら重ねる形（bold / italic / strike は code に重なり、highlight / underline は
 *   Markdown で書けないので付けない）へ戻すことを検討する。
 * - ルビ・縦中横（content を持つ inline node）: node に付け、中の text には付けない（Markdown の読み込みも
 *   node に付ける。中の text に付けると、開き直しで node へ移り、読みの表示が変わり得る）
 * - そのほかの leaf（付箋のマーカー・画像・inline HTML・未知の leaf）: 付けない（Markdown の読み込みも
 *   付けず、付けても保存で落ちる。付箋のマーカーに付けると `noteAnchorProtection` が外す transaction を
 *   足し、入力規則の plugin の state が消えて Backspace の取り消しが効かなくなる）
 *
 * 中身が「code の mark のない text と hardBreak だけ」（code の規則では「text と hardBreak だけ」）のときは、
 * `tr.addMark` を1回だけ呼ぶ。vendor と同じ step になり、text と hardBreak だけの段落の動きが変わらない。
 */
function applyMarkLikeMarkdown(tr: Transaction, from: number, to: number, markType: MarkType): void {
  const mark = markType.create()
  const isCodeRule = !!markType.spec.code
  const $from = tr.doc.resolve(from)
  const parent = $from.parent
  const base = $from.start()
  const pieces: { pos: number; end: number; child: PMNode }[] = []
  let plain = true
  parent.forEach((child, offset) => {
    const pos = base + offset
    const end = pos + child.nodeSize
    if (end <= from || pos >= to) return
    pieces.push({ pos, end, child })
    const isPlain = (child.isText && (isCodeRule || !hasCodeMark(child))) || isHardBreak(child)
    if (!isPlain) plain = false
  })
  if (plain) {
    tr.addMark(from, to, mark)
    return
  }
  // 位置は変えない（addMark / addNodeMark だけ）ので、前に取った位置のまま使える。
  for (const { pos, end, child } of pieces) {
    const a = Math.max(pos, from)
    const b = Math.min(end, to)
    if (child.isText) {
      // code の text（code の規則以外）には何もしない。
      if (isCodeRule || !hasCodeMark(child)) tr.addMark(a, b, mark)
    } else if (isHardBreak(child)) {
      tr.addMark(a, b, mark)
    } else if (!child.isLeaf) {
      if (!mark.isInSet(child.marks)) tr.addNodeMark(pos, mark)
    }
  }
}

/**
 * 変換の本体。vendor `markInputRule()` の handler と同じ手順（閉じの記号・開きの記号を消し、中身へ mark を
 * 付け、次の入力へ mark を引き継がない）で、mark の置き方だけを `applyMarkLikeMarkdown` にした。
 * vendor の handler は code の text を含む範囲で `null` を返し、`tr.addMark()` で置き方が決まっている。
 * `getAttributes` は使っていないので、vendor の handler の他の分岐はない。
 * `alsoMarkTypes`（`***…***` の斜体）は、記号を消した後の同じ中身へ、`markType` と同じ置き方で重ねる。
 * 中身（最後の capture group）が空なら何もしない（`false`）。
 */
export function applyInlineMarkInputRuleConversion(
  tr: Transaction,
  range: { from: number; to: number },
  match: RegExpMatchArray,
  markType: MarkType,
  alsoMarkTypes: readonly MarkType[] = [],
): boolean {
  const captureGroup = match[match.length - 1]
  const fullMatch = match[0]
  if (!captureGroup) return false
  const startSpaces = fullMatch.search(/\S/)
  const textStart = range.from + fullMatch.indexOf(captureGroup)
  let textEnd = textStart + captureGroup.length
  // MD-ESCAPE-EXPLICIT1: code span の中では `\` はエスケープではなく文字（CommonMark）。Source Mode に同じ記号を
  // 書いて読んだ結果（`` `a\*b` `` は code の文字 `a\*b`）にそろえるため、中身の綴りのある文字は元の綴りの文字に戻す。
  // 増えた文字数だけ、中身の終わりと変換する範囲の終わりをずらす（以降の手順は vendor と同じ）。
  const expanded = markType.spec.code ? expandSpelledCharsToRaw(tr, textStart, textEnd) : 0
  textEnd += expanded
  range = { from: range.from, to: range.to + expanded }
  if (textEnd < range.to) tr.delete(textEnd, range.to)
  if (textStart > range.from) tr.delete(range.from + startSpaces, textStart)
  const markStart = range.from + startSpaces
  const markEnd = markStart + captureGroup.length + expanded
  const markTypes = [markType, ...alsoMarkTypes]
  for (const type of markTypes) applyMarkLikeMarkdown(tr, markStart, markEnd, type)
  for (const type of markTypes) tr.removeStoredMark(type)
  return true
}

/** 変換の関数。試験が、step を足さない・`false` を返す合成の変換を差し込めるように、規則ごとに持てる。 */
export type InlineMarkInputRuleConversion = (
  tr: Transaction,
  range: { from: number; to: number },
  match: RegExpMatchArray,
  markType: MarkType,
  alsoMarkTypes?: readonly MarkType[],
) => boolean

/** 規則（finder）と、その規則が付ける mark の type。 */
export type InlineMarkInputRuleEntry = {
  markType: MarkType
  /** 同じ変換で重ねて付ける mark（`***…***` の斜体）。 */
  alsoMarkTypes?: readonly MarkType[]
  find: InputRule['find']
  /** 省略すると `applyInlineMarkInputRuleConversion`。 */
  convert?: InlineMarkInputRuleConversion
}

/** schemaに存在するmarkの分だけ共有specからruleを作る。host / local の両方が使う。 */
export function buildInlineMarkInputRules(schema: Schema): InlineMarkInputRuleEntry[] {
  return INLINE_MARK_INPUT_RULE_SPECS.flatMap((spec) => {
    const markType = schema.marks[spec.markName]
    if (!markType) return []
    const alsoMarkTypes = (spec.alsoMarkNames ?? []).map((name) => schema.marks[name])
    // 重ねる mark が schema に無い規則は、片方だけ付けて開き直しで形が変わるので作らない。
    if (alsoMarkTypes.some((type) => !type)) return []
    return [alsoMarkTypes.length > 0 ? { markType, alsoMarkTypes, find: spec.find } : { markType, find: spec.find }]
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
 * 移植する。regexは共有側（vendor finder）のままで、ここではmatch配列の組み立てだけを行う。
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

export type InlineMarkInputRuleRunInput = {
  state: EditorState
  dispatch: (transaction: Transaction) => void
  composing: boolean
  from: number
  to: number
  text: string
  /** 変換しなかった理由の通知。呼ぶのは、code の規則で中身に inline node があって止めたときにちょうど1回。 */
  notify?: (reason: InlineMarkInputRuleNoticeReason) => void
}

export type InlineMarkInputRulesRuntime = {
  plugin: Plugin<InlineMarkInputRuleUndoable | null>
  rules: readonly InlineMarkInputRuleEntry[]
  /** `handleTextInput`相当。`EditorView`ではなくstate / dispatchだけを取る。 */
  run: (input: InlineMarkInputRuleRunInput) => boolean
}

/** 1回の入力（1文字、または1文字として扱えない文字列）に対する規則の試行の結果。 */
type InlineMarkInputRuleAttempt =
  | { kind: 'none' }
  /** code の規則で中身に inline node があり、変換せずに `notify` した（次の規則も試さない）。 */
  | { kind: 'blocked' }
  | { kind: 'threw' }
  | { kind: 'converted'; transaction: Transaction }

/**
 * 1回の入力 `[from, to)` へ `text` を打ったときの、規則の試行（1文字の入力の手順そのもの）。
 *
 * 1. code block の中、caret の隣が code の文字のときは `none`（Tiptap と同じ）
 * 2. caret の親が textblock でなければ `none`（ルビの中など）
 * 3. `textBefore = buildPositionFaithfulTextBefore($from) + text`。規則を順に試す
 * 4. match したら、`range = { from: from - (match[0].length - text.length), to }`（Tiptap と同じ式。
 *    1対1なので正しい位置になる）。中身（最後の capture group）が空なら次の規則へ
 * 5. 中身（capture group）が文書にある部分に収まるときは、そのまま変換する。収まらないとき（確定した文字が
 *    中身や開きの記号を含む）は、先に `tr.insertText(text, from, to)` をして、挿入後の文書の `range` で変換する
 * 6. code の規則（`` ` ``）で、中身に text・hardBreak 以外の inline node があるときは、変換せず `notify` を
 *    `'code-inline-node'` で1回呼んで `blocked`（呼び出し側が文字のまま入れる）。次の規則も試さない
 * 7. 変換は `applyInlineMarkInputRuleConversion`（vendor の handler は呼ばない）。`false` を返した、または
 *    step を足さなかったときは、その transaction を捨てて次の規則へ
 */
function attemptInlineMarkInputRules(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  rules: readonly InlineMarkInputRuleEntry[],
  notify: ((reason: InlineMarkInputRuleNoticeReason) => void) | undefined,
): InlineMarkInputRuleAttempt {
  let $from: ResolvedPos
  try {
    $from = state.doc.resolve(from)
  } catch {
    return { kind: 'none' }
  }
  if ($from.parent.type.spec.code) return { kind: 'none' }
  const adjacentCode = ($from.nodeBefore ?? $from.nodeAfter)?.marks.some(
    (mark) => mark.type.spec.code,
  )
  if (adjacentCode) return { kind: 'none' }
  if (!$from.parent.isTextblock) return { kind: 'none' }

  // MD-ESCAPE-EXPLICIT1: `\` を打った直後の句読点は、ほかの規則より先に、綴りのある文字にする。
  const spelling = buildSourceSpellingInputTransaction(state, $from, from, to, text)
  if (spelling !== null) return { kind: 'converted', transaction: spelling }

  const textBefore = buildPositionFaithfulTextBefore($from) + text
  for (const { markType, alsoMarkTypes, find, convert } of rules) {
    const match = matchInlineMarkInputRule(textBefore, find)
    if (!match) continue
    // 中身が空なら変換するものがない（次の規則へ）。
    const captureGroup = match[match.length - 1]
    if (!captureGroup) continue
    const docPart = match[0].length - text.length
    const captureStart = match[0].indexOf(captureGroup)
    const needsInsert = captureStart + captureGroup.length > docPart

    const transaction = state.tr
    let range = { from: from - docPart, to }
    if (needsInsert) {
      transaction.insertText(text, from, to)
      range = { from: range.from, to: from + text.length }
    }
    if (
      markType.spec.code &&
      rangeHasNonTextInlineNode(
        transaction.doc,
        range.from + captureStart,
        range.from + captureStart + captureGroup.length,
      )
    ) {
      notify?.('code-inline-node')
      return { kind: 'blocked' }
    }
    // MD-ESCAPE-EXPLICIT1: code の規則は、中身にバッククォートの綴り（`\``）があると変換しない
    // （CommonMark は閉じのバッククォートの列を `\` に関わらず数える。Source Mode に同じ文字を書いて読むと code span にならない）。
    if (
      markType.spec.code &&
      rangeHasSpelledChar(transaction.doc, range.from + captureStart, range.from + captureStart + captureGroup.length, '`')
    ) {
      continue
    }
    const stepsBefore = transaction.steps.length
    let converted: boolean
    try {
      converted = (convert ?? applyInlineMarkInputRuleConversion)(
        transaction,
        range,
        match,
        markType,
        alsoMarkTypes,
      )
    } catch {
      return { kind: 'threw' }
    }
    if (!converted || transaction.steps.length === stepsBefore) continue
    return { kind: 'converted', transaction }
  }
  return { kind: 'none' }
}

const NEWLINE_PATTERN = /[\n\r]/

/**
 * 確定した文字列を、1文字ずつ打った結果として試す文字の並びにする。1文字（コードポイント）以下、または
 * 改行を含むものは `null`（1回の入力として、今までどおり試す）。
 */
function splitTypedCharacters(text: string): string[] | null {
  if (NEWLINE_PATTERN.test(text)) return null
  const characters = Array.from(text)
  return characters.length > 1 ? characters : null
}

/**
 * 1文字ずつ打った結果を、1つの transaction にして返す（dispatch しない）。規則が1つも当たらなかった、または
 * 例外になったときは `null`。
 *
 * 1文字ごとに「規則を試し、当たれば変換、当たらなければその文字を挿入する」を、plugin を持たない作業用の
 * `EditorState` の上で繰り返し、集めた step を `state.tr` へ順に写す。作業用の state は plugin を持たないので、
 * filterTransaction / appendTransaction の影響を受けない（本物の state へ渡るのは、できあがった transaction だけ）。
 */
function buildTypedSequenceTransaction(
  state: EditorState,
  from: number,
  to: number,
  characters: readonly string[],
  rules: readonly InlineMarkInputRuleEntry[],
  notify: ((reason: InlineMarkInputRuleNoticeReason) => void) | undefined,
): Transaction | null {
  try {
    // 打つ位置が textblock の中でない（GapCursor・block の atom の選択など）ときは、既定の挿入に任せる。
    if (!state.doc.resolve(from).parent.isTextblock || !state.doc.resolve(to).parent.isTextblock) return null
    let work = EditorState.create({
      doc: state.doc,
      selection: TextSelection.create(state.doc, from, to),
      storedMarks: state.storedMarks,
    })
    const attempts: Transaction[] = []
    let converted = false
    let position = from
    let end = to
    for (const character of characters) {
      const attempt = attemptInlineMarkInputRules(work, position, end, character, rules, notify)
      if (attempt.kind === 'threw') return null
      let transaction: Transaction
      if (attempt.kind === 'converted') {
        transaction = attempt.transaction
        converted = true
      } else {
        // 当たらなかった文字、変換せず通知した文字は、そのまま打つ（1文字ずつ打った場合と同じ）。
        transaction = work.tr.insertText(character, position, end)
      }
      attempts.push(transaction)
      work = work.apply(transaction)
      position = work.selection.head
      end = position
    }
    if (!converted) return null

    const merged = state.tr
    for (const attempt of attempts) {
      for (const step of attempt.steps) merged.step(step)
    }
    merged.setSelection(TextSelection.create(merged.doc, work.selection.anchor, work.selection.head))
    if (work.storedMarks) merged.setStoredMarks(work.storedMarks)
    return merged
  } catch {
    return null
  }
}

/**
 * 複数の文字を一度に確定したときの結果を、同じ文字を1文字ずつ打った結果にそろえる（`**==強調==**` を一度に
 * 確定しても、内側の `==` も変換される）。1つの transaction なので、Cmd+Z は1回で確定の前へ戻る。Backspace の
 * 取り消し（`undoInputRule`）は、すべての step を戻した後に確定した文字をそのまま `from..to` へ入れる
 * （1文字の変換と同じ形）。規則が1つも当たらなかったときは `false` を返し、何もしない（呼び出し側の既定の挿入に任せる）。
 */
function runTypedSequence(input: {
  state: EditorState
  dispatch: (transaction: Transaction) => void
  from: number
  to: number
  text: string
  characters: readonly string[]
  rules: readonly InlineMarkInputRuleEntry[]
  plugin: Plugin<InlineMarkInputRuleUndoable | null>
  notify?: (reason: InlineMarkInputRuleNoticeReason) => void
}): boolean {
  const { state, dispatch, from, to, text, characters, rules, plugin, notify } = input
  const merged = buildTypedSequenceTransaction(state, from, to, characters, rules, notify)
  if (!merged) return false
  merged.setMeta(plugin, { transform: merged, from, to, text })
  dispatch(merged)
  return true
}

/**
 * host / PIS / Local Window の3経路が使う、共有の run（Tiptap の `run()` の代わり）。
 *
 * - composition 中は `false`
 * - 1文字（または改行を含む文字列）の入力は、1回の入力として試す（`attemptInlineMarkInputRules`）。
 *   変換できたら、undoable の meta（Backspace の `undoInputRule` は、すべての step を戻した後に `text` を
 *   from..to へ入れる）を付けて dispatch する
 * - 改行を含まない複数の文字は、1文字ずつ打った結果にそろえる（`runTypedSequence`）
 * - `text: ''`（従来の入力の IME が確定した後の run）は、今までどおり caret の前の末尾だけを見る（1つの入力として試す）。
 *   確定した文字列を1文字ずつ試すには変換の開始位置が要るので、この経路では行わない（EDITOR-INPUT-RULE-MIDSENTENCE1 の残る制限）
 */
export function runInlineMarkInputRules(
  input: InlineMarkInputRuleRunInput & {
    rules: readonly InlineMarkInputRuleEntry[]
    plugin: Plugin<InlineMarkInputRuleUndoable | null>
  },
): boolean {
  const { state, dispatch, composing, from, to, text, rules, plugin, notify } = input
  // composition preedit途中では一切変換しない。
  if (composing) return false
  const characters = splitTypedCharacters(text)
  if (characters) {
    return runTypedSequence({ state, dispatch, from, to, text, characters, rules, plugin, notify })
  }
  const attempt = attemptInlineMarkInputRules(state, from, to, text, rules, notify)
  if (attempt.kind !== 'converted') return false
  attempt.transaction.setMeta(plugin, { transform: attempt.transaction, from, to, text })
  dispatch(attempt.transaction)
  return true
}

export type InlineMarkInputRulesPluginOptions = {
  /** 変換しなかった理由の通知（host だけが受け口を持つ。Local Window は持たない）。 */
  onNotice?: (view: EditorView, reason: InlineMarkInputRuleNoticeReason) => void
  /**
   * Tiptap の input rule plugin と同じ、`compositionend` の後の `run`（`text: ''`）。
   * 従来の入力（host）の IME で確定した記号を変換するのに要る。Tiptap がすでに行っている処理を
   * 移しただけで、ほかの timer は足さない。
   */
  runAfterComposition?: boolean
}

/**
 * ProseMirror plugin と共有の run を1つにまとめる。host は editor の生成時に登録し、Local Window は
 * 独立 `EditorState` へ入れる。入口は `handleTextInput`（PIS の `commitText` も
 * `view.someProp('handleTextInput')` で同じ plugin を通る）。Enter（`'\n'`）は扱わない: mark の
 * finder はすべて記号で終わるので、`'\n'` を足した文字には当たらない。
 */
export function createInlineMarkInputRulesRuntime(
  schema: Schema,
  options: InlineMarkInputRulesPluginOptions = {},
): InlineMarkInputRulesRuntime {
  const rules = buildInlineMarkInputRules(schema)
  const runInView = (view: EditorView, from: number, to: number, text: string): boolean =>
    runInlineMarkInputRules({
      state: view.state,
      dispatch: (transaction) => view.dispatch(transaction),
      composing: view.composing,
      from,
      to,
      text,
      rules,
      plugin,
      notify: options.onNotice ? (reason) => options.onNotice?.(view, reason) : undefined,
    })
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
        return runInView(view, from, to, text)
      },
      handleDOMEvents: options.runAfterComposition
        ? {
            compositionend: (view) => {
              setTimeout(() => {
                if (view.isDestroyed) return
                const { $cursor } = view.state.selection as { $cursor?: ResolvedPos | null }
                if ($cursor) runInView(view, $cursor.pos, $cursor.pos, '')
              })
              return false
            },
          }
        : undefined,
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
  options: InlineMarkInputRulesPluginOptions = {},
): Plugin<InlineMarkInputRuleUndoable | null> {
  return createInlineMarkInputRulesRuntime(schema, options).plugin
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
