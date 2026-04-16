export const AUTO_TCY_SYMBOLS = new Set(['!!', '!?', '??'])

export const AUTO_TCY_MIN_DIGITS_MIN = 1
export const AUTO_TCY_MAX_DIGITS_MAX = 4
export const DEFAULT_AUTO_TCY_ENABLED = false
export const DEFAULT_AUTO_TCY_MIN_DIGITS = 2
export const DEFAULT_AUTO_TCY_MAX_DIGITS = 4
export const DEFAULT_AUTO_TCY_NUMBERS_ONLY = false

export type AutoTcyDigitRange = {
  minDigits: number
  maxDigits: number
}

export type AutoTcyDigitRangeInput = {
  minDigits?: unknown
  maxDigits?: unknown
  autoTcyMinDigits?: unknown
  autoTcyMaxDigits?: unknown
  numbersOnly?: unknown
  autoTcyNumbersOnly?: unknown
}

export type AutoTcyRange = {
  from: number
  to: number
  text: string
}

export type AutoTcyDisplayGateInput = {
  autoTcyEnabled?: unknown
  writingMode?: unknown
  fullPlainEditActive?: boolean
  paragraphPlainModeActive?: boolean
}

export function resolveAutoTcyDigitRange(
  input?: AutoTcyDigitRangeInput | null,
): AutoTcyDigitRange {
  const rawMin = normalizeAutoTcyDigitValue(
    input?.minDigits ?? input?.autoTcyMinDigits,
    DEFAULT_AUTO_TCY_MIN_DIGITS,
  )
  const rawMax = normalizeAutoTcyDigitValue(
    input?.maxDigits ?? input?.autoTcyMaxDigits,
    DEFAULT_AUTO_TCY_MAX_DIGITS,
  )
  return rawMin <= rawMax
    ? { minDigits: rawMin, maxDigits: rawMax }
    : { minDigits: rawMax, maxDigits: rawMin }
}

export function isValidAutoTcyBody(
  text: string,
  options?: AutoTcyDigitRangeInput | null,
): boolean {
  const numbersOnly = resolveAutoTcyNumbersOnly(options)
  const tokenPattern = numbersOnly ? /^[0-9]+$/ : /^[A-Za-z0-9]+$/
  if (tokenPattern.test(text)) {
    const digitRange = resolveAutoTcyDigitRange(options)
    return text.length >= digitRange.minDigits && text.length <= digitRange.maxDigits
  }
  return AUTO_TCY_SYMBOLS.has(text)
}

export function collectAutoTcyRanges(
  text: string,
  options?: AutoTcyDigitRangeInput | null,
): AutoTcyRange[] {
  if (!text) return []

  const ranges: AutoTcyRange[] = []
  const tokenRegex = /[A-Za-z0-9!?]+/g

  for (const match of text.matchAll(tokenRegex)) {
    const token = match[0] ?? ''
    const from = match.index ?? -1
    if (!token || from < 0) continue

    const to = from + token.length
    const prev = from > 0 ? text[from - 1] : ''
    const next = to < text.length ? text[to] : ''

    // 明示 TCY（｟...｠）の本体は display-only auto TCY の対象外。
    if (prev === '｟' && next === '｠') continue
    if (!isValidAutoTcyBody(token, options)) continue

    ranges.push({ from, to, text: token })
  }

  return ranges
}

export function shouldEnableAutoTcyDisplay(
  input: AutoTcyDisplayGateInput,
): boolean {
  return (
    input.autoTcyEnabled === true &&
    input.writingMode === 'vertical-rl' &&
    input.fullPlainEditActive !== true
  )
}

export function resolveAutoTcyNumbersOnly(
  input?: AutoTcyDigitRangeInput | null,
): boolean {
  return (
    input?.numbersOnly === true ||
    input?.autoTcyNumbersOnly === true
  )
}

function normalizeAutoTcyDigitValue(value: unknown, fallback: number): number {
  if (value == null || typeof value === 'boolean') return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(
    AUTO_TCY_MIN_DIGITS_MIN,
    Math.min(AUTO_TCY_MAX_DIGITS_MAX, Math.trunc(num)),
  )
}
