/**
 * EDITOR-PARAGRAPH-REPARSE1（追記 2）: 読み直しで置き換えたとき、保存される文字列が変わらないことの最後の安全網。
 *
 * 置き換えるのは文書直下の block 1 つの中の対象の textblock の中身だけで、block の種類・構造・文書直下の子の数は変わらない。
 * 比べ方は改行のモードで分ける:
 * - `obsidian-paragraph`: 文書全体の保存の文字列の比較。書き出し（`MD-SOURCE-PRESERVE1` の元の綴りの再利用）には、境目の確かめが
 *   合わないと隣へ広げ、4 回で合わなければ文書全体を今の書き方にする、局所でない動きがあり、窓では捉えられない。書き出しは速い
 *   （記録ありで 1〜5 ms）。
 * - `commonmark-strict`: 窓の比較。strict の書き出しは遅く（長文で 1 回 330〜470 ms）、文書全体の比較は 2 回の書き出しになる。
 *   strict の書き出しが対象の block の出力へ与える影響は、次の 2 つだけなので、窓で足りる:
 *   (1) `shouldPreserveEmptyParagraph`（`preserveEmptyParagraphs` が ON のとき）が、空の段落（子が 0 の段落）を残すかを、
 *       両側の最も近い中身のある block で決める。
 *   (2) `getOutput()` が出力の末尾を `trimEnd()` する。
 *   窓は、対象の block を中心にして次のように広げる（その間の空の段落も窓に入れる。文書の端に着いたらそこまで）:
 *   - 左: 空の段落を飛ばして、中身のある block を 1 つ含むまで（(1) のため）。
 *   - 右: 空の段落を飛ばすだけでは足りない。出力が空白だけになる block（空白だけの段落など）は「中身のある block」だが、`trimEnd()` が
 *     その出力を越えて対象の末尾の空白まで食い込む。窓の右端は、**見える文字（空白でない文字）を含む block** までにする（(1)(2) の両方のため。
 *     見える文字を含まない block は、画像だけの段落・水平線などの出力が見えるものでも、安全側に飛ばして先へ広げる）。
 *   前後 1 個の固定の窓では、「対象（末尾に空白）・空の段落・中身のある段落」の並びで、文書の中では空の段落が残って対象の末尾の空白が
 *   保存に残るのに、窓の中では空の段落が窓の最後で落ち、`trimEnd()` で末尾の空白の違いが隠れる。空の段落だけを飛ばす窓でも、
 *   「対象（末尾に空白）・空白だけの段落・中身のある段落」の並びで、窓の最後が空白だけの段落になり、同じ理由で違いが隠れる
 *   （総当たりの試験が見つけた）。
 *   この窓が成り立つ前提は、対象の block が置き換えの前後とも「中身のある block」であること（空の段落は前後の block の書き方に効く）。
 *   対象の textblock の中身が空になる候補は採らない（`reparseTransaction.ts`）。
 */
import type { Node as PMNode } from '@tiptap/pm/model'
import type { LineBreakPolicy } from '../../types'

/** 文書直下の子のうち、`[from, to)` の範囲（添字）。 */
export type SaveCheckWindow = { from: number; to: number }

/** strict の書き出しが「空」と見て飛ばす段落（子が 0 の段落。`serializeMarkdown.ts` の `findAdjacentContentBlock` と同じ判定）。 */
function isEmptyParagraph(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.childCount === 0
}

/** 見える文字（空白でない文字）を含む block か。`trimEnd()` が食い込めない出力を持つ block の、安全側の判定（画像だけの段落などは false）。 */
function hasVisibleText(node: PMNode): boolean {
  return /\S/.test(node.textContent)
}

/**
 * 文書直下の子 `topIndex` を中心にした窓。左は、空の段落を飛ばして、中身のある block を 1 つ含むまで。右は、見える文字を含む
 * block を 1 つ含むまで（空の段落・空白だけの段落・見える文字のない block は飛ばす）。その間の block も窓に入れる。
 * 文書の端に着いたら、そこまで。
 */
export function resolveSaveCheckWindow(doc: PMNode, topIndex: number): SaveCheckWindow {
  let from = topIndex
  while (from > 0) {
    from -= 1
    if (!isEmptyParagraph(doc.child(from))) break
  }
  let to = topIndex + 1
  while (to < doc.childCount) {
    to += 1
    if (hasVisibleText(doc.child(to - 1))) break
  }
  return { from, to }
}

function windowDocument(doc: PMNode, window: SaveCheckWindow): PMNode {
  const children: PMNode[] = []
  for (let index = window.from; index < window.to; index += 1) children.push(doc.child(index))
  return doc.type.create(null, children)
}

/**
 * 置き換えの前後で、保存される文字列が同じか（`serializeDocument` は保存と同じ書き出し）。`topIndex` は、置き換えた block の、
 * 文書直下の子の番号（前後の文書で同じ）。書き出しが投げたら false（置き換えない側）。
 */
export function isSavedTextUnchanged(input: {
  before: PMNode
  after: PMNode
  topIndex: number
  lineBreakPolicy: LineBreakPolicy
  serializeDocument(doc: PMNode): string
}): boolean {
  const { before, after, topIndex, lineBreakPolicy, serializeDocument } = input
  if (before.childCount !== after.childCount || topIndex < 0 || topIndex >= before.childCount) return false
  try {
    if (lineBreakPolicy === 'obsidian-paragraph') return serializeDocument(after) === serializeDocument(before)
    const window = resolveSaveCheckWindow(before, topIndex)
    return serializeDocument(windowDocument(after, window)) === serializeDocument(windowDocument(before, window))
  } catch {
    return false
  }
}
