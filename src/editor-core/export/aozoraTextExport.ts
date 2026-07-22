import type { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model'
import { encodeAozoraInlineNode } from '../io/clipboardSlicePlainText'
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
import type { BookExportBookInfo, BookExportChapterInfo } from './bookExportMetadata'

export type AozoraTextExportWarningCode =
  | 'unsupported-node'
  | 'unsupported-mark'
  | 'approximate-directive'
  | 'approximate-node'
  | 'unsupported-directive'
  | 'unsupported-style-directive'

export type AozoraTextExportWarning = {
  code: AozoraTextExportWarningCode
  message: string
  nodeType?: string
  markType?: string
  directive?: string
}

export type AozoraTextExportResult = {
  text: string
  warnings: AozoraTextExportWarning[]
}

const SUPPORTED_MARK_NAMES = new Set(['bold', 'italic'])

const MARK_PRIORITY: Record<string, number> = {
  bold: 1,
  italic: 2,
}

/**
 * 外部 export 共通の pure options model (`externalExportOptions.ts`) を青空文庫風
 * 向けの公開名で再輸出したものに、Book 全体 export 専用の作品情報 / 章ファイル
 * 情報表示 option を追加したもの。`ExternalExportOptions` 由来のフィールドは
 * 共有 `ExternalExportOptions` と同一で、省略時の既定値は現行挙動と完全に一致
 * する（`resolveExternalExportOptions` 参照）。
 *
 * Book 全体 export 専用の作品情報 / 章ファイル情報表示（2026-07-08、pure
 * conversion のみ。UI / IPC は未接続）:
 *   - `includeBookInfo` / `bookInfo` / `includeChapterInfo` / `chapterInfos` /
 *     `showRoleLabels` は Book 全体 export（`bookExportConversion.ts`）専用の
 *     option（`lemeMarkdownExport.ts` 冒頭コメントと同じ設計方針）。active
 *     document export では常に無視される。metadata 本体はこの converter 自身が
 *     読み書きせず、呼び出し側が Book manifest 由来の値をすでに組み立てて渡す。
 *   - LeME / でんでんが `#` / `##` の Markdown 見出しへ変換するのに対し、
 *     青空文庫風は見出し注記（`［＃「タイトル」は大見出し］`）を使わず、
 *     title / 著者・訳者を**通常テキストの行**として出す（見出し注記を使うと
 *     章ファイル情報の title が本文中の実在見出しと誤認されるおそれがあるため、
 *     意図して見出し扱いにしない）。著者・訳者行は `serializeAlignEnd` と同じ
 *     地付き注記（前置き型 `［＃地付き］本文`）で右寄せ近似する（title 行には
 *     付けない）。
 *   - 作品情報・章ファイル情報のブロック末尾には、本文との間に約3行分の
 *     余白を確保するため空行を3つ追加する。青空文庫風 txt は Markdown と違い
 *     連続する空行がそのまま複数の空行として残るため、この方式で正確に3行分の
 *     余白になる（LeME / でんでんの `<p><br /></p>` ×3 と同じ意図の、
 *     フォーマットに応じた実現方法）。
 *   - どちらも `doc` の top-level 走査には加わらない独立した文字列として合成
 *     するため、`pageBreakBeforeHeading` の見出し前自動改ページ判定には
 *     一切影響しない。章境界の `［＃改ページ］` は、章ファイル情報が非空で
 *     挿入される章ではその直前へ移る（章本文側には二重に付かない）。
 *   - 空の項目（title / author / authors / translators）は個別に省略し、
 *     全部空ならその block 自体を出さない。複数著者・訳者は配列順のまま
 *     `、` で連結する。`showRoleLabels: false` のときは「著: 」「訳: 」を
 *     前置しない。
 */
export type AozoraTextExportOptions = ExternalExportOptions & {
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

type ExportContext = {
  warnings: AozoraTextExportWarning[]
  /**
   * 現在有効な青空文庫字下げレベル（0 = 字下げなし）。`［＃ここからN字下げ］` /
   * `［＃ここで字下げ終わり］` は文書全体で単一の状態を持つフラグであり、
   * blockquote / `:::indent-N` のネストはスタックではなく絶対レベルとして
   * 表現する（AozoraEpub3 互換）。
   */
  activeIndentLevel: number
  options: ResolvedExternalExportOptions
}

function pushWarning(
  ctx: ExportContext,
  warning: AozoraTextExportWarning,
): void {
  ctx.warnings.push(warning)
}

function markPriority(mark: Mark): number {
  return MARK_PRIORITY[mark.type.name] ?? 99
}

function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => markPriority(a) - markPriority(b))
}

function openAozoraMark(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '［＃太字］'
    case 'italic':
      return '［＃斜体］'
    default:
      return ''
  }
}

function closeAozoraMark(mark: Mark): string {
  switch (mark.type.name) {
    case 'bold':
      return '［＃太字終わり］'
    case 'italic':
      return '［＃斜体終わり］'
    default:
      return ''
  }
}

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
      message: `Unsupported mark "${mark.type.name}" was stripped during Aozora text export`,
      markType: mark.type.name,
    })
  }
}

function wrapWithMarks(ctx: ExportContext, text: string, marks: Mark[]): string {
  const sorted = sortMarks(marks)
  const supported = sorted.filter((m) => SUPPORTED_MARK_NAMES.has(m.type.name))
  emitUnsupportedMarks(ctx, sorted)

  let open = ''
  let close = ''
  for (const mark of supported) {
    open += openAozoraMark(mark)
  }
  for (let i = supported.length - 1; i >= 0; i--) {
    close += closeAozoraMark(supported[i])
  }
  return `${open}${text}${close}`
}

function serializeTcy(ctx: ExportContext, node: PMNode): string {
  const body = node.textContent
  const encoded = `${body}［＃「${body}」は縦中横］`
  return wrapWithMarks(ctx, encoded, resolveInlineNodeMarks(node))
}

function serializeRuby(ctx: ExportContext, node: PMNode): string {
  const encoded = encodeAozoraInlineNode(node)
  if (encoded === null) return node.textContent
  return wrapWithMarks(ctx, encoded, resolveInlineNodeMarks(node))
}

/**
 * `src` からファイル名相当を取り出す。`/` / `\` どちらの区切りにも対応する
 * 純粋な文字列処理のみで、ファイルの存在確認や読み込みは行わない。
 */
function extractImageFileName(src: string): string {
  const trimmed = src.trim()
  if (!trimmed) return ''
  // Markdown の link destination 正規化で `\` が `%5C` に percent-encode
  // されることがあるため、生の `\` と併せて区切りとして扱う。
  const normalized = trimmed.replace(/\\/g, '/').replace(/%5c/gi, '/')
  const segments = normalized.split('/')
  return segments[segments.length - 1] ?? ''
}

const AOZORA_IMAGE_FALLBACK_DESCRIPTION = '画像'

/**
 * `nyoze_image` を青空文庫風の画像注記（`［＃説明（ファイル名）入る］`）へ近似する。
 * サイズ取得や画像ファイルの読み込みは行わず、`node.attrs` の文字列のみを使う。
 * `nyoze-img://` のような内部表示用 URL は使わない。
 */
function serializeAozoraImage(node: PMNode): string {
  const alt = ((node.attrs.alt as string) ?? '').trim()
  const title = ((node.attrs.title as string) ?? '').trim()
  const src = (node.attrs.src as string) ?? ''
  const description = alt || title || AOZORA_IMAGE_FALLBACK_DESCRIPTION
  const fileName = extractImageFileName(src)
  if (!fileName) {
    return `［＃${description}入る］`
  }
  return `［＃${description}（${fileName}）入る］`
}

function serializeInlineNode(ctx: ExportContext, node: PMNode): string {
  if (node.isText) {
    return wrapWithMarks(ctx, node.text ?? '', [...node.marks])
  }

  switch (node.type.name) {
    case 'aozoraRuby':
      return serializeRuby(ctx, node)
    case 'aozoraTcy':
      return serializeTcy(ctx, node)
    case 'nyoze_image':
      return serializeAozoraImage(node)
    case 'noteAnchor':
      return ''
    case 'hardBreak':
      return '\n'
    case 'html_inline_atom': {
      pushWarning(ctx, {
        code: 'unsupported-node',
        message: 'html_inline_atom raw HTML tags were omitted during Aozora text export',
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

/**
 * `1` → `１`、`10` → `１０` のように半角数字を全角数字へ変換する。
 * AozoraEpub3 は字下げ注記の数字が全角でないと `注記未変換` として扱うため、
 * 青空文庫向けの数値表記にはこの helper を必ず経由させる。
 */
function toAozoraFullWidthDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) + 0xfee0),
  )
}

/**
 * h1=大見出し、h2/h3=中見出し、h4〜h6=小見出し（LeME 実機確認結果に合わせた割当）。
 */
function resolveHeadingLabel(level: number): string {
  if (level <= 1) return '大見出し'
  if (level <= 3) return '中見出し'
  return '小見出し'
}

function serializeHeading(ctx: ExportContext, node: PMNode): string {
  const level = (node.attrs.level as number) ?? 1
  const inlineBody = serializeInlineFragment(ctx, node.content)
  const plainTitle = node.textContent.trim()

  if (!plainTitle) {
    pushWarning(ctx, {
      code: 'unsupported-node',
      message: 'Heading has no plain title text for Aozora heading annotation',
      nodeType: 'heading',
    })
    return inlineBody
  }

  return `${inlineBody}［＃「${plainTitle}」は${resolveHeadingLabel(level)}］`
}

function serializeParagraph(ctx: ExportContext, node: PMNode): string {
  if (node.content.size === 0) return ''
  return serializeInlineFragment(ctx, node.content)
}

function serializeDirectiveChildBlocks(ctx: ExportContext, node: PMNode, level: number): string[] {
  const lines: string[] = []
  node.forEach((child) => {
    lines.push(serializeBlock(ctx, child, level))
  })
  return lines
}

/**
 * 青空文庫の地付き注記は前置き型。1行なら `［＃地付き］本文`、複数行なら
 * ブロック指定（`［＃ここから地付き］` … `［＃ここで地付き終わり］`）にする。
 * 内容が空行のみの場合は無理に地付き化しない。
 */
function serializeAlignEnd(childLines: string[]): string {
  const body = childLines.join('\n')
  const bodyLines = body.split('\n')
  const hasContent = bodyLines.some((line) => line.length > 0)
  if (!hasContent) return body
  if (bodyLines.length === 1) {
    return `［＃地付き］${bodyLines[0]}`
  }
  return `［＃ここから地付き］\n${body}\n［＃ここで地付き終わり］`
}

/**
 * `:::align-center` の近似字下げ量。`［＃ページの左右中央］` は章扉 / 献辞などの
 * ページ単位配置注記であり、Nyoze の text-align 的な中央寄せとは意味が違うため
 * 使わない。青空文庫風 txt では代わりに字下げ注記へ近似する。
 */
const AOZORA_ALIGN_CENTER_INDENT_LEVEL = 5

function serializeDirectiveBlock(ctx: ExportContext, node: PMNode, level: number): string {
  const attrs: DirectiveAttrs = {
    kind: node.attrs.kind as DirectiveAttrs['kind'],
    name: (node.attrs.name as string) ?? '',
    level: (node.attrs.level as number | null) ?? null,
  }
  const token = formatDirectiveToken(attrs)

  if (attrs.kind === 'indent') {
    const directiveLevel = attrs.level ?? Number(attrs.name) ?? 1
    if (directiveLevel >= 1 && directiveLevel <= 6) {
      // AozoraEpub3 互換: 字下げは現在の字下げからの相対値ではなく、行端からの
      // 絶対字下げ量として出す。blockquote / 他の indent とネストしている場合は
      // 現在の ambient level に加算する（開始・終了注記自体は子の leaf 側で
      // `emitIndentTransition` により単一の状態遷移として出す）。
      const childLevel = level + directiveLevel
      const lines: string[] = []
      node.forEach((child) => {
        lines.push(serializeBlock(ctx, child, childLevel))
      })
      return lines.join('\n')
    }
  }

  if (attrs.kind === 'align' && attrs.name === 'center') {
    pushWarning(ctx, {
      code: 'approximate-directive',
      message:
        'align-center は青空文庫の「ページの左右中央」注記（ページ単位配置）とは意味が異なるため、５字下げとして近似出力',
      directive: token || 'align-center',
    })
    // indent-N と同じ字下げ状態遷移 helper に乗せる。現在の ambient level に
    // 加算するため、既存の字下げの中にある場合はさらに深い絶対レベルになる。
    const childLevel = level + AOZORA_ALIGN_CENTER_INDENT_LEVEL
    const lines: string[] = []
    node.forEach((child) => {
      lines.push(serializeBlock(ctx, child, childLevel))
    })
    return lines.join('\n')
  }

  if (attrs.kind === 'align' && attrs.name === 'end') {
    pushWarning(ctx, {
      code: 'approximate-directive',
      message: 'align-end は青空文庫の地付き注記として近似出力',
      directive: token || 'align-end',
    })
    // `［＃地付き］` / `［＃ここから地付き］…［＃ここで地付き終わり］` は align-end
    // 自身が出す literal な wrapper なので、子を serialize する前に現在の字下げ
    // 状態を ambient level へ戻しておく。そうしないと、子の leaf 側で発生する
    // `emitIndentTransition` の注記（例: 直前 sibling が字下げを残したまま終わった
    // 場合の `［＃ここで字下げ終わり］`）が地付き wrapper の内側に混入してしまう。
    const prefix = emitIndentTransition(ctx, level)
    const childLines = serializeDirectiveChildBlocks(ctx, node, level)
    const aligned = serializeAlignEnd(childLines)
    return prefix ? `${prefix}\n${aligned}` : aligned
  }

  const childLines = serializeDirectiveChildBlocks(ctx, node, level)
  const body = childLines.join('\n')

  if (attrs.kind === 'style') {
    const styleToken = token || `style-${attrs.name}`
    pushWarning(ctx, {
      code: 'unsupported-style-directive',
      message: `style directive "${styleToken}" was exported as plain text only`,
      directive: styleToken,
    })
    return body
  }

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
    case 'codeBlock':
    case 'html_block_atom':
      return true
    default:
      return false
  }
}

/** 本文区切りとしての罫線。warning は出さない。 */
function serializeAozoraHorizontalRule(): string {
  return '＊　＊　＊'
}

/**
 * `nyozePageBreak`（`:::page-break`）は AozoraEpub3 の標準改ページ注記
 * `［＃改ページ］` へ直接対応する。「ページの左右中央」「地付き」のような意味の
 * ズレがある近似ではなく、改ページという意味そのものが一致するため warning は
 * 出さない。
 *
 * Slice B（2026-07 page-break RenderModel 正規化）: top-level の `:::page-break`
 * は `pageBreakRenderModel.ts` の `normalizeTopLevelPageBreaks()` を経由してから
 * この注記を出す（`serializeTopLevelDoc` 参照）。出力記法自体は変えず、
 * 「いつ・何回出すか」の判定だけを normalize 済み pending break に寄せる
 * （LeME / でんでんと同じ方針）。
 *
 * 見出し前改ページレベル設定（2026-07）: `pageBreakBeforeHeadingMaxLevel`
 * （既定 `6`）で自動改ページの対象見出しレベルを絞れる。既定値は現行互換
 * （h1〜h6 すべて対象）。normalize 由来の `breakBefore` には影響しない。
 */
function serializeAozoraPageBreak(): string {
  return '［＃改ページ］'
}

/**
 * `:::blank-page` / `:::blank-page-N` (`nyozeBlankPage`) を、AozoraEpub3 標準の
 * 改ページ注記 `［＃改ページ］` の組み合わせで近似する。
 *
 * AozoraEpub3 には「空白ページ」専用の注記が無いため、`［＃改ページ］` は
 * あくまで「次に続く内容を新しいページから開始する」制御命令として扱う
 * （`serializeAozoraPageBreak` と同じ）。そのため、count 個の空白ページを
 * 分離するには、各ページの直前に改ページ注記を置くだけでなく、最後の
 * 空白ページの直後にも改ページ注記を置いて次の内容を新しいページへ押し出す
 * 必要がある（count 個のページに対し `count + 1` 個の改ページ注記）。
 *
 * 改ページ注記だけを連続させると、注記の掛かり先となる実体のある行が無く
 * なり、変換ツール側で注記が空振り（次の実内容へ吸収される等）する懸念が
 * あるため、各ページの間に全角スペース 1 文字（`AOZORA_BLANK_PAGE_FILLER`）
 * を最小限の filler として挟む。実機での正確な挙動（filler の見え方、
 * 連続する改ページ注記の扱い）は未確認のため `approximate-node` warning を
 * 付ける。
 */
const AOZORA_BLANK_PAGE_FILLER = '　'

function serializeAozoraBlankPageAnnotation(count: number): string {
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    parts.push(serializeAozoraPageBreak())
    parts.push(AOZORA_BLANK_PAGE_FILLER)
  }
  parts.push(serializeAozoraPageBreak())
  return parts.join('\n')
}

function warnBlankPageApproximated(ctx: ExportContext, count: number): void {
  pushWarning(ctx, {
    code: 'approximate-node',
    message: `Blank page (count=${count}) was approximated using ${count + 1} ［＃改ページ］ annotations around a minimal filler line; exact rendering in an AozoraEpub3-generated EPUB has not been verified`,
    nodeType: NYOZE_BLANK_PAGE_NODE_NAME,
  })
}

/**
 * blockquote は自身で開始・終了注記を出さず、子を「現在の字下げ + 1」の
 * 絶対レベルで再帰的に serialize するだけにする。開始 / 終了注記は子の leaf
 * block（paragraph 等）が `emitIndentTransition` 経由でレベル変化を検出した
 * ときにだけ出るため、ネストしても `ここで字下げ終わり` が重複しない。
 */
function serializeAozoraBlockquote(ctx: ExportContext, node: PMNode, level: number): string {
  const childLevel = level + 1
  const lines: string[] = []
  node.forEach((child) => {
    lines.push(serializeBlock(ctx, child, childLevel))
  })
  return lines.join('\n')
}

/**
 * listItem の中身（複数 paragraph / nested list を含む）を安全に本文化する。
 * task list の `checked` 属性は無視し、通常の list item として出力する。
 */
function serializeAozoraListItem(
  ctx: ExportContext,
  listItem: PMNode,
  marker: string,
  level: number,
): string {
  const lines: string[] = []
  listItem.forEach((child) => {
    lines.push(serializeBlock(ctx, child, level))
  })
  const [first, ...rest] = lines
  const indent = ' '.repeat(marker.length)
  let text = `${marker}${first ?? ''}`
  for (const line of rest) {
    text += `\n${indent}${line}`
  }
  return text
}

function serializeAozoraBulletList(ctx: ExportContext, node: PMNode, level: number): string {
  const items: string[] = []
  node.forEach((listItem) => {
    items.push(serializeAozoraListItem(ctx, listItem, '・', level))
  })
  return items.join('\n')
}

function serializeAozoraOrderedList(ctx: ExportContext, node: PMNode, level: number): string {
  let counter = (node.attrs.start as number) ?? 1
  const items: string[] = []
  node.forEach((listItem) => {
    items.push(serializeAozoraListItem(ctx, listItem, `${counter}. `, level))
    counter++
  })
  return items.join('\n')
}

function serializeUnsupportedBlock(ctx: ExportContext, node: PMNode): string {
  if (node.type.name === 'html_block_atom') {
    pushWarning(ctx, {
      code: 'unsupported-node',
      message: 'html_block_atom raw HTML was omitted during Aozora text export',
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
 * 現在の `ctx.activeIndentLevel` から `targetLevel` へ状態遷移するために
 * 必要な注記だけを返す。青空文庫の字下げ注記は文書全体で単一の状態フラグ
 * であり、ネスト用のスタックではないため、レベルが変わるたびに
 * `［＃ここからN字下げ］` を出し直すだけでよく（`N` が浅くなる場合も同様）、
 * `0` に戻るときだけ `［＃ここで字下げ終わり］` を出す。
 */
function emitIndentTransition(ctx: ExportContext, targetLevel: number): string {
  if (targetLevel === ctx.activeIndentLevel) return ''
  if (targetLevel <= 0) {
    ctx.activeIndentLevel = 0
    return '［＃ここで字下げ終わり］'
  }
  ctx.activeIndentLevel = targetLevel
  return `［＃ここから${toAozoraFullWidthDigits(targetLevel)}字下げ］`
}

/**
 * leaf block の直前に、必要な字下げ状態遷移注記を差し込む。`serializeContent`
 * は遅延評価にする必要がある。先に中身を評価してしまうと、bulletList /
 * orderedList のように中身の中でさらに `serializeBlock` を再帰呼び出しする
 * ケースで、そちらの再帰呼び出し（listItem 内 paragraph 等）が先に
 * `emitIndentTransition` を消費してしまい、注記がマーカー（`・` / `1. `）の
 * 後ろに入り込んでしまう。
 */
function serializeWithIndentTransition(
  ctx: ExportContext,
  level: number,
  serializeContent: () => string,
): string {
  const transition = emitIndentTransition(ctx, level)
  const content = serializeContent()
  if (!transition) return content
  return content.length > 0 ? `${transition}\n${content}` : transition
}

function serializeBlock(ctx: ExportContext, node: PMNode, level: number = 0): string {
  switch (node.type.name) {
    case 'paragraph':
      return serializeWithIndentTransition(ctx, level, () => serializeParagraph(ctx, node))
    case 'heading':
      return serializeWithIndentTransition(ctx, level, () => serializeHeading(ctx, node))
    case NYOZE_DIRECTIVE_NODE_NAME:
      return serializeDirectiveBlock(ctx, node, level)
    case 'noteAnchor':
      return ''
    case 'horizontalRule':
      return serializeWithIndentTransition(ctx, level, () => serializeAozoraHorizontalRule())
    case 'blockquote':
      return serializeAozoraBlockquote(ctx, node, level)
    case 'bulletList':
      return serializeWithIndentTransition(ctx, level, () =>
        serializeAozoraBulletList(ctx, node, level),
      )
    case 'orderedList':
      return serializeWithIndentTransition(ctx, level, () =>
        serializeAozoraOrderedList(ctx, node, level),
      )
    case 'nyoze_image':
      return serializeWithIndentTransition(ctx, level, () => serializeAozoraImage(node))
    case NYOZE_PAGE_BREAK_NODE_NAME:
      if (!ctx.options.pageBreak) return ''
      return serializeWithIndentTransition(ctx, level, () => serializeAozoraPageBreak())
    case NYOZE_BLANK_PAGE_NODE_NAME: {
      const count = (node.attrs.count as number) ?? 1
      warnBlankPageApproximated(ctx, count)
      return serializeWithIndentTransition(ctx, level, () => serializeAozoraBlankPageAnnotation(count))
    }
    default:
      if (isUnsupportedExportBlock(node)) {
        return serializeWithIndentTransition(ctx, level, () => serializeUnsupportedBlock(ctx, node))
      }
      if (node.isTextblock) {
        return serializeWithIndentTransition(ctx, level, () =>
          serializeInlineFragment(ctx, node.content),
        )
      }
      return serializeWithIndentTransition(ctx, level, () => serializeUnsupportedBlock(ctx, node))
  }
}

/** heading の `level` 属性を表示可能な範囲 (h1〜h6) へ丸める。 */
function clampHeadingLevel(level: number): number {
  return Math.min(Math.max(level, 1), 6)
}

/**
 * `pageBreakBeforeHeading` が有効なとき、top-level heading の直前に自動で
 * 改ページ注記を挿入するべきか判定する。
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

/**
 * Book 全体の作品情報（`includeBookInfo: true`）を、本文冒頭に一度だけ出す
 * 通常テキストの prelude として組み立てる。青空文庫風では見出し注記
 * （`［＃「タイトル」は大見出し］`）を使わず、title / 著者・訳者を通常テキストの
 * 行として出す（型定義の doc comment 参照）。`title` → `author` → `translator`
 * の順、空項目（trim 後）は個別に省略し、3 つとも空なら空文字列を返す。
 */
/**
 * 著者・訳者の1行を、青空文庫の地付き注記（前置き型、`serializeAlignEnd` の
 * 1行分岐と同じ記法）で右寄せ近似する。作品情報・章ファイル情報の著者・訳者行
 * だけに使う（title 行には付けない）。
 */
function applyAozoraCreditAlignEnd(line: string): string {
  return `［＃地付き］${line}`
}

function normalizeMetadataLine(value: string | undefined): string {
  return (value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

function buildBookInfoText(info: BookExportBookInfo | undefined, showRoleLabels: boolean): string {
  if (!info) return ''
  const title = normalizeMetadataLine(info.title)
  const author = normalizeMetadataLine(info.author)
  const translator = normalizeMetadataLine(info.translator)
  if (!title && !author && !translator) return ''

  const lines: string[] = []
  if (title) lines.push(title)
  if (author) lines.push(applyAozoraCreditAlignEnd(`${showRoleLabels ? '著: ' : ''}${author}`))
  if (translator) lines.push(applyAozoraCreditAlignEnd(`${showRoleLabels ? '訳: ' : ''}${translator}`))
  // 本文との間に約3行分の余白を確保する。青空文庫風 txt は Markdown と違い
  // 連続する空行がそのまま複数の空行として残るため、空文字列を3つ追加するだけで
  // よい（`buildChapterInfoText` と同じ理由）。
  lines.push('', '', '')
  return lines.join('\n')
}

/**
 * 章ファイル情報（`includeChapterInfo: true`）の 1 章分を通常テキストへ組み立てる。
 * `buildBookInfoText` と同じ空項目省略・role label 方針だが、著者・訳者は
 * 配列のまま `、` で連結する。
 */
function buildChapterInfoText(info: BookExportChapterInfo, showRoleLabels: boolean): string {
  const title = normalizeMetadataLine(info.title)
  const authors = (info.authors ?? []).map(normalizeMetadataLine).filter((author) => author.length > 0)
  const translators = (info.translators ?? [])
    .map(normalizeMetadataLine)
    .filter((translator) => translator.length > 0)
  if (!title && authors.length === 0 && translators.length === 0) return ''

  const lines: string[] = []
  if (title) lines.push(title)
  if (authors.length > 0)
    lines.push(applyAozoraCreditAlignEnd(`${showRoleLabels ? '著: ' : ''}${authors.join('、')}`))
  if (translators.length > 0)
    lines.push(applyAozoraCreditAlignEnd(`${showRoleLabels ? '訳: ' : ''}${translators.join('、')}`))
  // 章本文との間に約3行分の余白を確保する。章ファイル情報は
  // `serializeTopLevelDoc` の `lines` 配列へ1エントリとして push され、章本文の
  // 最初の行と単一の `\n` で連結されるため、ここで3つ空行を追加するだけで
  // 章本文との間に3行分の空行が入る。
  lines.push('', '', '')
  return lines.join('\n')
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
 * top-level の子は、まず `normalizeTopLevelPageBreaks()`
 * （`pageBreakRenderModel.ts`）へ通す。これにより `:::page-break` 自体は結果から
 * 消え、直前・直後の空 paragraph も除外され、連続する page-break は 1 つの
 * pending break に畳まれ、文書先頭・末尾の page-break は無視される。以後は
 * normalize 済みの block 列だけを serialize する（出力記法自体は
 * `serializeAozoraPageBreak` のまま変更しない）。
 *
 * `pageBreakBeforeHeading` が有効な場合、まだ `breakBefore` が付いていない
 * top-level heading（文書先頭を除く）の直前に自動で改ページ注記を追加で挿入する。
 * 明示 `:::page-break` 由来の `breakBefore` が既に true の heading には重ねて
 * 挿入しない。見出し自体の serialize (`serializeHeading`) は変更しない。
 *
 * 自動挿入する注記も既存の `serializeAozoraPageBreak` を経由し、字下げ状態遷移
 * (`serializeWithIndentTransition`) に乗せる。字下げが残ったまま次の top-level
 * block（見出し）へ移る場合でも、`［＃ここで字下げ終わり］` を欠かさないため。
 *
 * `chapterInfos` が渡されたときは、連結前 `doc.content` 内の元の位置
 * （`topLevelNodeIndex`）を使い、各章の開始位置に到達した content block の
 * 直前へ章ファイル情報の通常テキストを差し込む（LeME / でんでんと同じ
 * 「参照 identity で 2 つのパスを結ぶ」相関方式）。章境界の改ページ注記は、
 * 章ファイル情報が非空で挿入された時点でそちらへ移し、章本文側の block には
 * 二重に付けない。章ファイル情報自体は `doc` の heading node としては挿入
 * しないため、`pageBreakBeforeHeading` の対象にもならない。章ファイル情報の
 * 行自体も `serializeWithIndentTransition` に乗せ、残った字下げ状態を
 * 正しく閉じてから出力する。
 */
function serializeTopLevelDoc(
  ctx: ExportContext,
  doc: PMNode,
  chapterInfos: readonly BookExportChapterInfo[] | undefined,
  showRoleLabels: boolean,
): string {
  const lines: string[] = []
  const topLevelBlocks: PMNode[] = []
  doc.forEach((child) => topLevelBlocks.push(child))
  const normalized = normalizeTopLevelPageBreaks(topLevelBlocks)

  const sortedChapterInfos = sortChapterInfosByIndex(chapterInfos)
  const topLevelNodeIndex = sortedChapterInfos
    ? new Map(topLevelBlocks.map((node, i) => [node, i] as const))
    : null
  let chapterInfoPtr = 0

  // blank-page 自身の末尾改ページ注記がすでに「次を新しいページから始める」
  // 効果を持つため、直後の content block が明示 page-break 由来の
  // breakBefore を持っていても、その改ページ注記は重複させず 1 回だけ
  // 抑止する。
  let suppressNextBreakBefore = false

  normalized.forEach((block, index) => {
    if (block.kind === 'blankPage') {
      lines.push(
        serializeWithIndentTransition(ctx, 0, () => serializeAozoraBlankPageAnnotation(block.count)),
      )
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
            lines.push(serializeWithIndentTransition(ctx, 0, () => serializeAozoraPageBreak()))
            pendingBreak = false
          }
          lines.push(serializeWithIndentTransition(ctx, 0, () => infoText))
        }
      }
    }

    if (pendingBreak) {
      lines.push(serializeWithIndentTransition(ctx, 0, () => serializeAozoraPageBreak()))
    }

    lines.push(serializeBlock(ctx, node, 0))
  })
  if (ctx.activeIndentLevel !== 0) {
    lines.push(emitIndentTransition(ctx, 0))
  }
  const text = lines.join('\n')
  return text.length > 0 ? `${text}\n` : '\n'
}

export function exportAozoraTextFromDoc(
  doc: PMNode,
  options?: AozoraTextExportOptions,
): AozoraTextExportResult {
  const ctx: ExportContext = {
    warnings: [],
    activeIndentLevel: 0,
    options: resolveExternalExportOptions(options),
  }
  const showRoleLabels = options?.showRoleLabels ?? true
  const chapterInfos = options?.includeChapterInfo === true ? options?.chapterInfos : undefined
  const metadataText =
    options?.includeBookInfo === true
      ? buildBookInfoText(options?.bookInfo, showRoleLabels)
      : options?.includeDocumentInfo === true
        ? buildBookInfoText(options?.documentInfo, showRoleLabels)
        : ''
  const bodyText = serializeTopLevelDoc(ctx, doc, chapterInfos, showRoleLabels)
  // `metadataText` は末尾に既に3行分の空行を含む（`buildBookInfoText` 参照）ため、
  // ここでの連結は他の block 連結と同じ単一 `\n` にする（`\n\n` にすると空行が
  // 1行分余計に増えてしまう）。
  const text = metadataText.length > 0 ? `${metadataText}\n${bodyText}` : bodyText
  return { text, warnings: ctx.warnings }
}
