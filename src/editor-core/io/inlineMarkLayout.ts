import { Mark, type Node as PMNode } from '@tiptap/pm/model'

/**
 * MD-ROUNDTRIP-INLINE-MARK1: 段落・見出しの inline の装飾（mark）を、保存して開き直しても
 * 変わらない順・区切りで並べる、純粋な配置（`serializeMarkdown.ts` の `serializeInlineContent`
 * が使う。PM Doc も Markdown の文字列も作らない）。
 *
 * 層:
 * - L0 リンク（いちばん外側。始まる・終わる・href が変わるところで内側をすべて閉じて開き直す）
 * - L1 太字・斜体・取り消し線（markdown-it が区切りとして読む）
 * - L2 ハイライト・下線（`==` `||`。Nyoze が text の中だけを正規表現で読むので、いつも L1 の内側）
 * - L3 code（いちばん内側。text node ごとに code span）
 *
 * 規則:
 * 1. 続いている L1・L2 は、それぞれの層の中で、開いている順（外側から）を保つ。外側の mark が
 *    閉じない限り閉じない。新しく開く mark が複数あるときは、その位置から長く続くものを外側にし
 *    （長さは PM の位置で測る）、同じ長さなら太字 → 斜体 → 取り消し線 → ハイライト → 下線の順。
 * 2. L1 が変わる（閉じる・開く）ところでは、開いている L2 をすべて閉じて開き直す。
 * 3. N1: L1 の区切りの内側のすぐ隣が空白の文字なら、CommonMark では区切りとして働かない
 *    （`**単語 **` は太字にならない）。その空白の文字からその L1 の mark を外したことにして
 *    配置し直す。区切りの内側のすぐ隣に空白が来なくなるまで繰り返す（mark は減るだけなので終わる）。
 *    すぐ隣が code のバッククォートや L2 の区切りのときは空白が隣にないので外さない。
 *    L2・code・リンクは外さない。
 * 4. 空白のうち、半角スペースと改行は救済の正規表現（`fallbackEmphasis.ts`）が救わないので常に外す。
 *    それ以外（全角スペース・タブなど）は、段落の中が1つの text token のときだけ救済が効くので、
 *    外す・外さないを呼び出し側が選ぶ（`InlineMarkStripMode`。読み直して一致するほうを使う）。
 * 5. 配置の style は2つ。'keep-open' が上の規則。'legacy' は変更前の配置（固定の優先順位 ―
 *    リンク → 太字 → 斜体 → 取り消し線 → ハイライト → 下線 ― で外側から開き、次の範囲で
 *    違う mark が現れたら共通の先頭だけ残して閉じ直す）に N1 だけを足したもの。
 *    'keep-open' は文字の直後で記号が続く位置（`あ**~~い~~`）で markdown-it が区切りとして読まず、
 *    変更前が救済の正規表現で偶然戻っていた場面を壊すことがあるので、呼び出し側が読み直して
 *    一致する style を選ぶ（変更前に往復できた場面を壊さないため）。
 */

export type InlineMarkName = 'bold' | 'italic' | 'strike' | 'highlight' | 'underline'

/**
 * N1 で空白から mark を外す範囲。'all' は半角スペース・改行と、全角スペースなど。'hard' は半角スペース・
 * 改行だけ（全角スペースなどの端は外さずに書く）。'none' は外さない（変更前と同じ）。
 */
export type InlineMarkStripMode = 'all' | 'hard' | 'none'

/** 配置の style。'keep-open' は続いている装飾を閉じない配置、'legacy' は変更前の固定の優先順位の配置。 */
export type InlineMarkLayoutStyle = 'keep-open' | 'legacy'

/** 層 L1。同じ長さの並びは、この順で外側から。 */
const L1_MARK_NAMES: readonly InlineMarkName[] = ['bold', 'italic', 'strike']
/** 層 L2。 */
const L2_MARK_NAMES: readonly InlineMarkName[] = ['highlight', 'underline']

const ALL_LAYERED_NAMES: readonly InlineMarkName[] = [...L1_MARK_NAMES, ...L2_MARK_NAMES]
const NAME_INDEX: Record<InlineMarkName, number> = { bold: 0, italic: 1, strike: 2, highlight: 3, underline: 4 }
const NAME_COUNT = ALL_LAYERED_NAMES.length

/** CommonMark の Unicode whitespace（タブ・LF・FF・CR と Zs）。1文字を渡す。 */
const COMMONMARK_WHITESPACE = /^[\t\n\f\r\p{Zs}]$/u

/** 救済の正規表現も救わない空白（半角スペースと改行）。 */
function isHardWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\n'
}

/** 救済の正規表現が救い得る空白（全角スペース・タブ・NBSP など）。 */
function isSoftWhitespace(ch: string): boolean {
  return ch !== ' ' && ch !== '\n' && COMMONMARK_WHITESPACE.test(ch)
}

/** 空白の文字（BMP の1文字）が、この範囲の N1 で外せる端か。 */
function isStrippableWhitespace(ch: string, mode: InlineMarkStripMode): boolean {
  if (mode === 'none') return false
  if (isHardWhitespace(ch)) return true
  return mode === 'all' && isSoftWhitespace(ch)
}

const SOFT_WHITESPACE_PROBE = /[\t\f\r\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/
const L1_MARK_NAME_SET: ReadonlySet<string> = new Set(L1_MARK_NAMES)
const LAYERED_MARK_NAME_SET: ReadonlySet<string> = new Set(ALL_LAYERED_NAMES)

export interface InlineMarkTraits {
  /** 太字・斜体・取り消し線・ハイライト・下線のどれかが付いた text・ルビ・縦中横がある。 */
  layeredMarks: boolean
  /**
   * 'keep-open' と 'legacy' の配置が違い得る inline がある（同じ範囲に装飾が2つ以上ある、または
   * 区切りなしに隣り合う2つの範囲がどちらも装飾を持つ）。装飾が1つの範囲だけなら false。
   */
  styleMayDiffer: boolean
  /** 太字・斜体・取り消し線の付いた text に、半角スペースと改行以外の空白がある（端にあるとは限らない）。 */
  softWhitespaceInMarkedText: boolean
}

function layeredMarkCount(marks: readonly Mark[]): number {
  let n = 0
  for (const mark of marks) if (LAYERED_MARK_NAME_SET.has(mark.type.name)) n += 1
  return n
}

/** 装飾を閉じて区切る inline node（画像・付箋・inline HTML・hardBreak）。 */
const INLINE_SEPARATOR_NODE_NAMES: ReadonlySet<string> = new Set(['nyoze_image', 'noteAnchor', 'html_inline_atom', 'hardBreak'])

function analyzeTextblock(textblock: PMNode, traits: InlineMarkTraits): void {
  let previousLayered = 0
  textblock.forEach((child) => {
    if (INLINE_SEPARATOR_NODE_NAMES.has(child.type.name)) {
      previousLayered = 0
      return
    }
    // ルビ・縦中横は、node の mark と子の mark が合わさる（実際の配置は両方を見る。ここは広めに数える）。
    const layered = layeredMarkCount(child.marks) + (child.isText ? 0 : layeredMarkCount(child.firstChild?.marks ?? []))
    if (layered >= 1) traits.layeredMarks = true
    if (layered >= 2 || (layered >= 1 && previousLayered >= 1)) traits.styleMayDiffer = true
    previousLayered = layered
    if (
      child.isText &&
      !traits.softWhitespaceInMarkedText &&
      SOFT_WHITESPACE_PROBE.test(child.text ?? '') &&
      child.marks.some((mark) => L1_MARK_NAME_SET.has(mark.type.name))
    ) {
      traits.softWhitespaceInMarkedText = true
    }
  })
}

/**
 * textblock の inline に、mark が1つでも付いた text・ルビ・縦中横があるか（画像・付箋・inline HTML・
 * hardBreak の mark は書き出しに使わないので見ない）。ルビ・縦中横は node の mark と子の mark の
 * どちらも見る（子の mark は共通でなくても数える。広めに見て、配置の計算へ回す）。
 * false なら、配置の計算を通さず、変更前と同じ書き方で書ける。
 */
export function hasInlineMarks(textblock: PMNode): boolean {
  let marked = false
  textblock.forEach((child) => {
    if (marked || INLINE_SEPARATOR_NODE_NAMES.has(child.type.name)) return
    if (child.marks.length > 0) {
      marked = true
      return
    }
    if (child.isText) return
    child.forEach((grandchild) => {
      if (grandchild.marks.length > 0) marked = true
    })
  })
  return marked
}

/** block の inline を見て、配置の候補を分ける必要があるかを安く調べる（読み直さない）。 */
export function analyzeInlineMarks(block: PMNode): InlineMarkTraits {
  const traits: InlineMarkTraits = { layeredMarks: false, styleMayDiffer: false, softWhitespaceInMarkedText: false }
  if (block.isTextblock) {
    analyzeTextblock(block, traits)
    return traits
  }
  block.descendants((node) => {
    if (!node.isTextblock) return true
    analyzeTextblock(node, traits)
    return false
  })
  return traits
}

/**
 * code span を書く。中身の `` ` `` の連続の最長 + 1 個の `` ` `` で囲み、中身が `` ` `` で始まる
 * か終わるとき、または空白で始まりかつ空白で終わる3文字以上のときは、両側に半角スペースを1つ
 * ずつ足す（読み込みが両側から1つずつ取る）。
 *
 * 読み込みの markdown-it 14.3.0 は `/^ (.+) $/` で取るので、CommonMark の仕様（空白だけの中身は
 * 取らない）と違い、空白だけの3文字以上も取る。往復を決めるのは Nyoze の読み込みなので、
 * 取られる中身はすべて足す（空白1つ・2つだけの中身は取られないので足さない）。
 */
export function formatCodeSpan(content: string): string {
  let longest = 0
  let run = 0
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 96) {
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  const fence = '`'.repeat(longest + 1)
  const needsPadding =
    content.startsWith('`') ||
    content.endsWith('`') ||
    (content.length >= 3 && content.startsWith(' ') && content.endsWith(' '))
  const pad = needsPadding ? ' ' : ''
  return fence + pad + content + pad + fence
}

/** 配置の入力 1 件。text node か、ルビ・縦中横の node（中身は青空文庫の符号化した文字）。 */
export interface InlineMarkItem {
  /** text node の文字、またはルビ・縦中横の符号化した文字。 */
  text: string
  /** ルビ・縦中横の node。text なら null。 */
  node: PMNode | null
  /** PM の位置での大きさ（text の長さ、または `node.nodeSize`）。 */
  size: number
  /** 実効の mark（ルビ・縦中横は node の mark と子に共通の mark）。 */
  marks: readonly Mark[]
}

/** 配置した後の 1 区間（同じ mark の組が続く文字）。 */
export interface PlannedSegment {
  text: string
  node: PMNode | null
  size: number
  /** N1 の後の mark の組。 */
  marks: readonly Mark[]
  link: Mark | null
  code: boolean
}

export type InlineMarkEvent =
  | { type: 'open'; name: InlineMarkName | 'link'; link: Mark | null }
  | { type: 'close'; name: InlineMarkName | 'link'; link: Mark | null }
  | { type: 'content'; segment: PlannedSegment }

export interface InlineMarkPlan {
  events: InlineMarkEvent[]
  /** N1 の後の区間（隣り合う同じ mark の組は1つにしてある）。 */
  segments: PlannedSegment[]
  /** N1 でどれかの空白から mark を外した（入力の mark の組と違う）。 */
  stripped: boolean
}

interface Seg extends PlannedSegment {
  l1: InlineMarkName[]
  l2: InlineMarkName[]
}

function classify(marks: readonly Mark[]): { link: Mark | null; l1: InlineMarkName[]; l2: InlineMarkName[]; code: boolean } {
  let link: Mark | null = null
  let code = false
  const names = new Set<string>()
  for (const mark of marks) {
    const name = mark.type.name
    if (name === 'link') link ??= mark
    else if (name === 'code') code = true
    else names.add(name)
  }
  return {
    link,
    l1: L1_MARK_NAMES.filter((name) => names.has(name)),
    l2: L2_MARK_NAMES.filter((name) => names.has(name)),
    code,
  }
}

function makeSeg(text: string, node: PMNode | null, size: number, marks: readonly Mark[]): Seg {
  return { text, node, size, marks, ...classify(marks) }
}

function sameLink(a: Mark | null, b: Mark | null): boolean {
  if (a === null || b === null) return a === b
  return a.eq(b)
}

interface Flag {
  index: number
  side: 'start' | 'end'
  name: InlineMarkName
}

interface LayoutResult {
  events: InlineMarkEvent[]
  flags: Flag[]
}

/** seg i から続く、その mark を持つ区間の長さ（同じリンクの中で、PM の位置の数）。 */
function computeRemaining(segs: readonly Seg[]): number[] {
  const rem = new Array<number>(segs.length * NAME_COUNT).fill(0)
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const seg = segs[i]
    const continues = i + 1 < segs.length && sameLink(seg.link, segs[i + 1].link)
    for (const name of seg.l1) {
      const k = NAME_INDEX[name]
      rem[i * NAME_COUNT + k] = seg.size + (continues ? rem[(i + 1) * NAME_COUNT + k] : 0)
    }
    for (const name of seg.l2) {
      const k = NAME_INDEX[name]
      rem[i * NAME_COUNT + k] = seg.size + (continues ? rem[(i + 1) * NAME_COUNT + k] : 0)
    }
  }
  return rem
}

function layout(segs: readonly Seg[], strip: InlineMarkStripMode, style: InlineMarkLayoutStyle): LayoutResult {
  const events: InlineMarkEvent[] = []
  const flags: Flag[] = []
  const rem = computeRemaining(segs)

  let link: Mark | null = null
  let s1: InlineMarkName[] = []
  let s2: InlineMarkName[] = []

  /** seg の端の文字が空白で、区切りのすぐ隣になる（code・L2・ルビ等が挟まらない）か。 */
  const edgeStrippable = (index: number, side: 'start' | 'end'): boolean => {
    const seg = segs[index]
    if (seg.node !== null || seg.code || seg.l2.length > 0) return false
    const ch = side === 'start' ? seg.text.charAt(0) : seg.text.charAt(seg.text.length - 1)
    return isStrippableWhitespace(ch, strip)
  }

  const closeL2 = (): void => {
    for (let k = s2.length - 1; k >= 0; k -= 1) events.push({ type: 'close', name: s2[k], link: null })
    s2 = []
  }
  /** s1 の k 番目以降を、内側から閉じる。閉じる直前の content は segs[lastIndex]。 */
  const closeL1To = (keep: number, lastIndex: number): void => {
    if (keep >= s1.length) return
    const strippable = lastIndex >= 0 && edgeStrippable(lastIndex, 'end')
    for (let k = s1.length - 1; k >= keep; k -= 1) {
      events.push({ type: 'close', name: s1[k], link: null })
      if (strippable) flags.push({ index: lastIndex, side: 'end', name: s1[k] })
    }
    s1 = s1.slice(0, keep)
  }
  const closeAll = (lastIndex: number): void => {
    closeL2()
    closeL1To(0, lastIndex)
    if (link !== null) {
      events.push({ type: 'close', name: 'link', link })
      link = null
    }
  }
  const orderForOpen = (names: InlineMarkName[], index: number): InlineMarkName[] =>
    names.length < 2
      ? names
      : [...names].sort(
          (a, b) =>
            rem[index * NAME_COUNT + NAME_INDEX[b]] - rem[index * NAME_COUNT + NAME_INDEX[a]] ||
            NAME_INDEX[a] - NAME_INDEX[b],
        )

  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i]

    if (!sameLink(link, seg.link)) {
      closeAll(i - 1)
      if (seg.link !== null) {
        events.push({ type: 'open', name: 'link', link: seg.link })
        link = seg.link
      }
    }

    if (style === 'legacy') {
      // 変更前の配置: 優先順位（L1 → L2）の並びのうち、共通の先頭だけ残して閉じ直す。
      const want = [...seg.l1, ...seg.l2]
      const stack = [...s1, ...s2]
      let keep = 0
      while (keep < stack.length && keep < want.length && stack[keep] === want[keep]) keep += 1
      if (keep < stack.length) {
        const strippable = i > 0 && stack.slice(keep).some((name) => L1_MARK_NAME_SET.has(name)) && edgeStrippable(i - 1, 'end')
        for (let k = stack.length - 1; k >= keep; k -= 1) {
          events.push({ type: 'close', name: stack[k], link: null })
          if (strippable && L1_MARK_NAME_SET.has(stack[k])) flags.push({ index: i - 1, side: 'end', name: stack[k] })
        }
      }
      const opening = want.slice(keep)
      const startStrippable = opening.some((name) => L1_MARK_NAME_SET.has(name)) && edgeStrippable(i, 'start')
      for (const name of opening) {
        events.push({ type: 'open', name, link: null })
        if (startStrippable && L1_MARK_NAME_SET.has(name)) flags.push({ index: i, side: 'start', name })
      }
      s1 = want.filter((name) => L1_MARK_NAME_SET.has(name))
      s2 = want.filter((name) => !L1_MARK_NAME_SET.has(name))
      events.push({ type: 'content', segment: seg })
      continue
    }

    // L1: 続いているものは閉じない。開いている順の先頭から、次の範囲にもあるものだけ残す。
    let keep1 = 0
    while (keep1 < s1.length && seg.l1.includes(s1[keep1])) keep1 += 1
    const kept1 = s1.slice(0, keep1)
    const toOpen1 = seg.l1.filter((name) => !kept1.includes(name))
    if (keep1 < s1.length || toOpen1.length > 0) closeL2()
    closeL1To(keep1, i - 1)
    if (toOpen1.length > 0) {
      const startStrippable = edgeStrippable(i, 'start')
      for (const name of orderForOpen(toOpen1, i)) {
        events.push({ type: 'open', name, link: null })
        s1.push(name)
        if (startStrippable) flags.push({ index: i, side: 'start', name })
      }
    }

    // L2: L1 が変わったときは空になっているので、すべて開き直す。
    let keep2 = 0
    while (keep2 < s2.length && seg.l2.includes(s2[keep2])) keep2 += 1
    if (keep2 < s2.length) {
      for (let k = s2.length - 1; k >= keep2; k -= 1) events.push({ type: 'close', name: s2[k], link: null })
      s2 = s2.slice(0, keep2)
    }
    const kept2 = s2
    const toOpen2 = seg.l2.filter((name) => !kept2.includes(name))
    for (const name of orderForOpen(toOpen2, i)) {
      events.push({ type: 'open', name, link: null })
      s2.push(name)
    }

    events.push({ type: 'content', segment: seg })
  }
  closeAll(segs.length - 1)
  return { events, flags }
}

/** 隣り合う text の区間で、mark の組が同じものを1つにする。 */
function pushMerged(out: Seg[], seg: Seg): void {
  const last = out[out.length - 1]
  if (last !== undefined && last.node === null && seg.node === null && Mark.sameSet(last.marks as Mark[], seg.marks as Mark[])) {
    out[out.length - 1] = makeSeg(last.text + seg.text, null, last.size + seg.size, last.marks)
    return
  }
  out.push(seg)
}

function withoutMarks(marks: readonly Mark[], names: ReadonlySet<InlineMarkName>): Mark[] {
  return marks.filter((mark) => !names.has(mark.type.name as InlineMarkName))
}

/** 先頭・末尾から数えた、外せる空白の連続の長さ。 */
function strippableRun(text: string, side: 'start' | 'end', strip: InlineMarkStripMode): number {
  let n = 0
  if (side === 'start') {
    while (n < text.length && isStrippableWhitespace(text.charAt(n), strip)) n += 1
  } else {
    while (n < text.length && isStrippableWhitespace(text.charAt(text.length - 1 - n), strip)) n += 1
  }
  return n
}

function applyFlags(segs: readonly Seg[], flags: readonly Flag[], strip: InlineMarkStripMode): Seg[] {
  const starts = new Map<number, Set<InlineMarkName>>()
  const ends = new Map<number, Set<InlineMarkName>>()
  for (const flag of flags) {
    const table = flag.side === 'start' ? starts : ends
    const set = table.get(flag.index) ?? new Set<InlineMarkName>()
    set.add(flag.name)
    table.set(flag.index, set)
  }
  const out: Seg[] = []
  segs.forEach((seg, index) => {
    const startNames = starts.get(index)
    const endNames = ends.get(index)
    if (startNames === undefined && endNames === undefined) {
      pushMerged(out, seg)
      return
    }
    const text = seg.text
    const head = startNames === undefined ? 0 : strippableRun(text, 'start', strip)
    const tail = endNames === undefined ? 0 : strippableRun(text, 'end', strip)
    if (head >= text.length || tail >= text.length) {
      // 全体が外せる空白。
      const names = new Set<InlineMarkName>([...(startNames ?? []), ...(endNames ?? [])])
      pushMerged(out, makeSeg(text, seg.node, seg.size, withoutMarks(seg.marks, names)))
      return
    }
    if (head > 0 && startNames !== undefined) {
      pushMerged(out, makeSeg(text.slice(0, head), null, head, withoutMarks(seg.marks, startNames)))
    }
    const middleStart = startNames !== undefined ? head : 0
    const middleEnd = endNames !== undefined ? text.length - tail : text.length
    pushMerged(out, makeSeg(text.slice(middleStart, middleEnd), null, middleEnd - middleStart, seg.marks))
    if (tail > 0 && endNames !== undefined) {
      pushMerged(out, makeSeg(text.slice(text.length - tail), null, tail, withoutMarks(seg.marks, endNames)))
    }
  })
  return out
}

/**
 * 区切り（画像・付箋・inline HTML・hardBreak）で分かれた1つの範囲を配置する。
 * 範囲の始めと終わりではすべて閉じている。
 */
export function planInlineMarks(
  items: readonly InlineMarkItem[],
  strip: InlineMarkStripMode,
  style: InlineMarkLayoutStyle,
): InlineMarkPlan {
  let segs: Seg[] = []
  for (const item of items) pushMerged(segs, makeSeg(item.text, item.node, item.size, item.marks))
  let stripped = false
  // 外した mark の数は単調に増え、1回の繰り返しで少なくとも1つ増えるので、必ず終わる。
  const limit = items.reduce((sum, item) => sum + item.text.length, 0) * 2 + 8
  for (let iteration = 0; ; iteration += 1) {
    const result = layout(segs, strip, style)
    if (result.flags.length === 0 || iteration >= limit) {
      return { events: result.events, segments: segs, stripped }
    }
    segs = applyFlags(segs, result.flags, strip)
    stripped = true
  }
}
