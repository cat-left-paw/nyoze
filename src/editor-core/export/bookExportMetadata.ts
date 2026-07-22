/**
 * Book 全体 export（LeME / でんでん / 青空文庫風 / Web Book）で共有する、作品情報 /
 * 章ファイル情報の metadata shape。
 *
 * 特定フォーマットに依存しない中立な型としてここに定義する。LeME / でんでん /
 * 青空文庫風の pure converter（`lemeMarkdownExport.ts` / `dendenMarkdownExport.ts` /
 * `aozoraTextExport.ts`）はこのモジュールだけを import し、共有 semantic HTML
 * （`htmlExportSemantic.ts`）には依存しない。意図的な分離で、semantic 側の
 * `HtmlDocumentInfo` / `HtmlChapterInfo` とは shape が完全に一致する。
 * `bookExportConversion.ts`（オーケストレーション層）はこの型のまま
 * `exportWebBookFromDoc()` / semantic 呼び出しへ構造的に渡せるため、変換 helper は不要。
 *
 * fs / electron / React に依存しない純粋な型定義のみのモジュール。
 */

/** Book 全体の作品情報（Book 冒頭に一度だけ表示）。 */
export type BookExportBookInfo = {
  title?: string
  author?: string
  translator?: string
}

/** 章ファイル情報（各章冒頭に表示）の 1 章分。 */
export type BookExportChapterInfo = {
  /**
   * 連結後の doc（`bookExportConversion.ts` が組み立てる）の top-level 子要素
   * 配列内で、この章「自身」の最初の top-level node が最初に出現する位置
   * （0-based）。章境界の page-break marker がある場合はその直後の位置を指す。
   */
  index: number
  title?: string
  authors?: readonly string[]
  translators?: readonly string[]
}
