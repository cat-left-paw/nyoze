/**
 * CLIPBOARD-INTERNAL-PASTE1: Nyoze の中でコピーした内容の印。
 *
 * コピーのとき、ProseMirror が書いた HTML の `data-pm-slice` の付いた要素に
 * `data-nyoze-copy="1"` を足す。貼り付けは、この印のある `text/html` を ProseMirror の
 * 標準の貼り付け（`data-pm-slice` からコピーした slice をそのまま組み立て直す）に任せ、
 * `text/plain` を Nyoze の Markdown として読み直さない（文字の記号が見出し・強調などに
 * ならない）。外から来た内容（印なし）の扱いは変えない。
 *
 * 印は要素の属性で、`text/plain` / `text/markdown`（外のアプリへ貼る文字）には出ない。
 */

export const NYOZE_CLIPBOARD_MARK_ATTR = 'data-nyoze-copy'
const NYOZE_CLIPBOARD_MARK_VALUE = '1'
const PM_SLICE_ATTR = 'data-pm-slice'

// 印を付けてよい slice かの判定（`canRestoreSliceFromHtml`）は、CLIPBOARD-INTERNAL-PASTE3 から
// clipboard の parser が戻せるかで決めるので、`clipboardNodeCodec.ts` にある。

/**
 * `serializeForClipboard` が作った `dom` の、`data-pm-slice` の付いた要素へ印を付ける。
 * その要素がなければ何もしない（付けたときだけ true）。
 */
export function markNyozeClipboardDom(dom: Pick<Element, 'querySelector'>): boolean {
  // 実際の dom は Element。querySelector を持たない最小の偽物（試験）でも落とさない。
  if (typeof dom.querySelector !== 'function') return false
  const sliceRoot = dom.querySelector(`[${PM_SLICE_ATTR}]`)
  if (!sliceRoot) return false
  sliceRoot.setAttribute(NYOZE_CLIPBOARD_MARK_ATTR, NYOZE_CLIPBOARD_MARK_VALUE)
  return true
}

// 属性名は大文字小文字を区別しない（HTML の parser が小文字にする）。
const MARK_ATTR_PROBE = /data-nyoze-copy/i
const HTML_COMMENT = /<!--[\s\S]*?-->/g
// 開始 tag。属性の値の中の `>` で切れないよう、引用符の中は丸ごと読む。
const START_TAG = /<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
// 属性 1 つ: name と、あれば引用符つき / なしの値。
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/**
 * `text/html` に Nyoze の印（開始 tag の属性 `data-nyoze-copy="1"`）があるか。
 * comment の中や、本文の文字・別の属性の値の中に同じ文字列があるだけでは true にしない。
 */
export function isNyozeClipboardHtml(html: string): boolean {
  if (!MARK_ATTR_PROBE.test(html)) return false
  const withoutComments = html.replace(HTML_COMMENT, '')
  const tagRe = new RegExp(START_TAG.source, 'g')
  let tag: RegExpExecArray | null
  while ((tag = tagRe.exec(withoutComments)) !== null) {
    const attributes = tag[2] ?? ''
    if (!MARK_ATTR_PROBE.test(attributes)) continue
    const attrRe = new RegExp(ATTRIBUTE.source, 'g')
    let attr: RegExpExecArray | null
    while ((attr = attrRe.exec(attributes)) !== null) {
      if (attr[1].toLowerCase() !== NYOZE_CLIPBOARD_MARK_ATTR) continue
      const value = attr[2] ?? attr[3] ?? attr[4]
      if (value === NYOZE_CLIPBOARD_MARK_VALUE) return true
    }
  }
  return false
}
