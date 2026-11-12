import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
// markdown-it の block rule は型宣言を持たない（公開しているのは実装だけ）。
// @ts-expect-error TS7016: reference rule の型宣言が無い
import referenceRule from 'markdown-it/lib/rules_block/reference.mjs'

/**
 * MD-ESCAPE-EXPLICIT1（§3.5）: リンクの定義の行（`[注]: 説明`、`[^1]: 注の本文`）を、文書から消さずに
 * 見える行として持つ。
 *
 * markdown-it の `reference` rule は、定義を `env.references` に登録して行を消費し、token を作らない。
 * そのため既定の改行モードでは、行が空の段落になり（まわりの空行を消すとファイルからも消える）、
 * 互換の改行モードでは、定義の行が保存で消えた。この rule は元の `reference` rule をそのまま呼び
 * （定義の登録・参照の形のリンクは今どおり）、消費した行の元の文字を持つ `ref_def` token を足す。
 * 読み込み（`parseMarkdown.ts`）は、その行を元の文字のまま持つ段落にする。
 */
export const REFERENCE_DEFINITION_TOKEN_TYPE = 'ref_def'

type BlockRule = (state: StateBlock, startLine: number, endLine: number, silent: boolean) => boolean

/** `md` の `reference` rule を、定義の行を `ref_def` token として残す rule に差し替える。 */
export function registerVisibleReferenceDefinition(md: MarkdownIt): void {
  const original = referenceRule as BlockRule
  md.block.ruler.at('reference', (state, startLine, endLine, silent) => {
    const consumed = original(state, startLine, endLine, silent)
    if (!consumed || silent) return consumed
    const token = state.push(REFERENCE_DEFINITION_TOKEN_TYPE, '', 0)
    token.block = true
    token.map = [startLine, state.line]
    token.content = state.getLines(startLine, state.line, state.blkIndent, false).trim()
    return true
  })
}
