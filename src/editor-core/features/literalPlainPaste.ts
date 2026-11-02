import { Fragment, Slice } from '@tiptap/pm/model'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { isNyozeClipboardHtml } from './clipboardInternalMark'

/**
 * CLIPBOARD-INTERNAL-PASTE2: 右クリックの「プレーンテキストとして貼り付け」で、Nyoze の中で
 * コピーした内容を文字のまま入れる。
 *
 * 貼り付けのイベントは `text/plain` しか持たない（`text/html` は付けない）ので、貼り付けの
 * handler は、その `text/plain` が Nyoze の中でコピーしたものかを知れない。クリップボードの
 * `text/html` に Nyoze の印（`data-nyoze-copy`）があったときだけ、イベントに専用の type を
 * 足して「この `text/plain` は文字のまま入れる」と伝える。印のない内容（外部のアプリのコピー）
 * は、これまでどおり Markdown として読む。
 */
export const NYOZE_PLAIN_LITERAL_PASTE_TYPE = 'application/x-nyoze-plain-literal'
const LITERAL_PASTE_VALUE = '1'

export type PlainPastePayload = {
  /** 改行を `\n` にそろえた `text/plain`。 */
  text: string
  /** true のとき、貼り付けのイベントへ `NYOZE_PLAIN_LITERAL_PASTE_TYPE` を足す。 */
  literal: boolean
}

/** クリップボードから読んだ内容を、プレーンテキストの貼り付けのイベントに載せる形へ決める。 */
export function resolvePlainPastePayload(input: { html: string | null; text: string }): PlainPastePayload {
  return {
    text: input.text.replace(/\r\n/g, '\n'),
    literal: input.html !== null && isNyozeClipboardHtml(input.html),
  }
}

/** 貼り付けのイベントが、文字のまま入れる指示（専用の type の値 `1`）を持っているか。 */
export function isLiteralPlainPasteData(data: Pick<DataTransfer, 'getData'>): boolean {
  return data.getData(NYOZE_PLAIN_LITERAL_PASTE_TYPE) === LITERAL_PASTE_VALUE
}

/**
 * ProseMirror の標準のプレーンテキストの貼り付け（Shift+Cmd+V と同じ経路。`parseFromClipboard` の
 * `text/plain` の枝）と同じ結果になる transaction を組み立てるだけで、dispatch はしない。
 * 行（`\r\n` `\r` `\n` の連続を 1 つの区切りとする）ごとに、選択の開始位置の mark を持つ段落を作り、
 * `Slice.maxOpen` で開いた slice を `replaceSelection` する。
 *
 * Tiptap の paste rule は `uiEvent: 'paste'` の meta で動き、`**太字ではない**` のような文字を
 * mark に変えてしまうので、この meta は付けない（Markdown の plain paste と同じ）。
 * 空の文字列は何も入れないので null を返す。
 */
export function buildLiteralPlainPasteTransaction(state: EditorState, text: string): Transaction | null {
  if (!text) return null
  const { schema } = state
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return null
  const marks = state.selection.$from.marks()
  const paragraphs: PMNode[] = text
    .split(/(?:\r\n?|\n)+/)
    .map((block) => paragraph.create(null, block ? schema.text(block, marks) : undefined))
  const slice = Slice.maxOpen(Fragment.from(paragraphs), true)
  return state.tr.replaceSelection(slice)
}
