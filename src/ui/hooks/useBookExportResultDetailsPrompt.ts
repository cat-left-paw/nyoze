import { useCallback, useState } from 'react'
import type { BookExportFormat } from '../../../electron/bookExportOperation'
import type {
  BookExportChapterWarningDisplayItem,
  BookExportConversionWarningDisplayItem,
  WebBookAssetFailureDisplayItem,
} from '../utils/mapBookExportWarningsToDisplayItems'

export type BookExportResultDetailsOutcome =
  | 'success-with-warnings'
  | 'missing-chapters'
  | 'asset-error'

export type BookExportResultDetailsPromptState = {
  format: BookExportFormat
  outcome: BookExportResultDetailsOutcome
  chapterWarnings: BookExportChapterWarningDisplayItem[]
  conversionWarnings: BookExportConversionWarningDisplayItem[]
  /** `missing-chapters` のときだけ、plan 由来の章数（部分 export しない不変条件の可視化）。 */
  totalChapterCount?: number
  /** WB-IMG-1: `asset-error` のときだけ、画像 embed に失敗した一覧。 */
  assetFailures?: WebBookAssetFailureDisplayItem[]
}

/**
 * Book export 結果（warning 付き成功 / missing-chapters）の詳細確認モーダル状態。
 * options prompt と異なり、閉じても後続処理を分岐させないため resolver は不要。
 */
export function useBookExportResultDetailsPrompt() {
  const [state, setState] = useState<BookExportResultDetailsPromptState | null>(null)

  const showBookExportResultDetails = useCallback(
    (next: BookExportResultDetailsPromptState) => setState(next),
    [],
  )

  const closeBookExportResultDetails = useCallback(() => setState(null), [])

  return { state, showBookExportResultDetails, closeBookExportResultDetails }
}
