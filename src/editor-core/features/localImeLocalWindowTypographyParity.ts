/**
 * LOCAL-WINDOW-TYPOGRAPHY-PARITY1 — host PM と Local Window の **表示専用** 組版契約。
 *
 * このmoduleはownership / scheduler / transaction / commitを一切持たない。
 * `src/styles.css`の共有ruleが実装、ここがその契約の正本（selector list と
 * property whitelist）で、`tests/local-ime-local-window-typography-parity1.test.ts`が
 * 両者の一致を静的に固定する。
 *
 * 原稿保全: paragraph末補正はCSS generated content（`::after`）だけで行い、
 * WJ / ZWSPをPM Doc、Markdown、clipboard、Undo history、DOM `textContent`へ
 * 混入させない。DOM `textContent`を編集SoTにしない契約も変えない。
 */

/** 共有組版contractを与えるhost PM側selector。 */
export const LOCAL_IME_LOCAL_WINDOW_HOST_TYPOGRAPHY_SELECTOR =
  '.editor-core-host .ProseMirror'

/** 共有組版contractを与えるLocal Window側selector（local PMのroot `.ProseMirror`）。 */
export const LOCAL_IME_LOCAL_WINDOW_LOCAL_TYPOGRAPHY_SELECTOR =
  '.editor-surface > .nyoze-local-window-overlay > [data-nyoze-local-window-editor="true"] > .ProseMirror'

/**
 * host / Local Windowで一致していなければならないlayout影響property。
 * 実機で確認したlayout shiftのroot causeは`text-align` / `text-align-last` /
 * `text-justify` / `text-wrap`の欠落だったが、再発防止のため行分割・font metrics
 * 一式をまとめてこのwhitelistで固定する。
 */
export const LOCAL_IME_LOCAL_WINDOW_TYPOGRAPHY_PROPERTIES = [
  'writing-mode',
  'text-orientation',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'white-space',
  'line-break',
  'word-break',
  'overflow-wrap',
  'hanging-punctuation',
  'text-wrap',
  'text-align',
  'text-align-last',
  'text-justify',
] as const

export type LocalImeLocalWindowTypographyProperty =
  (typeof LOCAL_IME_LOCAL_WINDOW_TYPOGRAPHY_PROPERTIES)[number]

/**
 * editor 本文の折り返し行末揃え。host / Local Window の共有 contract rule が
 * writing-mode を問わず持つ。Page Viewer / export の縦書き専用 justify とは独立。
 */
export const LOCAL_IME_LOCAL_WINDOW_JUSTIFY_PROPERTIES = [
  'text-align',
  'text-align-last',
  'text-justify',
] as const

/** 共有 contract rule が持つべき property（justify を含む）。 */
export const LOCAL_IME_LOCAL_WINDOW_SHARED_CONTRACT_PROPERTIES =
  LOCAL_IME_LOCAL_WINDOW_TYPOGRAPHY_PROPERTIES

/** host / localともにparagraph末へ出す表示専用文字（DOMには入らない）。 */
export const LOCAL_IME_LOCAL_WINDOW_PARAGRAPH_END_GENERATED_CONTENT =
  '"\\200B" / ""'

/**
 * paragraph末補正の判定入力。DOM APIから切り離した「実DOM形状」だけを表す。
 *
 * - `soleTrailingBreak`: 子が`br.ProseMirror-trailingBreak`ひとつだけ（空paragraph）。
 * - `specialInlineDirectChildBeforeTrailingBreak`: Ruby / TCY wrapperが`p`の
 *   **直接子**で、その直後（`img.ProseMirror-separator`を高々1つ挟んでよい）の
 *   `br.ProseMirror-trailingBreak`がlast child。TCYのような
 *   `contenteditable="false"` leafが段落末に来るとPMがseparatorを1つ挿すため、
 *   hostのsentinel経路と同じ表示結果にするにはこれも同じ抑止に含める。
 *   host側はsentinel widgetを同じ位置条件で見ており、markに包まれて直接子で
 *   なくなった場合はhost / localともに抑止しない（既存hostの表示結果と同じ）。
 */
export type LocalImeLocalWindowParagraphEndShape = {
  readonly soleTrailingBreak: boolean
  readonly specialInlineDirectChildBeforeTrailingBreak: boolean
}

/** paragraph末のgenerated ZWSPを抑止すべきか（host既存条件と同値）。 */
export function shouldSuppressLocalImeLocalWindowParagraphEndContent(
  shape: LocalImeLocalWindowParagraphEndShape,
): boolean {
  return shape.soleTrailingBreak || shape.specialInlineDirectChildBeforeTrailingBreak
}

/**
 * Local Window側の抑止selector。host sentinelはlocalへ複製しないので、
 * 証明済みのRuby / TCY DOM自身を同じ位置条件で使う。
 */
export const LOCAL_IME_LOCAL_WINDOW_PARAGRAPH_END_SUPPRESSION_SELECTORS = [
  `${LOCAL_IME_LOCAL_WINDOW_LOCAL_TYPOGRAPHY_SELECTOR} > p:has(> :is([data-aozora-ruby], [data-tategaki-tcy]) + br.ProseMirror-trailingBreak:last-child)`,
  `${LOCAL_IME_LOCAL_WINDOW_LOCAL_TYPOGRAPHY_SELECTOR} > p:has(> :is([data-aozora-ruby], [data-tategaki-tcy]) + img.ProseMirror-separator + br.ProseMirror-trailingBreak:last-child)`,
  `${LOCAL_IME_LOCAL_WINDOW_LOCAL_TYPOGRAPHY_SELECTOR} > p:has(> br.ProseMirror-trailingBreak:only-child)`,
] as const

/**
 * CSS textを比較するときの空白正規化。prettierが入れる改行 / indentと、
 * `:has(` / `:is(` の内側に入る折返し空白を吸収する。
 */
export function normalizeLocalImeLocalWindowCssText(cssText: string): string {
  return cssText
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}
