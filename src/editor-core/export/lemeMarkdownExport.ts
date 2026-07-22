import type { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model'
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
import { applyExportAutoTcyToLeMEText } from './exportAutoTcy'
import type { BookExportBookInfo, BookExportChapterInfo } from './bookExportMetadata'

/**
 * LeME 互換 Markdown export の pure converter。
 *
 * 実機確認の結果、LeME の `.md` 入力では以下が判明した。
 *   - 青空文庫形式ルビは非対応（HTML `<ruby>` は対応）
 *   - 明示 TCY `^...^` は対応
 *   - Markdown 見出し `#`〜`######` は対応
 *   - ただし配置 wrapper（`markdown="1"` div）内の `# 見出し` は文字としてそのまま
 *     表示され、見出しとして解釈されない。見出しを HTML タグ（`<h1 style=...>`）
 *     にすると配置付き見出しとして表示された
 *   - 基本 Markdown（`**太字**` / `*斜体*` / `***太字斜体***`）は対応
 *   - 追加実機確認（2026-07-02）: 打ち消し線 `~~...~~`、インラインコード、
 *     ハイライト `<mark>`、水平線 `---`、引用 `>`、bullet / ordered list、
 *     fenced code block も対応。ただし task list（`- [ ]` / `- [x]`）を含む
 *     `.md` は LeME 側で EPUB 変換エラーになるため、task item は通常 bullet item
 *     へ降格する。link / table / image / 数式 / 脚注は今回も対象外
 *   - 追加実機確認（2026-07-02、続報）: `markdown="1"` wrapper の開始タグ直後に
 *     本文を続けると、wrapper 内最初の段落だけ Markdown 装飾が解釈されないことが
 *     判明。開始タグ直後に空行を入れると最初の段落でも解釈された
 *   - 実機回帰修正（2026-07-02、続報2）: GFM table 風テキスト（paragraph +
 *     hardBreak として保持される）を hardBreak → `<br />` で出すと LeME 側で
 *     table として認識されなかった。物理改行のままなら table として表示された
 *     ため、conservative に GFM table 風と判定できる paragraph に限り hardBreak
 *     を物理改行 `\n` として出す（通常の hardBreak は引き続き `<br />`）。また
 *     `wrapWithMarks` の close delimiter 組み立てが逆順 prepend になっており、
 *     非対称 delimiter（`<mark>` / `</mark>`）が Markdown delimiter（`*` 等）と
 *     混在すると閉じ位置が壊れていたため、逆順 append へ修正した
 *   - 実機回帰修正（2026-07-02、続報3）: LeME `.md` はローカル画像を表示できる
 *     ことが確認された。以前は `nyoze_image`（atom node で textContent が空）を
 *     unsupported として空出力にしていたが、通常 Markdown 保存と同じ escape
 *     helper で `![alt](src)` / `![alt](src "title")` へ復元するよう修正した
 *   - 実機回帰修正（2026-07-02、続報4）: `:::align-center` / `:::align-end` 内に
 *     GFM table 風 paragraph があると、`markdown="1"` 付き `<div>` の内側に table
 *     が入り LeME 側で EPUB 変換エラーになった。table 構造を align より優先し、
 *     table 風 paragraph は div に包まず物理改行のまま出す（align は落ち、
 *     `unsupported-directive` warning を出す）
 *
 * このため LeME export v1 は **`.md` + HTML 併用**を標準とする。一度 `.txt`
 * （LeME Text(Nor)）向け出力を検討・実装したが、上記の実機確認結果により
 * `.md + HTML` 標準へ戻した（履歴は `docs/work-log.md` 参照）。
 *
 * 入力は ProseMirror `doc`。Markdown 文字列を再 parse せず、通常 Markdown 保存
 * 経路も呼ばない。React / Electron / fs に依存しない純粋関数。
 *
 * LeME `.md + HTML` v1 の中心:
 *   - top-level block          → 原則 空行 (`\n\n`) 区切り
 *   - 空 paragraph              → `<p><br /></p>`（末尾の空 paragraph は出力しない）
 *   - ルビ (`aozoraRuby`)       → HTML `<ruby>親文字<rt>ルビ</rt></ruby>`（HTML escape 済み）
 *   - 明示 TCY (`aozoraTcy`)    → `^...^`
 *   - hardBreak                → `<br />`（単改行が潰れる場合があるため明示変換）。
 *                                ただし GFM table 風 paragraph（table node がない
 *                                ため paragraph + hardBreak として保持される）と
 *                                conservative に判定できる場合だけ、物理改行
 *                                `\n` として出す（LeME 側で table として解釈させる）
 *   - bold / italic / 両方      → Markdown `**...**` / `*...*` / `***...***`
 *   - strike                   → `~~...~~`
 *   - code（inline）            → 本文中の最長 backtick run より長い fence（code が
 *                                付いた inline は他 mark を重ねず code を優先）
 *   - highlight                → HTML `<mark>...</mark>`（plain text 部分は HTML escape）
 *   - underline (`||...||`)   → HTML `<u>...</u>`（plain text 部分は HTML escape）
 *   - image (`nyoze_image`)    → Markdown image syntax `![alt](src)` / `![alt](src "title")`
 *                                へ復元（通常 Markdown 保存と同じ escape helper。画像ファイルの
 *                                コピーや path rebasing はせず、保存済み src をそのまま使う。
 *                                `nyoze-img://` 表示用 URL は出力しない。warning なし）
 *   - link                     → 引き続き未対応。本文のみ + warning
 *   - heading                  → Markdown `#`〜`######`
 *   - horizontalRule           → `---`
 *   - blockquote               → 各行に `> ` を付ける Markdown 引用（内部 inline 変換は維持）
 *   - codeBlock                → fenced code block（language 維持、backtick 衝突回避）
 *   - bulletList / orderedList → Markdown list。task item（`checked` 属性あり）は
 *                                通常 bullet item へ降格 + warning
 *   - `:::align-center`        → 通常 block は `<div style="text-align:center;" markdown="1">\n\n...</div>`、
 *                                heading は `<hN style="text-align:center;">...</hN>`、GFM table 風
 *                                paragraph は div に包まず物理改行のまま（align 落ち + warning）
 *   - `:::align-end`           → 通常 block は `<div style="text-align:right;" markdown="1">\n\n...</div>`、
 *                                heading は `<hN style="text-align:right;">...</hN>`、GFM table 風
 *                                paragraph は div に包まず物理改行のまま（align 落ち + warning）
 *   - `:::indent-N`            → `<div style="padding-top:Nem;" markdown="1">\n\n...</div>`（縦書き前提。
 *                                横書き向け `padding-left` 切替は未対応）。開始タグ直後の空行は
 *                                wrapper 内最初の段落も LeME 側で Markdown 解釈させるため
 *                                （`<hN style="text-align:...">` heading には空行を入れない）
 *   - `:::style-*`             → 中身のみ + warning
 *   - `:::page-break`          → `<div style="page-break-before:always;"></div>`
 *                                （§後述: `!PB` は使わない。warning なし）
 *   - `:::blank-page` / `:::blank-page-N` (`nyozeBlankPage`) → count 個の
 *                                `<div style="page-break-before:always;page-break-after:always;">&#160;</div>`
 *                                （§後述。`approximate-node` warning 付き）
 *   - noteAnchor / 付箋本文     → 出力しない
 *   - table / 数式 / 脚注 / raw HTML（ユーザー入力由来）→ 構造保持せず
 *                                textContent のみ + warning（table は Nyoze の schema に
 *                                専用 node がなく、そもそも paragraph として解釈される）
 *
 * `nyozePageBreak`（`:::page-break`）の記法選定:
 *   - LeME の公式仕様には旧 Text(Nor) 系の改ページ記法 `!PB` があるが、`!C` / `!R`
 *     と同じ Text(Nor) directive の系統であり、現行の `.md + HTML` 方針（旧
 *     Text(Nor) 記法は使わず、実機確認済みの HTML/CSS へ寄せる）とは整合しない。
 *     そのため `!PB` は採用しない。
 *   - 代わりに、実機確認済みの `text-align` / `padding-top` と同じ「inline style
 *     付き HTML `<div>` がそのまま通る」性質を利用し、`page-break-before:always`
 *     を使う空 `<div>` を出す。`nyozePageBreak` は本文を持たない marker node の
 *     ため、内容を持つ block に `style` を足すのではなく、独立した空 div として
 *     出力する。
 *   - `page-break-before` は EPUB CSS で広く使われる標準的な改ページ指定であり、
 *     `text-align` / `padding-top` と同じ「inline style を honor する」経路を通る
 *     想定だが、page-break 固有の実機確認はまだ行っていない（要実機確認）。
 *
 * Slice B（2026-07 page-break RenderModel 正規化）:
 *   - top-level の `:::page-break` は `pageBreakRenderModel.ts` の
 *     `normalizeTopLevelPageBreaks()` を経由してから serialize する。Editor
 *     marker node をそのまま flow へ流すのではなく、normalize 済み pending
 *     break の実現手段として `serializePageBreak()` の div を出す。
 *   - 出力記法自体（`<div style="page-break-before:always;"></div>`）は変更
 *     しない。変わるのは「いつ・何回出すか」の判定だけ。
 *   - page-break 前後の空 paragraph は出力しない。連続 page-break は 1 回に
 *     畳む。文書先頭・末尾の page-break は出力しない。
 *   - `pageBreakBeforeHeading` は、normalize 由来の `breakBefore` がまだ false
 *     の heading にだけ適用する（`docs/page-break-render-model-spec-2026-07.md`
 *     §11 のとおり、明示 break と自動 break を同じ `breakBefore` 概念に合流）。
 *   - normalize は top-level block だけを対象にする（初期仕様どおり）。
 *     `:::align-center` 等の中に nested した `:::page-break` はこの正規化の
 *     対象外のままとし、`serializeBlock` の既存 `NYOZE_PAGE_BREAK_NODE_NAME`
 *     分岐（`ctx.options.pageBreak` に応じてそのまま div を出す）を維持する。
 *
 * 見出し前改ページレベル設定（2026-07）:
 *   - `pageBreakBeforeHeadingMaxLevel`（既定 `6`）で、`pageBreakBeforeHeading`
 *     による自動改ページの対象を h1〜hN に絞れる。既定値は現行互換（h1〜h6
 *     すべて対象）。
 *   - 判定対象は既存どおり top-level heading のみ。nested heading は対象外。
 *   - この設定は `normalizeTopLevelPageBreaks()` 由来の `breakBefore`
 *     （明示 `:::page-break` や章境界 page-break）には影響しない。
 *
 * `nyozeBlankPage`（`:::blank-page` / `:::blank-page-N`）の外部 export 対応
 * （2026-07）:
 *   - `normalizeTopLevelPageBreaks()` は top-level `nyozeBlankPage` を
 *     `{ kind: 'blankPage'; count }` という fixed page slot として返す
 *     （`:::page-break` の `breakBefore` とは別概念。§`pageBreakRenderModel.ts`）。
 *   - 1 個の空白ページを、`page-break-before` と `page-break-after` を両方
 *     持つ空 `<div>`（完全な空要素は EPUB reader 側で collapse される懸念が
 *     あるため、XHTML/XML で安全な数値文字参照 `&#160;` を内容に入れる。
 *     named entity `&nbsp;` は EPUB 変換後に未定義 entity になり得るため使わない）
 *     として近似する。count 個ぶん、この
 *     div を連続して出す。各 div は「開始 + 終了」を自己完結して持つため、
 *     直前・直後の block の有無や `breakBefore` の状態に関係なく、常に独立
 *     した 1 ページとして機能する（実機での正確な挙動は未確認のため
 *     `approximate-node` warning を付ける）。
 *   - `pageBreak: false` は明示 `:::page-break` と見出し前自動改ページだけを
 *     抑止する option であり（`ExternalExportOptions.pageBreak` の定義参照）、
 *     `nyozeBlankPage` はユーザーが明示した固定の空白ページなので、
 *     `pageBreak` の値に関係なく常に出力する。
 *   - `:::page-break` と `:::blank-page` が隣接しても余計な page-break を
 *     重複させないため、`serializeTopLevelDoc` は blank-page 出力の直後に
 *     続く content block の `breakBefore`（明示 page-break 由来）をこの
 *     ループ内だけの一時 flag（`suppressNextBreakBefore`）で 1 回だけ
 *     抑止する。blank-page 自身の末尾 div がすでに「次を新しいページから
 *     始める」効果を持つため、二重に page-break div を出さないようにする
 *     （`本文 → page-break → blank-page-2 → page-break → 次の本文` で
 *     page-break div が重複しないことを保証する）。
 *   - nested blank-page（`:::align-center` 等の中）は、`serializeBlock` の
 *     `NYOZE_BLANK_PAGE_NODE_NAME` 分岐で同じ div 列を出す。ただし
 *     `suppressNextBreakBefore` は top-level の loop 内だけの状態のため、
 *     nested の場合はこの重複回避の対象外（nested page-break も同様に
 *     top-level normalize の対象外であることに合わせた仕様）。
 *
 * Book 全体 export 専用の作品情報 / 章ファイル情報表示（2026-07-08、pure
 * conversion のみ。UI / IPC は未接続）:
 *   - `includeBookInfo` / `bookInfo` / `includeChapterInfo` / `chapterInfos` /
 *     `showRoleLabels` は Book 全体 export（`bookExportConversion.ts`）専用の
 *     option。active document export（`EditorCoreHandle.exportLeMEMarkdown`）
 *     は `bookInfo` / `chapterInfos` を渡す呼び出し元が無いため常に無視される。
 *   - `bookInfo` / `chapterInfos` の metadata 本体はこの converter 自身が
 *     読み書きしない。呼び出し側（`bookExportConversion.ts`）が Book manifest
 *     由来の値をすでに組み立てて渡すだけで、この converter は受け取った
 *     文字列をそのまま `#` / `##` 見出しと本文行へ変換するだけの薄い層。
 *   - 作品情報（`includeBookInfo: true`）は Book 全体の先頭に一度だけ、
 *     `# title` 見出し + 著者行という Markdown で出す（既存 `doc` の
 *     top-level 走査には加わらない独立した prelude 文字列のため、
 *     `pageBreakBeforeHeading` の「文書先頭の見出しは対象外」判定や章境界
 *     page-break には一切影響しない）。
 *   - 章ファイル情報（`includeChapterInfo: true`）は各章の先頭に `##
 *     章タイトル` 見出し + 著者/訳者行という Markdown で出す。章境界の
 *     自動改ページ option（`bookExportConversion.ts` の `boundary` option）
 *     由来の page-break がある章では、その page-break はこの章ファイル情報
 *     ブロックの直前へ移る（章本文側の
 *     block には二重に付かない。空 metadata で章ファイル情報が省略される
 *     章では従来どおり章本文側に残る。Book 全体 HTML export の同名 option と
 *     同じ設計、`docs/book-export-design-2026-07.md` §7.4 参照）。章ファイル
 *     情報自体も既存 `doc` の
 *     heading node としては挿入しない（`buildChapterInfoText` が生成する
 *     文字列を `serializeTopLevelDoc` が直接 `rendered` へ差し込むだけ）ため、
 *     `pageBreakBeforeHeading` による見出し前自動改ページの対象にもならない
 *     （二重改ページが起きない）。
 *   - 空の項目（title / author / authors / translators）は個別に省略し、
 *     全部空ならその block 自体を出さない。複数著者・訳者は配列順のまま
 *     `、` で連結する。`showRoleLabels: false` のときは「著: 」「訳: 」を
 *     前置しない。
 *   - `pageBreak: false` のときも、作品情報・章ファイル情報の表示自体は
 *     抑止しない（抑止されるのは改ページの出力だけ。§`ExternalExportOptions.pageBreak`）。
 *   - 著者・訳者行は地付き（横書きでは右寄せ）で出す。`:::align-end` と同じ
 *     `wrapAlignDiv('right', ...)` を再利用し、著者行・訳者行を個別の
 *     `<div style="text-align:right;" markdown="1">` で包む（title 見出しは
 *     包まない。`markdown="1"` div 内で `#` 見出しが解釈されない実機確認済みの
 *     制約を回避するため）。
 *   - 作品情報・章ファイル情報のブロック末尾には、本文との間に約3行分の余白を
 *     持たせるため `<p><br /></p>`（`EMPTY_PARAGRAPH_OUTPUT`）を3つ追加する。
 *     Markdown の空行 (`\n\n`) 自体は連続しても1回の段落区切りにしか解釈されず
 *     視覚的な余白を生まないため、`nyozeBlankPage` の近似と同じ「実体を持つ空
 *     paragraph を必要数だけ並べる」方式を使う。
 */

export type LeMEMarkdownExportWarningCode =
  | 'unsupported-node'
  | 'unsupported-mark'
  | 'unsupported-style-directive'
  | 'unsupported-directive'
  | 'approximate-node'

export type LeMEMarkdownExportWarning = {
  code: LeMEMarkdownExportWarningCode
  message: string
  nodeType?: string
  markType?: string
  directive?: string
}

export type LeMEMarkdownExportResult = {
  text: string
  warnings: LeMEMarkdownExportWarning[]
}

/**
 * 外部 export 共通の pure options model (`externalExportOptions.ts`) を LeME
 * 向けの公開名で再輸出したものに、Book 全体 export 専用の作品情報 / 章ファイル
 * 情報表示 option（ファイル冒頭コメント参照）を追加したもの。`ExternalExportOptions`
 * 由来のフィールドは共有 `ExternalExportOptions` と同一で、省略時の既定値は
 * 現行挙動と完全に一致する（`resolveExternalExportOptions` 参照）。追加分の
 * option は省略時（`includeBookInfo` / `includeChapterInfo` とも既定 `false`）も
 * 現行挙動と完全一致する。
 */
export type LeMEMarkdownExportOptions = ExternalExportOptions & {
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

const SUPPORTED_MARK_NAMES = new Set(['bold', 'italic', 'strike', 'highlight', 'underline', 'code'])

const MARK_PRIORITY: Record<string, number> = {
  bold: 1,
  italic: 2,
  strike: 3,
  highlight: 4,
  underline: 5,
  code: 6,
}

type ExportContext = {
  warnings: LeMEMarkdownExportWarning[]
  options: ResolvedExternalExportOptions
}

function pushWarning(
  ctx: ExportContext,
  warning: LeMEMarkdownExportWarning,
): void {
  ctx.warnings.push(warning)
}

function markPriority(mark: Mark): number {
  return MARK_PRIORITY[mark.type.name] ?? 99
}

function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => markPriority(a) - markPriority(b))
}

function lemeMarkOpenDelimiter(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '**'
    case 'italic':
      return '*'
    case 'strike':
      return '~~'
    case 'highlight':
      return '<mark>'
    case 'underline':
      return '<u>'
    default:
      return ''
  }
}

function lemeMarkCloseDelimiter(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '**'
    case 'italic':
      return '*'
    case 'strike':
      return '~~'
    case 'highlight':
      return '</mark>'
    case 'underline':
      return '</u>'
    default:
      return ''
  }
}

/** HTML text content 用の最小 escape（`&` `<` `>`）。 */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * inline code (`` ` ``) の delimiter。本文中の最長連続 backtick run より 1 つ長い
 * fence を選び、code span が途中で閉じてしまわないようにする。
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

/**
 * inline node (ruby / tcy) 自身の marks と、全 text child に共通する marks を
 * 合成する。aozoraTextExport と同じ方針で、wrapper node 上ではなく child text に
 * mark が乗っているケースも拾う。
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
      message: `Unsupported mark "${mark.type.name}" was stripped during LeME Markdown export`,
      markType: mark.type.name,
    })
  }
}

/**
 * bold / italic / strike / highlight を Markdown (+ HTML) delimiter で包む。
 * 優先順で open し、close は逆順にすることで nesting が崩れない。
 * LeME `.md` は `***太字斜体***` に対応しているため丸めない。
 *
 * `code` mark が付いている場合は最優先で扱う。Markdown の inline code span は
 * 内部の Markdown 構文を解釈しないため、他の mark（bold 等）は重ねず code の
 * backtick fence だけで包む（silent flatten であり `unsupported-mark` の対象では
 * ない。code 以外の真に未対応な mark、例えば link はそのまま warning を出す）。
 *
 * 不変条件: open delimiter は mark priority 順に連結し、close delimiter はその
 * 逆順に「append」する（prepend しない）。対称 delimiter（`**` / `*` / `~~`）と
 * 非対称 delimiter（`<mark>` / `</mark>` のような開始・終了が異なるタグ）が
 * 混在しても、最後に開いた mark から先に閉じる well-formed nesting になり、
 * HTML tag が正しい内側で閉じる。例: supported = [italic, highlight] のとき
 * open = `*<mark>`、close は highlight → italic の順に append され `</mark>*`
 * になる（`*<mark>本文</mark>*`）。将来 underline / sup / sub のような非対称
 * delimiter mark を追加しても、この関数を変更せずに対応できる。
 */
function wrapWithMarks(ctx: ExportContext, text: string, marks: Mark[]): string {
  const sorted = sortMarks(marks)
  const hasCode = sorted.some((m) => m.type.name === 'code')
  emitUnsupportedMarks(ctx, sorted)

  if (hasCode) {
    const fence = chooseInlineCodeFence(text)
    return `${fence}${text}${fence}`
  }

  const supported = sorted.filter((m) => SUPPORTED_MARK_NAMES.has(m.type.name))

  let open = ''
  let close = ''
  for (const mark of supported) {
    open += lemeMarkOpenDelimiter(mark)
  }
  for (let i = supported.length - 1; i >= 0; i--) {
    close += lemeMarkCloseDelimiter(supported[i])
  }
  return `${open}${text}${close}`
}

function serializeTcy(ctx: ExportContext, node: PMNode): string {
  const encoded = `^${node.textContent}^`
  return wrapWithMarks(ctx, encoded, resolveInlineNodeMarks(node))
}

/**
 * ルビは LeME `.md` で非対応の青空文庫形式ではなく HTML `<ruby>` へ変換する。
 * HTML なので親文字 / ルビに `{` `}` `|` を含んでいても壊れず、fallback は不要。
 */
function serializeRuby(ctx: ExportContext, node: PMNode): string {
  const base = escapeHtmlText(node.textContent)
  const ruby = escapeHtmlText((node.attrs.ruby as string) ?? '')
  const encoded = `<ruby>${base}<rt>${ruby}</rt></ruby>`
  return wrapWithMarks(ctx, encoded, resolveInlineNodeMarks(node))
}

/**
 * `nyoze_image` を Markdown image syntax として復元する。実機確認で LeME `.md`
 * はローカル画像を表示できることが分かったため、通常 Markdown 保存の serializer
 * と同じ escape helper を使って `![alt](src)` / `![alt](src "title")` へ戻す。
 *
 * 画像ファイルのコピーや、export 先に合わせた path の rebasing はしない。
 * 保存されている `node.attrs.src` をそのまま Markdown image destination として
 * escape するだけで、`nyoze-img://` のような Nyoze 内部表示用 URL は使わない。
 * ローカル画像が LeME 側から読めるかどうかは、export 先と画像ファイルの相対位置を
 * ユーザーが管理する前提とする。remote image / absolute path も検証・変換しない。
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

function serializeInlineNode(ctx: ExportContext, node: PMNode): string {
  if (node.isText) {
    const marks = [...node.marks]
    const rawText = node.text ?? ''
    const hasCode = marks.some((m) => m.type.name === 'code')
    const hasHighlight = marks.some((m) => m.type.name === 'highlight')
    const hasUnderline = marks.some((m) => m.type.name === 'underline')
    // highlight / underline は raw HTML (<mark> / <u>) を生成するため、plain text
    // 部分だけ escape する。code が同時に付いている場合は code 側が優先され
    // escape 不要なので対象外。auto TCY の span.tcy は固定記号だけなので
    // escape 対象外（segment 組み立て側で通常文字列だけ escape する）。
    const needsHtmlEscape = (hasHighlight || hasUnderline) && !hasCode
    const text = applyExportAutoTcyToLeMEText(
      rawText,
      marks,
      ctx.options,
      needsHtmlEscape ? escapeHtmlText : undefined,
    )
    return wrapWithMarks(ctx, text, marks)
  }

  switch (node.type.name) {
    case 'aozoraRuby':
      return serializeRuby(ctx, node)
    case 'aozoraTcy':
      return serializeTcy(ctx, node)
    case 'nyoze_image':
      // 画像は inline atom として paragraph 内に出るため、基本的にこの経路を通る。
      return serializeImage(node)
    case 'noteAnchor':
      return ''
    case 'hardBreak':
      // 単改行が LeME 側で潰れることがあるため、明示的な改行タグを出す。
      return '<br />'
    case 'html_inline_atom': {
      pushWarning(ctx, {
        code: 'unsupported-node',
        message: 'html_inline_atom raw HTML tags were omitted during LeME Markdown export',
        nodeType: node.type.name,
      })
      return node.textContent
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
  let result = ''
  fragment.forEach((child) => {
    result += serializeInlineNode(ctx, child)
  })
  return result
}

function serializeHeadingInlineBody(ctx: ExportContext, node: PMNode): string {
  return serializeInlineFragment(ctx, node.content)
}

/** heading の `level` 属性を表示可能な範囲 (h1〜h6) へ丸める。 */
function clampHeadingLevel(level: number): number {
  return Math.min(Math.max(level, 1), 6)
}

function serializeHeading(ctx: ExportContext, node: PMNode): string {
  const clamped = clampHeadingLevel((node.attrs.level as number) ?? 1)
  const inlineBody = serializeHeadingInlineBody(ctx, node)
  return `${'#'.repeat(clamped)} ${inlineBody}`
}

/**
 * paragraph の直接 child を hardBreak で区切って「行」の配列（各行は node 配列）に
 * 分割する。hardBreak 自体は結果に含めない。
 */
function splitParagraphAtHardBreaks(node: PMNode): PMNode[][] {
  const segments: PMNode[][] = [[]]
  node.forEach((child) => {
    if (child.type.name === 'hardBreak') {
      segments.push([])
      return
    }
    segments[segments.length - 1].push(child)
  })
  return segments
}

/** node 配列の plain text（mark / ruby ルビ文字等は無視し textContent を連結）。判定専用。 */
function segmentPlainText(segment: PMNode[]): string {
  return segment.map((n) => n.textContent).join('')
}

/** GFM table separator の 1 cell（例: `-`, `:--`, `--:`, `:--:`）。 */
const GFM_TABLE_SEPARATOR_CELL = /^:?-+:?$/

/** 行全体が GFM table separator らしいか（例: `|---|---|`, `:---|---:`, `---|---`）。 */
function isGfmTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed.length === 0) return false
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  if (stripped.trim().length === 0) return false
  const cells = stripped.split('|')
  return cells.length > 0 && cells.every((cell) => GFM_TABLE_SEPARATOR_CELL.test(cell.trim()))
}

/**
 * GFM table 風 paragraph の conservative 判定。
 *
 * Nyoze には table node がなく、`| A | B |` のような GFM table 記法は
 * paragraph + hardBreak として保持される。hardBreak を通常どおり `<br />` に
 * 変換すると LeME 側で table として解釈されなくなるため、次をすべて満たす
 * 場合だけ「table 風」と判定し、hardBreak を物理改行として扱う。
 *   - hardBreak があり 2 行以上ある
 *   - 1 行目（header）に `|` を含む
 *   - 2 行目（separator）が GFM separator らしい（`|---|---|` 等）
 *   - 3 行目以降（body）があれば、すべて `|` を含む
 */
function isGfmTableLikeParagraphSegments(segments: PMNode[][]): boolean {
  if (segments.length < 2) return false
  const lines = segments.map(segmentPlainText)
  const header = lines[0]
  const separator = lines[1]
  if (!header.includes('|')) return false
  if (!isGfmTableSeparatorLine(separator)) return false
  const bodyLines = lines.slice(2)
  return bodyLines.every((line) => line.includes('|'))
}

function serializeInlineNodesArray(ctx: ExportContext, nodes: PMNode[]): string {
  let result = ''
  for (const node of nodes) {
    result += serializeInlineNode(ctx, node)
  }
  return result
}

/**
 * GFM table 風 paragraph は、hardBreak を `<br />` にせず物理改行 `\n` で
 * 出力する。LeME 実機では物理改行のままであれば表として表示されるため。
 */
function serializeGfmTableLikeParagraph(ctx: ExportContext, segments: PMNode[][]): string {
  return segments.map((segment) => serializeInlineNodesArray(ctx, segment)).join('\n')
}

function serializeParagraph(ctx: ExportContext, node: PMNode): string {
  if (node.content.size === 0) return ''
  const segments = splitParagraphAtHardBreaks(node)
  if (segments.length >= 2 && isGfmTableLikeParagraphSegments(segments)) {
    return serializeGfmTableLikeParagraph(ctx, segments)
  }
  return serializeInlineFragment(ctx, node.content)
}

/** top-level の空 paragraph (Nyoze の空行) を表す HTML。warning は出さない。 */
const EMPTY_PARAGRAPH_OUTPUT = '<p><br /></p>'

/**
 * block の child を「空行区切りの行配列」へ変換する。directive block（indent /
 * style / fallback）と blockquote の両方から共有する。
 * 空 paragraph は `<p><br /></p>` に、内容のない block（省略された unsupported
 * block 等）は読み飛ばす。
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
 * `nyozePageBreak` を独立した空 `<div>` へ変換する。旧 Text(Nor) 記法 `!PB` は
 * `.md + HTML` 方針と整合しないため使わない（ファイル冒頭コメント参照）。
 * `text-align` / `padding-top` と同じ inline style 付き `<div>` の経路を使うが、
 * page-break 固有の実機確認はまだ行っていない。
 */
function serializePageBreak(): string {
  return '<div style="page-break-before:always;"></div>'
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
 * task list item（`checked` 属性が `true` / `false`）は、LeME が task list を含む
 * `.md` の EPUB 変換でエラーになることが確認されているため、通常 bullet item へ
 * 降格する（`- [ ]` / `- [x]` を出さない）。
 */
function warnTaskListItemDowngraded(ctx: ExportContext): void {
  pushWarning(ctx, {
    code: 'unsupported-node',
    message:
      'Task list item was downgraded to a plain bullet list item for LeME export (LeME fails to convert an EPUB when a task list is present)',
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

/**
 * `markdown="1"` div の開始タグ直後に空行を入れる。実機確認の結果、開始タグ直後に
 * 本文を続けると wrapper 内の最初の段落だけ LeME 側で Markdown 装飾が解釈されない
 * ことがあったため、空行を挟んで最初の段落も通常どおり解釈されるようにする。
 */
function wrapAlignDiv(cssAlign: 'center' | 'right', body: string): string {
  return `<div style="text-align:${cssAlign};" markdown="1">\n\n${body}\n</div>`
}

/**
 * align directive を child ごとに処理する。
 *
 * LeME `.md` では `markdown="1"` div の中で `# 見出し` を使うと `#` が文字として
 * 表示され、見出しとして解釈されない。そのため heading child は div に入れず、
 * `<hN style="text-align:...">` という HTML heading へ変換して見出し構造と配置を
 * 両立させる。heading 以外の child は、通常 Markdown が解釈されるよう
 * `markdown="1"` 付き div で個別に包む。
 *
 * ただし GFM table 風 paragraph（`splitParagraphAtHardBreaks` /
 * `isGfmTableLikeParagraphSegments` で判定）は例外で、`markdown="1"` div に
 * 包まない。LeME は top-level の GFM table 風 Markdown を table として解釈できる
 * 一方、`markdown="1"` 付き HTML `<div>` の内側に table を入れると変換エラーに
 * なりやすいことが実機で確認された。そのため table 構造を align より優先し、
 * align を落として物理改行のまま出力する（`serializeGfmTableLikeParagraph` を
 * 再利用。判定ロジックの重複実装はしない）。
 */
function serializeAlignDirective(
  ctx: ExportContext,
  node: PMNode,
  cssAlign: 'center' | 'right',
  directiveToken: string,
): string {
  const parts: string[] = []
  node.forEach((child) => {
    if (child.type.name === 'heading') {
      const level = Math.min(Math.max((child.attrs.level as number) ?? 1, 1), 6)
      const body = serializeHeadingInlineBody(ctx, child)
      parts.push(`<h${level} style="text-align:${cssAlign};">${body}</h${level}>`)
      return
    }
    if (child.type.name === 'paragraph' && child.content.size === 0) {
      parts.push(EMPTY_PARAGRAPH_OUTPUT)
      return
    }
    if (child.type.name === 'paragraph') {
      const segments = splitParagraphAtHardBreaks(child)
      if (segments.length >= 2 && isGfmTableLikeParagraphSegments(segments)) {
        pushWarning(ctx, {
          code: 'unsupported-directive',
          message:
            'GFM table-like paragraph inside align directive was exported without alignment for LeME compatibility',
          directive: directiveToken,
          nodeType: NYOZE_DIRECTIVE_NODE_NAME,
        })
        const tableText = serializeGfmTableLikeParagraph(ctx, segments)
        if (tableText.length > 0) parts.push(tableText)
        return
      }
    }
    const text = serializeBlock(ctx, child)
    if (text.length > 0) parts.push(wrapAlignDiv(cssAlign, text))
  })
  return parts.join('\n\n')
}

function serializeDirectiveBlock(ctx: ExportContext, node: PMNode): string {
  const attrs: DirectiveAttrs = {
    kind: node.attrs.kind as DirectiveAttrs['kind'],
    name: (node.attrs.name as string) ?? '',
    level: (node.attrs.level as number | null) ?? null,
  }
  const token = formatDirectiveToken(attrs)

  if (attrs.kind === 'align' && attrs.name === 'center') {
    return serializeAlignDirective(ctx, node, 'center', token)
  }

  if (attrs.kind === 'align' && attrs.name === 'end') {
    return serializeAlignDirective(ctx, node, 'right', token)
  }

  if (attrs.kind === 'indent') {
    const level = attrs.level ?? Number(attrs.name) ?? 1
    if (level >= 1 && level <= 6) {
      // 縦書き前提で padding-top を使う。横書き向け padding-left 切替は未対応。
      // 開始タグ直後に空行を入れ、wrapper 内最初の段落も LeME 側で Markdown
      // として解釈されるようにする（wrapAlignDiv と同じ理由）。
      const body = serializeChildBlockLines(ctx, node).join('\n\n')
      return `<div style="padding-top:${level}em;" markdown="1">\n\n${body}\n</div>`
    }
  }

  if (attrs.kind === 'style') {
    const styleToken = token || `style-${attrs.name}`
    pushWarning(ctx, {
      code: 'unsupported-style-directive',
      message: `style directive "${styleToken}" was exported as plain text only`,
      directive: styleToken,
    })
    return serializeChildBlockLines(ctx, node).join('\n\n')
  }

  pushWarning(ctx, {
    code: 'unsupported-directive',
    message: `Unsupported directive block "${token || node.type.name}" was exported as plain text only`,
    directive: token || undefined,
    nodeType: NYOZE_DIRECTIVE_NODE_NAME,
  })
  return serializeChildBlockLines(ctx, node).join('\n\n') || node.textContent
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
      message: 'html_block_atom raw HTML was omitted during LeME Markdown export',
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
 * `page-break-before` / `page-break-after` を両方持つ空 `<div>` として近似する。
 * 完全な空要素は EPUB reader 側で collapse される懸念があるため、
 * XHTML/XML で安全な数値文字参照 `&#160;` を内容に入れる。named entity
 * `&nbsp;` は EPUB 変換後に未定義 entity になり得るため使わない。
 * before/after を両方持つため、直前・直後の block の状態に
 * 関係なく単独で 1 ページとして機能する（ファイル冒頭コメント参照）。
 */
function serializeBlankPageUnit(): string {
  return '<div style="page-break-before:always;page-break-after:always;">&#160;</div>'
}

/** count 個の空白ページ div を連結した文字列を返す（block 区切りは呼び出し側に委ねる）。 */
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
 * Markdown prelude として組み立てる。`title` → `author` → `translator` の順。
 * 空項目（trim 後）は個別に省略し、3 つとも空なら空文字列を返す（呼び出し側は
 * 空文字列のときは何も連結しない）。この関数は `doc` の top-level 走査には
 * 一切関与しない独立した文字列生成のため、`pageBreakBeforeHeading` の
 * 「文書先頭の見出しは対象外」判定や章境界 page-break には影響しない
 * （ファイル冒頭コメント参照）。
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
    parts.push(wrapAlignDiv('right', `${showRoleLabels ? '著: ' : ''}${escapeMetadataMarkdownText(author)}`))
  if (translator)
    parts.push(wrapAlignDiv('right', `${showRoleLabels ? '訳: ' : ''}${escapeMetadataMarkdownText(translator)}`))
  // 本文との間に約3行分の余白を確保する（`<p><br /></p>` を3つ、ファイル冒頭
  // コメントの「1個で1行ぶんの空きを表す」既存慣習と同じ単位）。
  parts.push(EMPTY_PARAGRAPH_OUTPUT, EMPTY_PARAGRAPH_OUTPUT, EMPTY_PARAGRAPH_OUTPUT)
  return parts.join('\n\n')
}

/**
 * 章ファイル情報（`includeChapterInfo: true`）の 1 章分を Markdown へ組み立てる。
 * `buildBookInfoText` と同じ空項目省略・role label 方針だが、見出しは `##`
 * （作品情報の `#` より 1 段深い）、著者・訳者は配列のまま `、` で連結する。
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
      wrapAlignDiv('right', `${showRoleLabels ? '著: ' : ''}${authors.map(escapeMetadataMarkdownText).join('、')}`),
    )
  if (translators.length > 0)
    parts.push(
      wrapAlignDiv(
        'right',
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
 * Book 全体 HTML export の同名 helper と同じ役割。
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
 * LeME `.md` は Markdown 的なので、top-level block は原則空行区切りにする。Nyoze
 * の空 paragraph は、空行がそのまま畳まれて見た目の空きが消えないよう
 * `<p><br /></p>` に変換する。末尾の空 paragraph は保存時の trailing newline 由来
 * のことが多いため出力しない。
 *
 * top-level の子は、まず `normalizeTopLevelPageBreaks()`
 * （`pageBreakRenderModel.ts`）へ通す。これにより `:::page-break` 自体は結果から
 * 消え、直前・直後の空 paragraph も除外され、連続する page-break は 1 つの
 * pending break に畳まれ、文書先頭・末尾の page-break は無視される。以後は
 * normalize 済みの block 列だけを serialize する。
 *
 * `pageBreakBeforeHeading` が有効な場合、まだ `breakBefore` が付いていない
 * top-level heading（文書先頭を除く）の直前に自動で改ページ div を追加で挿入する。
 * 明示 `:::page-break` 由来の `breakBefore` が既に true の heading には重ねて
 * 挿入しない。見出し自体の serialize (`serializeHeading`) は変更しない。
 *
 * `chapterInfos` が渡されたときは、連結前 `doc.content` 内の元の位置
 * （`topLevelNodeIndex`、`ctx.headingIds` と同じ「参照 identity で 2 つの
 * パスを結ぶ」パターン）を使い、各章の開始位置に到達した content block の
 * 直前へ章ファイル情報の Markdown を差し込む。章境界の page-break は、
 * 章ファイル情報が非空で挿入された時点でそちらへ移し、章本文側の block には
 * 二重に付けない（章ファイル情報が空で省略される章では従来どおり章本文側の
 * block に残る）。章ファイル情報自体は `doc` の heading node としては
 * 挿入しないため、`pageBreakBeforeHeading` の対象にもならない
 * （ファイル冒頭コメント参照）。
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
  // 持っていても、その page-break div は重複させず 1 回だけ抑止する
  // （ファイル冒頭コメント参照）。
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

export function exportLeMECompatibleMarkdownFromDoc(
  doc: PMNode,
  options?: LeMEMarkdownExportOptions,
): LeMEMarkdownExportResult {
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
