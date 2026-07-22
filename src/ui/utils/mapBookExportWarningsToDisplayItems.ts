import type { BookExportChapterLoadWarning } from '../../../electron/bookExportChapterLoader'
import type { BookExportConversionWarning } from '../../../electron/bookExportOperation'
import type { WebBookAssetFailure } from '../../editor-core/export/webBookAssetPlan'

export type BookExportChapterWarningDisplayItem = {
  source: 'chapter'
  id: string
  kind: BookExportChapterLoadWarning['kind']
  path: string
  title: string
  detail?: string
}

export type BookExportConversionWarningDisplayItem = {
  source: 'conversion'
  id: string
  code: string
  message: string
  nodeType?: string
  markType?: string
  directive?: string
}

export type BookExportWarningDisplayItem =
  | BookExportChapterWarningDisplayItem
  | BookExportConversionWarningDisplayItem

/**
 * chapter 読み込み warning（missing / read-error）を表示用の pure data へ変換する。
 * fs / electron / React に依存しない。
 */
export function mapBookExportChapterLoadWarningsToDisplayItems(
  warnings: readonly BookExportChapterLoadWarning[],
): BookExportChapterWarningDisplayItem[] {
  return warnings.map((warning, index) => ({
    source: 'chapter',
    id: `chapter-${index}-${warning.path}`,
    kind: warning.kind,
    path: warning.path,
    title: warning.title,
    detail: warning.kind === 'chapter-read-error' ? warning.detail : undefined,
  }))
}

/**
 * converter warning（unsupported-node 等）を表示用の pure data へ変換する。
 * `message` は既存 converter が組み立てた文字列をそのまま MVP 表示に使う（追加の翻訳はしない）。
 */
export function mapBookExportConversionWarningsToDisplayItems(
  warnings: readonly BookExportConversionWarning[],
): BookExportConversionWarningDisplayItem[] {
  return warnings.map((warning, index) => ({
    source: 'conversion',
    id: `conversion-${index}-${warning.code}`,
    code: warning.code,
    message: warning.message,
    nodeType: warning.nodeType,
    markType: warning.markType,
    directive: warning.directive,
  }))
}

export type WebBookAssetFailureDisplayItem = {
  id: string
  code: WebBookAssetFailure['code']
  originLabel: string
  rawSrc: string
  message: string
}

/**
 * WB-IMG-1: 画像 asset の validation failure（main が返す安全な user-facing
 * message のみ。absolute path / realpath / hash 等は main 側で既に除去済み）を
 * 表示用の pure data へ変換する。fs / electron / React に依存しない。
 */
export function mapWebBookAssetFailuresToDisplayItems(
  failures: readonly WebBookAssetFailure[],
): WebBookAssetFailureDisplayItem[] {
  return failures.map((failure, index) => ({
    id: `asset-${index}-${failure.code}`,
    code: failure.code,
    originLabel: failure.originLabel,
    rawSrc: failure.rawSrc,
    message: failure.message,
  }))
}
