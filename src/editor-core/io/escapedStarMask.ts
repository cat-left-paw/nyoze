import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'

/**
 * MD-ROUNDTRIP-ESCAPE1 / ESCAPE2: ファイルの `\*` と `\[` を、結合後の文字として
 * Nyoze の正規表現（強調の救済・チェックボックスの接頭辞など）に本物の `*` `[` と
 * 見せない。
 *
 * markdown-it の `escape` rule は `\*` / `\[` を `text_special`（content はエスケープを
 * 外した文字）にし、core の `text_join` が前後の text へ結合する。結合後は、ファイルの
 * `\[` と打った `[` が区別できない。
 *
 * このモジュールは `text_join` の直前に core rule を1つ足し、`\*` と `\[` 由来の
 * `text_special` だけ content を、それぞれ別の「目印の文字」へ置き換える
 * （結合はそのまま `text_join` が行う。画像の説明など、inline の子の中も同じ）。
 * 目印は本文・Ruby・TCY・画像の説明を作るところで元の文字へ戻す（`unmaskEscapedChars`）。
 *
 * - 対象は `\*` と `\[` だけ。`\_` `\\` `\~` `\=` `\|` `` \` `` `\<` と entity は、
 *   いまの読み込みのまま（markup がこの2つでない `text_special` は触らない）。
 * - 目印は Unicode の noncharacter（U+FDD0〜U+FDEF）で、`*` と `[` で別の文字。
 *   読み込む原文に現れないものを選ぶ。片方の空きが無ければ、その文字だけ置き換えず
 *   いまの動きに倒す（もう片方は空きがあれば置き換える）。
 * - 目印の選択は parse 1回ごとの env に保持する。`source` は読み込む原文全体。
 */
export type EscapedCharEnv = {
  /** 目印を選ぶ基準にする原文（呼び出し側が入れる。無ければ rule が見ている src）。 */
  source?: string
  /** `\*` の目印。null は空きが無く、いまの動きに倒した印。 */
  escapedStar?: string | null
  /** `\[` の目印。null は空きが無く、いまの動きに倒した印。 */
  escapedBracket?: string | null
}

const NONCHARACTER_FIRST = 0xfdd0
const NONCHARACTER_LAST = 0xfdef

interface MaskToken {
  type: string
  markup: string
  content: string
  children: MaskToken[] | null
}

function choosePlaceholder(source: string, reserved: ReadonlySet<string>): string | null {
  for (let code = NONCHARACTER_FIRST; code <= NONCHARACTER_LAST; code += 1) {
    const candidate = String.fromCharCode(code)
    if (reserved.has(candidate) || source.includes(candidate)) continue
    return candidate
  }
  return null
}

function placeholderFor(
  env: EscapedCharEnv,
  key: 'escapedStar' | 'escapedBracket',
  source: string,
): string | null {
  const current = env[key]
  if (current !== undefined) return current
  const reserved = new Set<string>()
  if (env.escapedStar) reserved.add(env.escapedStar)
  if (env.escapedBracket) reserved.add(env.escapedBracket)
  const chosen = choosePlaceholder(source, reserved)
  env[key] = chosen
  return chosen
}

function maskTokens(tokens: MaskToken[] | null, env: EscapedCharEnv, source: string): void {
  if (!tokens) return
  for (const token of tokens) {
    const key = token.type === 'text_special'
      ? token.markup === '\\*'
        ? 'escapedStar'
        : token.markup === '\\['
          ? 'escapedBracket'
          : null
      : null
    if (key !== null) {
      const placeholder = placeholderFor(env, key, source)
      if (placeholder !== null) token.content = placeholder
    }
    if (token.children) maskTokens(token.children, env, source)
  }
}

function maskEscapedChars(state: StateCore): void {
  const env = state.env as EscapedCharEnv
  maskTokens(state.tokens as unknown as MaskToken[], env, env.source ?? state.src)
}

/** `md` の core に、`text_join` の直前で `\*` と `\[` を目印へ置き換える rule を足す。 */
export function registerEscapedCharMask(md: MarkdownIt): void {
  md.core.ruler.before('text_join', 'nyoze_escaped_char_mask', maskEscapedChars)
}

/** 目印の文字を元の `*` / `[` に戻す。目印が選ばれていない parse では何もしない。 */
export function unmaskEscapedChars(env: EscapedCharEnv, text: string): string {
  let out = text
  const star = env.escapedStar
  if (star && out.includes(star)) out = out.split(star).join('*')
  const bracket = env.escapedBracket
  if (bracket && out.includes(bracket)) out = out.split(bracket).join('[')
  return out
}
