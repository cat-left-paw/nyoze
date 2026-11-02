import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * MD-ROUNDTRIP-ESCAPE1（A4）: 本文の記号を、開き直しても記号のまま残すための
 * 保存時のエスケープ（`serializeMarkdown.ts` の S1）。
 *
 * 保存は block ごとに「いまと同じ形（`\` なし）の S0」を作り、記法になり得る文字があれば
 * 読み直して元の node と一致するかを確かめる。S0 が一致すれば S0。一致しなければ、
 * このエスケープを入れた S1 を使う（S1 が一致しなくても使う）。ただし、S1 を読み直した
 * 文書の見える文字に含まれる `\` が、元の block より多いときは S0（`\` が文字として残る
 * 場所では足さない）。S1 は ASCII の記号の前に `\` を足すだけなので、その安全策のほかでは
 * S0 より文字を失わない。
 *
 * 対象（仕様 §3.3）:
 * - 行頭（textblock の内容の各行の先頭。行頭の半角スペース・タブの後を含む）の記法:
 *   `#`、`>`、`<`、`:::`、`- ` `+ ` `* `（`*` は下の本文中の規則で足りる）、番号つきリスト
 *   （`1.` `1)`）、水平線・setext の下線、fence の開き、`|...|` の行。
 * - 本文中: `*` `_`、`\`（後が ASCII の記号か行末のとき）。
 * 対象外（後回し。足さない）: バッククォート、`~~`、`==`、`||`、本文中の `[`、本文中の `<`、entity。
 * ESCAPE2 で足したもの: 行頭の参照定義とチェックボックス形の `[`、見出しの末尾の閉じの `#`。
 */

/** ASCII の記号（CommonMark で `\` によりエスケープできる文字）。 */
const ASCII_PUNCTUATION_CLASS = '!-\\/:-@\\[-`{-~'

/** `*` `_` と、後が ASCII の記号か行末の `\`。 */
const INLINE_ESCAPE = new RegExp(`\\\\(?=[${ASCII_PUNCTUATION_CLASS}]|$)|[*_]`, 'g')
const INLINE_ESCAPE_PROBE = /[\\*_]/
const STAR_OR_UNDERSCORE = /[*_]/g

const LEADING_BLANK = /^[ \t]*/

/**
 * 行頭の記法の判定（行頭の空白を除いた残りに対して）。マッチしたら、`\` を入れる位置を返す。
 * 位置は rest の先頭からの offset。マッチしなければ null。
 */
function lineStartEscapeOffset(rest: string): number | null {
  const first = rest[0]
  if (first === '#' || first === '>' || first === '<') return 0
  if (first === '[') {
    // チェックボックス（`[ ]` `[x]` `[X]` の後が空白・タブ・行末）か、参照定義（`]` の直後が `:`）。
    // 本文中の `[` はここへ来ない（行頭のときだけ）。当たらなければ他の行頭規則へ落とさない。
    if (/^\[[ xX]\](?:[ \t]|$)/.test(rest)) return 0
    const close = rest.indexOf(']')
    if (close >= 2 && rest[close + 1] === ':') return 0
    return null
  }
  if (first === ':' && rest.startsWith(':::')) return 0
  if (first === '|' && /^\|.*\|[ \t]*$/.test(rest)) return 0
  if ((first === '-' || first === '+') && /^[-+](?:[ \t]|$)/.test(rest)) return 0
  if (first !== undefined && first >= '0' && first <= '9') {
    const ordered = /^(\d{1,9})([.)])(?:[ \t]|$)/.exec(rest)
    if (ordered) return ordered[1].length
  }
  // 水平線（`---`）と setext の下線（`===`、`---`）。`***` `___` は `*` `_` の規則で足りる。
  if (/^(?:-[ \t]*){3,}$/.test(rest)) return 0
  if (/^(?:=+|-+)[ \t]*$/.test(rest)) return 0
  if (/^(?:`{3,}|~{3,})/.test(rest)) return 0
  return null
}

function escapeLine(line: string, atLineStart: boolean): string {
  const escaped = line.replace(INLINE_ESCAPE, (match) => `\\${match}`)
  if (!atLineStart) return escaped
  const indent = LEADING_BLANK.exec(escaped)?.[0].length ?? 0
  const rest = escaped.slice(indent)
  // すでにエスケープされた文字（`\*` など）は、これ以上足さない。
  if (rest.length === 0 || rest[0] === '\\') return escaped
  const offset = lineStartEscapeOffset(rest)
  if (offset === null) return escaped
  const at = indent + offset
  return `${escaped.slice(0, at)}\\${escaped.slice(at)}`
}

/**
 * text node の文字を S1 のエスケープへ通す。`atLineStart` は、この文字の先頭が行頭
 * （container の接頭辞と行頭の空白の後）に来るか。文字の中の改行の後は常に行頭。
 * 変えるものが無ければ同じ文字列（同じ参照）を返す。
 */
export function escapeSyntaxText(text: string, atLineStart: boolean): string {
  const hasNewline = text.includes('\n')
  if (!atLineStart && !hasNewline && !INLINE_ESCAPE_PROBE.test(text)) return text
  if (!hasNewline) {
    return escapeLine(text, atLineStart)
  }
  const lines = text.split('\n')
  let changed = false
  const out = lines.map((line, index) => {
    const next = escapeLine(line, index === 0 ? atLineStart : true)
    if (next !== line) changed = true
    return next
  })
  return changed ? out.join('\n') : text
}

/** link の文字の中: `\` と `[` `]` は既存の `escapeMarkdownBracketText` が行うので、`*` `_` だけ。 */
export function escapeStarAndUnderscore(text: string): string {
  return text.replace(STAR_OR_UNDERSCORE, (match) => `\\${match}`)
}

/** 文字の末尾が「行頭の空白だけ」を残して終わっているか（次の text node が行頭になるか）。 */
function endsAtLineStart(text: string, startedAtLineStart: boolean): boolean {
  const newline = text.lastIndexOf('\n')
  const tail = newline === -1 ? text : text.slice(newline + 1)
  return (newline !== -1 || startedAtLineStart) && /^[ \t]*$/.test(tail)
}

function inlineMayNeedEscape(node: PMNode, startsAtLineStart: boolean): boolean {
  let atLineStart = startsAtLineStart
  let found = false
  node.forEach((child) => {
    if (found) return
    if (child.type.name === 'hardBreak') {
      atLineStart = true
      return
    }
    if (!child.isText) {
      atLineStart = false
      return
    }
    const text = child.text ?? ''
    // code の mark の中は S1 でも足さない。
    if (child.marks.some((mark) => mark.type.name === 'code')) {
      atLineStart = false
      return
    }
    if (escapeSyntaxText(text, atLineStart) !== text) {
      found = true
      return
    }
    atLineStart = endsAtLineStart(text, atLineStart)
  })
  return found
}

/**
 * 見出しの inline を書き終えた文字列の末尾が、行頭または空白・タブの後の `#` の並び
 * （後ろは空白・タブだけ）なら、その `#` をすべて `\#` にする。
 * 末尾が mark の閉じ・HTML・付箋・inline code のときは `#` で終わらないので当たらない。
 * すでに `\#` になっている並び（`\` の直後）は、前の文字が空白でも行頭でもないので当たらない。
 */
export function escapeHeadingClosingSequence(inline: string): string {
  return inline.replace(/(^|[\n \t])(#+)([ \t]*)$/, (_match, lead: string, hashes: string, trail: string) => {
    return lead + hashes.split('#').join('\\#') + trail
  })
}

/** 見出しの文字が、末尾の空白・タブを除いて `#` で終わる（閉じの並びの確かめが要り得る）。 */
function headingMayNeedClosingEscape(node: PMNode): boolean {
  return node.textContent.replace(/[ \t]+$/, '').endsWith('#')
}

/**
 * S1 が S0 と違い得る block か（安い前判定）。text node に `*` `_` `\`、または行頭の記法が
 * 無ければ S1 は S0 と同じなので、読み直して確かめる必要がない。多少広くてよい
 * （確かめる回数が増えるだけで、出力は確かめの結果で決まる）。
 * code block・HTML block・水平線は文字を変えないので対象外。
 */
export function blockMayNeedSyntaxEscape(node: PMNode): boolean {
  switch (node.type.name) {
    case 'paragraph':
      return inlineMayNeedEscape(node, true)
    case 'heading':
      // 見出しの文字は `# ` の後に続くので、行頭の記法の対象にならない。
      // 末尾の閉じの `#` だけ、別の後処理（`escapeHeadingClosingSequence`）の対象。
      return inlineMayNeedEscape(node, false) || headingMayNeedClosingEscape(node)
    case 'codeBlock':
    case 'html_block_atom':
    case 'horizontalRule':
      return false
    default: {
      if (node.isLeaf || node.isTextblock) return false
      let found = false
      node.forEach((child) => {
        if (!found && blockMayNeedSyntaxEscape(child)) found = true
      })
      return found
    }
  }
}
