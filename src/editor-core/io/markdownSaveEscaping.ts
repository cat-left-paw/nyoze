import { ASCII_PUNCTUATION_CHAR } from './sourceSpelling'

/**
 * MD-ESCAPE-BACKSLASH1: 保存専用。文字として見える、綴りのない `\` だけを扱う。
 * 区間末尾の1文字を保留し、次に実際に書く文字（装飾・raw・生成した escape を含む）で決める。
 * code・sourceSpelling.raw・HTML は raw() で渡し、その中身には触らない。
 */
export class MarkdownSaveInlineWriter {
  private output = ''
  private pendingBackslash = false
  private pendingLegacyDouble = false
  changedBackslashes = false

  constructor(readonly protectBackslashes = true) {}

  raw(text: string, legacyText = text): void {
    if (!text) return
    if (text !== legacyText) this.changedBackslashes = true
    this.flushPending(text.charAt(0))
    this.output += text
  }

  private flushPending(next: string): void {
    if (this.pendingBackslash) {
      const double = ASCII_PUNCTUATION_CHAR.test(next)
      if (double !== this.pendingLegacyDouble) this.changedBackslashes = true
      this.output += double ? '\\\\' : '\\'
      this.pendingBackslash = false
    }
  }

  text(text: string, escapeCharacters: ReadonlySet<string> = NO_ESCAPES, legacyDouble = false): void {
    if (!this.protectBackslashes) {
      this.raw(text)
      return
    }
    if (escapeCharacters.size === 0 && !text.includes('\\')) {
      this.raw(text)
      return
    }
    // 長い本文は通常1回の raw()。生成した escape の `\` は文字の `\` と区別する。
    let start = 0
    for (let i = 0; i < text.length; i += 1) {
      const char = text.charAt(i)
      if (char !== '\\' && !escapeCharacters.has(char)) continue
      this.raw(text.slice(start, i))
      if (char === '\\') {
        this.flushPending('\\')
        this.pendingBackslash = true
        this.pendingLegacyDouble = legacyDouble
      } else {
        this.raw(`\\${char}`)
      }
      start = i + 1
    }
    this.raw(text.slice(start))
  }

  finish(): string {
    if (this.pendingBackslash && this.pendingLegacyDouble) this.changedBackslashes = true
    return this.output + (this.pendingBackslash ? '\\' : '')
  }
}

const NO_ESCAPES: ReadonlySet<string> = new Set()
export const SAVE_BRACKET_ESCAPES: ReadonlySet<string> = new Set(['[', ']'])
const TITLE_ESCAPES: ReadonlySet<string> = new Set(['"'])
const ANGLE_ESCAPES: ReadonlySet<string> = new Set(['<', '>'])

/** 後続の記法も同じ writer に通す（末尾の `\` の直後は ] / " / > / )）。 */
function escapedField(text: string, escapes: ReadonlySet<string>, prefix: string, suffix: string): string {
  const writer = new MarkdownSaveInlineWriter()
  writer.raw(prefix)
  writer.text(text, escapes)
  writer.raw(suffix)
  return writer.finish()
}

export function markdownSaveTitle(title: string): string {
  return escapedField(title, TITLE_ESCAPES, '"', '"')
}

export function markdownSaveAlt(alt: string): string {
  return escapedField(alt, SAVE_BRACKET_ESCAPES, '![', ']')
}

export function markdownSaveDestination(url: string, hasTitle: boolean): string {
  // 制御文字の除去と <…> を選ぶ条件は従来の保存と同じ。
  // eslint-disable-next-line no-control-regex
  const safe = url.replace(/[\x00-\x1f\x7f]/g, '')
  if (/[\s()<>]/.test(safe)) return escapedField(safe, ANGLE_ESCAPES, '<', '>')
  const escaped = escapedField(safe, NO_ESCAPES, '', hasTitle ? ' ' : ')').slice(0, -1)
  // markdown-it の裸の宛先は「\ + 空白」で宛先を終える。title 前でも末尾の \ は二重にする。
  return hasTitle && safe.endsWith('\\') ? escaped + '\\' : escaped
}
