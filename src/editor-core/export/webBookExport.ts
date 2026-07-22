import type { Node as PMNode } from '@tiptap/pm/model'
import {
  buildClassAttr,
  buildHtmlSemanticMainContent,
  escapeHtmlAttribute,
  escapeHtmlText,
  resolveWritingMode,
  type HtmlExportOptions,
  type HtmlExportWarning,
} from './htmlExportSemantic'
import { buildWebBookReaderCss } from './webBookReaderCss'
import { buildWebBookReaderScript } from './webBookReaderScript'
import {
  buildWebBookAuthorPaletteCss,
  normalizeWebBookPaletteSnapshot,
  type WebBookPaletteSnapshotInput,
} from './webBookPaletteSnapshot'
import {
  DEFAULT_WEB_BOOK_TYPOGRAPHY_SNAPSHOT,
  buildWebBookTypographyCssVariables,
  normalizeWebBookTypographySnapshot,
  type WebBookHeadingFont,
  type WebBookTypographySnapshotInput,
} from './webBookTypographySnapshot'
import {
  DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT,
  normalizeWebBookAutoTcySnapshot,
  type WebBookAutoTcySnapshotInput,
} from './webBookAutoTcySnapshot'
import {
  concatTemplateParts,
  htmlPart,
  type HtmlTemplatePart,
  type WebBookAssetRequest,
} from './webBookAssetPlan'

export type {
  HtmlChapterInfo,
  HtmlDocumentInfo,
  HtmlExportOptions,
  HtmlExportWarning,
  HtmlExportWarningCode,
  HtmlExportWritingMode,
} from './htmlExportSemantic'
export type {
  HtmlTemplatePart,
  WebBookAssetOrigin,
  WebBookAssetRequest,
} from './webBookAssetPlan'

/**
 * Web Book WB-R5: CSS Columns screen reader + reader furniture + page transition
 * + isolated print boundary.
 *
 * - No File menu / IPC / Save dialog wiring (WB-R6).
 * - Session-only reader state (no localStorage / settings.json / Display Settings).
 * - Reader chrome は overlay（layout height を予約しない）。詳細設定は Settings popover、
 *   Outline は physical right の drawer に置く。
 * - ページ遷移（なし / フェード / スライド / ズーム、既定フェード 500ms）は
 *   session-only の演出で、pagination SoT / print には影響しない。
 * - Does not embed `.nyoze-print-toolbar` or standalone HTML print shell.
 */

export type WebBookOutlineChapter = {
  /** 1-based chapter number; matches heading id prefix `wb-c{n}-`. */
  chapter: number
  title: string
}

export type WebBookExportOptions = HtmlExportOptions & {
  /**
   * Export 開始時点の resolved document colors を渡す Web Book 専用 snapshot。
   * 未指定は Author snapshot 不在を意味し、Classic preset を初期値にする。
   * 指定時は pure export 境界で #rrggbb の完全な 3 色のみを受理する。
   */
  authorPaletteSnapshot?: WebBookPaletteSnapshotInput
  /**
   * Export 開始時点の Display Settings 由来見出し appearance。
   * 未指定は safe default（same-as-body / start / 0.45em / h1+h2 divider）。
   * 指定時は pure export 境界で完全 shape のみを受理する（custom font 名は不可）。
   */
  typographySnapshot?: WebBookTypographySnapshotInput
  /**
   * Export 開始時点の Display Settings 由来 auto TCY。
   * 未指定は safe default（enabled=false）。指定時は完全 4 key のみを受理する。
   * Export Options / Reader Settings には出さない。
   */
  autoTcySnapshot?: WebBookAutoTcySnapshotInput
  /**
   * Book 全体で章をまたぐ heading ID namespace 用。
   * `assembleBookExportDocInternal` の `chapterStartIndices` を渡す。
   * 単独文書では省略する。
   */
  chapterStartIndices?: readonly number[]
  /**
   * Outline 用の章タイトル island（`includeChapterInfo` とは独立）。
   * Book 全体 export では常に渡す。単独文書では省略。
   */
  outlineChapters?: readonly WebBookOutlineChapter[]
  /** WB-IMG-2: export container; only main materialization/write behavior reads this. */
  outputProfile?: import('./webBookAssetPlan').WebBookOutputProfile
}

/**
 * WB-IMG-1: template artifact + collected asset requests instead of a plain
 * `html` string. `template` is safe to serialize over IPC as-is; resolving
 * `assetRequests` and calling `materializeWebBookTemplate` (main process
 * only, see `electron/webBookAssetResolution.ts`) yields the final HTML.
 */
export type WebBookExportResult = {
  template: readonly HtmlTemplatePart[]
  assetRequests: readonly WebBookAssetRequest[]
  warnings: HtmlExportWarning[]
}

function buildInsetOptions(defaultValue: number): string {
  const values = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80]
  return values
    .map((v) => `<option value="${v}"${v === defaultValue ? ' selected' : ''}>${v}px</option>`)
    .join('')
}

/** 常時表示側の compact overlay chrome（layout height を予約しない）。 */
function buildCompactChrome(): string {
  return [
    '<header class="nyoze-web-book-chrome" data-wb-chrome="">',
    '<div class="nyoze-web-book-chrome__nav" role="group" aria-label="ページ移動">',
    '<button type="button" data-wb-prev aria-label="前のページ" title="前のページ">◀</button>',
    '<span class="nyoze-web-book-chrome__status" data-wb-status aria-live="polite">0%</span>',
    '<button type="button" data-wb-next aria-label="次のページ" title="次のページ">▶</button>',
    '</div>',
    '<span class="nyoze-web-book-chrome__divider" aria-hidden="true"></span>',
    '<button type="button" data-wb-outline-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="nyoze-web-book-outline">目次</button>',
    '<button type="button" data-wb-settings-toggle aria-haspopup="dialog" aria-expanded="false" aria-controls="nyoze-web-book-settings">設定</button>',
    '</header>',
  ].join('')
}

function headingFontPressed(current: WebBookHeadingFont, value: WebBookHeadingFont): string {
  return current === value ? 'true' : 'false'
}

/** Reader Settings popover（session-only、compact chrome の設定 trigger から開く）。 */
function buildSettingsPopover(hasAuthorPalette: boolean, headingFont: WebBookHeadingFont): string {
  const themeOptions = [
    hasAuthorPalette ? '<option value="author" selected>Author / Original</option>' : '',
    `<option value="classic"${hasAuthorPalette ? '' : ' selected'}>Classic</option>`,
    '<option value="light">Light</option>',
    '<option value="dark">Dark</option>',
    '<option value="paper">Paper</option>',
  ].join('')
  return [
    '<div id="nyoze-web-book-settings" class="nyoze-web-book-settings" data-wb-chrome="" role="dialog" aria-label="表示設定" tabindex="-1" hidden>',
    '<fieldset class="nyoze-web-book-settings__section">',
    '<legend>本文</legend>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">文字サイズ</span>',
    '<span class="nyoze-web-book-settings__group" role="group" aria-label="文字サイズ">',
    '<button type="button" data-wb-scale-decrease aria-label="文字を小さく">A−</button>',
    '<span class="nyoze-web-book-settings__value" data-wb-scale-status aria-live="polite">100%</span>',
    '<button type="button" data-wb-scale-increase aria-label="文字を大きく">A+</button>',
    '</span>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">書体</span>',
    '<span class="nyoze-web-book-settings__segmented" role="group" aria-label="書体">',
    '<button type="button" data-wb-font="mincho" aria-pressed="true">明朝</button>',
    '<button type="button" data-wb-font="gothic" aria-pressed="false">ゴシック</button>',
    '</span>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">見出し書体</span>',
    '<span class="nyoze-web-book-settings__segmented" role="group" aria-label="見出し書体">',
    `<button type="button" data-wb-heading-font="same-as-body" aria-pressed="${headingFontPressed(headingFont, 'same-as-body')}">本文と同じ</button>`,
    `<button type="button" data-wb-heading-font="mincho" aria-pressed="${headingFontPressed(headingFont, 'mincho')}">明朝</button>`,
    `<button type="button" data-wb-heading-font="gothic" aria-pressed="${headingFontPressed(headingFont, 'gothic')}">ゴシック</button>`,
    '</span>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">書字方向</span>',
    '<span class="nyoze-web-book-settings__segmented" role="group" aria-label="書字方向">',
    '<button type="button" data-wb-writing-mode="vertical-rl" aria-pressed="true">縦書き</button>',
    '<button type="button" data-wb-writing-mode="horizontal-tb" aria-pressed="false">横書き</button>',
    '</span>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-theme-select">テーマ</label>',
    '<select id="nyoze-web-book-theme-select" data-wb-theme-select aria-label="Reader theme">',
    themeOptions,
    '</select>',
    '</div>',
    '</fieldset>',
    '<fieldset class="nyoze-web-book-settings__section">',
    '<legend>ページ</legend>',
    '<span class="nyoze-web-book-settings__hint">上・下余白は最低16pxに選択値を加算します。</span>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-inset-top">上余白</label>',
    '<select id="nyoze-web-book-inset-top" data-wb-page-inset-top aria-label="上余白">',
    buildInsetOptions(32),
    '</select>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-inset-bottom">下余白</label>',
    '<select id="nyoze-web-book-inset-bottom" data-wb-page-inset-bottom aria-label="下余白">',
    buildInsetOptions(16),
    '</select>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-inset-inline">左右余白</label>',
    '<select id="nyoze-web-book-inset-inline" data-wb-page-inset-inline aria-label="左右余白">',
    buildInsetOptions(16),
    '</select>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">用紙枠</span>',
    '<button type="button" data-wb-paper-frame aria-pressed="true">表示する</button>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-transition-select">ページ遷移</label>',
    '<select id="nyoze-web-book-transition-select" data-wb-transition-select aria-label="ページ遷移">',
    '<option value="none">なし</option>',
    '<option value="fade" selected>フェード</option>',
    '<option value="slide">スライド</option>',
    '<option value="zoom">ズーム</option>',
    '</select>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-transition-speed">遷移速度</label>',
    '<span class="nyoze-web-book-settings__group">',
    '<input type="range" id="nyoze-web-book-transition-speed" data-wb-transition-speed-range min="200" max="1000" step="50" value="500" aria-label="遷移速度">',
    '<span class="nyoze-web-book-settings__value" data-wb-transition-speed-status aria-live="polite">500ms</span>',
    '</span>',
    '</div>',
    '</fieldset>',
    '<fieldset class="nyoze-web-book-settings__section">',
    '<legend>ヘッダー</legend>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">ヘッダー</span>',
    '<button type="button" data-wb-header-enabled aria-pressed="true" aria-label="ヘッダーを表示">表示する</button>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-header-align">ヘッダー位置</label>',
    '<select id="nyoze-web-book-header-align" data-wb-header-align aria-label="ヘッダー位置">',
    '<option value="left" selected>左</option>',
    '<option value="center">中央</option>',
    '<option value="right">右</option>',
    '</select>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">タイトル</span>',
    '<button type="button" data-wb-header-show-title aria-pressed="true" aria-label="ヘッダーにタイトルを表示">表示する</button>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">著者</span>',
    '<button type="button" data-wb-header-show-author aria-pressed="false" aria-label="ヘッダーに著者を表示">表示する</button>',
    '</div>',
    '</fieldset>',
    '<fieldset class="nyoze-web-book-settings__section">',
    '<legend>フッター</legend>',
    '<div class="nyoze-web-book-settings__row">',
    '<span class="nyoze-web-book-settings__label">フッター</span>',
    '<button type="button" data-wb-footer-enabled aria-pressed="true" aria-label="フッターを表示">表示する</button>',
    '</div>',
    '<div class="nyoze-web-book-settings__row">',
    '<label class="nyoze-web-book-settings__label" for="nyoze-web-book-footer-align">フッター位置</label>',
    '<select id="nyoze-web-book-footer-align" data-wb-footer-align aria-label="フッター位置">',
    '<option value="left">左</option>',
    '<option value="center">中央</option>',
    '<option value="right" selected>右</option>',
    '</select>',
    '</div>',
    '</fieldset>',
    '<div class="nyoze-web-book-settings__footer">',
    '<button type="button" data-wb-reset>初期設定に戻す</button>',
    '</div>',
    '</div>',
  ].join('')
}

/** screen 専用 furniture。metadata は既存 pure export input から安全に静的 DOM へ埋め込む。 */
function buildReaderFurniture(title: string, author: string): { header: string; footer: string } {
  const hasTitle = title.trim().length > 0
  const hasAuthor = author.trim().length > 0
  return {
    header: [
      `<header class="nyoze-web-book-reader-header" data-wb-reader-header data-wb-has-title="${hasTitle}" data-wb-has-author="${hasAuthor}">`,
      '<span class="nyoze-web-book-reader-header__content">',
      `<span class="nyoze-web-book-reader-header__title">${hasTitle ? escapeHtmlText(title) : ''}</span>`,
      '<span class="nyoze-web-book-reader-header__separator" aria-hidden="true">·</span>',
      `<span class="nyoze-web-book-reader-header__author">${hasAuthor ? escapeHtmlText(author) : ''}</span>`,
      '</span>',
      '</header>',
    ].join('\n'),
    footer: [
      '<footer class="nyoze-web-book-reader-footer" data-wb-reader-footer>',
      '<span data-wb-footer-pages role="status" aria-live="polite" aria-atomic="true" aria-label="現在のページ 1 / 1">1 / 1</span>',
      '</footer>',
    ].join('\n'),
  }
}

function buildChapterTitlesIsland(
  chapters: readonly WebBookOutlineChapter[] | undefined,
): string {
  if (!chapters || chapters.length === 0) return ''
  const items = chapters
    .map((ch) => {
      const n = Math.floor(Number(ch.chapter))
      if (!Number.isFinite(n) || n < 1) return ''
      return `<span data-wb-chapter="${n}" data-wb-title="${escapeHtmlAttribute(ch.title)}"></span>`
    })
    .filter(Boolean)
    .join('')
  if (!items) return ''
  return `<div id="nyoze-web-book-chapter-titles" hidden>${items}</div>\n`
}

/**
 * Build a complete Web Book HTML document from a PM doc.
 * Shares semantic serialization with Web Book via `htmlExportSemantic`.
 */
export function exportWebBookFromDoc(
  doc: PMNode,
  options?: WebBookExportOptions,
): WebBookExportResult {
  const title = options?.title ?? ''
  const readerTitle = options?.documentInfo?.title?.trim() ? options.documentInfo.title : title
  const readerAuthor = options?.documentInfo?.author ?? ''
  const authorPaletteSnapshot =
    options?.authorPaletteSnapshot === undefined
      ? undefined
      : normalizeWebBookPaletteSnapshot(options.authorPaletteSnapshot)
  const hasAuthorPalette = authorPaletteSnapshot !== undefined
  const typographySnapshot =
    options?.typographySnapshot === undefined
      ? DEFAULT_WEB_BOOK_TYPOGRAPHY_SNAPSHOT
      : normalizeWebBookTypographySnapshot(options.typographySnapshot)
  const autoTcySnapshot =
    options?.autoTcySnapshot === undefined
      ? DEFAULT_WEB_BOOK_AUTO_TCY_SNAPSHOT
      : normalizeWebBookAutoTcySnapshot(options.autoTcySnapshot)
  const writingMode = resolveWritingMode(options?.writingMode)
  const modeClass =
    writingMode === 'horizontal-tb'
      ? 'nyoze-writing-mode-horizontal-tb'
      : 'nyoze-writing-mode-vertical-rl'

  const semantic = buildHtmlSemanticMainContent(doc, options, {
    variant: 'web-book',
    chapterStartIndices: options?.chapterStartIndices,
    autoTcy: autoTcySnapshot,
  })

  const readerCss = [
    buildWebBookReaderCss(),
    authorPaletteSnapshot ? buildWebBookAuthorPaletteCss(authorPaletteSnapshot) : '',
  ].filter(Boolean).join('\n\n')
  const readerScript = buildWebBookReaderScript()
  const chapterIsland = buildChapterTitlesIsland(options?.outlineChapters)
  const readerFurniture = buildReaderFurniture(readerTitle, readerAuthor)
  const authorPaletteAttrs = authorPaletteSnapshot
    ? ` data-wb-author-palette="true" data-wb-author-page-color="${authorPaletteSnapshot.pageColor}" data-wb-author-text-color="${authorPaletteSnapshot.textColor}" data-wb-author-heading-color="${authorPaletteSnapshot.headingColor}"`
    : ''
  const typographyStyle = escapeHtmlAttribute(buildWebBookTypographyCssVariables(typographySnapshot))
  const headingFont = typographySnapshot.headingFont

  const bodyAttrs =
    buildClassAttr(['nyoze-web-book-root', 'nyoze-web-book--screen', modeClass]) +
    ` data-wb-theme="${hasAuthorPalette ? 'author' : 'classic'}"${authorPaletteAttrs} data-wb-font="mincho" data-wb-heading-font="${headingFont}" data-wb-heading-font-initial="${headingFont}" data-wb-writing-mode="${writingMode}" data-wb-page-inset-top="32" data-wb-page-inset-bottom="16" data-wb-page-inset-inline="16" data-wb-paper-frame="on" data-wb-header-enabled="on" data-wb-header-align="left" data-wb-header-show-title="on" data-wb-header-show-author="off" data-wb-footer-enabled="on" data-wb-footer-align="right" data-wb-transition="fade" data-wb-transition-speed="500" data-wb-page-index="0" data-wb-page-count="1" style="${typographyStyle}"`

  // WB-IMG-1: everything outside `.nyoze-web-book-flow` is literal (no
  // asset holes possible in chrome / css / script). `semantic.template` is
  // spliced in as-is, preserving any asset holes it contains.
  const prefix =
    '<!doctype html>\n' +
    `<html lang="ja" class="nyoze-web-book" data-nyoze-web-book="" data-writing-mode="${writingMode}">\n` +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${escapeHtmlText(title)}</title>\n` +
    `<style>\n${readerCss}\n</style>\n` +
    '</head>\n' +
    `<body${bodyAttrs}>\n` +
    `${buildCompactChrome()}\n` +
    `${buildSettingsPopover(hasAuthorPalette, headingFont)}\n` +
    '<div class="nyoze-web-book-backdrop" data-wb-backdrop aria-hidden="true" hidden></div>\n' +
    '<aside id="nyoze-web-book-outline" class="nyoze-web-book-outline" role="dialog" aria-modal="true" aria-label="目次" tabindex="-1" hidden></aside>\n' +
    '<main class="nyoze-web-book-main">\n' +
    '<div class="nyoze-web-book-paper-frame">\n' +
    `${readerFurniture.header}\n` +
    '<div class="nyoze-web-book-viewport" data-wb-page-index="0" data-wb-page-count="1" tabindex="0">\n' +
    '<div class="nyoze-web-book-flow">'

  const suffix =
    '</div>\n' +
    '<div class="nyoze-web-book-transition-mask" data-wb-transition-mask aria-hidden="true"></div>\n' +
    '<div class="nyoze-web-book-transition-overlay" data-wb-transition-overlay aria-hidden="true"></div>\n' +
    '</div>\n' +
    `${readerFurniture.footer}\n` +
    '</div>\n' +
    '</main>\n' +
    chapterIsland +
    `<script>\n${readerScript}\n</script>\n` +
    '</body>\n' +
    '</html>\n'

  const template = concatTemplateParts(htmlPart(prefix), semantic.template, htmlPart(suffix))

  return { template, assetRequests: semantic.assetRequests, warnings: semantic.warnings }
}
