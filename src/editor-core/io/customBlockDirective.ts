/**
 * Nyoze 独自ブロック装飾 (custom block directive) の純粋ヘルパー。
 *
 * 記法は fenced directive block:
 *
 *   :::align-center
 *   第一章
 *   :::
 *
 * 対応 directive:
 *   - align-center / align-end          → kind 'align'
 *   - indent-1 .. indent-6              → kind 'indent'
 *   - style-<id> (semantic style block) → kind 'style'
 *
 * `style-<id>` は汎用 semantic style block。`<id>` は保存上の semantic id で、
 * 組み込み (letter / muted / heading) 以外の未知 id も壊さず保持する。
 *
 * このモジュールは Node.js 依存を持たない pure helper のみとし、
 * parseMarkdown / serializeMarkdown / schema 層から共有する。
 *
 * `:::page-break` (改ページ marker) は上記 wrapper directive とは別の独立した
 * fenced empty directive。中身を持たず、専用 block atom (`nyozePageBreak`) に
 * 変換される。body を持つ `:::page-break ... :::` は安全側で通常の
 * unknown directive fallback (plain text 温存) として扱う。
 */

export const NYOZE_DIRECTIVE_NODE_NAME = 'nyozeDirectiveBlock'

/** 改ページ block atom node 名。`nyozeDirectiveBlock` とは別の独立 node。 */
export const NYOZE_PAGE_BREAK_NODE_NAME = 'nyozePageBreak'

/** `:::page-break` directive token。align/indent/style とは別枠で扱う。 */
export const PAGE_BREAK_TOKEN = 'page-break'

/** 空白ページ block atom node 名。`nyozePageBreak` / `nyozeDirectiveBlock` とは別の独立 node。 */
export const NYOZE_BLANK_PAGE_NODE_NAME = 'nyozeBlankPage'

/** `:::blank-page` / `:::blank-page-N` directive の token prefix。 */
export const BLANK_PAGE_TOKEN_PREFIX = 'blank-page'

/** `:::blank-page-N` の有効な N の範囲。 */
export const BLANK_PAGE_MIN_COUNT = 1
export const BLANK_PAGE_MAX_COUNT = 20

/** 組み込み semantic style id。CSS で軽く表示する最低限のセット。 */
export const BUILTIN_STYLE_IDS = ['letter', 'muted', 'heading'] as const

export type DirectiveKind = 'align' | 'indent' | 'style'

export interface DirectiveDescriptor {
  kind: DirectiveKind
  /** align: 'center' | 'end' / indent: level digit string / style: style id */
  name: string
  /** indent のみ 1..6。それ以外は null。 */
  level: number | null
}

export interface DirectiveAttrs {
  kind: DirectiveKind
  name: string
  level: number | null
}

/**
 * directive open 行:  `:::token`
 * token は `[A-Za-z0-9][A-Za-z0-9_-]*`。妥当性 (indent 範囲 / style id) は
 * classifyDirectiveToken が最終判定する。
 */
const DIRECTIVE_OPEN_REGEX = /^:::([A-Za-z0-9][A-Za-z0-9_-]*)[ \t]*$/

/** directive close 行:  `:::` (token なし) */
const DIRECTIVE_CLOSE_REGEX = /^:::[ \t]*$/

/** style id: `style-[a-z0-9][a-z0-9_-]{0,31}` の id 部分。 */
const STYLE_ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/

const INDENT_TOKEN_REGEX = /^indent-([1-6])$/

/** 行が directive open ならその token を返す。違えば null。 */
export function matchDirectiveOpenLine(line: string): string | null {
  const match = DIRECTIVE_OPEN_REGEX.exec(line)
  return match ? match[1] : null
}

/** 行が directive close (`:::`) かどうか。 */
export function isDirectiveCloseLine(line: string): boolean {
  return DIRECTIVE_CLOSE_REGEX.test(line)
}

/** 組み込み style id かどうか。 */
export function isBuiltinStyleId(id: string): boolean {
  return (BUILTIN_STYLE_IDS as readonly string[]).includes(id)
}

/**
 * directive token を分類する。対応外 / 無効なら null。
 * 無効例: `style-` / `style-手紙` / `indent-0` / `indent-7` / `foobar`
 */
export function classifyDirectiveToken(token: string): DirectiveDescriptor | null {
  if (token === 'align-center') return { kind: 'align', name: 'center', level: null }
  if (token === 'align-end') return { kind: 'align', name: 'end', level: null }

  const indent = INDENT_TOKEN_REGEX.exec(token)
  if (indent) {
    const level = Number(indent[1])
    return { kind: 'indent', name: indent[1], level }
  }

  if (token.startsWith('style-')) {
    const id = token.slice('style-'.length)
    if (STYLE_ID_REGEX.test(id)) {
      return { kind: 'style', name: id, level: null }
    }
    return null
  }

  return null
}

/** node attrs から正規 directive token を組み立てる。serialize / renderHTML 共通。 */
export function formatDirectiveToken(attrs: DirectiveAttrs): string {
  switch (attrs.kind) {
    case 'align':
      return `align-${attrs.name}`
    case 'indent':
      return `indent-${attrs.level ?? 1}`
    case 'style':
      return `style-${attrs.name}`
    default:
      return ''
  }
}

/** `blank-page-N` の N 部分（`blank-page` 単体は N なし）。範囲チェックは呼び出し側で行う。 */
const BLANK_PAGE_TOKEN_COUNT_REGEX = /^blank-page-([0-9]+)$/

/**
 * token が `blank-page` / `blank-page-<任意の suffix>` の形をしているかどうか
 * （有効性は問わない）。`findMatchingCloseIndex` の depth 判定や、
 * `splitDirectiveSegments` で「blank-page として扱おうとしている行かどうか」を
 * 判定するために使う。`blank-page4` のように `-` を挟まない形は対象外
 * （そもそも blank-page を意図した記法ではないとみなし、通常の未知 token と
 * 同じ経路で plain text として温存する）。
 */
function isBlankPageShapedToken(token: string): boolean {
  return token === BLANK_PAGE_TOKEN_PREFIX || token.startsWith(`${BLANK_PAGE_TOKEN_PREFIX}-`)
}

/**
 * `blank-page` / `blank-page-N` token から有効な空白ページ枚数を取り出す。
 * `blank-page` は `blank-page-1` と同じ意味 (count 1)。
 * 無効 (範囲外 `blank-page-0` / `blank-page-999`、非数値 `blank-page-many`、
 * 二重ハイフン `blank-page--1` など) は `null` を返す。呼び出し側はこの場合、
 * warning + clamp ではなく元のテキストをそのまま温存する。
 */
export function matchBlankPageToken(token: string): number | null {
  if (token === BLANK_PAGE_TOKEN_PREFIX) return 1
  const match = BLANK_PAGE_TOKEN_COUNT_REGEX.exec(token)
  if (!match) return null
  const count = Number(match[1])
  if (count < BLANK_PAGE_MIN_COUNT || count > BLANK_PAGE_MAX_COUNT) return null
  return count
}

/** node attrs (count) から正規 `blank-page` / `blank-page-N` token を組み立てる。 */
export function formatBlankPageToken(count: number): string {
  return count <= BLANK_PAGE_MIN_COUNT
    ? BLANK_PAGE_TOKEN_PREFIX
    : `${BLANK_PAGE_TOKEN_PREFIX}-${count}`
}

export type DirectiveSegment =
  | { type: 'plain'; lines: string[] }
  | { type: 'directive'; token: string; descriptor: DirectiveDescriptor; inner: string[] }
  | { type: 'page-break' }
  | { type: 'blank-page'; count: number }

/**
 * top-level の行配列を「通常 chunk」と「directive block」へ分割する。
 *
 * directive と認識する条件:
 *   1. open 行が対応 directive token (classifyDirectiveToken !== null)
 *   2. その行が fenced code block の内側でない
 *   3. 対応する close 行が存在する (depth 一致)
 *
 * 直前が空行かどうかは問わない。行全体が有効な directive open 行で、対応する
 * close 行があれば、本文直後・連続 directive でも directive として扱う。
 * 上記を満たさない `:::...` 行は通常テキストとして温存する (既存 fallback)。
 * fenced code block 内の `:::...` は directive 化しない。
 * inner はネスト対応のため呼び出し側で再帰的に分割する。
 *
 * `:::page-break` は wrapper directive とは別枠。open 直後 (inner 0 行) に
 * close が来る canonical 形のときだけ `page-break` segment にする。
 * body を持つ場合は安全側で directive 化せず、open/inner/close の行を
 * そのまま plain として温存する (既存の unknown directive fallback と同じ扱い)。
 *
 * `:::blank-page` / `:::blank-page-N` も同様に別枠。open 直後 (inner 0 行) に
 * close が来て、かつ N が有効範囲 (`blank-page` 単体または `blank-page-1`〜
 * `blank-page-20`) のときだけ `blank-page` segment にする。範囲外・非数値の N
 * や body を持つ場合は、page-break の body fallback と同じ方針で directive 化
 * せず元の行をそのまま plain として温存する (warning + clamp はしない)。
 */
export function splitDirectiveSegments(lines: string[]): DirectiveSegment[] {
  const segments: DirectiveSegment[] = []
  const codeMask = computeFencedCodeLineMask(lines)
  let plain: string[] = []

  const flushPlain = (): void => {
    if (plain.length > 0) {
      segments.push({ type: 'plain', lines: plain })
      plain = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const token = codeMask[i] ? null : matchDirectiveOpenLine(lines[i])
    const descriptor = token ? classifyDirectiveToken(token) : null
    const isPageBreakToken = token === PAGE_BREAK_TOKEN
    const isBlankPageToken = token !== null && isBlankPageShapedToken(token)

    if (token && (descriptor || isPageBreakToken || isBlankPageToken)) {
      const closeIndex = findMatchingCloseIndex(lines, i, codeMask)
      if (closeIndex !== -1) {
        const inner = lines.slice(i + 1, closeIndex)

        if (isPageBreakToken) {
          if (inner.length === 0) {
            flushPlain()
            segments.push({ type: 'page-break' })
            i = closeIndex + 1
            continue
          }
          // body あり → 安全側: directive 化せず元の行をそのまま plain として温存する。
          plain.push(lines[i], ...inner, lines[closeIndex])
          i = closeIndex + 1
          continue
        }

        if (isBlankPageToken) {
          const count = inner.length === 0 ? matchBlankPageToken(token) : null
          if (count !== null) {
            flushPlain()
            segments.push({ type: 'blank-page', count })
            i = closeIndex + 1
            continue
          }
          // 範囲外・非数値の N、または body あり → 安全側: directive 化せず
          // 元の行をそのまま plain として温存する (page-break の body fallback と同じ方針)。
          plain.push(lines[i], ...inner, lines[closeIndex])
          i = closeIndex + 1
          continue
        }

        flushPlain()
        segments.push({
          type: 'directive',
          token,
          descriptor: descriptor!,
          inner,
        })
        i = closeIndex + 1
        continue
      }
    }

    plain.push(lines[i])
    i++
  }

  flushPlain()
  return segments
}

/**
 * open 行に対応する close 行 index を返す。見つからなければ -1。
 * ネストした有効 directive open を depth として数える。
 * `:::page-break` / `:::blank-page*` token も (安全側 fallback かどうかに
 * 関わらず) depth として数える。数えないと、外側 directive の close 判定が
 * nested page-break / blank-page の close 行を誤って外側の close と解釈して
 * しまう。fenced code block 内の `:::` 行は open / close いずれにも数えない。
 */
function findMatchingCloseIndex(lines: string[], openIndex: number, codeMask: boolean[]): number {
  let depth = 1
  for (let k = openIndex + 1; k < lines.length; k++) {
    if (codeMask[k]) continue
    const line = lines[k]
    if (isDirectiveCloseLine(line)) {
      depth--
      if (depth === 0) return k
      continue
    }
    const token = matchDirectiveOpenLine(line)
    if (
      token &&
      (classifyDirectiveToken(token) || token === PAGE_BREAK_TOKEN || isBlankPageShapedToken(token))
    ) {
      depth++
    }
  }
  return -1
}

const FENCED_CODE_OPEN_REGEX = /^ {0,3}(`{3,}|~{3,})/

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 各行が fenced code block の内側 (fence 区切り行を含む) かどうかを返す。
 * open fence は `` ``` `` / `~~~` (0-3 space indent)。close は同種 fence char の
 * 同長以上。close が無い場合は EOF まで code 扱い (CommonMark 準拠)。
 * indent code block は `:::` が列頭に来ないため別途考慮不要。
 */
function computeFencedCodeLineMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false)
  let i = 0
  while (i < lines.length) {
    const open = FENCED_CODE_OPEN_REGEX.exec(lines[i] ?? '')
    if (!open) {
      i++
      continue
    }
    const fenceRun = open[1]
    const fenceChar = fenceRun[0]
    const minLen = fenceRun.length
    const closeRegex = new RegExp(`^ {0,3}${escapeForRegex(fenceChar)}{${minLen},}[ \\t]*$`)

    mask[i] = true
    let j = i + 1
    let closed = false
    while (j < lines.length) {
      mask[j] = true
      if (closeRegex.test(lines[j] ?? '')) {
        closed = true
        j++
        break
      }
      j++
    }
    i = closed ? j : lines.length
  }
  return mask
}
