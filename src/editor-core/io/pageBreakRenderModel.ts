/**
 * `:::page-break` / `:::blank-page` の RenderModel / ExportModel 正規化。
 *
 * 正本: `docs/page-break-render-model-spec-2026-07.md`
 *
 * `:::page-break` (`nyozePageBreak`) を「本文 flow 内の表示ブロック」ではなく、
 * 「次の有効な表示ブロックの `breakBefore`」へ変換し、`:::blank-page` /
 * `:::blank-page-N` (`nyozeBlankPage`) を content block ではなく fixed page
 * slot（`{ kind: 'blankPage'; count }`）として扱う pure helper。
 * fs / Electron / React / IPC には依存しない。`@tiptap/pm/model` の `Node` 型
 * だけを使うため、PM doc から取り出した top-level block 列（`doc.forEach` 相当）を
 * そのまま渡せる。exporter 側 (`bookExportConversion.ts` 等) や将来の Page Viewer が
 * 直接再利用できる形にしてある。
 *
 * 初期実装は **top-level block のみ** を対象とする。呼び出し側が渡す配列は
 * 常に「1階層のブロック列」である前提で、この関数自身は子 block の中を
 * 再帰的に探索しない。そのため `nyozeDirectiveBlock` / blockquote / list /
 * codeBlock などの中に nested した `:::page-break` / `:::blank-page` はこの
 * 関数から見えず、通常の content block としてそのまま透過する（初期仕様の対象外）。
 *
 * このモジュールでは exporter 接続、Page Viewer 実装は行わない
 * （それぞれ Slice B / Slice E の責務）。
 */

import type { Node as PMNode } from '@tiptap/pm/model'
import { NYOZE_BLANK_PAGE_NODE_NAME, NYOZE_PAGE_BREAK_NODE_NAME } from './customBlockDirective'

/** normalize 後の content block。`breakBefore` は page-break normalize 由来のときだけ true。 */
export type ContentRenderBlock = {
  kind: 'content'
  node: PMNode
  /** この block の直前に改ページを挟むか。page-break normalize 由来のときだけ true。 */
  breakBefore: boolean
}

/**
 * `:::blank-page` / `:::blank-page-N` (`nyozeBlankPage`) 由来の fixed page slot。
 * content block とは異なり、`breakBefore` の概念を持たない
 * （blank-page 自体がすでに独立した固定ページのため）。
 *
 * `node` は元の `nyozeBlankPage` node への参照 (`ContentRenderBlock.node` と同じ
 * 「node をコピーしない」方針)。既存 exporter (LeME / でんでん / 青空文庫風 /
 * HTML) はこれまでどおり `count` だけを読み、`node` は無視する。`pageModel.ts`
 * の Book chapter 対応 (`buildPageModelFromBookChapters`) が、node の参照
 * identity から「この blank-page がどの章由来か」を引き直すために追加した。
 */
export type BlankPageRenderBlock = {
  kind: 'blankPage'
  count: number
  node: PMNode
}

export type PageBreakRenderBlock = ContentRenderBlock | BlankPageRenderBlock

/** top-level block が `nyozePageBreak` (改ページ marker) かどうか。 */
export function isTopLevelPageBreakNode(node: PMNode): boolean {
  return node.type.name === NYOZE_PAGE_BREAK_NODE_NAME
}

/** top-level block が `nyozeBlankPage` (空白ページ marker) かどうか。 */
export function isTopLevelBlankPageNode(node: PMNode): boolean {
  return node.type.name === NYOZE_BLANK_PAGE_NODE_NAME
}

/** `nyozeBlankPage` node の `count` attr を読み取る (未設定時は 1)。 */
function resolveBlankPageCount(node: PMNode): number {
  const count = node.attrs.count as number | undefined
  return typeof count === 'number' && Number.isFinite(count) ? count : 1
}

/**
 * top-level `paragraph` が空 paragraph かどうか。
 *
 * 空 paragraph の定義: `paragraph` node で、textContent が空、かつ表示対象の
 * inline node (hardBreak / noteAnchor / nyoze_image / aozoraRuby / aozoraTcy /
 * html_inline_atom など) を一切持たない。`content.size === 0` はこの両方を
 * 同時に満たす (子 node が 1 つも無ければ textContent も自動的に空になる)。
 */
export function isEmptyTopLevelParagraphNode(node: PMNode): boolean {
  return node.type.name === 'paragraph' && node.content.size === 0
}

/**
 * top-level block 列から `:::page-break` / `:::blank-page` を正規化する。
 *
 * 仕様 (`docs/page-break-render-model-spec-2026-07.md` §6):
 * 1. `page-break` 自体は結果から消す。
 * 2. `page-break` 直前の連続した空 paragraph は結果から除外する。
 * 3. `page-break` 直後の連続した空 paragraph は次の有効 block 探索時に skip する。
 * 4. 次の非空・表示可能 content block に `breakBefore: true` を付ける。
 * 5. 連続 `page-break` は 1 つの pending break に畳む。
 * 6. 文書先頭の `page-break` は無視する (先頭に来る content block へは
 *    `breakBefore` を付けない。空白ページも作らない)。
 * 7. 文書末尾の `page-break` は無視する (何も生成しない)。
 * 8. `blankPage` は page-break と別の fixed page slot として維持する
 *    (`{ kind: 'blankPage'; count }`。content block ではないため empty
 *    paragraph の trim 対象にはならず、それ自体に `breakBefore` も付かない)。
 * 9. `page-break` と `blankPage` が隣接しても、page-break は追加の空白ページを
 *    作らない。`blankPage` は「すでにそれ自体が新しいページ」を提供するため、
 *    直前に pending だった page-break はここで解消される
 *    (`blankPage` の直後に続く content block へ、直前の page-break 由来の
 *    `breakBefore` を持ち越さない。「fixed blank pages の後に続く flow
 *    section の開始」として扱う。§7.8 参照)。
 *
 * nested page-break / blank-page (top-level 以外) はこの関数の対象外。
 * 呼び出し側は top-level block 列だけを渡すこと。
 */
export function normalizeTopLevelPageBreaks(
  blocks: readonly PMNode[],
): PageBreakRenderBlock[] {
  const result: PageBreakRenderBlock[] = []
  let breakPending = false

  for (const block of blocks) {
    if (isTopLevelPageBreakNode(block)) {
      // page-break 直前の連続した空 paragraph を結果から除外する
      // (blankPage エントリは content ではないためこの trim の対象にならない)。
      while (
        result.length > 0 &&
        result[result.length - 1].kind === 'content' &&
        isEmptyTopLevelParagraphNode((result[result.length - 1] as ContentRenderBlock).node)
      ) {
        result.pop()
      }
      breakPending = true
      continue
    }

    if (isTopLevelBlankPageNode(block)) {
      result.push({ kind: 'blankPage', count: resolveBlankPageCount(block), node: block })
      // blankPage 自体がすでに固定ページを提供するため、直前の pending break は
      // ここで解消する。続く content block へ余計な breakBefore を持ち越さない。
      breakPending = false
      continue
    }

    if (breakPending && isEmptyTopLevelParagraphNode(block)) {
      // page-break 直後の連続した空 paragraph は次の有効 block 探索時に skip する。
      continue
    }

    // 文書先頭 (result が空) では breakPending が true でも breakBefore を付けない。
    // これにより文書先頭の page-break (直後に空 paragraph が続く場合を含む) は
    // 空白ページを作らず無視される。
    const breakBefore = breakPending && result.length > 0
    result.push({ kind: 'content', node: block, breakBefore })
    breakPending = false
  }

  // 文書末尾に残った pending break (末尾 page-break) は何も生成せず無視する。
  return result
}
