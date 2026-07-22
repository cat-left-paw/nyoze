import type { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model'
import { encodeAozoraInlineNode } from '../io/clipboardSlicePlainText'
import {
  chooseCodeFence,
  escapeMarkdownBracketText,
  escapeMarkdownTitle,
  escapeMarkdownUrlDestination,
} from '../io/markdownEscaping'
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
import { applyExportAutoTcyToText } from './exportAutoTcy'
import type { BookExportBookInfo, BookExportChapterInfo } from './bookExportMetadata'

/**
 * でんでんコンバーター向け Markdown export の pure converter。
 *
 * 入力は ProseMirror `doc`。Markdown 文字列を再 parse せず、通常 Markdown 保存
 * 経路も呼ばない。React / Electron / fs に依存しない純粋関数。
 *
 * でんでん v1 の中心:
 *   - ルビ (`aozoraRuby`)    → でんでん形式 `{親文字|ルビ}`
 *     - 親文字 / ルビに `{` `}` `|` を含む場合は青空文庫形式へ fallback + warning
 *   - 明示 TCY (`aozoraTcy`) → `^...^`
 *   - hardBreak               → 物理改行 `\n`（`<br />` にしない）。GFM table 風
 *                                paragraph（table node がないため paragraph +
 *                                hardBreak として保持される）もこの物理改行の
 *                                おかげでそのまま table として通るため、LeME の
 *                                ような専用検出ロジックは不要
 *   - bold                    → Markdown `**...**`
 *   - italic                  → 実機確認（2026-07-02）により HTML `<i>...</i>` で
 *                                表示できることが判明したため `<i>` へ変更
 *                                （旧方針: `*...*` / `_..._` が圏点 / 傍点になるため
 *                                本文のみ + italic-dropped warning。撤回）
 *   - bold + italic           → 実機確認済みの `<i>**...**</i>` へ変更（italic が
 *                                外側）。`***...***` は出さない
 *                                （旧方針: bold へ丸め + bold-italic-downgraded
 *                                warning。撤回）
 *   - strike                  → 実機確認済みの HTML `<s>...</s>`
 *   - highlight                → HTML `<mark>...</mark>`
 *   - underline (`||...||`)   → HTML `<u>...</u>`
 *   - inline code               → Markdown backtick（内容中の最長 backtick run より
 *                                長い fence）
 *   - link                     → Markdown link `[text](dest)` / `[text](dest "title")`
 *                                として保持（通常 Markdown 保存と同じ escape
 *                                helper）。link text 内の bold / italic / ruby /
 *                                TCY などの inline 変換も、mark 境界を跨いで
 *                                連続していれば保持される
 *   - heading                 → Markdown `#`〜`######`
 *   - horizontalRule          → `---`
 *   - blockquote              → 各行に `> ` を付ける Markdown 引用（内部 inline
 *                                変換は維持。bold / italic / strike / highlight /
 *                                link / code すべてそのまま反映される）
 *   - codeBlock                → fenced code block（language 維持、本文中の最長
 *                                backtick run より長い fence で衝突回避）
 *   - bulletList / orderedList → Markdown list（`- item` / `N. item`。
 *                                `orderedList.attrs.start` があれば開始番号に
 *                                使う）。task item（`checked` 属性あり）は
 *                                `[ ]` / `[x]` を出さず通常 bullet item へ降格
 *                                + warning
 *   - image (`nyoze_image`)   → Markdown image syntax `![alt](src)` /
 *                                `![alt](src "title")` へ復元（通常 Markdown 保存
 *                                と同じ escape helper。画像ファイルのコピーや
 *                                export 先に合わせた path rebasing はせず、
 *                                保存済み `src` をそのまま使う。`nyoze-img://`
 *                                表示用 URL は出力しない。warning なし）
 *   - `:::align-center`      → `<div class="text-center" markdown="1">...</div>`
 *   - `:::align-end`         → `<div class="text-right" markdown="1">...</div>`
 *                                （heading child も div の中に Markdown heading の
 *                                まま残す。実機確認で問題なかったため、LeME の
 *                                ように `<hN>` へ抽出はしない）
 *   - `:::indent-N`          → `<div style="padding-top:Nem;" markdown="1">...</div>`
 *                                （縦書き前提。横書き向け `padding-left` 切替は
 *                                未対応。全角スペース prefix は折り返し行に
 *                                効かないため不採用。LeME と同じく開始タグ直後に
 *                                空行を入れ、wrapper 内最初の段落も Markdown と
 *                                して解釈されるようにする。warning なし）
 *   - `:::style-*`           → 中身のみ + warning
 *   - `:::page-break`        → `<div style="page-break-before:always;"></div>`
 *                                （でんでんの text-center / text-right のような専用
 *                                helper class は改ページ向けには確認できていない
 *                                ため、LeME と同じ inline style 付き空 div を使う。
 *                                warning なし。page-break 固有の実機確認は未実施）
 *   - `:::blank-page` / `:::blank-page-N` (`nyozeBlankPage`) → count 個の
 *                                `<div style="page-break-before:always;page-break-after:always;">&#160;</div>`
 *                                （LeME と同じ近似。`approximate-node` warning 付き。
 *                                詳細は下記コメント参照）
 *
 * Slice B（2026-07 page-break RenderModel 正規化）:
 *   - top-level の `:::page-break` は `pageBreakRenderModel.ts` の
 *     `normalizeTopLevelPageBreaks()` を経由してから serialize する。出力記法
 *     自体は変えず、「いつ・何回出すか」の判定だけを normalize 済み
 *     pending break に寄せる（LeME と同じ方針。詳細は lemeMarkdownExport.ts
 *     冒頭コメント参照）。
 *   - 見出し前改ページレベル設定（2026-07）: `pageBreakBeforeHeadingMaxLevel`
 *     （既定 `6`）で自動改ページの対象見出しレベルを絞れる。既定値は現行互換
 *     （h1〜h6 すべて対象）。normalize 由来の `breakBefore` には影響しない。
 *
 * `nyozeBlankPage`（`:::blank-page` / `:::blank-page-N`）の外部 export 対応
 * （2026-07）: LeME と同じ方針（`lemeMarkdownExport.ts` 冒頭コメント参照）。
 *   - `normalizeTopLevelPageBreaks()` は top-level `nyozeBlankPage` を
 *     `{ kind: 'blankPage'; count }` として返す。1 個の空白ページを
 *     `page-break-before` / `page-break-after` を両方持つ空 `<div>`
 *     （XHTML/XML で安全な数値文字参照 `&#160;` 入り）として近似し、
 *     count 個ぶん連続して出す。named entity `&nbsp;` は でんでんの
 *     HTML parser で未定義 entity になり得るため使わない。
 *   - `pageBreak: false` は明示 `:::page-break` と見出し前自動改ページだけを
 *     抑止する option であり、`nyozeBlankPage` はユーザーが明示した固定の
 *     空白ページなので `pageBreak` の値に関係なく常に出力する。
 *   - blank-page の末尾 div がすでに「次を新しいページから始める」効果を
 *     持つため、直後の content block の明示 page-break 由来 `breakBefore` は
 *     `serializeTopLevelDoc` 内の一時 flag（`suppressNextBreakBefore`）で
 *     1 回だけ抑止し、page-break div を重複させない。
 *   - nested blank-page はこの重複回避の対象外（nested page-break と同様、
 *     top-level normalize の対象外）。
 *   - top-level block        → 原則 `\n\n`（空行）区切り
 *   - 空 paragraph           → `<p><br /></p>`（でんでん側で空行が畳まれて見た目の空きが
 *                              消えるのを防ぐ。末尾の空 paragraph は出力しない）
 *   - noteAnchor / 付箋本文   → 出力しない
 *   - table / 数式 / 脚注 / raw HTML（ユーザー入力由来）→ 構造保持せず
 *                                textContent のみ + warning（table は Nyoze の
 *                                schema に専用 node がなく、そもそも paragraph
 *                                として解釈される。GFM table 風 paragraph は
 *                                上記 hardBreak の物理改行によりそのまま通る）
 *
 * Book 全体 export 専用の作品情報 / 章ファイル情報表示（2026-07-08、pure
 * conversion のみ。UI / IPC は未接続）: LeME と同じ方針
 * （`lemeMarkdownExport.ts` 冒頭コメント参照）。`includeBookInfo` / `bookInfo` /
 * `includeChapterInfo` / `chapterInfos` / `showRoleLabels` は Book 全体 export
 * （`bookExportConversion.ts`）専用の option で、active document export では
 * 常に無視される。metadata 本体はこの converter 自身が読み書きせず、呼び出し側
 * が Book manifest 由来の値をすでに組み立てて渡すだけ。作品情報は Book 全体の
 * 先頭に一度だけ `# title` 見出し + 著者行、章ファイル情報は各章の先頭に
 * `## 章タイトル` 見出し + 著者/訳者行という Markdown で出す。どちらも `doc` の
 * top-level 走査には加わらない独立した文字列として合成するため、
 * `pageBreakBeforeHeading` の見出し前自動改ページ判定には一切影響しない。
 * 章境界の page-break は、章ファイル情報が非空で挿入される章ではその直前へ
 * 移る（章本文側には二重に付かない）。著者・訳者行は地付き（横書きでは右寄せ）
 * で出す。`:::align-end` と同じ `wrapHelperDiv('text-right', ...)` を再利用し、
 * 著者行・訳者行を個別の div で包む（title 見出しは包まない）。ブロック末尾には
 * 本文との間に約3行分の余白を持たせるため `<p><br /></p>` を3つ追加する
 * （LeME と同じ理由。`lemeMarkdownExport.ts` 冒頭コメント参照）。
 */

export type DendenMarkdownExportWarningCode =
  | 'unsupported-node'
  | 'unsupported-mark'
  | 'unsupported-style-directive'
  | 'unsupported-directive'
  | 'approximate-node'
  | 'ruby-fallback'
  // 実機確認（2026-07-02）により italic / bold+italic はどちらも表示できることが
  // 判明したため、この2つの warning code はもう発生しない。将来互換のため type
  // からは削除しないが、`emitUnsupportedMarks` などから push されることはない。
  | 'italic-dropped'
  | 'bold-italic-downgraded'

export type DendenMarkdownExportWarning = {
  code: DendenMarkdownExportWarningCode
  message: string
  nodeType?: string
  markType?: string
  directive?: string
}

export type DendenMarkdownExportResult = {
  text: string
  warnings: DendenMarkdownExportWarning[]
}

/**
 * 外部 export 共通の pure options model (`externalExportOptions.ts`) を でんでん
 * 向けの公開名で再輸出したものに、Book 全体 export 専用の作品情報 / 章ファイル
 * 情報表示 option（ファイル冒頭コメント参照）を追加したもの。`ExternalExportOptions`
 * 由来のフィールドは共有 `ExternalExportOptions` と同一で、省略時の既定値は
 * 現行挙動と完全に一致する（`resolveExternalExportOptions` 参照）。追加分の
 * option も省略時（`includeBookInfo` / `includeChapterInfo` とも既定 `false`）は
 * 現行挙動と完全一致する。
 */
export type DendenMarkdownExportOptions = ExternalExportOptions & {
  /** Book 全体の先頭に一度だけ作品情報を表示するか。既定 `false`。 */
  includeBookInfo?: boolean
  /** `includeBookInfo: true` のときに使う、Book 全体の title / author。 */
  bookInfo?: BookExportBookInfo
  /** 各章ファイルの先頭に章ファイル情報を表示するか。既定 `false`。 */
  includeChapterInfo?: boolean
  /** `includeChapterInfo: true` のときに使う、章ごとの metadata。 */
  chapterInfos?: readonly BookExportChapterInfo[]
  /** 著者・訳者行に「著: 」「訳: 」の役割ラベルを表示するか。既定 `true`。 */
  showRoleLabels?: boolean
  /**
   * 単独文書 export の先頭に一度だけ文書情報（title / author /
   * translator）を表示するか。既定 `false`。Book 全体の `includeBookInfo` とは
   * 別 field（出所が異なるため）。値は hook 層が解決して渡す。
   */
  includeDocumentInfo?: boolean
  /** `includeDocumentInfo: true` のときに使う、単独文書 metadata（title / author / translator）。 */
  documentInfo?: BookExportBookInfo
}

const SUPPORTED_MARK_NAMES = new Set(['bold', 'italic', 'strike', 'highlight', 'underline', 'code', 'link'])

// link はでんでん側でも Markdown link のまま表示できるため最も外側、code は
// 中身を literal にする都合上、diff ロジックには参加させず別扱いにする
// （下記 `applyMarksAndEmit` 参照）。
const MARK_PRIORITY: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  highlight: 4,
  underline: 5,
  code: 6,
}

type ExportContext = {
  warnings: DendenMarkdownExportWarning[]
  options: ResolvedExternalExportOptions
}

/** 1 paragraph / heading / blockquote 行など、1回の inline fragment 直列化の間
 *  だけ生存する mark stack。paragraph をまたいで共有しない。 */
type MarkStackState = {
  activeMarks: Mark[]
}

function pushWarning(
  ctx: ExportContext,
  warning: DendenMarkdownExportWarning,
): void {
  ctx.warnings.push(warning)
}

function markPriority(mark: Mark): number {
  return MARK_PRIORITY[mark.type.name] ?? 99
}

function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => markPriority(a) - markPriority(b))
}

/**
 * bold + italic が同時に新規で開始される（どちらも直前まで非アクティブだった）
 * 場合だけ、この2つの相対順序を入れ替えて italic を外側にする。
 *
 * 実機確認（2026-07-02）により、でんでんは `<i>**text**</i>`（italic が外側）
 * を bold+italic として正しく表示する。一方、bold が先に単独で開始し、その
 * 内側の一部だけに italic が追加されるケース（`**太字の中に*斜体*を含む**`）
 * では、bold の open/close を段落全体で1回だけに保つため、bold を外側のまま
 * 継続させ italic だけを内側で開閉する必要がある。そのため優先順位テーブル
 * 自体は bold(1) < italic(2) のまま保ち、"両方が同時に新規で開く" 差分
 * （`toOpen` 配列）に対してだけ、この関数で局所的に順序を入れ替える。
 */
function reorderFreshBoldItalic(marksToOpen: Mark[]): Mark[] {
  const boldIndex = marksToOpen.findIndex((m) => m.type.name === 'bold')
  const italicIndex = marksToOpen.findIndex((m) => m.type.name === 'italic')
  if (boldIndex === -1 || italicIndex === -1) return marksToOpen

  const italicMark = marksToOpen[italicIndex]
  const withoutItalic = marksToOpen.filter((_, i) => i !== italicIndex)
  const newBoldIndex = withoutItalic.findIndex((m) => m.type.name === 'bold')
  return [
    ...withoutItalic.slice(0, newBoldIndex),
    italicMark,
    ...withoutItalic.slice(newBoldIndex),
  ]
}

/** HTML tag (`<i>` / `<mark>` / `<s>`) の中に入れる plain text の最小 escape。 */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * inline code (`` ` ``) の delimiter。本文中の最長連続 backtick run より 1 つ
 * 長い fence を選び、code span が途中で閉じないようにする（LeME export の
 * `chooseInlineCodeFence` と同じ方針の同等実装）。
 */
function chooseInlineCodeFence(text: string): string {
  const matches = text.match(/`+/g)
  let longest = 0
  if (matches) {
    for (const run of matches) {
      if (run.length > longest) longest = run.length
    }
  }
  return '`'.repeat(Math.max(1, longest + 1))
}

function dendenMarkOpenDelimiter(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '**'
    case 'italic':
      return '<i>'
    case 'strike':
      return '<s>'
    case 'highlight':
      return '<mark>'
    case 'underline':
      return '<u>'
    case 'link':
      return '['
    default:
      return ''
  }
}

function dendenMarkCloseDelimiter(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '**'
    case 'italic':
      return '</i>'
    case 'strike':
      return '</s>'
    case 'highlight':
      return '</mark>'
    case 'underline':
      return '</u>'
    case 'link': {
      const href = (mark.attrs.href as string) ?? ''
      const title = mark.attrs.title as string | undefined
      const safeHref = escapeMarkdownUrlDestination(href)
      if (title) return `](${safeHref} "${escapeMarkdownTitle(title)}")`
      return `](${safeHref})`
    }
    default:
      return ''
  }
}

/**
 * inline node (ruby / tcy) 自身の marks と、全 text child に共通する marks を
 * 合成する。aozoraTextExport / lemeMarkdownExport と同じ方針。
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

function emitUnsupportedMarks(ctx: ExportContext, marks: Mark[]): void {
  for (const mark of marks) {
    if (SUPPORTED_MARK_NAMES.has(mark.type.name)) continue
    pushWarning(ctx, {
      code: 'unsupported-mark',
      message: `Unsupported mark "${mark.type.name}" was stripped during Denden Markdown export`,
      markType: mark.type.name,
    })
  }
}

function closeMarksDownTo(state: MarkStackState, keepLen: number): string {
  let out = ''
  for (let i = state.activeMarks.length - 1; i >= keepLen; i--) {
    out += dendenMarkCloseDelimiter(state.activeMarks[i])
  }
  return out
}

/**
 * `state.activeMarks` を `target` に近づける（差分だけ開閉する）。前後で共通
 * する mark（同じ位置に同じ mark が続くもの）は閉じずに保つため、bold のよう
 * に段落をまたいで続く mark の delimiter が段落全体で1回だけになる。
 * `target` は呼び出し側で `sortMarks` 済みの配列を渡すこと。
 */
function transitionMarks(state: MarkStackState, target: Mark[]): string {
  let commonLen = 0
  while (
    commonLen < state.activeMarks.length &&
    commonLen < target.length &&
    state.activeMarks[commonLen].eq(target[commonLen])
  ) {
    commonLen++
  }

  let out = closeMarksDownTo(state, commonLen)

  const toOpen = reorderFreshBoldItalic(target.slice(commonLen))
  for (const mark of toOpen) {
    out += dendenMarkOpenDelimiter(mark)
  }

  state.activeMarks = [...state.activeMarks.slice(0, commonLen), ...toOpen]
  return out
}

/**
 * 現在 `state` で開いている mark のうち、HTML tag (`<i>` / `<s>` / `<mark>`)
 * または Markdown link `[...]` の中に入る plain text かどうかを判定する。
 */
function escapeForActiveMarks(text: string, marks: Mark[]): string {
  const needsHtmlEscape = marks.some(
    (m) =>
      m.type.name === 'italic' ||
      m.type.name === 'strike' ||
      m.type.name === 'highlight' ||
      m.type.name === 'underline',
  )
  const needsBracketEscape = marks.some((m) => m.type.name === 'link')
  let result = text
  if (needsHtmlEscape) result = escapeHtmlText(result)
  if (needsBracketEscape) result = escapeMarkdownBracketText(result)
  return result
}

/**
 * text run（または ruby / tcy の encode 済み文字列）を `state` の mark stack
 * へ反映する。`code` mark が付いている場合は他の mark をすべて無視し、
 * backtick fence で包んだ literal として出す（他の mark は silent flatten
 * であり `unsupported-mark` の対象ではない。code 以外の真に未対応な mark は
 * 引き続き `emitUnsupportedMarks` で warning を出す）。
 */
function applyMarksAndEmit(
  ctx: ExportContext,
  state: MarkStackState,
  rawText: string,
  marks: Mark[],
): string {
  const sorted = sortMarks(marks)
  emitUnsupportedMarks(ctx, sorted)
  const hasCode = sorted.some((m) => m.type.name === 'code')

  if (hasCode) {
    const out = closeMarksDownTo(state, 0)
    state.activeMarks = []
    const fence = chooseInlineCodeFence(rawText)
    return `${out}${fence}${rawText}${fence}`
  }

  const supported = sorted.filter((m) => SUPPORTED_MARK_NAMES.has(m.type.name))
  const out = transitionMarks(state, supported)
  return out + escapeForActiveMarks(rawText, supported)
}

function serializeTcy(ctx: ExportContext, state: MarkStackState, node: PMNode): string {
  const encoded = `^${node.textContent}^`
  return applyMarksAndEmit(ctx, state, encoded, resolveInlineNodeMarks(node))
}

/** でんでんルビ `{親|ルビ}` として安全に出せない文字。 */
function isUnsafeForDendenRuby(value: string): boolean {
  return value.includes('{') || value.includes('}') || value.includes('|')
}

function serializeRuby(ctx: ExportContext, state: MarkStackState, node: PMNode): string {
  const base = node.textContent
  const ruby = (node.attrs.ruby as string) ?? ''
  const marks = resolveInlineNodeMarks(node)

  if (isUnsafeForDendenRuby(base) || isUnsafeForDendenRuby(ruby)) {
    // でんでん形式が壊れるため青空文庫形式へ fallback する（raw HTML は出さない）。
    pushWarning(ctx, {
      code: 'ruby-fallback',
      message:
        'Ruby base or reading contains "{", "}", or "|"; exported as Aozora-style ruby instead of Denden ruby',
      nodeType: 'aozoraRuby',
    })
    const fallback = encodeAozoraInlineNode(node)
    if (fallback === null) return applyMarksAndEmit(ctx, state, base, marks)
    return applyMarksAndEmit(ctx, state, fallback, marks)
  }

  return applyMarksAndEmit(ctx, state, `{${base}|${ruby}}`, marks)
}

/**
 * `nyoze_image` を Markdown image syntax として復元する。通常 Markdown 保存の
 * serializer と同じ escape helper を使って `![alt](src)` / `![alt](src "title")`
 * へ戻す。画像ファイルのコピーや export 先に合わせた path の rebasing はせず、
 * 保存されている `node.attrs.src` をそのまま Markdown image destination として
 * escape するだけで、`nyoze-img://` のような Nyoze 内部表示用 URL は使わない。
 */
function serializeImage(node: PMNode): string {
  const alt = (node.attrs.alt as string) ?? ''
  const src = (node.attrs.src as string) ?? ''
  const title = node.attrs.title as string | null
  const safeAlt = escapeMarkdownBracketText(alt)
  const safeSrc = escapeMarkdownUrlDestination(src)
  if (title) {
    return `![${safeAlt}](${safeSrc} "${escapeMarkdownTitle(title)}")`
  }
  return `![${safeAlt}](${safeSrc})`
}

function serializeInlineNode(ctx: ExportContext, state: MarkStackState, node: PMNode): string {
  if (node.isText) {
    const marks = [...node.marks]
    // auto TCY は通常 text にだけ `^...^` を差し込み、その後に既存の escape / mark
    // stack 処理を一度通す。明示 TCY・ruby・code/link mark は対象外（helper 側）。
    const rawText = applyExportAutoTcyToText(node.text ?? '', marks, ctx.options)
    return applyMarksAndEmit(ctx, state, rawText, marks)
  }

  switch (node.type.name) {
    case 'aozoraRuby':
      return serializeRuby(ctx, state, node)
    case 'aozoraTcy':
      return serializeTcy(ctx, state, node)
    case 'nyoze_image': {
      // 画像は inline atom として paragraph 内に出るため、基本的にこの経路を通る。
      // 画像自体は mark で装飾しないため、周辺の mark をいったん閉じる。
      const out = closeMarksDownTo(state, 0)
      state.activeMarks = []
      return out + serializeImage(node)
    }
    case 'noteAnchor': {
      const out = closeMarksDownTo(state, 0)
      state.activeMarks = []
      return out
    }
    case 'hardBreak': {
      const out = closeMarksDownTo(state, 0)
      state.activeMarks = []
      return `${out}\n`
    }
    case 'html_inline_atom': {
      pushWarning(ctx, {
        code: 'unsupported-node',
        message: 'html_inline_atom raw HTML tags were omitted during Denden Markdown export',
        nodeType: node.type.name,
      })
      const out = closeMarksDownTo(state, 0)
      state.activeMarks = []
      return out + node.textContent
    }
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
      } else {
        pushWarning(ctx, {
          code: 'unsupported-node',
          message: `Unsupported inline node "${node.type.name}" was omitted`,
          nodeType: node.type.name,
        })
      }
      return text
    }
  }
}

function serializeInlineFragment(ctx: ExportContext, fragment: Fragment): string {
  const state: MarkStackState = { activeMarks: [] }
  let result = ''
  fragment.forEach((child) => {
    result += serializeInlineNode(ctx, state, child)
  })
  result += closeMarksDownTo(state, 0)
  return result
}

/** heading の `level` 属性を表示可能な範囲 (h1〜h6) へ丸める。 */
function clampHeadingLevel(level: number): number {
  return Math.min(Math.max(level, 1), 6)
}

function serializeHeading(ctx: ExportContext, node: PMNode): string {
  const clamped = clampHeadingLevel((node.attrs.level as number) ?? 1)
  const inlineBody = serializeInlineFragment(ctx, node.content)
  return `${'#'.repeat(clamped)} ${inlineBody}`
}

function serializeParagraph(ctx: ExportContext, node: PMNode): string {
  if (node.content.size === 0) return ''
  return serializeInlineFragment(ctx, node.content)
}

/** top-level の空 paragraph (Nyoze の空行) を表す HTML。warning は出さない。 */
const EMPTY_PARAGRAPH_OUTPUT = '<p><br /></p>'

/**
 * block の child を「空行区切りの行配列」へ変換する。`:::indent-N` / blockquote /
 * list item から共有する。空 paragraph は `<p><br /></p>` に、内容のない block
 * （省略された unsupported block 等）は読み飛ばす。
 */
function serializeChildBlockLines(ctx: ExportContext, node: PMNode): string[] {
  const lines: string[] = []
  node.forEach((child) => {
    if (child.type.name === 'paragraph' && child.content.size === 0) {
      lines.push(EMPTY_PARAGRAPH_OUTPUT)
      return
    }
    const text = serializeBlock(ctx, child)
    if (text.length > 0) lines.push(text)
  })
  return lines
}

function serializeHorizontalRule(): string {
  return '---'
}

/**
 * Markdown blockquote として各行に `> ` を付ける。複数 block（blank line で
 * 分かれた paragraph 等）は空行区切りで連結してから行単位で処理するため、
 * blank line 由来の行は bare `>` になり、blockquote として壊れない。
 */
function serializeBlockquote(ctx: ExportContext, node: PMNode): string {
  const combined = serializeChildBlockLines(ctx, node).join('\n\n')
  return combined
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n')
}

/** fenced code block。language を維持し、本文中の backtick run より長い fence を選ぶ。 */
function serializeCodeBlock(node: PMNode): string {
  const lang = (node.attrs.language as string) ?? ''
  const body = node.textContent
  const fence = chooseCodeFence(body)
  const bodyWithTrailingNewline = body.endsWith('\n') ? body : `${body}\n`
  return `${fence}${lang}\n${bodyWithTrailingNewline}${fence}`
}

/**
 * task list item（`checked` 属性が `true` / `false`）は、Nyoze の schema に専用
 * `taskItem` node がなく通常の `listItem` に `checked` が乗るだけの構造。でんでん
 * v1 は task list 記法（`- [ ]` / `- [x]`）を扱わないため、通常 bullet item へ
 * 降格する。
 */
function warnTaskListItemDowngraded(ctx: ExportContext): void {
  pushWarning(ctx, {
    code: 'unsupported-node',
    message: 'Task list item was downgraded to a plain bullet list item for Denden Markdown export',
    nodeType: 'listItem',
  })
}

function serializeListItem(ctx: ExportContext, listItem: PMNode, marker: string): string {
  const checked = listItem.attrs.checked as boolean | null | undefined
  if (checked !== null && checked !== undefined) {
    warnTaskListItemDowngraded(ctx)
  }

  const lines = serializeChildBlockLines(ctx, listItem)
  const [first, ...rest] = lines
  const indent = ' '.repeat(marker.length)
  let text = `${marker}${first ?? ''}`
  for (const line of rest) {
    text += `\n${indent}${line}`
  }
  return text
}

function serializeBulletList(ctx: ExportContext, node: PMNode): string {
  const items: string[] = []
  node.forEach((listItem) => {
    items.push(serializeListItem(ctx, listItem, '- '))
  })
  return items.join('\n')
}

function serializeOrderedList(ctx: ExportContext, node: PMNode): string {
  let counter = (node.attrs.start as number) ?? 1
  const items: string[] = []
  node.forEach((listItem) => {
    items.push(serializeListItem(ctx, listItem, `${counter}. `))
    counter++
  })
  return items.join('\n')
}

function serializeDirectiveChildBlocks(ctx: ExportContext, node: PMNode): string[] {
  const lines: string[] = []
  node.forEach((child) => {
    lines.push(serializeBlock(ctx, child))
  })
  return lines
}

/** でんでんの text-align helper class で block 全体を包む。 */
function wrapHelperDiv(className: string, body: string): string {
  return `<div class="${className}" markdown="1">\n${body}\n</div>`
}

/**
 * `nyozePageBreak` を独立した空 `<div>` へ変換する。でんでんの公式ヘルパー
 * class（`text-center` / `text-right` 等）に改ページ向けのものは確認できて
 * いないため、LeME と同じ inline style `page-break-before:always` を使う。
 * page-break 固有の実機確認はまだ行っていない。
 */
function serializePageBreak(): string {
  return '<div style="page-break-before:always;"></div>'
}

function serializeDirectiveBlock(ctx: ExportContext, node: PMNode): string {
  const attrs: DirectiveAttrs = {
    kind: node.attrs.kind as DirectiveAttrs['kind'],
    name: (node.attrs.name as string) ?? '',
    level: (node.attrs.level as number | null) ?? null,
  }
  const token = formatDirectiveToken(attrs)
  const childLines = serializeDirectiveChildBlocks(ctx, node)
  const body = childLines.join('\n')

  if (attrs.kind === 'align' && attrs.name === 'center') {
    return wrapHelperDiv('text-center', body)
  }

  if (attrs.kind === 'align' && attrs.name === 'end') {
    // Nyoze の地付きと完全同義ではなく、でんでん向け text-right 近似。
    return wrapHelperDiv('text-right', body)
  }

  if (attrs.kind === 'style') {
    const styleToken = token || `style-${attrs.name}`
    pushWarning(ctx, {
      code: 'unsupported-style-directive',
      message: `style directive "${styleToken}" was exported as plain text only`,
      directive: styleToken,
    })
    return body
  }

  if (attrs.kind === 'indent') {
    const level = attrs.level ?? Number(attrs.name) ?? 1
    if (level >= 1 && level <= 6) {
      // 段落先頭の全角スペースは折り返し行に効かず block indent として破綻する
      // ため採用しない。LeME と同じく markdown="1" 付き HTML div (padding-top)
      // で字下げを表現する（縦書き前提。横書き向け padding-left 切替は未対応）。
      // 開始タグ直後に空行を入れ、wrapper 内最初の段落も Markdown として解釈
      // されるようにする（LeME の実機確認由来の安定化パターンに合わせる）。
      const indentBody = serializeChildBlockLines(ctx, node).join('\n\n')
      return `<div style="padding-top:${level}em;" markdown="1">\n\n${indentBody}\n</div>`
    }
  }

  // その他不正 directive attrs は MVP では中身のみ。
  pushWarning(ctx, {
    code: 'unsupported-directive',
    message: `Unsupported directive block "${token || node.type.name}" was exported as plain text only`,
    directive: token || undefined,
    nodeType: NYOZE_DIRECTIVE_NODE_NAME,
  })
  return body || node.textContent
}

function isUnsupportedExportBlock(node: PMNode): boolean {
  switch (node.type.name) {
    case 'html_block_atom':
      return true
    default:
      return false
  }
}

function serializeUnsupportedBlock(ctx: ExportContext, node: PMNode): string {
  if (node.type.name === 'html_block_atom') {
    pushWarning(ctx, {
      code: 'unsupported-node',
      message: 'html_block_atom raw HTML was omitted during Denden Markdown export',
      nodeType: node.type.name,
    })
    return node.textContent
  }

  const text = node.textContent
  pushWarning(ctx, {
    code: 'unsupported-node',
    message: `Unsupported block node "${node.type.name}" was exported as text content only`,
    nodeType: node.type.name,
  })
  return text
}

/**
 * `:::blank-page` / `:::blank-page-N` (`nyozeBlankPage`) の 1 ページぶんを、
 * `page-break-before` / `page-break-after` を両方持つ空 `<div>` として近似する
 * （LeME と同じ形。`lemeMarkdownExport.ts` の `serializeBlankPageUnit` 参照）。
 * `&nbsp;` は でんでんの HTML parser で未定義 entity になり得るため使わない。
 */
function serializeBlankPageUnit(): string {
  return '<div style="page-break-before:always;page-break-after:always;">&#160;</div>'
}

/** count 個の空白ページ div を配列で返す（block 区切りは呼び出し側に委ねる）。 */
function serializeBlankPageUnits(count: number): string[] {
  return Array.from({ length: count }, () => serializeBlankPageUnit())
}

function warnBlankPageApproximated(ctx: ExportContext, count: number): void {
  pushWarning(ctx, {
    code: 'approximate-node',
    message: `Blank page (count=${count}) was approximated using ${count} consecutive <div> block(s) with page-break-before/page-break-after; exact rendering in an EPUB reader has not been verified`,
    nodeType: NYOZE_BLANK_PAGE_NODE_NAME,
  })
}

function serializeBlock(ctx: ExportContext, node: PMNode): string {
  switch (node.type.name) {
    case 'paragraph':
      return serializeParagraph(ctx, node)
    case 'heading':
      return serializeHeading(ctx, node)
    case 'horizontalRule':
      return serializeHorizontalRule()
    case 'blockquote':
      return serializeBlockquote(ctx, node)
    case 'codeBlock':
      return serializeCodeBlock(node)
    case 'bulletList':
      return serializeBulletList(ctx, node)
    case 'orderedList':
      return serializeOrderedList(ctx, node)
    case NYOZE_DIRECTIVE_NODE_NAME:
      return serializeDirectiveBlock(ctx, node)
    case NYOZE_PAGE_BREAK_NODE_NAME:
      return ctx.options.pageBreak ? serializePageBreak() : ''
    case NYOZE_BLANK_PAGE_NODE_NAME: {
      const count = (node.attrs.count as number) ?? 1
      warnBlankPageApproximated(ctx, count)
      return serializeBlankPageUnits(count).join('\n\n')
    }
    case 'noteAnchor':
      return ''
    case 'nyoze_image':
      // 画像は inline group node のため通常は paragraph 内（serializeInlineNode）を
      // 経由するが、直接 block 位置に現れた場合も同じ Markdown image syntax を出す。
      return serializeImage(node)
    default:
      if (isUnsupportedExportBlock(node)) {
        return serializeUnsupportedBlock(ctx, node)
      }
      if (node.isTextblock) {
        return serializeInlineFragment(ctx, node.content)
      }
      return serializeUnsupportedBlock(ctx, node)
  }
}

/**
 * `pageBreakBeforeHeading` が有効なとき、top-level heading の直前に自動で
 * 改ページを挿入するべきか判定する。
 * - `pageBreak` が false なら (`:::page-break` 自体を出力しない設定) 挿入しない。
 * - `headingLevel` が `pageBreakBeforeHeadingMaxLevel` を超える見出しには挿入
 *   しない（既定 `6` は h1〜h6 すべて対象で現行互換）。
 * - 文書先頭の見出し (normalize 後の最初の block) には挿入しない。
 *
 * 明示 `:::page-break` との重複回避は、呼び出し側 (`serializeTopLevelDoc`) が
 * `normalizeTopLevelPageBreaks()` の `breakBefore` が既に true の block では
 * この関数を呼ばないことで保証する（同じ block に二重で改ページを足さない）。
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

function normalizeMetadataLine(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function escapeMetadataMarkdownText(value: string): string {
  return escapeHtmlText(value)
}

/**
 * Book 全体の作品情報（`includeBookInfo: true`）を、本文冒頭に一度だけ出す
 * Markdown prelude として組み立てる。LeME と同じ方針
 * （`lemeMarkdownExport.ts` の同名 helper 参照）。
 */
function buildBookInfoText(info: BookExportBookInfo | undefined, showRoleLabels: boolean): string {
  if (!info) return ''
  const title = normalizeMetadataLine(info.title)
  const author = normalizeMetadataLine(info.author)
  const translator = normalizeMetadataLine(info.translator)
  if (!title && !author && !translator) return ''

  const parts: string[] = []
  if (title) parts.push(`# ${escapeMetadataMarkdownText(title)}`)
  if (author)
    parts.push(wrapHelperDiv('text-right', `${showRoleLabels ? '著: ' : ''}${escapeMetadataMarkdownText(author)}`))
  if (translator)
    parts.push(
      wrapHelperDiv('text-right', `${showRoleLabels ? '訳: ' : ''}${escapeMetadataMarkdownText(translator)}`),
    )
  // 本文との間に約3行分の余白を確保する（LeME と同じ理由。
  // `lemeMarkdownExport.ts` の同名 helper 参照）。
  parts.push(EMPTY_PARAGRAPH_OUTPUT, EMPTY_PARAGRAPH_OUTPUT, EMPTY_PARAGRAPH_OUTPUT)
  return parts.join('\n\n')
}

/**
 * 章ファイル情報（`includeChapterInfo: true`）の 1 章分を Markdown へ組み立てる。
 * LeME と同じ方針（`lemeMarkdownExport.ts` の同名 helper 参照）。
 */
function buildChapterInfoText(info: BookExportChapterInfo, showRoleLabels: boolean): string {
  const title = normalizeMetadataLine(info.title)
  const authors = (info.authors ?? []).map(normalizeMetadataLine).filter((author) => author.length > 0)
  const translators = (info.translators ?? [])
    .map(normalizeMetadataLine)
    .filter((translator) => translator.length > 0)
  if (!title && authors.length === 0 && translators.length === 0) return ''

  const parts: string[] = []
  if (title) parts.push(`## ${escapeMetadataMarkdownText(title)}`)
  if (authors.length > 0)
    parts.push(
      wrapHelperDiv(
        'text-right',
        `${showRoleLabels ? '著: ' : ''}${authors.map(escapeMetadataMarkdownText).join('、')}`,
      ),
    )
  if (translators.length > 0)
    parts.push(
      wrapHelperDiv(
        'text-right',
        `${showRoleLabels ? '訳: ' : ''}${translators.map(escapeMetadataMarkdownText).join('、')}`,
      ),
    )
  // 章本文との間に約3行分の余白を確保する（buildBookInfoText と同じ理由）。
  parts.push(EMPTY_PARAGRAPH_OUTPUT, EMPTY_PARAGRAPH_OUTPUT, EMPTY_PARAGRAPH_OUTPUT)
  return parts.join('\n\n')
}

/**
 * `serializeTopLevelDoc` の章ファイル情報挿入に使う、連結前 `doc.content` 内の
 * 位置（`BookExportChapterInfo.index`）でソート済みの読み取り専用ビュー。
 */
function sortChapterInfosByIndex(
  chapterInfos: readonly BookExportChapterInfo[] | undefined,
): readonly BookExportChapterInfo[] | null {
  if (!chapterInfos || chapterInfos.length === 0) return null
  return [...chapterInfos].sort((a, b) => a.index - b.index)
}

/**
 * top-level block を空行 (`\n\n`) 区切りで連結する。
 *
 * でんでん向け Markdown では top-level block は原則空行区切りにする。Nyoze の空
 * paragraph は、でんでん側で連続空行が畳まれて見た目の空きが消えないよう
 * `<p><br /></p>` に変換する。通常 paragraph 間の separator（隣接 paragraph）と
 * Nyoze の空 paragraph は doc の node 構造で区別する。
 *
 * top-level の子は、まず `normalizeTopLevelPageBreaks()`
 * （`pageBreakRenderModel.ts`）へ通す。これにより `:::page-break` 自体は結果から
 * 消え、直前・直後の空 paragraph も除外され、連続する page-break は 1 つの
 * pending break に畳まれ、文書先頭・末尾の page-break は無視される。以後は
 * normalize 済みの block 列だけを serialize する。
 *
 * 末尾の空 paragraph は保存時の trailing newline 由来のことが多いため出力しない。
 * 内容を持たない block（raw HTML / 省略画像 / noteAnchor）も空行を生まないよう除く。
 *
 * `pageBreakBeforeHeading` が有効な場合、まだ `breakBefore` が付いていない
 * top-level heading（文書先頭を除く）の直前に自動で改ページ div を追加で挿入する。
 * 明示 `:::page-break` 由来の `breakBefore` が既に true の heading には重ねて
 * 挿入しない。見出し自体の serialize (`serializeHeading`) は変更しない。
 *
 * `chapterInfos` が渡されたときの挿入方針は LeME と同じ（`lemeMarkdownExport.ts`
 * の `serializeTopLevelDoc` 冒頭コメント参照）。
 */
function serializeTopLevelDoc(
  ctx: ExportContext,
  doc: PMNode,
  chapterInfos: readonly BookExportChapterInfo[] | undefined,
  showRoleLabels: boolean,
): string {
  const rendered: string[] = []
  const topLevelBlocks: PMNode[] = []
  doc.forEach((child) => topLevelBlocks.push(child))
  const normalized = normalizeTopLevelPageBreaks(topLevelBlocks)

  const sortedChapterInfos = sortChapterInfosByIndex(chapterInfos)
  const topLevelNodeIndex = sortedChapterInfos
    ? new Map(topLevelBlocks.map((node, i) => [node, i] as const))
    : null
  let chapterInfoPtr = 0

  // blank-page 自身の末尾 div がすでに「次を新しいページから始める」効果を
  // 持つため、直後の content block が明示 page-break 由来の breakBefore を
  // 持っていても、その page-break div は重複させず 1 回だけ抑止する。
  let suppressNextBreakBefore = false

  normalized.forEach((block, index) => {
    if (block.kind === 'blankPage') {
      rendered.push(...serializeBlankPageUnits(block.count))
      warnBlankPageApproximated(ctx, block.count)
      suppressNextBreakBefore = true
      return
    }
    const { node, breakBefore } = block
    const autoHeadingBreak =
      !breakBefore &&
      node.type.name === 'heading' &&
      shouldInsertAutoPageBreakBeforeHeading(
        ctx,
        index > 0,
        clampHeadingLevel((node.attrs.level as number) ?? 1),
      )
    const effectiveBreakBefore = (breakBefore || autoHeadingBreak) && !suppressNextBreakBefore
    suppressNextBreakBefore = false
    let pendingBreak = effectiveBreakBefore && ctx.options.pageBreak

    const originalIndex = topLevelNodeIndex?.get(node)
    if (sortedChapterInfos && topLevelNodeIndex && originalIndex !== undefined) {
      while (
        chapterInfoPtr < sortedChapterInfos.length &&
        sortedChapterInfos[chapterInfoPtr].index <= originalIndex
      ) {
        const info = sortedChapterInfos[chapterInfoPtr]
        chapterInfoPtr++
        const infoText = buildChapterInfoText(info, showRoleLabels)
        if (infoText.length > 0) {
          if (pendingBreak) {
            rendered.push(serializePageBreak())
            pendingBreak = false
          }
          rendered.push(infoText)
        }
      }
    }

    if (pendingBreak) {
      rendered.push(serializePageBreak())
    }

    if (node.type.name === 'paragraph' && node.content.size === 0) {
      rendered.push(EMPTY_PARAGRAPH_OUTPUT)
      return
    }
    const text = serializeBlock(ctx, node)
    if (text.length > 0) rendered.push(text)
  })

  while (
    rendered.length > 0 &&
    rendered[rendered.length - 1] === EMPTY_PARAGRAPH_OUTPUT
  ) {
    rendered.pop()
  }

  const text = rendered.join('\n\n')
  return text.length > 0 ? `${text}\n` : '\n'
}

export function exportDendenCompatibleMarkdownFromDoc(
  doc: PMNode,
  options?: DendenMarkdownExportOptions,
): DendenMarkdownExportResult {
  const ctx: ExportContext = { warnings: [], options: resolveExternalExportOptions(options) }
  const showRoleLabels = options?.showRoleLabels ?? true
  const chapterInfos = options?.includeChapterInfo === true ? options?.chapterInfos : undefined
  const metadataText =
    options?.includeBookInfo === true
      ? buildBookInfoText(options?.bookInfo, showRoleLabels)
      : options?.includeDocumentInfo === true
        ? buildBookInfoText(options?.documentInfo, showRoleLabels)
        : ''
  const bodyText = serializeTopLevelDoc(ctx, doc, chapterInfos, showRoleLabels)
  const text = metadataText.length > 0 ? `${metadataText}\n\n${bodyText}` : bodyText
  return { text, warnings: ctx.warnings }
}
