import type MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import { unescapeAll } from 'markdown-it/lib/common/utils.mjs'

/**
 * MD-ESCAPE-EXPLICIT1: 「この文字は、ファイルでは `raw` の綴りだった」を覚える `sourceSpelling` mark の、
 * 純粋な部分（schema にも PM の state にも依らない）。
 *
 * アプリは黙って原稿を書き換えない。ファイルにあった `\*` `\#` `&amp;` などの綴りを、読み込みでは
 * 「文字（`*` `#` `&`）＋元の綴り（mark の `raw`）」にし、保存ではその文字を `raw` で書く。
 * 利用者が打っていない `\` を足さず、ファイルにあった `\` を消さない（`serializeMarkdown.ts` は
 * 本文の文字に `\` を足さない）。
 *
 * - 読み込み: markdown-it の `escape` rule（`\` + ASCII の句読点）と `entity` rule（文字参照）は、
 *   `text_special` token（`markup` が元の綴り、`content` が文字）を作り、core の `text_join` が前後の
 *   text へ結合するので、結合後は元の綴りが分からなくなる。`text_join` の直前に core rule を1つ足し、
 *   綴りが文字と違う `text_special` だけ `content` を「目印の文字」へ置き換える（結合はそのまま
 *   `text_join` が行う）。目印は本文・Ruby・TCY・画像の説明を作るところで文字へ戻し、本文では
 *   mark を付ける（`splitSourceSpelledText`）。目印の文字は、読み込む原文に現れないものを選ぶ。
 *   これにより、Nyoze の正規表現（強調の救済・チェックボックスの接頭辞など）は、綴りのある文字を
 *   区切りとして見ない（`*` `[` に限らずすべての句読点）。
 * - 保存: mark のある文字を `raw` で書く（`writeSourceSpelling`）。`raw` を読むとその文字にならない
 *   （検索の置換・IME の確定などで文字が入れ替わった）ときは、mark を無視してその文字のまま書く。
 */

export const SOURCE_SPELLING_MARK_NAME = 'sourceSpelling'

/** `\` + ASCII の句読点（CommonMark が `\` でエスケープできる32文字）。 */
const ESCAPE_RAW = /^\\[!-/:-@[-`{-~]$/
/** 文字参照（`&amp;` `&#123;` `&#x1F600;`）。名前は markdown-it の `entity` rule と同じ形。 */
const ENTITY_RAW = /^&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});$/

/**
 * `raw`（1つのエスケープ、または1つの文字参照）が表す文字。`raw` がそのどちらでもない、または
 * 文字にならない（未知の名前の文字参照）ときは null。
 */
export function decodeSourceSpelling(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (ESCAPE_RAW.test(raw)) return raw.charAt(1)
  if (ENTITY_RAW.test(raw)) {
    const decoded = unescapeAll(raw)
    return decoded !== raw && decoded.length > 0 ? decoded : null
  }
  return null
}

/** `raw` が mark の値として有効か（形が正しく、文字になる）。 */
export function isValidSourceSpellingRaw(raw: unknown): raw is string {
  return decodeSourceSpelling(raw) !== null
}

/** `\` でエスケープできる ASCII の句読点 1 文字。 */
export const ASCII_PUNCTUATION_CHAR = /^[!-/:-@[-`{-~]$/

/**
 * `text`（同じ `sourceSpelling` mark の text）のうち、`raw` が表す文字と一致する文字（＝保存で `raw` で書く、
 * 記号として使わない文字）を `fill` に置き換えた文字列（長さは変わらない）。入力規則が、綴りのある文字を
 * 記号として見ないために使う。`raw` が無効、または一致する文字がなければ、同じ文字列。
 */
export function maskSourceSpelledText(text: string, raw: unknown, fill: string): string {
  const decoded = decodeSourceSpelling(raw)
  if (decoded === null || !text.includes(decoded)) return text
  return text.split(decoded).join(fill.repeat(decoded.length))
}

/**
 * 保存: `text`（同じ mark の組が続く text）を書く。`raw` が表す文字と一致する部分は `raw` で書き、
 * それ以外の部分（入れ替わった文字）は `writePlain` が書く（リンクの文字のエスケープなど）。
 * `raw` が無効なら、すべて `writePlain`。`writeRaw` は保存のバッファへ綴りをそのまま渡すための任意の出力先。
 */
export function writeSourceSpelling(
  text: string,
  raw: unknown,
  writePlain: (chunk: string) => string,
  writeRaw: (chunk: string) => string = (chunk) => chunk,
): string {
  if (text.length === 0) return ''
  const decoded = decodeSourceSpelling(raw)
  if (decoded === null || !text.includes(decoded)) return writePlain(text)
  let out = ''
  let plain = ''
  let index = 0
  while (index < text.length) {
    if (text.startsWith(decoded, index)) {
      if (plain.length > 0) {
        out += writePlain(plain)
        plain = ''
      }
      out += writeRaw(raw as string)
      index += decoded.length
    } else {
      plain += text.charAt(index)
      index += 1
    }
  }
  if (plain.length > 0) out += writePlain(plain)
  return out
}

/** 読み込みの1回（parse 1回分）で、目印の文字と元の綴りの対応を持つ。 */
export type SourceSpellingEnv = {
  /** 目印を選ぶ基準にする原文（呼び出し側が入れる。無ければ rule が見ている src）。 */
  source?: string
  /** 目印の文字 → 元の綴りと文字。 */
  spellings?: Map<string, { raw: string; text: string }>
  /** 元の綴り → 目印の文字（同じ綴りは同じ目印）。 */
  placeholders?: Map<string, string>
  /** 目印の候補を、次にどこから探すか。 */
  nextCandidate?: number
  /** 目印の候補を使い切った。 */
  exhausted?: boolean
}

interface MaskToken {
  type: string
  markup: string
  content: string
  info: string
  children: MaskToken[] | null
}

/**
 * 目印の候補: Unicode の noncharacter（U+FDD0〜U+FDEF）→ 私用領域（U+E000〜U+F8FF）。
 * どれも BMP の1文字で、句読点・空白・Nyoze の正規表現の区切りのどれでもない。
 */
const CANDIDATE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0xfdd0, 0xfdef],
  [0xe000, 0xf8ff],
]
const CANDIDATE_COUNT = CANDIDATE_RANGES.reduce((sum, [first, last]) => sum + (last - first + 1), 0)

function candidateAt(order: number): string {
  let rest = order
  for (const [first, last] of CANDIDATE_RANGES) {
    const size = last - first + 1
    if (rest < size) return String.fromCharCode(first + rest)
    rest -= size
  }
  return ''
}

function placeholderFor(env: SourceSpellingEnv, raw: string, text: string, source: string): string | null {
  const known = env.placeholders?.get(raw)
  if (known !== undefined) return known
  if (env.exhausted) return null
  let order = env.nextCandidate ?? 0
  while (order < CANDIDATE_COUNT) {
    const candidate = candidateAt(order)
    order += 1
    if (source.includes(candidate)) continue
    env.nextCandidate = order
    env.placeholders ??= new Map()
    env.spellings ??= new Map()
    env.placeholders.set(raw, candidate)
    env.spellings.set(candidate, { raw, text })
    return candidate
  }
  env.nextCandidate = order
  env.exhausted = true
  return null
}

function maskTokens(tokens: MaskToken[] | null, env: SourceSpellingEnv, source: string): void {
  if (!tokens) return
  for (const token of tokens) {
    if (
      token.type === 'text_special' &&
      (token.info === 'escape' || token.info === 'entity') &&
      token.markup !== token.content
    ) {
      const placeholder = placeholderFor(env, token.markup, token.content, source)
      if (placeholder !== null) token.content = placeholder
    }
    if (token.children) maskTokens(token.children, env, source)
  }
}

function maskSourceSpellings(state: StateCore): void {
  const env = state.env as SourceSpellingEnv
  maskTokens(state.tokens as unknown as MaskToken[], env, env.source ?? state.src)
}

/** `md` の core に、`text_join` の直前で、綴りのある `text_special` を目印へ置き換える rule を足す。 */
export function registerSourceSpellingMask(md: MarkdownIt): void {
  md.core.ruler.before('text_join', 'nyoze_source_spelling_mask', maskSourceSpellings)
}

/** この parse で、目印を使った文字があるか（無ければ、本文の文字を走査しない）。 */
export function hasSourceSpellings(env: SourceSpellingEnv): boolean {
  return env.spellings !== undefined && env.spellings.size > 0
}

/** 目印の文字を、元の文字（`*` `&` など）へ戻す。mark は付けない（Ruby の読み・画像の説明・title など）。 */
export function unmaskSourceSpellings(env: SourceSpellingEnv, text: string): string {
  const spellings = env.spellings
  if (spellings === undefined || spellings.size === 0) return text
  let out = text
  for (const [placeholder, entry] of spellings) {
    if (out.includes(placeholder)) out = out.split(placeholder).join(entry.text)
  }
  return out
}

export interface SourceSpelledRun {
  /** 元の文字（目印を戻したもの。同じ綴りが続けば、その数だけ繰り返す）。 */
  text: string
  /** 元の綴り。綴りのない文字は null。 */
  raw: string | null
}

/**
 * 本文の文字を、綴りのある文字の連続と、ない文字の連続に分ける。目印の文字は文字へ戻す。
 * 同じ綴りの文字が続くときは1つの run（`\*\*` → text `**`、raw `\*`）。
 */
export function splitSourceSpelledText(env: SourceSpellingEnv, text: string): SourceSpelledRun[] {
  const spellings = env.spellings
  if (spellings === undefined || spellings.size === 0) return [{ text, raw: null }]
  const runs: SourceSpelledRun[] = []
  let plain = ''
  const flushPlain = (): void => {
    if (plain.length > 0) runs.push({ text: plain, raw: null })
    plain = ''
  }
  for (const char of text) {
    const entry = spellings.get(char)
    if (entry === undefined) {
      plain += char
      continue
    }
    flushPlain()
    const last = runs[runs.length - 1]
    if (last !== undefined && last.raw === entry.raw) last.text += entry.text
    else runs.push({ text: entry.text, raw: entry.raw })
  }
  flushPlain()
  return runs
}
