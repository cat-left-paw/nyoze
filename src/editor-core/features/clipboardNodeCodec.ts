import {
  DOMParser as PMDOMParser,
  DOMSerializer,
  type Attrs,
  type DOMOutputSpec,
  type Fragment,
  type Node as PMNode,
  type ParseOptions,
  type Schema,
  type Slice,
  type TagParseRule,
} from '@tiptap/pm/model'
import {
  classifyDirectiveToken,
  formatBlankPageToken,
  formatDirectiveToken,
  matchBlankPageToken,
  NYOZE_BLANK_PAGE_NODE_NAME,
  NYOZE_DIRECTIVE_NODE_NAME,
  NYOZE_PAGE_BREAK_NODE_NAME,
  type DirectiveAttrs,
} from '../io/customBlockDirective'
import { isMarkdownLinkDestinationAllowed } from '../io/parseMarkdown'
import { isNyozeClipboardHtml } from './clipboardInternalMark'

/**
 * CLIPBOARD-INTERNAL-PASTE3: Nyoze の中のコピー・切り取りと貼り付けで、画像・HTML の atom・
 * 改ページ・白紙・装飾ブロックを、同じ node・同じ属性で戻す。
 *
 * この6つの node の schema の `parseHTML()` は空で、`renderHTML()` は文字のラベルしか出さない
 * （エディタの DOM と、外から来た HTML の読み込みのため。変えない）。clipboard の経路だけに、
 * 属性を `data-nyoze-clip-*` として書く serializer と、それを読む parser を足す。
 *
 * - 書く: schema の serializer と同じ要素・同じ文字のラベルを出し、属性だけを足す
 *   （外のアプリが見る要素の種類と文字は変わらない）。
 * - 読む: `data-nyoze-clip` を持つ要素から node を作る規則を、schema の規則より先に置く。
 *   値は Markdown の parser と同じ関数で検査し、通らない要素からは node を作らない。
 * - Nyoze の印（`data-nyoze-copy="1"`）のない HTML からは作らない（`transformPastedHTML`）。
 *
 * serializer / parser は schema ごとに1回だけ作る。editorProps は schema ができる前に渡すので、
 * props の値は、渡された内容の schema の codec へ委ねる薄い入口にする。
 */

const CLIP_KIND_ATTR = 'data-nyoze-clip'
const CLIP_ATTR_PREFIX = 'data-nyoze-clip'
const CLIP_ATTR_PROBE = /data-nyoze-clip/i

type ClipAttributes = Record<string, string>

type NodeCodec = {
  name: string
  kind: string
  tag: string
  write: (node: PMNode) => ClipAttributes
  /** 検査に通らなければ false（node を作らない）。 */
  read: (element: HTMLElement) => Attrs | false
}

/**
 * 文字列の値（と画像の title の null）を、属性の値として往復で1文字も変わらない形にする。
 * JSON の文字列にし（引用符・`\`・改行・制御文字・サロゲートの片割れは escape される）、
 * 残る空白も `\uXXXX` にする（属性の値に空白がないので、HTML の薄さの判定の
 * `on…=` / `style=` の検出に、足した属性が関わらない）。
 */
export function encodeClipValue(value: string | null): string {
  return JSON.stringify(value).replace(/\s/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function decodeClipValue(raw: string | null): unknown {
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function readClipString(element: HTMLElement, name: string): string | null {
  const value = decodeClipValue(element.getAttribute(`${CLIP_ATTR_PREFIX}-${name}`))
  return typeof value === 'string' ? value : null
}

const NODE_CODECS: readonly NodeCodec[] = [
  {
    name: 'nyoze_image',
    kind: 'image',
    tag: 'span',
    write: (node) => ({
      [`${CLIP_ATTR_PREFIX}-src`]: encodeClipValue(String(node.attrs.src)),
      [`${CLIP_ATTR_PREFIX}-alt`]: encodeClipValue(String(node.attrs.alt)),
      [`${CLIP_ATTR_PREFIX}-title`]: encodeClipValue(node.attrs.title === null ? null : String(node.attrs.title)),
    }),
    read: (element) => {
      const src = readClipString(element, 'src')
      const alt = readClipString(element, 'alt')
      const title = decodeClipValue(element.getAttribute(`${CLIP_ATTR_PREFIX}-title`))
      if (src === null || alt === null) return false
      // Markdown の読み込みと同じ検査。通らない src（`javascript:` など）からは画像を作らない（ラベルの文字が入る）。
      if (!isMarkdownLinkDestinationAllowed(src)) return false
      if (title !== null && typeof title !== 'string') return false
      return { src, alt, title }
    },
  },
  {
    name: 'html_inline_atom',
    kind: 'html-inline',
    tag: 'span',
    write: (node) => ({ [`${CLIP_ATTR_PREFIX}-raw`]: encodeClipValue(String(node.attrs.raw)) }),
    read: (element) => {
      const raw = readClipString(element, 'raw')
      return raw === null ? false : { raw }
    },
  },
  {
    name: 'html_block_atom',
    kind: 'html-block',
    tag: 'div',
    write: (node) => ({ [`${CLIP_ATTR_PREFIX}-raw`]: encodeClipValue(String(node.attrs.raw)) }),
    read: (element) => {
      const raw = readClipString(element, 'raw')
      return raw === null ? false : { raw }
    },
  },
  {
    name: NYOZE_PAGE_BREAK_NODE_NAME,
    kind: 'page-break',
    tag: 'div',
    write: () => ({}),
    read: () => ({}),
  },
  {
    name: NYOZE_BLANK_PAGE_NODE_NAME,
    kind: 'blank-page',
    tag: 'div',
    write: (node) => ({ [`${CLIP_ATTR_PREFIX}-token`]: formatBlankPageToken(Number(node.attrs.count)) }),
    read: (element) => {
      const count = matchBlankPageToken(element.getAttribute(`${CLIP_ATTR_PREFIX}-token`) ?? '')
      return count === null ? false : { count }
    },
  },
  {
    name: NYOZE_DIRECTIVE_NODE_NAME,
    kind: 'directive',
    tag: 'div',
    write: (node) => ({ [`${CLIP_ATTR_PREFIX}-token`]: formatDirectiveToken(node.attrs as DirectiveAttrs) }),
    read: (element) => {
      const descriptor = classifyDirectiveToken(element.getAttribute(`${CLIP_ATTR_PREFIX}-token`) ?? '')
      return descriptor === null ? false : { kind: descriptor.kind, name: descriptor.name, level: descriptor.level }
    },
  },
]

/** clipboard の codec が扱う node の名前。 */
export const CLIPBOARD_CODEC_NODE_NAMES: readonly string[] = NODE_CODECS.map((codec) => codec.name)

function isPlainAttrsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !('nodeType' in value)
}

/** schema の serializer が返した要素の記述の、外側の要素に属性を足す（要素と子は変えない）。 */
function withClipAttributes(spec: DOMOutputSpec, attrs: ClipAttributes): DOMOutputSpec {
  if (Array.isArray(spec) && typeof spec[0] === 'string') {
    const [tag, second, ...rest] = spec as unknown as [string, ...unknown[]]
    if (isPlainAttrsObject(second)) return [tag, { ...second, ...attrs }, ...rest] as unknown as DOMOutputSpec
    const tail = spec.length > 1 ? [second, ...rest] : []
    return [tag, attrs, ...tail] as unknown as DOMOutputSpec
  }
  const element = (spec as { nodeType?: number }).nodeType === 1
    ? spec as unknown as Element
    : (spec as { dom?: Node }).dom?.nodeType === 1 ? (spec as { dom: Element }).dom : null
  if (element) for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value)
  return spec
}

type SchemaCodec = { serializer: DOMSerializer; parser: PMDOMParser; restorableNodes: Set<string>; restorableMarks: Set<string> }
const schemaCodecs = new WeakMap<Schema, SchemaCodec>()

function schemaCodec(schema: Schema): SchemaCodec {
  const cached = schemaCodecs.get(schema)
  if (cached) return cached
  const baseSerializer = DOMSerializer.fromSchema(schema)
  const baseParser = PMDOMParser.fromSchema(schema)
  const nodes = { ...baseSerializer.nodes }
  const codecRules: TagParseRule[] = []
  for (const codec of NODE_CODECS) {
    const render = baseSerializer.nodes[codec.name]
    if (!schema.nodes[codec.name] || !render) continue
    nodes[codec.name] = (node: PMNode) => withClipAttributes(render(node), { [CLIP_KIND_ATTR]: codec.kind, ...codec.write(node) })
    codecRules.push({ tag: `${codec.tag}[${CLIP_KIND_ATTR}="${codec.kind}"]`, node: codec.name, getAttrs: codec.read })
  }
  const parser = new PMDOMParser(schema, [...codecRules, ...baseParser.rules])
  const restorableNodes = new Set<string>()
  const restorableMarks = new Set<string>()
  for (const rule of parser.rules) {
    if ('node' in rule && rule.node) restorableNodes.add(rule.node)
    if ('mark' in rule && rule.mark) restorableMarks.add(rule.mark)
  }
  const codec = { serializer: new DOMSerializer(nodes, baseSerializer.marks), parser, restorableNodes, restorableMarks }
  schemaCodecs.set(schema, codec)
  return codec
}

/** clipboard の serializer（schema ごとに1つ）。 */
export function clipboardNodeSerializerFor(schema: Schema): DOMSerializer {
  return schemaCodec(schema).serializer
}

/** clipboard の parser（schema ごとに1つ）。 */
export function clipboardNodeParserFor(schema: Schema): PMDOMParser {
  return schemaCodec(schema).parser
}

/**
 * Nyoze の印を付けてよい slice か。印は「この HTML を ProseMirror の標準の貼り付けで読めば、
 * コピーした slice に戻る」という意味なので、clipboard の parser が戻せない node・mark を
 * 1つでも含む slice には付けない（付箋の marker は、書く前に slice から取り除く）。
 */
export function canRestoreSliceFromHtml(slice: Slice): boolean {
  const first = slice.content.firstChild
  if (!first) return true
  const { restorableNodes, restorableMarks } = schemaCodec(first.type.schema)
  let restorable = true
  slice.content.descendants((node: PMNode) => {
    if (!restorable) return false
    if (!node.isText && !restorableNodes.has(node.type.name)) restorable = false
    else if (node.marks.some((mark) => !restorableMarks.has(mark.type.name))) restorable = false
    return restorable
  })
  return restorable
}

/**
 * HTML から `data-nyoze-clip` / `data-nyoze-clip-*` の属性を取り除く。属性がなければ
 * 受け取った文字列をそのまま返す。本文の文字（text node）は変えない。
 */
export function stripClipboardNodeCodecAttributes(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  let removed = false
  for (const element of Array.from(template.content.querySelectorAll('*'))) {
    for (const name of element.getAttributeNames()) {
      if (!name.startsWith(CLIP_ATTR_PREFIX)) continue
      element.removeAttribute(name)
      removed = true
    }
  }
  return removed ? template.innerHTML : html
}

/**
 * `transformPastedHTML`: Nyoze の印のない HTML では、6つの node を作らない（外から来た HTML の
 * 結果を変えない）。`data-nyoze-clip` を含まない HTML は、受け取った文字列をそのまま返す。
 */
export function transformPastedHtmlForClipboardCodec(html: string): string {
  if (!CLIP_ATTR_PROBE.test(html)) return html
  if (isNyozeClipboardHtml(html)) return html
  return stripClipboardNodeCodecAttributes(html)
}

/**
 * editorProps の serializer。渡された fragment の schema の codec へ委ねる
 * （空の fragment は、schema に依らず空の DOM になる）。
 */
class ClipboardNodeSerializer extends DOMSerializer {
  constructor() {
    super({}, {})
  }

  override serializeFragment(fragment: Fragment, options?: { document?: Document }, target?: HTMLElement | DocumentFragment): HTMLElement | DocumentFragment {
    const first = fragment.firstChild
    if (!first) return super.serializeFragment(fragment, options, target)
    return clipboardNodeSerializerFor(first.type.schema).serializeFragment(fragment, options, target)
  }

  override serializeNode(node: PMNode, options?: { document?: Document }): HTMLElement | Text {
    return clipboardNodeSerializerFor(node.type.schema).serializeNode(node, options)
  }
}

/** editorProps の parser。ProseMirror の貼り付けは、貼る位置（`context`）を必ず渡す。 */
const clipboardNodeParser = {
  parseSlice(dom: globalThis.Node, options: ParseOptions = {}): Slice {
    const schema = options.context?.doc.type.schema
    if (!schema) throw new Error('clipboard parser needs the paste context')
    return clipboardNodeParserFor(schema).parseSlice(dom, options)
  },
  parse(dom: globalThis.Node, options: ParseOptions = {}): PMNode {
    const schema = options.topNode?.type.schema ?? options.context?.doc.type.schema
    if (!schema) throw new Error('clipboard parser needs a schema')
    return clipboardNodeParserFor(schema).parse(dom, options)
  },
} as unknown as PMDOMParser

/** EditorCore の editorProps へ広げる props。 */
export const clipboardNodeCodecEditorProps = {
  clipboardSerializer: new ClipboardNodeSerializer(),
  clipboardParser: clipboardNodeParser,
  transformPastedHTML: transformPastedHtmlForClipboardCodec,
}
