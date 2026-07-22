/**
 * LeME 互換 / でんでん向け / 青空文庫風の 3 系統 export pure converter が共有する
 * options model。React / Electron / fs に依存しない pure module。
 *
 * `autoTcy` は LeME / でんでん向けに限り、通常 text node 内の auto TCY 候補を
 * target-native な `^...^` として出力する。青空文庫風 / HTML は型として受け取って
 * も変換しない。既定は off で、options 省略時の既存出力は変わらない。
 *
 * 見出し配置の出力反映は、型と既定値だけをここに用意し、実際の変換ロジックは
 * 次スライス以降で追加する。見出し前改ページは各 converter の top-level heading
 * 直前処理で実装する（このモジュール単体では何も変換しない）。
 */

import {
  DEFAULT_AUTO_TCY_MAX_DIGITS,
  DEFAULT_AUTO_TCY_MIN_DIGITS,
  DEFAULT_AUTO_TCY_NUMBERS_ONLY,
  resolveAutoTcyDigitRange,
  resolveAutoTcyNumbersOnly,
} from '../features/autoTcy'

export type ExternalExportOptions = {
  /** 自動 TCY を LeME / でんでん向けの `^...^` として出力するか。既定は反映しない。 */
  autoTcy?: boolean
  /** 自動 TCY 対象の最小桁数（1〜4）。`autoTcy` が true のときだけ意味を持つ。 */
  tcyMinDigits?: number
  /** 自動 TCY 対象の最大桁数（1〜4）。`autoTcy` が true のときだけ意味を持つ。 */
  tcyMaxDigits?: number
  /** 自動 TCY を数字のみに絞るか。`autoTcy` が true のときだけ意味を持つ。 */
  tcyNumbersOnly?: boolean
  /** 見出しの配置 (`:::align-center` 等) を出力へ反映するか。既定は反映する（現行挙動）。未実装 (常に反映)。 */
  headingAlignment?: boolean
  /** 見出し直前に自動で改ページを出力するか。既定は出力しない（現行挙動）。 */
  pageBreakBeforeHeading?: boolean
  /**
   * `pageBreakBeforeHeading` が有効なとき、どの見出しレベルまでを対象にするか
   * (1〜6)。既定は `6`（h1〜h6 すべて対象。後方互換）。`pageBreakBeforeHeading`
   * が false のときはこの値に関係なく見出し前改ページを出力しない。
   * 非数値は `resolveExternalExportOptions` が既定値 `6` へフォールバックし、
   * 有限値は最も近い整数へ丸めたうえで `1`〜`6` にクランプする。
   */
  pageBreakBeforeHeadingMaxLevel?: number
  /** `:::page-break`（`nyozePageBreak`）を出力するか。既定は出力する（現行挙動）。 */
  pageBreak?: boolean
}

export type ResolvedExternalExportOptions = Required<ExternalExportOptions>

/**
 * 現行挙動と完全に一致する既定値。
 * - `autoTcy` off / `headingAlignment` on / `pageBreakBeforeHeading` off は、
 *   いずれも現状 Nyoze の export が実際に行っている挙動をそのまま表す。
 * - `tcyMinDigits` / `tcyMaxDigits` / `tcyNumbersOnly` は `autoTcy` が off の間は
 *   参照されないため、WYSIWYG 表示専用の自動 TCY 既定値と揃えた参考値。
 */
export const DEFAULT_EXTERNAL_EXPORT_OPTIONS: ResolvedExternalExportOptions = {
  autoTcy: false,
  tcyMinDigits: DEFAULT_AUTO_TCY_MIN_DIGITS,
  tcyMaxDigits: DEFAULT_AUTO_TCY_MAX_DIGITS,
  tcyNumbersOnly: DEFAULT_AUTO_TCY_NUMBERS_ONLY,
  headingAlignment: true,
  pageBreakBeforeHeading: false,
  pageBreakBeforeHeadingMaxLevel: 6,
  pageBreak: true,
}

const PAGE_BREAK_BEFORE_HEADING_MIN_LEVEL = 1
const PAGE_BREAK_BEFORE_HEADING_MAX_LEVEL = 6

/**
 * `pageBreakBeforeHeadingMaxLevel` を安全な範囲へ正規化する。
 * - 数値でない・有限でない値（`undefined` / `NaN` / `Infinity` 等）は既定値
 *   `6`（h1〜h6 すべて対象、現行互換）へフォールバックする。
 * - 有限値は最も近い整数へ丸めたうえで `1`〜`6` にクランプする
 *   （例: `0` → `1`、`7` → `6`、`2.5` → `3`）。範囲外を丸めて既存挙動へ
 *   フォールバックさせるのではなく、意図が読み取れる境界値へ寄せる。
 */
function resolvePageBreakBeforeHeadingMaxLevel(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_EXTERNAL_EXPORT_OPTIONS.pageBreakBeforeHeadingMaxLevel
  }
  const rounded = Math.round(value)
  return Math.min(Math.max(rounded, PAGE_BREAK_BEFORE_HEADING_MIN_LEVEL), PAGE_BREAK_BEFORE_HEADING_MAX_LEVEL)
}

/**
 * 呼び出し側が省略したフィールドを既定値で埋める。`options` 自体が undefined
 * でも安全に既定値のみを返す。digit / numbersOnly / heading max level は単純
 * spread せず、Editor / Viewer と同じ normalizer で正規化する。
 */
export function resolveExternalExportOptions(
  options?: ExternalExportOptions,
): ResolvedExternalExportOptions {
  const digitRange = resolveAutoTcyDigitRange({
    minDigits: options?.tcyMinDigits,
    maxDigits: options?.tcyMaxDigits,
  })
  return {
    ...DEFAULT_EXTERNAL_EXPORT_OPTIONS,
    ...options,
    autoTcy: options?.autoTcy === true,
    tcyMinDigits: digitRange.minDigits,
    tcyMaxDigits: digitRange.maxDigits,
    tcyNumbersOnly: resolveAutoTcyNumbersOnly({
      numbersOnly: options?.tcyNumbersOnly,
    }),
    pageBreakBeforeHeadingMaxLevel: resolvePageBreakBeforeHeadingMaxLevel(
      options?.pageBreakBeforeHeadingMaxLevel,
    ),
  }
}
