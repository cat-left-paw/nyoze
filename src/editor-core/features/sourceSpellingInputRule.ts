import type { Mark, Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import {
  ASCII_PUNCTUATION_CHAR,
  SOURCE_SPELLING_MARK_NAME,
  decodeSourceSpelling,
  maskSourceSpelledText,
  writeSourceSpelling,
} from '../io/sourceSpelling'

/**
 * MD-ESCAPE-EXPLICIT1: 入力規則が、`sourceSpelling` mark のある文字を記号として使わないための部品と、
 * 「`\` + 記号」を打ったときの変換（`\` が消えて、記号が文字のまま残る）。
 *
 * - 照合に使う文字（`buildPositionFaithfulTextBefore`）では、綴りのある文字を 1 文字ずつ
 *   `SOURCE_SPELLED_MATCH_CHAR` に置き換える。記号（`*` `#` `-` など）ではなくなるので、どの規則も区切りとして
 *   使わない（`\*a*` は斜体にならない）。
 * - Tiptap の規則（見出し `# `・引用 `> `・リスト・code block・水平線）は、変換する範囲に綴りのある文字が
 *   あれば何もしない（`extensions/sourceSpellingInputRuleGuard.ts`）。
 * - `\` を打った直後に ASCII の句読点を打つと、`\` と句読点を、`raw = '\' + 句読点` の綴りを持つ句読点 1 文字に
 *   する（`**` が太字に変わるのと同じ形。Backspace で `undoInputRule` が、打った 2 文字へ戻す）。
 */

/** 照合に使う文字で、綴りのある文字の代わりに置く文字（記号でも空白でもない）。 */
export const SOURCE_SPELLED_MATCH_CHAR = '￼'

export function isSourceSpellingMark(mark: Mark): boolean {
  return mark.type.name === SOURCE_SPELLING_MARK_NAME
}

/** text node の文字のうち、保存で元の綴りで書く文字を `SOURCE_SPELLED_MATCH_CHAR` に置き換えた文字列。 */
export function maskSpelledTextNode(node: PMNode, text: string = node.text ?? ''): string {
  const mark = node.marks.find(isSourceSpellingMark)
  return mark === undefined ? text : maskSourceSpelledText(text, mark.attrs.raw, SOURCE_SPELLED_MATCH_CHAR)
}

/** `[from, to)` に、保存で元の綴りで書く文字（＝記号として使わない文字）があるか。 */
export function rangeHasSourceSpelledChar(doc: PMNode, from: number, to: number): boolean {
  const size = doc.content.size
  const start = Math.max(0, Math.min(size, from))
  const end = Math.max(start, Math.min(size, to))
  if (start === end) return false
  let found = false
  doc.nodesBetween(start, end, (node, pos) => {
    if (found) return false
    if (!node.isText) return true
    if (!node.marks.some(isSourceSpellingMark)) return true
    const text = node.text ?? ''
    const slice = text.slice(Math.max(0, start - pos), Math.max(0, end - pos))
    if (maskSpelledTextNode(node, slice) !== slice) found = true
    return false
  })
  return found
}

/**
 * 「`\` + 記号」の変換。`\` を打った直後（その `\` が綴りのない文字）に、ASCII の句読点 1 文字を
 * `[from, to)` へ打つとき、`\` と打った句読点を、綴りのある句読点 1 文字（`raw = '\' + 句読点`）に置き換える
 * transaction を返す。条件に合わなければ null。
 * 新しい文字には、`\` の mark（太字など）を引き継ぎ、綴りの mark を付ける。
 */
export function buildSourceSpellingInputTransaction(
  state: EditorState,
  $from: ResolvedPos,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  const spellingType = state.schema.marks[SOURCE_SPELLING_MARK_NAME]
  if (spellingType === undefined) return null
  if (!ASCII_PUNCTUATION_CHAR.test(text)) return null
  const before = $from.nodeBefore
  if (before === null || !before.isText) return null
  const beforeText = before.text ?? ''
  if (!beforeText.endsWith('\\')) return null
  // その `\` が、綴りのある `\`（ファイルの `\\`）なら、エスケープの開始ではない。
  if (maskSpelledTextNode(before).endsWith(SOURCE_SPELLED_MATCH_CHAR)) return null
  const marks = before.marks.filter((mark) => !isSourceSpellingMark(mark))
  const spelled = state.schema.text(text, spellingType.create({ raw: `\\${text}` }).addToSet(marks))
  return state.tr.replaceWith(from - 1, to, spelled)
}

/**
 * `[from, to)` の綴りのある文字を、元の綴りの文字（`raw`。`\*` なら 2 文字）に置き換える（綴りの mark は外し、
 * ほかの mark は残す）。code span の中は `\` が文字なので、code の入力規則が中身に使う。置き換えは右から行うので、
 * 返す値（増えた文字数）以外の位置は、`from` より前では変わらない。
 */
export function expandSpelledCharsToRaw(tr: Transaction, from: number, to: number): number {
  const runs: Array<{ pos: number; size: number; text: string; raw: string; marks: readonly Mark[] }> = []
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true
    const spelling = node.marks.find(isSourceSpellingMark)
    if (spelling === undefined) return false
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    const text = (node.text ?? '').slice(start - pos, end - pos)
    if (maskSpelledTextNode(node, text) === text) return false
    const raw = spelling.attrs.raw as string
    const decoded = decodeSourceSpelling(raw)
    if (decoded === null) return false
    runs.push({ pos: start, size: end - start, text, raw, marks: node.marks.filter((mark) => !isSourceSpellingMark(mark)) })
    return false
  })
  let added = 0
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index]
    const replacement = writeSourceSpelling(run.text, run.raw, (chunk) => chunk)
    tr.replaceWith(run.pos, run.pos + run.size, tr.doc.type.schema.text(replacement, run.marks))
    added += replacement.length - run.text.length
  }
  return added
}

/**
 * `[from, to)` に、`char` を表す綴りのある文字があるか。code span の入力規則が、中身にバッククォートの
 * 綴り（`\``）を含むときに変換しないために使う（CommonMark は閉じのバッククォートの列を `\` に関わらず
 * 数えるので、Source Mode に同じ文字を書いて読むと code span にならない）。
 */
export function rangeHasSpelledChar(doc: PMNode, from: number, to: number, char: string): boolean {
  let found = false
  doc.nodesBetween(Math.max(0, from), Math.min(doc.content.size, to), (node) => {
    if (found) return false
    if (!node.isText) return true
    const spelling = node.marks.find(isSourceSpellingMark)
    if (spelling !== undefined && decodeSourceSpelling(spelling.attrs.raw) === char && (node.text ?? '').includes(char)) found = true
    return false
  })
  return found
}
