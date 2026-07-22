import type { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model'
import {
  classifyImageSrc,
  isAbsoluteImageSrc,
} from '../io/imageSecurity'
import { validateDocumentLinkHref } from '../io/linkHrefSafety'
import {
  formatDirectiveToken,
  NYOZE_BLANK_PAGE_NODE_NAME,
  NYOZE_DIRECTIVE_NODE_NAME,
  NYOZE_PAGE_BREAK_NODE_NAME,
  type DirectiveAttrs,
} from '../io/customBlockDirective'
import { normalizeTopLevelPageBreaks } from '../io/pageBreakRenderModel'
import {
  resolveExternalExportOptions,
  type ExternalExportOptions,
  type ResolvedExternalExportOptions,
} from './externalExportOptions'
import {
  assetHolePart,
  concatTemplateParts,
  createWebBookAssetRefIdGenerator,
  htmlPart,
  type HtmlTemplatePart,
  type WebBookAssetOrigin,
  type WebBookAssetRequest,
} from './webBookAssetPlan'
import { buildExportAutoTcySegments } from './exportAutoTcy'
import type { WebBookAutoTcySnapshot } from './webBookAutoTcySnapshot'

/**
 * Shared semantic HTML serialization for Web Book (and former standalone HTML).
 *
 * Produces safe main-content fragments (documentInfo / TOC / body) only.
 * Web Book reader shell lives in `webBookExport.ts`. No React / Electron / fs / IPC.
 *
 * See `docs/html-export-design-2026-07.md` and `docs/web-book-design-2026-07.md`.
 *
 * WB-IMG-1 (`docs/web-book-assets-design-2026-07.md`): for `variant: 'web-book'`,
 * every `nyoze_image` occurrence becomes a `WebBookAssetRequest` + an `asset`
 * hole in the returned `HtmlTemplatePart[]`, instead of an inline `src`. This
 * pure layer never reads image bytes, never classifies a `rawSrc` as safe or
 * dangerous, and never knows a project root — only
 * `electron/webBookAssetResolution.ts` (main) resolves holes to validated
 * `data:` URLs. The retired `standalone` variant keeps its old pass-through /
 * `image-omitted` behavior untouched.
 */

export type HtmlExportWarningCode =
  | 'unsupported-node'
  | 'unsupported-mark'
  | 'unsupported-directive'
  | 'unsafe-link'
  | 'raw-html-escaped'
  | 'image-omitted'

export type HtmlExportWarning = {
  code: HtmlExportWarningCode
  message: string
  nodeType?: string
  markType?: string
  directive?: string
}

export type HtmlExportResult = {
  html: string
  warnings: HtmlExportWarning[]
}

export type HtmlExportWritingMode = 'vertical-rl' | 'horizontal-tb'

/** 簡易表紙（title page）の metadata group 書字方向。raw CSS は受け取らない。 */
export type DocumentInfoTitlePageWritingMode = 'inherit' | 'vertical-rl' | 'horizontal-tb'

/**
 * 簡易表紙（title page）のレイアウト。Tategaki 書籍モードの frontmatter 独立ページ
 * （`BookFrontmatterPageLayout`）と同じ 2 値。`normal` はタイトル群を開始側（上付き）、
 * 著者・訳者群を地付き（`text-align: end`）にする通常配置、`center` は中央配置。
 */
export type DocumentInfoTitlePageLayout = 'normal' | 'center'

export const DEFAULT_DOCUMENT_INFO_TITLE_PAGE_WRITING_MODE: DocumentInfoTitlePageWritingMode =
  'inherit'
export const DEFAULT_DOCUMENT_INFO_TITLE_PAGE_LAYOUT: DocumentInfoTitlePageLayout = 'normal'

/** 不正値・未指定は既定 `'inherit'` へ。列挙 3 値だけを受理する。 */
export function resolveDocumentInfoTitlePageWritingMode(
  value: unknown,
): DocumentInfoTitlePageWritingMode {
  if (value === 'inherit' || value === 'vertical-rl' || value === 'horizontal-tb') return value
  return DEFAULT_DOCUMENT_INFO_TITLE_PAGE_WRITING_MODE
}

/** 不正値・未指定は既定 `'normal'` へ。列挙 2 値だけを受理する。 */
export function resolveDocumentInfoTitlePageLayout(
  value: unknown,
): DocumentInfoTitlePageLayout {
  if (value === 'normal' || value === 'center') return value
  return DEFAULT_DOCUMENT_INFO_TITLE_PAGE_LAYOUT
}

/**
 * 外部 export 共通の pure options model (`externalExportOptions.ts`) に、
 * HTML export 固有のオプション（`title` / `writingMode` / `includeCss`）を
 * 追加した公開オプション型。共有フィールドの既定値は現行の LeME / でんでん /
 * 青空文庫風 export と完全に一致する（`resolveExternalExportOptions` 参照）。
 */
export type HtmlExportOptions = ExternalExportOptions & {
  /** `<title>` の中身。省略時は空文字列。 */
  title?: string
  /** `.nyoze-document` の writing-mode。省略時は `'vertical-rl'`。 */
  writingMode?: HtmlExportWritingMode
  /** `<style>` を埋め込むか。省略時（`undefined`）は埋め込む。`false` のときだけ省略。 */
  includeCss?: boolean
  /**
   * 本文冒頭に文書情報ブロック（title / author / translator）を表示するか。既定 `false`。
   * `documentInfo` を指定していても、この option が `true` でなければ出力しない。
   */
  includeDocumentInfo?: boolean
  /** 本文冒頭に heading (h1〜h6) から生成した目次を表示するか。既定 `false`。 */
  includeTableOfContents?: boolean
  /**
   * `includeTableOfContents: true` のとき、目次に含める見出しの最大レベル
   * (1〜6)。既定 `6`（h1〜h6 すべて）。`includeTableOfContents: false` のときは
   * 無視される。TOC に含まれない heading には TOC 用 `id` 属性も付けない。
   */
  tableOfContentsMaxLevel?: number
  /**
   * `includeDocumentInfo: true` のときに表示する metadata（`title` / `author` /
   * `translator`）。呼び出し側が既に読み取った文字列をそのまま渡す想定で、
   * pure converter 自身は文書の metadata 起源（YAML 先頭ブロック等）を読み書き
   * しない（そもそも文字列を受け取るだけで、由来には関知しない）。
   */
  documentInfo?: HtmlDocumentInfo
  /**
   * 文書情報の著者/訳者行に役割ラベル（「著」+ 全角スペース / 「訳」+ 全角スペース）を表示するか。既定 `true`。
   * `false` のときは名前だけを表示する。`includeDocumentInfo: false` のときは無視される。
   * `includeChapterInfo` の章ファイル情報にも同じ role label 設定を使う。
   * ラベルは全角スペース1文字を使い、コロンは付けない。
   */
  showRoleLabels?: boolean
  /**
   * 文書情報（Book では作品情報）ブロックの直後で改ページするか。既定 `false`。
   * `includeDocumentInfo: true` かつ info section が実際に出力されるときだけ有効。
   * 空 metadata で section 自体が出ない場合は no-op。`includeChapterInfo` には適用しない。
   * ON のとき section に `nyoze-break-after-page` を付け、通常の後余白は CSS 側で抑止する。
   * Web Book の出力 option として使い、standalone HTML shell の UI からは送らない。
   */
  breakAfterDocumentInfo?: boolean
  /**
   * 文書情報（Book では作品情報）を簡易表紙（title page）として表示するか。
   * 既定 `false`。`true` のとき info section に title page 用の class /
   * data attribute と inner group wrapper を付け、直後の改ページ
   * （`nyoze-break-after-page`）を `breakAfterDocumentInfo` の値に関わらず
   * 必ず有効にする（簡易表紙は常に独立ページ）。空 metadata で section 自体が
   * 出ない場合は no-op。`includeChapterInfo` の章ファイル情報には適用しない。
   * Web Book の出力 option として使い、standalone HTML shell の UI からは
   * 送らない（markup は additive で、旧 HTML shell の CSS には title page の
   * 見た目を追加しない）。
   */
  documentInfoTitlePage?: boolean
  /**
   * `documentInfoTitlePage: true` のときの metadata group の書字方向。
   * 既定 `'inherit'`（本文の現在の出力書字方向に従う）。group 自身にだけ
   * 適用し、本文 / TOC / Reader chrome の書字方向は変えない。
   */
  documentInfoTitlePageWritingMode?: DocumentInfoTitlePageWritingMode
  /**
   * `documentInfoTitlePage: true` のときのレイアウト（Tategaki の
   * frontmatter 独立ページと同じ `normal` / `center` の 2 値）。既定 `'normal'`。
   */
  documentInfoTitlePageLayout?: DocumentInfoTitlePageLayout
  /**
   * 各 chapter body file の先頭に、その chapter の title / authors / translators
   * を表示するか。既定 `false`。単独文書向け呼び出しでは常に無視される
   * （`chapterInfos` を渡さない呼び出し元では出しようがない）。Book 全体
   * Web Book export 専用の option（`bookExportConversion.ts` の
   * `exportBookExportChaptersToWebBook()` だけが `chapterInfos` を組み立てて渡す）。
   */
  includeChapterInfo?: boolean
  /**
   * `includeChapterInfo: true` のときに使う、章ごとの metadata。呼び出し側
   * （`bookExportConversion.ts`）が Book chapter 入力から組み立てて渡す。
   * この pure converter 自身は Book metadata がどこから来たか（manifest 等）を
   * 読み書きしない。単独文書向け呼び出しからは渡されない。
   */
  chapterInfos?: readonly HtmlChapterInfo[]
}

/**
 * 本文冒頭の文書情報ブロック用 metadata。Project / Book v3 metadata ではなく、
 * 単独文書 active tab の title / author / translator を想定する。Web Book /
 * Page Viewer でも同じ shape を再利用できるよう、独立した型として公開する。
 */
export type HtmlDocumentInfo = {
  title?: string
  author?: string
  translator?: string
}

/**
 * 章ファイル情報ブロック（`includeChapterInfo: true`）用の 1 chapter 分の metadata。
 * `authors` / `translators` は配列順を保持したまま渡す（表示時に `、` で連結する
 * のはこの converter 自身の責務）。
 */
export type HtmlChapterInfo = {
  /**
   * 連結後の doc（Web Book / semantic 呼び出し側が渡す `doc`）の top-level
   * 子要素配列（`doc.content`）内で、この章「自身」の最初の top-level node が
   * 最初に出現する位置（0-based）。章境界の `nyozePageBreak` marker がある場合は
   * その直後の位置を指す。
   *
   * この位置の node が `normalizeTopLevelPageBreaks()` で trim される
   * （空 paragraph 等）場合は、この位置以降で最初に生き残った block の直前に
   * 挿入する（章の内容が実質的に完全に空の場合は挿入されない）。
   */
  index: number
  title?: string
  authors?: readonly string[]
  translators?: readonly string[]
}

const SUPPORTED_MARK_NAMES = new Set([
  'bold',
  'italic',
  'strike',
  'underline',
  'highlight',
  'code',
  'link',
])

// link は最も外側、code は最も内側に固定する。HTML はタグの入れ子だけなので
// Markdown の fence 衝突のような制約はなく、優先順どおりに単純に入れ子にできる。
const MARK_PRIORITY: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  highlight: 4,
  underline: 5,
  code: 6,
}

/** この module 内の HTML fragment の内部表現。文字列連結ではなく part 配列で asset hole を保持する。 */
type Html = readonly HtmlTemplatePart[]

const EMPTY_HTML: Html = []

type ExportContext = {
  warnings: HtmlExportWarning[]
  options: ResolvedExternalExportOptions
  /**
   * heading node (参照 identity) → 割り当て済み id。
   * standalone HTML では TOC ON のときだけ非 null。
   * Web Book では常に非 null（非空 h1〜h6 すべて）。
   */
  headingIds: Map<PMNode, string> | null
  /** Web Book では blank-page section に識別用 data attribute を付ける。 */
  blankPageVariant: 'standalone' | 'web-book'
  variant: HtmlSemanticVariant
  /**
   * WB-R12: Web Book のみ。enabled な open-time auto TCY snapshot。
   * null のときは通常 text を分割しない（standalone / disabled / 未指定）。
   */
  autoTcy: WebBookAutoTcySnapshot | null
  /**
   * WB-IMG-1: `variant === 'web-book'` のときだけ使う asset request の蓄積先。
   * `serializeImage` が push する。standalone では常に空のまま。
   */
  assetRequests: WebBookAssetRequest[]
  /** 1 export 内で一意な `refId` を発行する（原稿由来の文字列は使わない）。 */
  nextAssetRefId: () => string
  /**
   * 現在直列化中の top-level block が属する origin。`serializeTopLevelDoc` が
   * 各 top-level block を処理する直前に更新し、その block 配下すべての
   * `nyoze_image`（ネストした paragraph / list / directive 内でも）が同じ
   * origin を参照する。
   */
  currentAssetOrigin: WebBookAssetOrigin
}

function pushWarning(ctx: ExportContext, warning: HtmlExportWarning): void {
  ctx.warnings.push(warning)
}

/** HTML text content 用の escape（`&` `<` `>`）。 */
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** HTML attribute value 用の escape（`&` `<` `>` `"` `'`）。 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** class 属性を組み立てる。classes が空なら属性自体を出さない。 */
export function buildClassAttr(classes: readonly string[]): string {
  if (classes.length === 0) return ''
  return ` class="${escapeHtmlAttribute(classes.join(' '))}"`
}

function markPriority(mark: Mark): number {
  return MARK_PRIORITY[mark.type.name] ?? 99
}

function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => markPriority(a) - markPriority(b))
}

function emitUnsupportedMarks(ctx: ExportContext, marks: Mark[]): void {
  for (const mark of marks) {
    if (SUPPORTED_MARK_NAMES.has(mark.type.name)) continue
    pushWarning(ctx, {
      code: 'unsupported-mark',
      message: `Unsupported mark "${mark.type.name}" was stripped during HTML export`,
      markType: mark.type.name,
    })
  }
}

function markOpenTag(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '<strong>'
    case 'italic':
      return '<em>'
    case 'strike':
      return '<s>'
    case 'highlight':
      return '<mark>'
    case 'underline':
      return '<u>'
    case 'code':
      return '<code>'
    case 'link': {
      const href = (mark.attrs.href as string) ?? ''
      const title = mark.attrs.title as string | null
      const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : ''
      return `<a href="${escapeHtmlAttribute(href)}"${titleAttr}>`
    }
    default:
      return ''
  }
}

function markCloseTag(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '</strong>'
    case 'italic':
      return '</em>'
    case 'strike':
      return '</s>'
    case 'highlight':
      return '</mark>'
    case 'underline':
      return '</u>'
    case 'code':
      return '</code>'
    case 'link':
      return '</a>'
    default:
      return ''
  }
}

/**
 * bold / italic / strike / underline / highlight / code / link を HTML タグで
 * 包む。open は優先順で、close はその逆順で閉じるため、入れ子は常に
 * well-formed になる。`content` に asset hole が含まれていても、prefix /
 * suffix の literal で包むだけなので hole の位置は保たれる。
 *
 * link は事前に `validateDocumentLinkHref` で href を検証し、危険と判定された
 * 場合はこの mark を "サポート対象外" として扱う（`<a>` へ包まず本文だけ残し、
 * `unsafe-link` warning を出す）。
 */
function wrapWithMarks(ctx: ExportContext, content: Html, marks: Mark[]): Html {
  const sorted = sortMarks(marks)
  emitUnsupportedMarks(ctx, sorted)

  const usable = sorted.filter((mark) => {
    if (!SUPPORTED_MARK_NAMES.has(mark.type.name)) return false
    if (mark.type.name === 'link') {
      const href = (mark.attrs.href as string) ?? ''
      if (validateDocumentLinkHref(href) === null) {
        pushWarning(ctx, {
          code: 'unsafe-link',
          message: 'Link with an unsafe href was exported as plain text only',
          markType: 'link',
        })
        return false
      }
    }
    return true
  })

  let open = ''
  let close = ''
  for (const mark of usable) open += markOpenTag(mark)
  for (let i = usable.length - 1; i >= 0; i--) close += markCloseTag(usable[i])
  return concatTemplateParts(htmlPart(open), content, htmlPart(close))
}

/**
 * inline node (ruby / tcy) 自身の marks と、全 text child に共通する marks を
 * 合成する。既存 export（LeME / でんでん / 青空文庫風）と同じ方針。
 */
function resolveInlineNodeMarks(node: PMNode): Mark[] {
  const nodeMarks = [...node.marks]

  let childCommon: Mark[] | null = null
  if (node.childCount > 0) {
    node.forEach((child) => {
      if (!child.isText) {
        childCommon = []
        return
      }
      const marks = [...child.marks]
      if (childCommon === null) {
        childCommon = marks
      } else {
        childCommon = childCommon.filter((m) => marks.some((cm) => m.eq(cm)))
      }
    })
  }
  const commonChildMarks = childCommon ?? []

  if (commonChildMarks.length === 0) return nodeMarks
  if (nodeMarks.length === 0) return commonChildMarks

  const merged = [...nodeMarks]
  for (const cm of commonChildMarks) {
    if (!merged.some((m) => m.eq(cm))) {
      merged.push(cm)
    }
  }
  return merged
}

function serializeRuby(ctx: ExportContext, node: PMNode): Html {
  const base = escapeHtmlText(node.textContent)
  const ruby = escapeHtmlText((node.attrs.ruby as string) ?? '')
  const encoded = htmlPart(`<ruby>${base}<rt>${ruby}</rt></ruby>`)
  return wrapWithMarks(ctx, encoded, resolveInlineNodeMarks(node))
}

function serializeTcy(ctx: ExportContext, node: PMNode): Html {
  const encoded = htmlPart(`<span class="nyoze-tcy">${escapeHtmlText(node.textContent)}</span>`)
  return wrapWithMarks(ctx, encoded, resolveInlineNodeMarks(node))
}

/**
 * `nyoze_image` を asset hole 付き `<img>` へ変換する（`variant: 'web-book'`）。
 *
 * WB-IMG-1: この pure layer は画像 bytes を読まず、`rawSrc` がリモート URL /
 * 危険 scheme / 境界外 / 不正形式であるかを一切判定しない（main が唯一の検証
 * 主体 — `docs/web-book-assets-design-2026-07.md` §4）。空 `src` だけは資産化
 * しようがないため、従来どおり `image-omitted` warning で省略する。
 *
 * `standalone`（retired）呼び出しは旧来の pass-through / 危険 scheme 省略の
 * ままにする（この shared contract 自体は変更しない）。
 */
function serializeImage(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  const src = (node.attrs.src as string) ?? ''
  const alt = (node.attrs.alt as string) ?? ''
  const title = node.attrs.title as string | null

  if (!src) {
    pushWarning(ctx, {
      code: 'image-omitted',
      message: 'Image had no src and was omitted during HTML export',
      nodeType: 'nyoze_image',
    })
    return EMPTY_HTML
  }

  if (ctx.variant === 'web-book') {
    const refId = ctx.nextAssetRefId()
    ctx.assetRequests.push({
      refId,
      kind: 'image',
      rawSrc: src,
      origin: ctx.currentAssetOrigin,
    })
    const altAttr = ` alt="${escapeHtmlAttribute(alt)}"`
    const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : ''
    return concatTemplateParts(
      htmlPart(`<img${buildClassAttr(extraClasses)} src="`),
      assetHolePart(refId),
      htmlPart(`"${altAttr}${titleAttr}>`),
    )
  }

  const kind = classifyImageSrc(src)
  if (kind === 'dangerous') {
    pushWarning(ctx, {
      code: 'image-omitted',
      message: 'Image with an unsafe src scheme was omitted during HTML export',
      nodeType: 'nyoze_image',
    })
    return EMPTY_HTML
  }
  if (kind === 'local' && isAbsoluteImageSrc(src)) {
    pushWarning(ctx, {
      code: 'image-omitted',
      message: 'Image with an absolute local path was omitted during HTML export to avoid leaking filesystem paths',
      nodeType: 'nyoze_image',
    })
    return EMPTY_HTML
  }

  const titleAttr = title ? ` title="${escapeHtmlAttribute(title)}"` : ''
  return htmlPart(
    `<img${buildClassAttr(extraClasses)} src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}"${titleAttr}>`,
  )
}

/**
 * raw HTML atom (`html_inline_atom` / `html_block_atom`) の `attrs.raw` を、
 * 実行可能な HTML としてではなく escape 済みテキストとして出す。
 */
function serializeRawHtmlInline(ctx: ExportContext, node: PMNode): string {
  const raw = (node.attrs.raw as string) ?? ''
  pushWarning(ctx, {
    code: 'raw-html-escaped',
    message: 'Raw inline HTML was escaped and not rendered as executable HTML',
    nodeType: 'html_inline_atom',
  })
  return `<span class="nyoze-raw-html">${escapeHtmlText(raw)}</span>`
}

function serializeRawHtmlBlock(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  const raw = (node.attrs.raw as string) ?? ''
  pushWarning(ctx, {
    code: 'raw-html-escaped',
    message: 'Raw HTML block was escaped and not rendered as executable HTML',
    nodeType: 'html_block_atom',
  })
  return htmlPart(`<pre${buildClassAttr(['nyoze-raw-html', ...extraClasses])}>${escapeHtmlText(raw)}</pre>`)
}

/**
 * WB-R12: Web Book 通常 text node を auto TCY 候補で分割する。
 * link / code mark、enabled OFF、空文字では通常 escape のみ。
 * 明示 TCY / ruby / codeBlock はこの経路を通らない。
 */
function serializeTextWithOptionalAutoTcy(
  ctx: ExportContext,
  text: string,
  marks: readonly Mark[],
): Html {
  const snapshot = ctx.autoTcy
  if (
    !snapshot ||
    snapshot.enabled !== true ||
    !text ||
    marks.some((mark) => mark.type.name === 'link' || mark.type.name === 'code')
  ) {
    return wrapWithMarks(ctx, htmlPart(escapeHtmlText(text)), [...marks])
  }

  const segments = buildExportAutoTcySegments(
    text,
    {
      tcyMinDigits: snapshot.minDigits,
      tcyMaxDigits: snapshot.maxDigits,
      tcyNumbersOnly: snapshot.numbersOnly,
    },
    'caret',
  )

  const parts: HtmlTemplatePart[] = []
  for (const segment of segments) {
    if (segment.kind === 'text') {
      parts.push(...htmlPart(escapeHtmlText(segment.text)))
      continue
    }
    parts.push(
      ...htmlPart(
        `<span class="nyoze-web-book-auto-tcy" data-wb-auto-tcy="1">${escapeHtmlText(segment.text)}</span>`,
      ),
    )
  }
  return wrapWithMarks(ctx, parts, [...marks])
}

function serializeInlineNode(ctx: ExportContext, node: PMNode): Html {
  if (node.isText) {
    return serializeTextWithOptionalAutoTcy(ctx, node.text ?? '', node.marks)
  }

  switch (node.type.name) {
    case 'aozoraRuby':
      return serializeRuby(ctx, node)
    case 'aozoraTcy':
      return serializeTcy(ctx, node)
    case 'nyoze_image':
      return serializeImage(ctx, node)
    case 'noteAnchor':
      return EMPTY_HTML
    case 'hardBreak':
      return htmlPart('<br>')
    case 'html_inline_atom':
      return htmlPart(serializeRawHtmlInline(ctx, node))
    default: {
      if (node.content.size > 0) {
        return serializeInlineFragment(ctx, node.content)
      }
      const text = node.textContent
      if (text) {
        pushWarning(ctx, {
          code: 'unsupported-node',
          message: `Unsupported inline node "${node.type.name}" was exported as text content only`,
          nodeType: node.type.name,
        })
        return htmlPart(escapeHtmlText(text))
      }
      pushWarning(ctx, {
        code: 'unsupported-node',
        message: `Unsupported inline node "${node.type.name}" was omitted`,
        nodeType: node.type.name,
      })
      return EMPTY_HTML
    }
  }
}

function serializeInlineFragment(ctx: ExportContext, fragment: Fragment): Html {
  const parts: HtmlTemplatePart[] = []
  fragment.forEach((child) => {
    parts.push(...serializeInlineNode(ctx, child))
  })
  return parts
}

const EMPTY_PARAGRAPH_HTML = '<p><br></p>'

function serializeParagraphNode(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  if (node.content.size === 0) {
    return extraClasses.length > 0
      ? htmlPart(`<p${buildClassAttr(extraClasses)}><br></p>`)
      : htmlPart(EMPTY_PARAGRAPH_HTML)
  }
  const inline = serializeInlineFragment(ctx, node.content)
  return concatTemplateParts(htmlPart(`<p${buildClassAttr(extraClasses)}>`), inline, htmlPart('</p>'))
}

/** heading の `level` 属性を表示可能な範囲 (h1〜h6) へ丸める。 */
function clampHeadingLevel(level: number): number {
  return Math.min(Math.max(level, 1), 6)
}

function serializeHeading(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  const level = clampHeadingLevel((node.attrs.level as number) ?? 1)
  const inline = serializeInlineFragment(ctx, node.content)
  const id = ctx.headingIds?.get(node)
  const idAttr = id ? ` id="${escapeHtmlAttribute(id)}"` : ''
  return concatTemplateParts(
    htmlPart(`<h${level}${idAttr}${buildClassAttr(extraClasses)}>`),
    inline,
    htmlPart(`</h${level}>`),
  )
}

/** fenced code block と等価な `<pre><code>`。language は class として維持する。 */
function serializeCodeBlock(node: PMNode, extraClasses: readonly string[] = []): Html {
  const lang = (node.attrs.language as string) ?? ''
  const body = node.textContent
  const codeClass = lang ? ` class="language-${escapeHtmlAttribute(lang)}"` : ''
  return htmlPart(`<pre${buildClassAttr(extraClasses)}><code${codeClass}>${escapeHtmlText(body)}</code></pre>`)
}

/** node の直接 child block を、区切りなく連結して HTML へ変換する。 */
function serializeChildBlocks(ctx: ExportContext, node: PMNode): Html {
  const parts: HtmlTemplatePart[] = []
  node.forEach((child) => {
    parts.push(...serializeBlock(ctx, child))
  })
  return parts
}

function serializeListItem(ctx: ExportContext, listItem: PMNode): Html {
  const checked = listItem.attrs.checked as boolean | null | undefined
  const isTaskItem = checked === true || checked === false
  const checkbox = isTaskItem
    ? `<input type="checkbox" disabled${checked ? ' checked' : ''}> `
    : ''
  // WB-R10: task item だけ additive に識別 class を付ける。通常 list item は不変。
  const classAttr = isTaskItem ? buildClassAttr(['nyoze-task-item']) : ''
  return concatTemplateParts(
    htmlPart(`<li${classAttr}>${checkbox}`),
    serializeChildBlocks(ctx, listItem),
    htmlPart('</li>'),
  )
}

function serializeBulletList(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  const items: HtmlTemplatePart[] = []
  node.forEach((listItem) => {
    items.push(...serializeListItem(ctx, listItem))
  })
  return concatTemplateParts(htmlPart(`<ul${buildClassAttr(extraClasses)}>`), items, htmlPart('</ul>'))
}

function serializeOrderedList(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  const start = (node.attrs.start as number) ?? 1
  const startAttr = start !== 1 ? ` start="${escapeHtmlAttribute(String(start))}"` : ''
  const items: HtmlTemplatePart[] = []
  node.forEach((listItem) => {
    items.push(...serializeListItem(ctx, listItem))
  })
  return concatTemplateParts(
    htmlPart(`<ol${startAttr}${buildClassAttr(extraClasses)}>`),
    items,
    htmlPart('</ol>'),
  )
}

/**
 * `:::align-center` / `:::align-end` / `:::indent-N` / `:::style-<id>` を、
 * 子 block をすべて内側に持つ単一の `<div>` へ変換する。Markdown 出力と異なり
 * HTML には「div の中で見出し記法が解釈されない」ような制約がないため、
 * child ごとに分割せず 1 つの wrapper にまとめる。
 */
function serializeDirectiveBlock(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  const attrs: DirectiveAttrs = {
    kind: node.attrs.kind as DirectiveAttrs['kind'],
    name: (node.attrs.name as string) ?? '',
    level: (node.attrs.level as number | null) ?? null,
  }
  const inner = serializeChildBlocks(ctx, node)

  if (attrs.kind === 'align' && attrs.name === 'center') {
    return concatTemplateParts(htmlPart(`<div${buildClassAttr(['nyoze-align-center', ...extraClasses])}>`), inner, htmlPart('</div>'))
  }
  if (attrs.kind === 'align' && attrs.name === 'end') {
    return concatTemplateParts(htmlPart(`<div${buildClassAttr(['nyoze-align-end', ...extraClasses])}>`), inner, htmlPart('</div>'))
  }
  if (attrs.kind === 'indent') {
    const level = attrs.level ?? 1
    return concatTemplateParts(
      htmlPart(`<div${buildClassAttr(['nyoze-indent', ...extraClasses])} style="--nyoze-indent-level:${level};">`),
      inner,
      htmlPart('</div>'),
    )
  }
  if (attrs.kind === 'style') {
    return concatTemplateParts(
      htmlPart(`<div${buildClassAttr([`nyoze-style-${attrs.name}`, ...extraClasses])}>`),
      inner,
      htmlPart('</div>'),
    )
  }

  const token = formatDirectiveToken(attrs)
  pushWarning(ctx, {
    code: 'unsupported-directive',
    message: `Unsupported directive block "${token || node.type.name}" was exported as plain content only`,
    directive: token || undefined,
    nodeType: NYOZE_DIRECTIVE_NODE_NAME,
  })
  return concatTemplateParts(htmlPart(`<div${buildClassAttr(extraClasses)}>`), inner, htmlPart('</div>'))
}

/**
 * `nyozePageBreak` の nested (top-level 正規化の対象外) 出現をこの独立した
 * 空 `<div>` へ変換する。top-level の場合はこの関数を経由せず、呼び出し側
 * (`serializeTopLevelDoc`) が次の block の class へ合流させる。
 */
function serializeNestedPageBreak(extraClasses: readonly string[] = []): Html {
  return htmlPart(`<div${buildClassAttr(['nyoze-break-before-page', ...extraClasses])} aria-hidden="true"></div>`)
}

function serializeBlankPageSections(
  ctx: ExportContext,
  count: number,
  extraClasses: readonly string[] = [],
): Html {
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    const dataAttrs =
      ctx.blankPageVariant === 'web-book'
        ? ` data-nyoze-web-book-blank-page="" data-blank-page-slot="${i + 1}" data-blank-page-count="${count}"`
        : ''
    parts.push(
      `<section${buildClassAttr(['nyoze-blank-page', ...extraClasses])}${dataAttrs} aria-hidden="true"></section>`,
    )
  }
  return htmlPart(parts.join(''))
}

function isUnsupportedExportBlock(node: PMNode): boolean {
  return node.type.name === 'html_block_atom'
}

function serializeUnsupportedBlock(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  if (isUnsupportedExportBlock(node)) {
    return serializeRawHtmlBlock(ctx, node, extraClasses)
  }
  if (node.isTextblock) {
    pushWarning(ctx, {
      code: 'unsupported-node',
      message: `Unsupported block node "${node.type.name}" was exported as a plain paragraph`,
      nodeType: node.type.name,
    })
    return concatTemplateParts(
      htmlPart(`<p${buildClassAttr(extraClasses)}>`),
      serializeInlineFragment(ctx, node.content),
      htmlPart('</p>'),
    )
  }
  if (node.content.childCount > 0) {
    pushWarning(ctx, {
      code: 'unsupported-node',
      message: `Unsupported block node "${node.type.name}" was exported as plain content only`,
      nodeType: node.type.name,
    })
    return concatTemplateParts(
      htmlPart(`<div${buildClassAttr(extraClasses)}>`),
      serializeChildBlocks(ctx, node),
      htmlPart('</div>'),
    )
  }
  const text = node.textContent
  pushWarning(ctx, {
    code: 'unsupported-node',
    message: `Unsupported block node "${node.type.name}" was exported as text content only`,
    nodeType: node.type.name,
  })
  return text ? htmlPart(`<div${buildClassAttr(extraClasses)}>${escapeHtmlText(text)}</div>`) : EMPTY_HTML
}

function serializeBlock(ctx: ExportContext, node: PMNode, extraClasses: readonly string[] = []): Html {
  switch (node.type.name) {
    case 'paragraph':
      return serializeParagraphNode(ctx, node, extraClasses)
    case 'heading':
      return serializeHeading(ctx, node, extraClasses)
    case 'horizontalRule':
      return htmlPart(`<hr${buildClassAttr(extraClasses)}>`)
    case 'blockquote':
      return concatTemplateParts(
        htmlPart(`<blockquote${buildClassAttr(extraClasses)}>`),
        serializeChildBlocks(ctx, node),
        htmlPart('</blockquote>'),
      )
    case 'codeBlock':
      return serializeCodeBlock(node, extraClasses)
    case 'bulletList':
      return serializeBulletList(ctx, node, extraClasses)
    case 'orderedList':
      return serializeOrderedList(ctx, node, extraClasses)
    case NYOZE_DIRECTIVE_NODE_NAME:
      return serializeDirectiveBlock(ctx, node, extraClasses)
    case NYOZE_PAGE_BREAK_NODE_NAME:
      return ctx.options.pageBreak ? serializeNestedPageBreak(extraClasses) : EMPTY_HTML
    case NYOZE_BLANK_PAGE_NODE_NAME: {
      const count = (node.attrs.count as number) ?? 1
      return serializeBlankPageSections(ctx, count, extraClasses)
    }
    case 'noteAnchor':
      return EMPTY_HTML
    case 'nyoze_image':
      return serializeImage(ctx, node, extraClasses)
    default:
      return serializeUnsupportedBlock(ctx, node, extraClasses)
  }
}

/**
 * `pageBreakBeforeHeading` が有効なとき、top-level heading の直前に自動で
 * 改ページ class を付けるべきか判定する。既存 LeME / でんでん export と同じ
 * semantics（`lemeMarkdownExport.ts` の同名関数を参照）。
 */
function shouldInsertAutoPageBreakBeforeHeading(
  ctx: ExportContext,
  hasPrecedingBlock: boolean,
  headingLevel: number,
): boolean {
  if (!ctx.options.pageBreakBeforeHeading || !ctx.options.pageBreak) return false
  if (headingLevel > ctx.options.pageBreakBeforeHeadingMaxLevel) return false
  return hasPrecedingBlock
}

/**
 * `serializeTopLevelDoc` の章ファイル情報挿入に使う、doc.content 内の位置
 * （`HtmlChapterInfo.index`）でソート済みの読み取り専用ビュー。空配列の場合は
 * `null` にして呼び出し側の分岐を単純にする。
 */
function sortChapterInfosByIndex(
  chapterInfos: readonly HtmlChapterInfo[] | undefined,
): readonly HtmlChapterInfo[] | null {
  if (!chapterInfos || chapterInfos.length === 0) return null
  return [...chapterInfos].sort((a, b) => a.index - b.index)
}

/**
 * top-level index（`chapterStartIndices` 空間）から、その位置が属する章の
 * 0-based ordinal を求める。`WebBookAssetRequest.origin` の `chapterId` に
 * そのまま文字列化して使う（`bookExportOperation.ts` 側の `chapters` 配列と
 * 同じ順序・同じ index 空間）。
 */
function resolveChapterOrdinalForTopLevelIndex(
  starts: readonly number[],
  topLevelIndex: number,
): number {
  let chapter = 0
  for (let i = 0; i < starts.length; i++) {
    if (topLevelIndex >= starts[i]) chapter = i
    else break
  }
  return chapter
}

function isTrivialEmptyParagraphHtml(html: Html): boolean {
  return html.length === 1 && html[0].kind === 'html' && html[0].value === EMPTY_PARAGRAPH_HTML
}

function serializeTopLevelDoc(
  ctx: ExportContext,
  doc: PMNode,
  chapterInfos: readonly HtmlChapterInfo[] | undefined,
  showRoleLabels: boolean,
  chapterStartIndices: readonly number[] | undefined,
): Html {
  const rendered: Html[] = []
  const topLevelBlocks: PMNode[] = []
  doc.forEach((child) => topLevelBlocks.push(child))
  const normalized = normalizeTopLevelPageBreaks(topLevelBlocks)

  const sortedChapterInfos = sortChapterInfosByIndex(chapterInfos)

  // WB-IMG-1: top-level index → node の Map。asset origin（章境界）と、既存の
  // 章ファイル情報挿入位置の両方に使う（参照 identity で 2 つのパスを結ぶ、
  // `ctx.headingIds` と同じパターン）。どちらか一方でも指定されていれば構築する
  // （`chapterInfos` だけを渡す単独文書向け呼び出しの既存挙動を壊さない）。
  const hasChapterBoundary = Boolean(chapterStartIndices && chapterStartIndices.length > 0)
  const topLevelNodeIndex =
    hasChapterBoundary || sortedChapterInfos
      ? new Map(topLevelBlocks.map((node, i) => [node, i] as const))
      : null
  if (!hasChapterBoundary) {
    ctx.currentAssetOrigin = { kind: 'active-document' }
  }
  let chapterInfoPtr = 0

  // blank-page 自身がすでに独立した固定ページのため、直後の content block の
  // 明示 page-break 由来 breakBefore はここで 1 回だけ抑止する
  // (lemeMarkdownExport.ts / dendenMarkdownExport.ts と同じ方針)。
  let suppressNextBreakBefore = false

  normalized.forEach((block, index) => {
    if (block.kind === 'blankPage') {
      rendered.push(serializeBlankPageSections(ctx, block.count))
      suppressNextBreakBefore = true
      return
    }

    const { node, breakBefore } = block

    if (topLevelNodeIndex && chapterStartIndices) {
      const originIndex = topLevelNodeIndex.get(node)
      if (originIndex !== undefined) {
        ctx.currentAssetOrigin = {
          kind: 'book-chapter',
          chapterId: String(resolveChapterOrdinalForTopLevelIndex(chapterStartIndices, originIndex)),
        }
      }
    }

    const autoHeadingBreak =
      !breakBefore &&
      node.type.name === 'heading' &&
      shouldInsertAutoPageBreakBeforeHeading(
        ctx,
        index > 0,
        clampHeadingLevel((node.attrs.level as number) ?? 1),
      )
    const shouldBreak =
      (breakBefore || autoHeadingBreak) && !suppressNextBreakBefore && ctx.options.pageBreak
    suppressNextBreakBefore = false

    // 章ファイル情報: この block が、まだ挿入していない章の開始位置（またはそれ以降）に
    // 到達していたら、その章の情報 block をこの block の直前へ挿む。改ページ class
    // (`nyoze-break-before-page`) は、最初に非空の章情報 block が生成された時点で
    // そちらへ移し、章本文側の block には二重に付けない（章情報 block が省略される
    // 場合は従来どおり章本文側の block に残る）。
    let chapterInfoHtml = ''
    let pendingBreakClasses = shouldBreak ? ['nyoze-break-before-page'] : []
    const originalIndex = topLevelNodeIndex?.get(node)
    if (sortedChapterInfos && topLevelNodeIndex && originalIndex !== undefined) {
      while (
        chapterInfoPtr < sortedChapterInfos.length &&
        sortedChapterInfos[chapterInfoPtr].index <= originalIndex
      ) {
        const info = sortedChapterInfos[chapterInfoPtr]
        chapterInfoPtr++
        const infoHtml = buildChapterInfoHtml(info, showRoleLabels, pendingBreakClasses)
        if (infoHtml.length > 0) {
          chapterInfoHtml += infoHtml
          pendingBreakClasses = []
        }
      }
    }

    const html = serializeBlock(ctx, node, pendingBreakClasses)
    if (chapterInfoHtml.length > 0 || html.length > 0) {
      rendered.push(concatTemplateParts(htmlPart(chapterInfoHtml), html))
    }
  })

  while (rendered.length > 0 && isTrivialEmptyParagraphHtml(rendered[rendered.length - 1])) {
    rendered.pop()
  }

  return concatTemplateParts(...rendered)
}

/** 役割ラベル ON 時の著者行 prefix（全角スペース1。コロンは使わない）。 */
const DOCUMENT_AUTHOR_ROLE_LABEL = '著　'
/** 役割ラベル ON 時の訳者行 prefix（全角スペース1。コロンは使わない）。 */
const DOCUMENT_TRANSLATOR_ROLE_LABEL = '訳　'

/**
 * `documentInfoTitlePage: true` のときだけ渡される簡易表紙の表示指定。
 * enum 2 値だけを持ち、raw CSS / font family / 任意文字列は受け取らない。
 */
type DocumentInfoTitlePageConfig = {
  writingMode: DocumentInfoTitlePageWritingMode
  layout: DocumentInfoTitlePageLayout
}

function buildDocumentInfoHtml(
  info: HtmlDocumentInfo | undefined,
  showRoleLabels: boolean,
  breakAfter = false,
  titlePage: DocumentInfoTitlePageConfig | null = null,
): string {
  if (!info) return ''
  const title = (info.title ?? '').trim()
  const author = (info.author ?? '').trim()
  const translator = (info.translator ?? '').trim()
  if (!title && !author && !translator) return ''

  const classes = ['nyoze-document-info']
  if (titlePage) classes.push('nyoze-document-info--title-page')
  if (breakAfter) classes.push('nyoze-break-after-page')
  const titlePageAttrs = titlePage
    ? ` data-nyoze-title-page-writing-mode="${titlePage.writingMode}" data-nyoze-title-page-layout="${titlePage.layout}"`
    : ''
  const titleHtml = title
    ? `<h1 class="nyoze-document-title">${escapeHtmlText(title)}</h1>`
    : ''
  const creditParts: string[] = []
  if (author) {
    const label = showRoleLabels ? DOCUMENT_AUTHOR_ROLE_LABEL : ''
    creditParts.push(`<p class="nyoze-document-credit">${label}${escapeHtmlText(author)}</p>`)
  }
  if (translator) {
    const label = showRoleLabels ? DOCUMENT_TRANSLATOR_ROLE_LABEL : ''
    creditParts.push(`<p class="nyoze-document-credit">${label}${escapeHtmlText(translator)}</p>`)
  }

  const parts: string[] = [`<section${buildClassAttr(classes)}${titlePageAttrs}>`]
  if (titlePage) {
    // Tategaki の frontmatter 独立ページと同じく「タイトル群」と「著者・訳者群」を
    // 別 group にする。空の group は出さない（空 group が spacing を占有しない）。
    parts.push('<div class="nyoze-document-info-group">')
    if (titleHtml) {
      parts.push(`<div class="nyoze-document-info-title-group">${titleHtml}</div>`)
    }
    if (creditParts.length > 0) {
      parts.push(`<div class="nyoze-document-info-credit-group">${creditParts.join('')}</div>`)
    }
    parts.push('</div>')
  } else {
    if (titleHtml) parts.push(titleHtml)
    parts.push(...creditParts)
  }
  parts.push('</section>')
  return parts.join('')
}

/**
 * 章ファイル情報ブロック（`includeChapterInfo: true`）を、Book 全体 document
 * info（`buildDocumentInfoHtml`）と区別できる、少し控えめな見た目の markup で
 * 組み立てる。title / authors / translators の順で表示し、空項目（trim 後）は
 * 個別に省略する。3 つとも空なら section 自体を出さない。すべて
 * `escapeHtmlText` で escape するため、`info` 経由で HTML を注入できない。
 *
 * `authors` / `translators` は配列順を保持したまま `、` で連結する（Book
 * metadata の複数著者・複数訳者をそのまま並べる）。`showRoleLabels` の扱いは
 * `buildDocumentInfoHtml` と同じ（`true`: 著/訳 + 全角スペースを前置、`false`: 名前だけ）。
 *
 * `extraClasses` は章境界の `nyoze-break-before-page` を、章本文の最初の block
 * ではなくこの section 自身に付けるために使う（呼び出し側 `serializeTopLevelDoc`
 * 参照）。`breakAfterDocumentInfo` は章ファイル情報には適用しない。
 */
function buildChapterInfoHtml(
  info: HtmlChapterInfo,
  showRoleLabels: boolean,
  extraClasses: readonly string[] = [],
): string {
  const title = (info.title ?? '').trim()
  const authors = (info.authors ?? []).map((author) => author.trim()).filter((author) => author.length > 0)
  const translators = (info.translators ?? [])
    .map((translator) => translator.trim())
    .filter((translator) => translator.length > 0)
  if (!title && authors.length === 0 && translators.length === 0) return ''

  const parts: string[] = [`<section${buildClassAttr(['nyoze-chapter-info', ...extraClasses])}>`]
  if (title) parts.push(`<h1 class="nyoze-chapter-title">${escapeHtmlText(title)}</h1>`)
  if (authors.length > 0) {
    const label = showRoleLabels ? DOCUMENT_AUTHOR_ROLE_LABEL : ''
    parts.push(`<p class="nyoze-chapter-credit">${label}${escapeHtmlText(authors.join('、'))}</p>`)
  }
  if (translators.length > 0) {
    const label = showRoleLabels ? DOCUMENT_TRANSLATOR_ROLE_LABEL : ''
    parts.push(`<p class="nyoze-chapter-credit">${label}${escapeHtmlText(translators.join('、'))}</p>`)
  }
  parts.push('</section>')
  return parts.join('')
}

type TocEntry = { level: number; id: string; text: string }

/**
 * heading テキストから HTML id を組み立てる。空白は `-` へ、id / href の
 * round-trip を壊しうる文字（`"` `'` `<` `>` `&` `#`）は取り除く。結果が
 * 空文字列になる場合（記号のみの見出し等）は `section` にフォールバックする。
 * `heading-` を常に前置し、id が数字や記号だけで始まらないようにする。
 */
function slugifyHeadingText(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, '-').replace(/["'<>&#]/g, '')
  return cleaned || 'section'
}

/**
 * 同名（同一 slug）の heading が複数あるとき、2 件目以降に `-2` `-3` ... の
 * suffix を付けて id の重複を避ける。`usedCounts` は 1 回の走査内でだけ状態を持つ。
 * `prefix` があるとき（Web Book Book 全体）は `wb-c{n}-heading-...` 形式。
 */
function generateHeadingId(text: string, usedCounts: Map<string, number>, prefix = ''): string {
  const base = `${prefix}heading-${slugifyHeadingText(text)}`
  const count = usedCounts.get(base) ?? 0
  usedCounts.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

/**
 * doc 内の heading (h1〜h6) を出現順に走査し、TOC entry と heading→id の
 * 対応（`headingIds`、参照 identity をキーにする）を組み立てる。空 heading
 * （trim 後のテキストが空）は TOC から除外し、id も割り当てない。
 * TOC 対象外 level（`maxLevel` 超）は TOC にも id にも載せない（standalone HTML 互換）。
 */
function collectHeadingTocEntries(
  doc: PMNode,
  headingIds: Map<PMNode, string>,
  maxLevel: number,
): TocEntry[] {
  const entries: TocEntry[] = []
  const usedCounts = new Map<string, number>()
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!text) return true
    const level = clampHeadingLevel((node.attrs.level as number) ?? 1)
    if (level > maxLevel) return true
    const id = generateHeadingId(text, usedCounts)
    headingIds.set(node, id)
    entries.push({ level, id, text })
    return true
  })
  return entries
}

/**
 * Web Book: 非空 h1〜h6 すべてに決定的な id を付ける（TOC option と独立）。
 * `chapterStartIndices` があるときは doc.content 上の top-level index を章境界と
 * 照合し、`wb-c{n}-heading-...` 形式の namespace にする。
 */
function assignWebBookHeadingIds(
  doc: PMNode,
  headingIds: Map<PMNode, string>,
  chapterStartIndices: readonly number[] | undefined,
): void {
  const usedCounts = new Map<string, number>()
  const starts = chapterStartIndices ? [...chapterStartIndices].sort((a, b) => a - b) : null

  const chapterPrefixForTopLevelIndex = (topLevelIndex: number): string => {
    if (!starts || starts.length === 0) return ''
    let chapter = 1
    for (let i = 0; i < starts.length; i++) {
      if (topLevelIndex >= starts[i]) chapter = i + 1
      else break
    }
    return `wb-c${chapter}-`
  }

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!text) return true
    const topLevelIndex = doc.resolve(pos).index(0)
    const idPrefix = chapterPrefixForTopLevelIndex(topLevelIndex)
    const id = generateHeadingId(text, usedCounts, idPrefix)
    headingIds.set(node, id)
    return true
  })
}

/**
 * TOC 用に Web Book ですでに割り当てた headingIds から、maxLevel 以内の entry を集める。
 */
function collectTocEntriesFromAssignedIds(
  doc: PMNode,
  headingIds: Map<PMNode, string>,
  maxLevel: number,
): TocEntry[] {
  const entries: TocEntry[] = []
  doc.descendants((node) => {
    if (node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!text) return true
    const level = clampHeadingLevel((node.attrs.level as number) ?? 1)
    if (level > maxLevel) return true
    const id = headingIds.get(node)
    if (!id) return true
    entries.push({ level, id, text })
    return true
  })
  return entries
}

/**
 * 目次 nav を組み立てる（`includeTableOfContents: true` かつ heading が
 * 1 つ以上あるときだけ、呼び出し側で条件付き呼び出しする）。ネストした
 * `<ol>` は作らず、flat list + `nyoze-toc-level-N` class で階層を表す。
 */
function buildTocHtml(entries: readonly TocEntry[]): string {
  if (entries.length === 0) return ''
  const items = entries
    .map(
      (entry) =>
        `<li class="nyoze-toc-level-${entry.level}"><a href="#${escapeHtmlAttribute(entry.id)}">${escapeHtmlText(entry.text)}</a></li>`,
    )
    .join('')
  return `<nav class="nyoze-toc" aria-label="目次"><h2 class="nyoze-toc-title">目次</h2><ol>${items}</ol></nav>`
}

export const DEFAULT_TABLE_OF_CONTENTS_MAX_LEVEL = 6

const TABLE_OF_CONTENTS_MAX_LEVEL_MIN = 1
const TABLE_OF_CONTENTS_MAX_LEVEL_MAX = 6

/** `tableOfContentsMaxLevel` を 1〜6 に正規化する。非数値は既定 `6` へ。 */
export function resolveTableOfContentsMaxLevel(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TABLE_OF_CONTENTS_MAX_LEVEL
  }
  const rounded = Math.round(value)
  return Math.min(
    Math.max(rounded, TABLE_OF_CONTENTS_MAX_LEVEL_MIN),
    TABLE_OF_CONTENTS_MAX_LEVEL_MAX,
  )
}

export function resolveWritingMode(value: HtmlExportWritingMode | undefined): HtmlExportWritingMode {
  return value === 'horizontal-tb' ? 'horizontal-tb' : 'vertical-rl'
}

/**
 * Shared semantic main content for standalone HTML and Web Book shells.
 * Does not wrap `<!doctype>` / print toolbar / Web Book chrome.
 */
export type HtmlSemanticVariant = 'standalone' | 'web-book'

export type HtmlSemanticPolicy = {
  variant: HtmlSemanticVariant
  /** Book Web Book only: top-level child indices of each chapter's first node. */
  chapterStartIndices?: readonly number[]
  /**
   * WB-R12: Web Book open-time auto TCY snapshot。
   * `variant === 'web-book'` かつ `enabled === true` のときだけ text 分割に使う。
   * standalone / 未指定 / disabled では通常 text のまま。
   */
  autoTcy?: WebBookAutoTcySnapshot | null
}

export type HtmlSemanticMainContent = {
  /**
   * Template artifact: ordered literal HTML parts + asset holes. For
   * `variant: 'standalone'` this never contains asset holes (legacy
   * pass-through image handling). For `variant: 'web-book'`, resolve
   * `assetRequests` first and pass the result to `materializeWebBookTemplate`
   * (see `webBookAssetPlan.ts`) to get the final HTML string.
   */
  template: readonly HtmlTemplatePart[]
  /** WB-IMG-1 asset requests collected while serializing (`web-book` variant only; always empty for `standalone`). */
  assetRequests: readonly WebBookAssetRequest[]
  warnings: HtmlExportWarning[]
}

export function buildHtmlSemanticMainContent(
  doc: PMNode,
  options: HtmlExportOptions | undefined,
  policy: HtmlSemanticPolicy,
): HtmlSemanticMainContent {
  const includeTableOfContents = options?.includeTableOfContents === true
  const tableOfContentsMaxLevel = resolveTableOfContentsMaxLevel(options?.tableOfContentsMaxLevel)
  const blankPageVariant = policy.variant === 'web-book' ? 'web-book' : 'standalone'

  let headingIds: Map<PMNode, string> | null = null
  let tocEntries: TocEntry[] = []

  if (policy.variant === 'web-book') {
    headingIds = new Map()
    assignWebBookHeadingIds(doc, headingIds, policy.chapterStartIndices)
    tocEntries = includeTableOfContents
      ? collectTocEntriesFromAssignedIds(doc, headingIds, tableOfContentsMaxLevel)
      : []
  } else if (includeTableOfContents) {
    headingIds = new Map()
    tocEntries = collectHeadingTocEntries(doc, headingIds, tableOfContentsMaxLevel)
  }

  const ctx: ExportContext = {
    warnings: [],
    options: resolveExternalExportOptions(options),
    headingIds,
    blankPageVariant,
    variant: policy.variant,
    autoTcy:
      policy.variant === 'web-book' && policy.autoTcy?.enabled === true
        ? policy.autoTcy
        : null,
    assetRequests: [],
    nextAssetRefId: createWebBookAssetRefIdGenerator(),
    currentAssetOrigin: { kind: 'active-document' },
  }

  const showRoleLabels = options?.showRoleLabels !== false
  const includeDocumentInfo = options?.includeDocumentInfo === true
  const documentInfoTitlePage = options?.documentInfoTitlePage === true
  // 簡易表紙は常に独立ページ: title page ON では breakAfterDocumentInfo の値に
  // 関わらず section 直後の改ページを有効にする。
  const breakAfterDocumentInfo = documentInfoTitlePage || options?.breakAfterDocumentInfo === true
  const titlePageConfig = documentInfoTitlePage
    ? {
        writingMode: resolveDocumentInfoTitlePageWritingMode(
          options?.documentInfoTitlePageWritingMode,
        ),
        layout: resolveDocumentInfoTitlePageLayout(options?.documentInfoTitlePageLayout),
      }
    : null
  const documentInfoHtml = includeDocumentInfo
    ? buildDocumentInfoHtml(
        options?.documentInfo,
        showRoleLabels,
        breakAfterDocumentInfo,
        titlePageConfig,
      )
    : ''
  const tocHtml = includeTableOfContents ? buildTocHtml(tocEntries) : ''
  const includeChapterInfo = options?.includeChapterInfo === true
  const chapterInfos = includeChapterInfo ? options?.chapterInfos : undefined
  const bodyHtml = serializeTopLevelDoc(ctx, doc, chapterInfos, showRoleLabels, policy.chapterStartIndices)

  return {
    template: concatTemplateParts(htmlPart(documentInfoHtml), htmlPart(tocHtml), bodyHtml),
    assetRequests: ctx.assetRequests,
    warnings: ctx.warnings,
  }
}
