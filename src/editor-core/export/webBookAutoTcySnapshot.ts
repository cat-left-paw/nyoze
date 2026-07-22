/**
 * Web Book auto TCY 用の純粋な appearance snapshot。
 * Display Settings の auto TCY 4 field を export 境界で正規化し、
 * Page Viewer PV-SET-1B と同じ検出意味論（桁 1〜4、記号3種）を保つ。
 * Web Book 専用設定・Export Options・settings.json 新 key は持たない。
 */

import {
  AUTO_TCY_MAX_DIGITS_MAX,
  AUTO_TCY_MIN_DIGITS_MIN,
  DEFAULT_AUTO_TCY_ENABLED,
  DEFAULT_AUTO_TCY_MAX_DIGITS,
  DEFAULT_AUTO_TCY_MIN_DIGITS,
  DEFAULT_AUTO_TCY_NUMBERS_ONLY,
} from '../features/autoTcy'

export type WebBookAutoTcySnapshotInput = {
  enabled: boolean
  numbersOnly: boolean
  minDigits: number
  maxDigits: number
}

export type WebBookAutoTcySnapshot = Readonly<WebBookAutoTcySnapshotInput>

const AUTO_TCY_KEYS = ['enabled', 'numbersOnly', 'minDigits', 'maxDigits'] as const

export const DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT: WebBookAutoTcySnapshot = Object.freeze({
  enabled: DEFAULT_AUTO_TCY_ENABLED,
  numbersOnly: DEFAULT_AUTO_TCY_NUMBERS_ONLY,
  minDigits: DEFAULT_AUTO_TCY_MIN_DIGITS,
  maxDigits: DEFAULT_AUTO_TCY_MAX_DIGITS,
})

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 桁数は有限整数かつ 1〜4（Page Viewer IPC と同じ）。範囲外・非整数は throw。
 * clamp はしない。
 */
function normalizeDigitStrict(value: unknown, key: 'minDigits' | 'maxDigits'): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < AUTO_TCY_MIN_DIGITS_MIN ||
    value > AUTO_TCY_MAX_DIGITS_MAX
  ) {
    throw new Error(
      `Web Book auto TCY snapshot の ${key} は 1〜4 の整数で指定してください`,
    )
  }
  return value
}

/**
 * 明示的に渡された auto TCY input を厳格に検証・正規化する。
 * 欠損・余分な key・型不正は静かな default にせず throw する。
 * minDigits > maxDigits のときは swap する（Page Viewer 適用時と同じ）。
 */
export function normalizeWebBookAutoTcySnapshot(input: unknown): WebBookAutoTcySnapshot {
  if (!isPlainObject(input)) {
    throw new Error(
      'Web Book auto TCY snapshot は enabled / numbersOnly / minDigits / maxDigits を持つ object で指定してください',
    )
  }

  const keys = Object.keys(input)
  if (
    keys.length !== AUTO_TCY_KEYS.length ||
    keys.some((key) => !AUTO_TCY_KEYS.includes(key as (typeof AUTO_TCY_KEYS)[number]))
  ) {
    throw new Error(
      'Web Book auto TCY snapshot には enabled / numbersOnly / minDigits / maxDigits 以外を指定できません',
    )
  }

  if (typeof input.enabled !== 'boolean') {
    throw new Error('Web Book auto TCY snapshot の enabled は boolean で指定してください')
  }
  if (typeof input.numbersOnly !== 'boolean') {
    throw new Error('Web Book auto TCY snapshot の numbersOnly は boolean で指定してください')
  }

  const minDigits = normalizeDigitStrict(input.minDigits, 'minDigits')
  const maxDigits = normalizeDigitStrict(input.maxDigits, 'maxDigits')
  const ordered =
    minDigits <= maxDigits
      ? { minDigits, maxDigits }
      : { minDigits: maxDigits, maxDigits: minDigits }

  return Object.freeze({
    enabled: input.enabled,
    numbersOnly: input.numbersOnly,
    minDigits: ordered.minDigits,
    maxDigits: ordered.maxDigits,
  })
}

/**
 * Display Settings から export-time snapshot を組み立てる。
 * 欠落・不正な field は Display / auto TCY 既定へフォールバックしたうえで normalize する。
 */
export function resolveWebBookAutoTcySnapshotFromDisplay(input?: {
  autoTcyEnabled?: unknown
  autoTcyNumbersOnly?: unknown
  autoTcyMinDigits?: unknown
  autoTcyMaxDigits?: unknown
} | null): WebBookAutoTcySnapshot {
  const settings = input ?? {}
  const enabled =
    typeof settings.autoTcyEnabled === 'boolean'
      ? settings.autoTcyEnabled
      : DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT.enabled
  const numbersOnly =
    typeof settings.autoTcyNumbersOnly === 'boolean'
      ? settings.autoTcyNumbersOnly
      : DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT.numbersOnly

  const minDigits = resolveDigitFromDisplay(
    settings.autoTcyMinDigits,
    DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT.minDigits,
  )
  const maxDigits = resolveDigitFromDisplay(
    settings.autoTcyMaxDigits,
    DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT.maxDigits,
  )

  return normalizeWebBookAutoTcySnapshot({
    enabled,
    numbersOnly,
    minDigits,
    maxDigits,
  })
}

function resolveDigitFromDisplay(value: unknown, fallback: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < AUTO_TCY_MIN_DIGITS_MIN ||
    value > AUTO_TCY_MAX_DIGITS_MAX
  ) {
    return fallback
  }
  return value
}
