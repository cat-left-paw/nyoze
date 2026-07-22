/**
 * Page Viewer 本文の read-only PMNode → React renderer。
 *
 * 対象は独立 BrowserWindow の軽量ページビューアだけで、editor core /
 * serializer / clipboard には一切触れない (PM doc も変更しない、pure な
 * 読み取り専用変換)。`dangerouslySetInnerHTML` は使わない — すべて実際の
 * React element として組み立てるので、任意の HTML/JS が実行される経路は
 * そもそも存在しない。
 *
 * 変換方針は共有 semantic HTML 層 `htmlExportSemantic.ts` (PMNode → HTML
 * 文字列の pure converter) に合わせる (mark の入れ子順序、blockquote/list/
 * codeBlock の構造、aozoraRuby → `<ruby><rt>`、aozoraTcy → tate-chu-yoko
 * span、link href の安全性判定など)。ただし出力が HTML 文字列ではなく
 * React element である点、および unsupported node/mark を warning 収集
 * せず黙って fallback するだけ (viewer に warning UI が無いため) が異なる。
 *
 * 未対応の node/mark は例外を投げず、必ず何かしらの表示にフォールバックする
 * (子 block/inline があれば再帰、無ければ `textContent`)。`renderPageViewerFlowBlock`
 * 自体も try/catch で包み、想定外の入力でも viewer 全体をクラッシュさせない。
 */

import type { Fragment, Mark, Node as PMNode } from '@tiptap/pm/model'
import type { CSSProperties, ReactNode } from 'react'
import { collectAutoTcyRanges } from '../../editor-core/features/autoTcy'
import {
  formatDirectiveToken,
  isBuiltinStyleId,
  NYOZE_DIRECTIVE_NODE_NAME,
  type DirectiveKind,
} from '../../editor-core/io/customBlockDirective'
import { validateDocumentLinkHref } from '../../editor-core/io/linkHrefSafety'
import type { PageViewFlowBlock } from '../../editor-core/io/pageModelView'
import { PageViewerImage } from './PageViewerImage'
import type { PageViewerImageScope } from './pageViewerTypes'

/** PV-SET-1B: display-only auto TCY の Viewer 側適用オプション。 */
export type PageViewerAutoTcyRenderOptions = {
  enabled: boolean
  numbersOnly: boolean
  minDigits: number
  maxDigits: number
}

type PageViewerContentRenderOptions = {
  imageScope?: PageViewerImageScope
  imageBaseToken?: string
  onImageSettled?: () => void
  autoTcy?: PageViewerAutoTcyRenderOptions
}

// --- marks ------------------------------------------------------------------

// htmlExportSemantic.ts の MARK_PRIORITY と同じ入れ子順序: link が最外殻、code が最内殻。
const MARK_PRIORITY: Readonly<Record<string, number>> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  highlight: 4,
  underline: 5,
  code: 6,
}

function sortMarksForRender(marks: readonly Mark[]): Mark[] {
  return [...marks].sort(
    (a, b) => (MARK_PRIORITY[a.type.name] ?? 50) - (MARK_PRIORITY[b.type.name] ?? 50),
  )
}

/**
 * link mark の href を安全性判定する。`validateDocumentLinkHref` は
 * `htmlExportSemantic.ts` の書き出し判定と同じ関数 — `https:` / `http:` / `mailto:` /
 * `tel:` と相対パス・`#fragment` は許可、`javascript:` 等の危険なスキームは
 * 拒否する。拒否された場合 mark ごと落とす (テキストはそのまま残す)。
 *
 * クリックは要件どおり無効化する (`onClick` で `preventDefault`)。viewer
 * window は SEC-3 と同じ navigation 制限を持つので二重の防御になる。
 */
function renderLinkMark(mark: Mark, content: ReactNode, key: string): ReactNode {
  const rawHref = typeof mark.attrs.href === 'string' ? mark.attrs.href : ''
  const safeHref = validateDocumentLinkHref(rawHref)
  if (safeHref === null) return content
  const title = typeof mark.attrs.title === 'string' ? mark.attrs.title : undefined
  return (
    <a
      key={key}
      href={safeHref}
      title={title}
      className="page-viewer-window__link"
      onClick={(event) => event.preventDefault()}
    >
      {content}
    </a>
  )
}

function renderSingleMark(mark: Mark, content: ReactNode, key: string): ReactNode {
  switch (mark.type.name) {
    case 'bold':
      // 一部の CJK 明朝フォントは太字 face を持たず、UA 既定の相対キーワード
      // (`bolder`) だけでは computed font-weight が本文と変わらないことがある。
      // 数値の `font-weight: 700` を明示する専用 class を CSS 側に用意する。
      return (
        <strong key={key} className="page-viewer-window__mark-bold">
          {content}
        </strong>
      )
    case 'italic':
      return <em key={key}>{content}</em>
    case 'strike':
      return <s key={key}>{content}</s>
    case 'underline':
      return (
        <u key={key} className="page-viewer-window__underline">
          {content}
        </u>
      )
    case 'highlight':
      return (
        <mark key={key} className="page-viewer-window__highlight">
          {content}
        </mark>
      )
    case 'code':
      return (
        <code key={key} className="page-viewer-window__mark-code">
          {content}
        </code>
      )
    case 'link':
      return renderLinkMark(mark, content, key)
    default:
      // 未対応 mark: 例外を投げず、テキストはそのまま (mark だけ落とす)。
      return content
  }
}

/** `marks` を優先順位どおりに入れ子で適用する (最内殻から順に包んでいく)。 */
function wrapWithMarks(content: ReactNode, marks: readonly Mark[], keyPrefix: string): ReactNode {
  const sorted = sortMarksForRender(marks)
  let node = content
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    node = renderSingleMark(sorted[i], node, `${keyPrefix}-m${i}`)
  }
  return node
}

/**
 * PV-SET-1B: text node 1 個を `collectAutoTcyRanges` で分割し、マッチ区間だけ
 * `.page-viewer-window__tcy` + `data-page-viewer-auto-tcy` で包む。
 * link / code mark 付き text は Editor の `AutoTcyDecoration` と同じく対象外。
 * text node をまたいで token を結合しない。
 */
function renderTextWithOptionalAutoTcy(
  text: string,
  marks: readonly Mark[],
  key: string,
  autoTcy?: PageViewerAutoTcyRenderOptions,
): ReactNode {
  const hasExcludedMark = marks.some((mark) => mark.type.name === 'link' || mark.type.name === 'code')
  if (!autoTcy?.enabled || !text || hasExcludedMark) {
    return wrapWithMarks(text, marks, key)
  }

  const ranges = collectAutoTcyRanges(text, {
    minDigits: autoTcy.minDigits,
    maxDigits: autoTcy.maxDigits,
    numbersOnly: autoTcy.numbersOnly,
  })
  if (ranges.length === 0) {
    return wrapWithMarks(text, marks, key)
  }

  const parts: ReactNode[] = []
  let cursor = 0
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]
    if (range.from > cursor) {
      parts.push(text.slice(cursor, range.from))
    }
    parts.push(
      <span
        key={`${key}-auto-tcy-${index}`}
        className="page-viewer-window__tcy"
        data-page-viewer-auto-tcy="1"
      >
        {range.text}
      </span>,
    )
    cursor = range.to
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }
  return wrapWithMarks(parts, marks, key)
}

// --- inline -------------------------------------------------------------------

function renderInlineFragment(
  fragment: Fragment,
  keyPrefix: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  const out: ReactNode[] = []
  fragment.forEach((child, _offset, index) => {
    out.push(renderInlineNode(child, `${keyPrefix}-i${index}`, contentOptions))
  })
  return out
}

function renderInlineNode(
  node: PMNode,
  key: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  if (node.isText) {
    return renderTextWithOptionalAutoTcy(node.text ?? '', node.marks, key, contentOptions?.autoTcy)
  }
  switch (node.type.name) {
    case 'hardBreak':
      return <br key={key} />
    case 'aozoraRuby': {
      const ruby = typeof node.attrs.ruby === 'string' ? node.attrs.ruby : ''
      const content = (
        <ruby key={key} className="page-viewer-window__ruby">
          {node.textContent}
          <rt>{ruby}</rt>
        </ruby>
      )
      return wrapWithMarks(content, node.marks, `${key}-w`)
    }
    case 'aozoraTcy': {
      const content = (
        <span key={key} className="page-viewer-window__tcy">
          {node.textContent}
        </span>
      )
      return wrapWithMarks(content, node.marks, `${key}-w`)
    }
    case 'nyoze_image': {
      const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
      const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
      const title = typeof node.attrs.title === 'string' && node.attrs.title ? node.attrs.title : undefined
      const content = (
        <PageViewerImage
          key={key}
          src={src}
          alt={alt}
          title={title}
          imageScope={contentOptions?.imageScope}
          imageBaseToken={contentOptions?.imageBaseToken}
          onImageSettled={contentOptions?.onImageSettled}
        />
      )
      return wrapWithMarks(content, node.marks, `${key}-w`)
    }
    case 'html_inline_atom': {
      // 危険なコードとして実行されないよう、あくまで可視テキストとして
      // 表示するだけ (dangerouslySetInnerHTML は使わない)。
      const raw = typeof node.attrs.raw === 'string' ? node.attrs.raw : node.textContent
      return (
        <span key={key} className="page-viewer-window__unsupported-inline">
          {raw}
        </span>
      )
    }
    default: {
      // 未対応 inline node (nyoze_image / noteAnchor 等): 例外を投げず、
      // 子 inline があれば再帰、無ければ textContent (atom なので通常は空)。
      if (node.content.size > 0) {
        return renderInlineFragment(node.content, key, contentOptions)
      }
      const text = node.textContent
      return text ? <span key={key}>{text}</span> : null
    }
  }
}

// --- block --------------------------------------------------------------------

function renderChildBlocks(
  node: PMNode,
  keyPrefix: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  const out: ReactNode[] = []
  node.forEach((child, _offset, index) => {
    out.push(renderBlockNode(child, `${keyPrefix}-b${index}`, contentOptions))
  })
  return out
}

function clampHeadingLevel(level: number): number {
  return Math.min(Math.max(Math.round(level) || 1, 1), 6)
}

function renderHeading(node: PMNode, key: string, contentOptions?: PageViewerContentRenderOptions): ReactNode {
  const level = clampHeadingLevel((node.attrs.level as number) ?? 1)
  const className = `page-viewer-window__heading page-viewer-window__heading--level-${level}`
  const inline = renderInlineFragment(node.content, key, contentOptions)
  switch (level) {
    case 1:
      return (
        <h1 key={key} className={className}>
          {inline}
        </h1>
      )
    case 2:
      return (
        <h2 key={key} className={className}>
          {inline}
        </h2>
      )
    case 3:
      return (
        <h3 key={key} className={className}>
          {inline}
        </h3>
      )
    case 4:
      return (
        <h4 key={key} className={className}>
          {inline}
        </h4>
      )
    case 5:
      return (
        <h5 key={key} className={className}>
          {inline}
        </h5>
      )
    default:
      return (
        <h6 key={key} className={className}>
          {inline}
        </h6>
      )
  }
}

function renderParagraph(node: PMNode, key: string, contentOptions?: PageViewerContentRenderOptions): ReactNode {
  if (node.content.size === 0) {
    return (
      <p key={key} className="page-viewer-window__paragraph">
        <br />
      </p>
    )
  }
  return (
    <p key={key} className="page-viewer-window__paragraph">
      {renderInlineFragment(node.content, key, contentOptions)}
    </p>
  )
}

/**
 * task item の最初の子 block を、checkbox と同じ行に inline で表示するための
 * 中身だけを返す (paragraph なら `<p>` で包まず inline fragment のまま)。
 * paragraph 以外が最初の子になるのは稀だが、その場合も例外は投げず通常の
 * block として描画する (少なくとも checkbox の隣から始まる)。
 */
function renderTaskItemLeadContent(
  node: PMNode,
  key: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  if (node.type.name === 'paragraph') {
    return node.content.size > 0 ? renderInlineFragment(node.content, key, contentOptions) : null
  }
  return renderBlockNode(node, key, contentOptions)
}

/**
 * checklist item (`- [ ] タスク` / `- [x] タスク`)。editor 本体は
 * `list-style:none` + 絶対配置の `::before` 疑似要素でチェックボックスを
 * 描画するため checkbox 自体が DOM 要素として測定できない。read-only
 * viewer では実際の `<input>` を使い (editor state は変更しない、
 * disabled+readOnly)、最初の paragraph の inline content とだけ同じ
 * flex row に並べることで「checkbox と本文が同じ行」を満たす。2 個目以降の
 * paragraph / nested list はそのまま通常 block として row の下に続く。
 */
function renderTaskListItem(
  node: PMNode,
  key: string,
  checked: boolean,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  const children: PMNode[] = []
  node.forEach((child) => children.push(child))
  const [firstChild, ...restChildren] = children

  return (
    <li
      key={key}
      className="page-viewer-window__list-item page-viewer-window__list-item--task"
      data-task-item="true"
      data-task-checked={checked ? 'true' : 'false'}
    >
      <div className="page-viewer-window__task-row">
        <input
          type="checkbox"
          checked={checked}
          disabled
          readOnly
          className="page-viewer-window__checkbox"
        />
        <span className="page-viewer-window__task-content">
          {firstChild ? renderTaskItemLeadContent(firstChild, `${key}-t0`, contentOptions) : null}
        </span>
      </div>
      {restChildren.map((child, index) => renderBlockNode(child, `${key}-b${index + 1}`, contentOptions))}
    </li>
  )
}

function renderListItem(node: PMNode, key: string, contentOptions?: PageViewerContentRenderOptions): ReactNode {
  const checked = node.attrs.checked as boolean | null | undefined
  if (checked === true || checked === false) {
    return renderTaskListItem(node, key, checked, contentOptions)
  }
  return (
    <li key={key} className="page-viewer-window__list-item">
      {renderChildBlocks(node, key, contentOptions)}
    </li>
  )
}

function renderList(
  node: PMNode,
  key: string,
  tag: 'ul' | 'ol',
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  const items: ReactNode[] = []
  node.forEach((listItem, _offset, index) => {
    items.push(renderListItem(listItem, `${key}-li${index}`, contentOptions))
  })
  if (tag === 'ol') {
    const start = typeof node.attrs.start === 'number' ? node.attrs.start : 1
    return (
      <ol key={key} start={start !== 1 ? start : undefined} className="page-viewer-window__list">
        {items}
      </ol>
    )
  }
  return (
    <ul key={key} className="page-viewer-window__list">
      {items}
    </ul>
  )
}

function renderCodeBlock(node: PMNode, key: string): ReactNode {
  const language = typeof node.attrs.language === 'string' ? node.attrs.language : ''
  return (
    <pre key={key} className="page-viewer-window__code-block">
      <code className={language ? `language-${language}` : undefined}>{node.textContent}</code>
    </pre>
  )
}

/**
 * Nyoze 独自ブロック装飾 (`:::align-center` / `:::align-end` / `:::indent-N` /
 * `:::style-<id>`) を read-only 表示する。class 名・data attr の設計は
 * editor 本体の NodeView (`schema/nyozeDirectiveBlock.ts` の `renderHTML`)
 * および `htmlExportSemantic.ts` の `serializeDirectiveBlock()` と同じ token 組み立て
 * (`formatDirectiveToken`) を再利用しつつ、viewer 専用の `page-viewer-window__*`
 * class を出す (`PageViewerWindowRoot.css` 側で完結させるため editor 本体の
 * `.nyoze-directive-block*` class・CSS には依存しない)。
 *
 * - `align-center` / `align-end`: 論理 `text-align` (縦書きでも追従)。
 * - `indent-N`: `--nyoze-directive-indent-level` を inline style で渡し、
 *   CSS 側で論理 `padding-inline-start` に変換 (行頭側の字下げ)。
 * - `style-<id>`: 組み込み (letter/muted/heading) は専用 class、未知 id も
 *   壊さず表示するだけの class を付ける (子要素は必ず表示する)。
 */
function renderDirectiveBlock(
  node: PMNode,
  key: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  const kind = (node.attrs.kind as DirectiveKind) ?? 'style'
  const name = typeof node.attrs.name === 'string' ? node.attrs.name : ''
  const level = typeof node.attrs.level === 'number' ? node.attrs.level : null
  const token = formatDirectiveToken({ kind, name, level })

  const classes = ['page-viewer-window__directive']
  if (token) classes.push(`page-viewer-window__directive--${token}`)
  if (kind === 'style' && !isBuiltinStyleId(name)) {
    classes.push('page-viewer-window__directive--style-unknown')
  }

  const style: CSSProperties | undefined =
    kind === 'indent'
      ? ({ '--nyoze-directive-indent-level': String(level ?? 1) } as CSSProperties)
      : undefined

  return (
    <div
      key={key}
      className={classes.join(' ')}
      data-nyoze-kind={kind}
      data-nyoze-directive={token || undefined}
      style={style}
    >
      {renderChildBlocks(node, key, contentOptions)}
    </div>
  )
}

/**
 * 未対応 block node の fallback (`htmlExportSemantic.ts` の
 * `serializeUnsupportedBlock` と同じ方針): block 子要素があれば再帰して表示、
 * 無ければ textContent を `<div>` に、それも空なら何も描画しない。例外は投げない。
 */
function renderUnsupportedBlock(
  node: PMNode,
  key: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  if (node.isTextblock) {
    return renderParagraph(node, key, contentOptions)
  }
  if (node.content.size > 0) {
    return (
      <div key={key} className="page-viewer-window__unsupported-block">
        {renderChildBlocks(node, key, contentOptions)}
      </div>
    )
  }
  const text = node.textContent
  return text ? (
    <div key={key} className="page-viewer-window__unsupported-block">
      {text}
    </div>
  ) : null
}

function renderBlockNode(
  node: PMNode,
  key: string,
  contentOptions?: PageViewerContentRenderOptions,
): ReactNode {
  switch (node.type.name) {
    case 'paragraph':
      return renderParagraph(node, key, contentOptions)
    case 'heading':
      return renderHeading(node, key, contentOptions)
    case 'bulletList':
      return renderList(node, key, 'ul', contentOptions)
    case 'orderedList':
      return renderList(node, key, 'ol', contentOptions)
    case 'blockquote':
      return (
        <blockquote key={key} className="page-viewer-window__blockquote">
          {renderChildBlocks(node, key, contentOptions)}
        </blockquote>
      )
    case 'codeBlock':
      return renderCodeBlock(node, key)
    case 'horizontalRule':
      return <hr key={key} className="page-viewer-window__hr" />
    case 'hardBreak':
      return <br key={key} />
    case NYOZE_DIRECTIVE_NODE_NAME:
      return renderDirectiveBlock(node, key, contentOptions)
    default:
      return renderUnsupportedBlock(node, key, contentOptions)
  }
}

// --- entry point ----------------------------------------------------------

export type RenderPageViewerFlowBlockOptions = {
  /**
   * `breakBefore` (`:::page-break` 由来) の表現方法。
   * - `'divider'` (既定): 従来どおり破線 + 余白の表示用 class
   *   (`__block--break-before`)。CSS columns を使わない表示での視覚 marker。
   * - `'column'`: CSS multicol pagination 用の `break-before: column` class
   *   (`__block--column-break-before`)。破線 class とは別 class で、視覚装飾は
   *   付けない (ページ境界そのものが表現になる)。
   */
  breakBeforeStyle?: 'divider' | 'column'
  /** heading anchor 用の DOM id。PageModel の anchor id と 1:1 に対応する。 */
  anchorId?: string
  /** Page Viewer 専用の opaque image capability。実 filesystem path は含めない。 */
  imageScope?: PageViewerImageScope
  /** active document / chapter の trusted image base を指す opaque token。 */
  imageBaseToken?: string
  /** img load/error 後に親 flow の column metrics 再計測を予約する。 */
  onImageSettled?: () => void
  /**
   * PV-SET-1B: display-only auto TCY。`enabled` は caller が writingMode gate
   * (`shouldEnableAutoTcyDisplay`) 済みの値を渡す。省略 / disabled 時は
   * 従来どおり素の text のみ。
   */
  autoTcy?: PageViewerAutoTcyRenderOptions
}

/**
 * `PageViewFlowBlock` 1 件 (top-level PMNode 1 個) を read-only React
 * element へ変換する。`data-block-id` / `breakBefore` class は既存どおり
 * ラッパー要素へ付ける (section 構造・キーボードページ送り・scrubber は
 * このラッパーの外側 (`PageViewerWindowRoot.tsx`) が担当するのでここでは
 * 触れない)。
 *
 * 想定外の入力で内部変換が例外を投げても viewer 全体を落とさないよう、
 * ここで一度だけ catch し、`textContent` だけの最小表示に fallback する。
 */
export function renderPageViewerFlowBlock(
  block: PageViewFlowBlock,
  options?: RenderPageViewerFlowBlockOptions,
): ReactNode {
  const breakBeforeClass =
    options?.breakBeforeStyle === 'column'
      ? 'page-viewer-window__block--column-break-before'
      : 'page-viewer-window__block--break-before'
  const className = block.breakBefore
    ? `page-viewer-window__block ${breakBeforeClass}`
    : 'page-viewer-window__block'
  let content: ReactNode
  try {
    content = renderBlockNode(block.node, block.id, options)
  } catch {
    content = <p className="page-viewer-window__paragraph">{block.node.textContent}</p>
  }
  return (
    <div
      key={block.id}
      id={options?.anchorId}
      data-block-id={block.id}
      data-page-viewer-anchor-id={options?.anchorId}
      className={className}
    >
      {content}
    </div>
  )
}
