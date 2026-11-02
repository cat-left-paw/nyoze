/**
 * PARAGRAPH-PLAIN-RESERVED-STYLE1: 段落プレーン編集「表示優先」の予約の大きさ（対象の段落の `min-block-size`）を、
 * 専用の `<style>` の規則（CSSOM）で書く。
 *
 * 以前は `.editor-surface` へ継承される custom property で書いていて、値が変わるたびに
 * 下の全要素の style が計算し直されていた（docs/paragraph-plain-reserved-style-diag1-2026-10.md）。
 * 規則の宣言だけを書き換えれば、計算し直すのは規則に当たる要素だけになる。ProseMirror の DOM には触れない
 * （DOM 監視を起こさない）。timer・rAF は持たない（量子化・同じ値の抑止・rAF でのまとめは呼び出し側）。
 */

/** `src/styles.css` の対象の段落の規則と同じ selector。 */
export const PARAGRAPH_PLAIN_RESERVED_SELECTOR =
  '.editor-surface .ProseMirror .tategaki-plain-overlay-target[data-plain-mode="true"]'

/** 専用の `<style>` の印（`data-nyoze-paragraph-plain-reserved`）。 */
export const PARAGRAPH_PLAIN_RESERVED_STYLE_ATTRIBUTE = 'data-nyoze-paragraph-plain-reserved'

export type ParagraphPlainReservedRule = {
  /** 規則の `min-block-size` を書く。`null` なら宣言を外す（`<style>` がまだなければ何もしない）。 */
  write(value: string | null): void
  /** `<style>` を文書から外す。 */
  dispose(): void
}

/** `getDocument` は編集中の document（overlay の host の `ownerDocument`）。 */
export function createParagraphPlainReservedRule(
  getDocument: () => Document | null | undefined,
): ParagraphPlainReservedRule {
  let element: HTMLStyleElement | null = null

  function ensureRule(doc: Document): CSSStyleRule | null {
    if (element && (element.ownerDocument !== doc || !element.isConnected)) dispose()
    if (!element) {
      element = doc.createElement('style')
      element.setAttribute(PARAGRAPH_PLAIN_RESERVED_STYLE_ATTRIBUTE, '')
      element.textContent = `${PARAGRAPH_PLAIN_RESERVED_SELECTOR} {}`
      ;(doc.head ?? doc.documentElement).appendChild(element)
    }
    return (element.sheet?.cssRules[0] as CSSStyleRule | undefined) ?? null
  }

  function write(value: string | null): void {
    if (value == null) {
      const rule = element?.sheet?.cssRules[0] as CSSStyleRule | undefined
      rule?.style.removeProperty('min-block-size')
      return
    }
    const doc = getDocument()
    if (!doc) return
    ensureRule(doc)?.style.setProperty('min-block-size', value)
  }

  function dispose(): void {
    element?.remove()
    element = null
  }

  return { write, dispose }
}
