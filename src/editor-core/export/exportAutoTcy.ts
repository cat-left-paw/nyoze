/**
 * LeME / でんでん向け export が共有する auto TCY 変換 helper。
 * 検出は Editor / Page Viewer と同じ `collectAutoTcyRanges()` を使い、独自 regex
 * は持たない。通常 text node 単位で完結させ、text node をまたいで結合しない。
 *
 * 出力形式:
 * - 数字・英数字: 両形式とも `^...^`
 * - `!!` / `!?` / `??`: でんでんは `^...^`、LeME は既定 CSS の
 *   `<span class="tcy">...</span>`（Nyoze は CSS を出力しない）
 */

import { AUTO_TCY_SYMBOLS, collectAutoTcyRanges } from '../features/autoTcy'
import type { ResolvedExternalExportOptions } from './externalExportOptions'

const AUTO_TCY_EXCLUDED_MARK_NAMES = new Set(['link', 'code'])

export type ExportAutoTcyMarkLike = {
  type: { name: string }
}

/** 記号3種だけが取り得る LeME 向け HTML wrap。英数字は常に caret。 */
export type ExportAutoTcyWrapForm = 'caret' | 'leme-span'

export type ExportAutoTcySegment =
  | { kind: 'text'; text: string }
  | { kind: 'autoTcy'; text: string; form: ExportAutoTcyWrapForm }

export type ExportAutoTcyDigitOptions = Pick<
  ResolvedExternalExportOptions,
  'tcyMinDigits' | 'tcyMaxDigits' | 'tcyNumbersOnly'
>

export function shouldApplyExportAutoTcy(
  options: Pick<ResolvedExternalExportOptions, 'autoTcy'>,
  marks: readonly ExportAutoTcyMarkLike[],
): boolean {
  if (options.autoTcy !== true) return false
  return !marks.some((mark) => AUTO_TCY_EXCLUDED_MARK_NAMES.has(mark.type.name))
}

function resolveAutoTcyWrapForm(
  token: string,
  symbolForm: ExportAutoTcyWrapForm,
): ExportAutoTcyWrapForm {
  return AUTO_TCY_SYMBOLS.has(token) ? symbolForm : 'caret'
}

/**
 * text を通常文字列と auto TCY token に分割する。
 * `symbolForm: 'leme-span'` のときだけ記号3種を span 候補にし、それ以外は caret。
 */
export function buildExportAutoTcySegments(
  text: string,
  options: ExportAutoTcyDigitOptions,
  symbolForm: ExportAutoTcyWrapForm = 'caret',
): ExportAutoTcySegment[] {
  if (!text) return []

  const ranges = collectAutoTcyRanges(text, {
    minDigits: options.tcyMinDigits,
    maxDigits: options.tcyMaxDigits,
    numbersOnly: options.tcyNumbersOnly,
  })
  if (ranges.length === 0) return [{ kind: 'text', text }]

  const segments: ExportAutoTcySegment[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.from > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, range.from) })
    }
    segments.push({
      kind: 'autoTcy',
      text: range.text,
      form: resolveAutoTcyWrapForm(range.text, symbolForm),
    })
    cursor = range.to
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) })
  }
  return segments
}

/**
 * segment 列を最終文字列へ組み立てる。
 * - text / caret の中身だけ `escapeText` を通す（ユーザー文字列の HTML escape 用）
 * - `leme-span` は固定3種だけを `<span class="tcy">...</span>` として出し、
 *   escape しない（かつ任意ユーザー文字列を raw HTML として通さない）
 */
export function assembleExportAutoTcySegments(
  segments: readonly ExportAutoTcySegment[],
  escapeText?: (text: string) => string,
): string {
  const esc = escapeText ?? ((value: string) => value)
  let out = ''
  for (const segment of segments) {
    if (segment.kind === 'text') {
      out += esc(segment.text)
      continue
    }
    if (segment.form === 'caret' || !AUTO_TCY_SYMBOLS.has(segment.text)) {
      out += `^${esc(segment.text)}^`
      continue
    }
    out += `<span class="tcy">${segment.text}</span>`
  }
  return out
}

/**
 * text 内の auto TCY 候補をすべて `^...^` で囲む（でんでん向け / 互換入口）。
 * マッチが無ければ元文字列を返す。
 */
export function wrapExportAutoTcyCarets(
  text: string,
  options: ExportAutoTcyDigitOptions,
): string {
  if (!text) return text
  return assembleExportAutoTcySegments(buildExportAutoTcySegments(text, options, 'caret'))
}

/**
 * でんでん向け: text node 用の caret のみ入口。
 * `autoTcy` off / 除外 mark / 空文字では text をそのまま返す。
 */
export function applyExportAutoTcyToText(
  text: string,
  marks: readonly ExportAutoTcyMarkLike[],
  options: ResolvedExternalExportOptions,
): string {
  if (!shouldApplyExportAutoTcy(options, marks)) return text
  return wrapExportAutoTcyCarets(text, options)
}

/**
 * LeME 向け: 記号3種を span.tcy、英数字を caret として組み立てる。
 * highlight / underline 用に `escapeText` を渡すと、通常文字列と caret 中身だけ
 * escape し、生成した span は escape しない。
 */
export function applyExportAutoTcyToLeMEText(
  text: string,
  marks: readonly ExportAutoTcyMarkLike[],
  options: ResolvedExternalExportOptions,
  escapeText?: (text: string) => string,
): string {
  if (!shouldApplyExportAutoTcy(options, marks)) {
    return escapeText ? escapeText(text) : text
  }
  return assembleExportAutoTcySegments(
    buildExportAutoTcySegments(text, options, 'leme-span'),
    escapeText,
  )
}
