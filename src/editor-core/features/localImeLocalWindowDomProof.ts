import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import {
  RUBY_PUNCT_BASE_CLASS,
  RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE,
  RUBY_PUNCT_RUN_WRAPPER_CLASS,
  RUBY_PUNCT_TAIL_CLASS,
} from '../extensions/rubyPunctuationNowrap'

/**
 * LOCAL-WINDOW-INLINE-CAP1: whitelisted markの`<a>`（link）と`<code>`（inline code）は
 * PM側の共有capability述語が保証するのでDOM proofでは遮断しない。
 *
 * LOCAL-WINDOW-SPECIALINLINE1: Ruby / TCY wrapperと、それに必要な
 * `contenteditable="false"`、および該当paragraphのhost sentinel widgetだけを、
 * **PM node positionから証明できた場合に限り**通す。無条件解除ではない。
 * note anchor / inline HTML atom / widget / gapcursorは引き続きfail-closedにする。
 */
const BLOCKED = [
  'ruby', '[data-note-anchor-id]', '[data-html-inline-atom]',
  '.ProseMirror-widget', '.ProseMirror-gapcursor',
].join(',')

/** PM proofで説明できない限り拒否する要素。 */
const CONDITIONAL = [
  '[contenteditable="false"]', '[data-aozora-ruby]', '[data-tategaki-tcy]',
  '[data-nyoze-special-inline-boundary]',
].join(',')

const SPECIAL_INLINE_NAMES = new Set(['aozoraRuby', 'aozoraTcy'])

/**
 * host sentinel が名乗ってよい `node種別 + 境界position` の **組**。
 * 種別と位置を別々のSetで照合すると、Ruby境界の種別とTCY境界のpositionを
 * 混ぜた不整合sentinelが通ってしまうため、必ずこのkeyで突き合わせる。
 */
export function buildLocalImeLocalWindowSentinelPairKey(
  nodeName: string,
  boundaryPos: number | string,
): string {
  return `${nodeName}@${boundaryPos}`
}

/**
 * `CONDITIONAL` に一致した要素1件ぶんの、DOM APIから切り離した判定入力。
 * `allowed`は証明済みwrapper / 直下readingとの **identity 一致** だけを表す
 * （子孫であることは許可理由にしない）。
 */
export type LocalImeLocalWindowConditionalCandidate = {
  readonly allowed: boolean
  readonly insideProvenWrapper: boolean
  readonly sentinelBoundary: string | undefined
  readonly sentinelNodeName: string | undefined
  readonly sentinelBoundaryPos: string | undefined
  readonly contentEditable: string | null
}

/** sentinel を名乗る dataset attribute を1つでも持つか。 */
function carriesSentinelAttributes(
  candidate: Pick<
    LocalImeLocalWindowConditionalCandidate,
    'sentinelBoundary' | 'sentinelNodeName' | 'sentinelBoundaryPos'
  >,
): boolean {
  return (
    candidate.sentinelBoundary !== undefined ||
    candidate.sentinelNodeName !== undefined ||
    candidate.sentinelBoundaryPos !== undefined
  )
}

/**
 * 証明済みspecial-inline DOMだけで説明できる要素かを判定する。
 *
 * - 証明済みwrapper / 直下readingは identity 一致のときだけ許す。
 *   Ruby base 内の未知の `contenteditable="false"` は子孫でも許さない。
 * - **混合ロールは fail-closed**。host の実DOMではRuby / TCY wrapperもreadingも
 *   sentinel attributeを持たないので、identity一致でもsentinel attributeが1つでも
 *   混入していれば拒否する。`allowed`をsentinel proofの迂回路にしない。
 * - host sentinel は配置場所に関わらず専用の pair proof を通す。
 *   証明済みwrapperの内側は host の実配置（node の直後）ではないので拒否する。
 */
export function isLocalImeLocalWindowConditionalElementExplained(
  candidate: LocalImeLocalWindowConditionalCandidate,
  sentinelPairs: ReadonlySet<string>,
): boolean {
  if (candidate.allowed) return !carriesSentinelAttributes(candidate)
  if (candidate.sentinelBoundary !== 'after') return false
  if (candidate.insideProvenWrapper) return false
  if (candidate.contentEditable === 'false') return false
  if (candidate.sentinelNodeName === undefined) return false
  if (candidate.sentinelBoundaryPos === undefined) return false
  return sentinelPairs.has(
    buildLocalImeLocalWindowSentinelPairKey(
      candidate.sentinelNodeName,
      candidate.sentinelBoundaryPos,
    ),
  )
}

type SpecialInlineDomProof = {
  /** PM nodeから引いたwrapper要素。identityは`paragraphChildren`側でも固定される。 */
  wrappers: HTMLElement[]
  positions: number[]
  /** conditional selectorに一致してよい要素の exact identity 集合。 */
  allowed: Set<HTMLElement>
  /** sentinelが名乗ってよい `nodeName@boundaryPos` の組。 */
  sentinelPairs: Set<string>
}

/**
 * paragraph内のspecial-inline DOMを`view.nodeDOM(pos)`から証明する。
 * `textContent`比較はせず、attrsのSoTはPM側のままにする。
 */
function proveParagraphSpecialInlineDom(
  view: EditorView,
  paragraph: ProseMirrorNode,
  paragraphPos: number,
  dom: HTMLElement,
): SpecialInlineDomProof | null {
  const wrappers: HTMLElement[] = []
  const positions: number[] = []
  const allowed = new Set<HTMLElement>()
  const sentinelPairs = new Set<string>()
  let broken = false
  paragraph.forEach((child, offset) => {
    if (broken || !SPECIAL_INLINE_NAMES.has(child.type.name)) return
    const pos = paragraphPos + 1 + offset
    let candidate: Node | null = null
    try { candidate = view.nodeDOM(pos) } catch { broken = true; return }
    if (!(candidate instanceof HTMLElement) || !dom.contains(candidate)) { broken = true; return }
    if (child.type.name === 'aozoraRuby') {
      const bases = candidate.querySelectorAll(':scope > [data-aozora-base]')
      const readings = candidate.querySelectorAll(':scope > .tategaki-aozora-ruby-rt')
      const reading = readings[0]
      if (
        candidate.dataset.aozoraRuby !== '1' ||
        bases.length !== 1 ||
        readings.length !== 1 ||
        !(reading instanceof HTMLElement) ||
        reading.getAttribute('contenteditable') !== 'false'
      ) { broken = true; return }
      allowed.add(reading)
    } else if (
      candidate.dataset.tategakiTcy !== '1' ||
      candidate.getAttribute('contenteditable') !== 'false'
    ) { broken = true; return }
    wrappers.push(candidate)
    positions.push(pos)
    allowed.add(candidate)
    sentinelPairs.add(
      buildLocalImeLocalWindowSentinelPairKey(child.type.name, pos + child.nodeSize),
    )
  })
  if (broken) return null
  // detached / duplicate / stale special-inline DOM を弾く: DOM側の総数がPM側と一致すること。
  const domCount = dom.querySelectorAll('[data-aozora-ruby],[data-tategaki-tcy]').length
  if (domCount !== wrappers.length) return null
  return { wrappers, positions, allowed, sentinelPairs }
}

/**
 * `contenteditable="false"` と host sentinel を、証明済みspecial-inline DOMだけで説明する。
 * 説明できない1件でもfalse。DOM走査だけを行い、判定は上の pure 述語へ委ねる。
 */
function areConditionalElementsExplained(
  dom: HTMLElement,
  proof: SpecialInlineDomProof,
): boolean {
  for (const element of Array.from(dom.querySelectorAll(CONDITIONAL))) {
    if (!(element instanceof HTMLElement)) return false
    const explained = isLocalImeLocalWindowConditionalElementExplained(
      {
        allowed: proof.allowed.has(element),
        insideProvenWrapper: proof.wrappers.some(
          (wrapper) => wrapper !== element && wrapper.contains(element),
        ),
        sentinelBoundary: element.dataset.nyozeSpecialInlineBoundary,
        sentinelNodeName: element.dataset.nyozeSpecialInlineNode,
        sentinelBoundaryPos: element.dataset.nyozeSpecialInlineBoundaryPos,
        contentEditable: element.getAttribute('contenteditable'),
      },
      proof.sentinelPairs,
    )
    if (!explained) return false
  }
  return true
}

/**
 * LOCAL-WINDOW-RUBY-PUNCT-NOWRAP1: `RubyPunctuationNowrap` の run wrapper は表示専用で、
 * host PM の focus / decoration 更新のたびに **同じ子要素のまま span だけが貼り替わる**。
 * この境界を paragraph child identity の正本に含めると、Ruby ＋ 対象約物を含む
 * window で Local Window の base proof が Start 直後に stale になり、dirty commit が
 * recovery へ落ちる（本スライス以前から再現する既存不具合）。
 *
 * そこで **exact な run wrapper 1 種類だけ** を 1 段だけ展開し、中身（text node /
 * Ruby wrapper / sentinel / tail span）は従来どおり exact identity で並べて比較する。
 * wrapper 以外の未知 DOM は展開しないので、「wrapper があるから未知 DOM を許す」には
 * ならない。special-inline / sentinel の proof（`proveParagraphSpecialInlineDom` /
 * `areConditionalElementsExplained`）は生 DOM のまま一切変更していない。
 */
/** display-only wrapper の直下 child を、DOM を持ち込まずに記述する。 */
export type LocalImeLocalWindowDisplayWrapperChild = {
  readonly isElement: boolean
  readonly tagName: string | null
  /** `data-nyoze-ruby-punct`（`base` / `tail`）。名乗っていなければ `null`。 */
  readonly punctRole: string | null
  /** `data-aozora-ruby="1"` を持つ実 Ruby wrapper か。 */
  readonly isRubyBaseElement: boolean
  readonly classes: readonly string[]
  /** special-inline sentinel の dataset を 1 つでも持つか（混合 role 検出用）。 */
  readonly carriesSentinelAttributes: boolean
  /** 入れ子 run wrapper か。 */
  readonly isRunWrapper: boolean
}

export type LocalImeLocalWindowDisplayWrapperCandidate = {
  readonly tagName: string
  /** 要素が持つ属性名の**全件**。production wrapper は `class` と識別属性の 2 件だけ。 */
  readonly attributeNames: readonly string[]
  /** `data-nyoze-ruby-punct-run` の値。未設定は `null`。 */
  readonly wrapperAttributeValue: string | null
  readonly classes: readonly string[]
  readonly children: readonly LocalImeLocalWindowDisplayWrapperChild[]
}

/**
 * display-only wrapper と認めてよい **唯一** の形（pure 判定）。
 *
 * production の `wrapRun()` が作る wrapper は
 * `<span class="tategaki-ruby-punct-run" data-nyoze-ruby-punct-run="1">` で、
 * それ以外の属性（`contenteditable` / `style` / `id` / sentinel dataset 等）も
 * 追加 class も持たない。ここでは
 *
 * 1. tag が `SPAN`
 * 2. 識別属性が **exact に `"1"`**
 * 3. class が `tategaki-ruby-punct-run` **のみ**
 * 4. 属性集合が `class` と識別属性の **2 件ちょうど**（未知属性・混合 role を拒否）
 * 5. 実 Ruby base（`data-aozora-ruby="1"` ＋ `data-nyoze-ruby-punct="base"` ＋
 *    `tategaki-ruby-punct-base`）から tail（`data-nyoze-ruby-punct="tail"` ＋
 *    `tategaki-ruby-punct-tail`）までの正規 run 構造
 * 6. 中間 child が role を名乗らない・入れ子 wrapper でない
 *
 * をすべて満たすときだけ true を返す。1 つでも欠ければ未知 DOM として
 * 従来どおり exact identity 比較の対象に残す（fail-closed）。
 * 中間 child の種別は限定しない（`img.ProseMirror-separator` や host sentinel が
 * 入り得るため）が、identity 比較からは外さないので検出力は落ちない。
 */
export function isLocalImeLocalWindowDisplayNeutralWrapper(
  candidate: LocalImeLocalWindowDisplayWrapperCandidate,
): boolean {
  if (candidate.tagName !== 'SPAN') return false
  if (candidate.wrapperAttributeValue !== '1') return false
  if (candidate.classes.length !== 1) return false
  if (candidate.classes[0] !== RUBY_PUNCT_RUN_WRAPPER_CLASS) return false
  const attributeNames = new Set(candidate.attributeNames)
  if (attributeNames.size !== 2) return false
  if (!attributeNames.has('class')) return false
  if (!attributeNames.has(RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE)) return false

  const children = candidate.children
  if (children.length < 2) return false
  const base = children[0]
  const tail = children[children.length - 1]
  if (!base || !tail) return false
  if (
    !base.isElement || base.tagName !== 'SPAN' || !base.isRubyBaseElement ||
    base.punctRole !== 'base' || !base.classes.includes(RUBY_PUNCT_BASE_CLASS) ||
    base.carriesSentinelAttributes || base.isRunWrapper
  ) return false
  if (
    !tail.isElement || tail.tagName !== 'SPAN' || tail.punctRole !== 'tail' ||
    !tail.classes.includes(RUBY_PUNCT_TAIL_CLASS) ||
    tail.carriesSentinelAttributes || tail.isRunWrapper
  ) return false
  for (let index = 1; index < children.length - 1; index += 1) {
    const middle = children[index]!
    if (middle.punctRole !== null || middle.isRunWrapper) return false
  }
  return true
}

function describeDisplayWrapperChild(
  node: Node,
): LocalImeLocalWindowDisplayWrapperChild {
  if (!(node instanceof HTMLElement)) {
    return {
      isElement: false, tagName: null, punctRole: null, isRubyBaseElement: false,
      classes: [], carriesSentinelAttributes: false, isRunWrapper: false,
    }
  }
  return {
    isElement: true,
    tagName: node.tagName,
    punctRole: node.dataset.nyozeRubyPunct ?? null,
    isRubyBaseElement: node.dataset.aozoraRuby === '1',
    classes: Array.from(node.classList),
    carriesSentinelAttributes: carriesSentinelAttributes({
      sentinelBoundary: node.dataset.nyozeSpecialInlineBoundary,
      sentinelNodeName: node.dataset.nyozeSpecialInlineNode,
      sentinelBoundaryPos: node.dataset.nyozeSpecialInlineBoundaryPos,
    }),
    isRunWrapper: node.hasAttribute(RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE),
  }
}

function isRubyPunctuationRunWrapper(node: Node): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false
  return isLocalImeLocalWindowDisplayNeutralWrapper({
    tagName: node.tagName,
    attributeNames: node.getAttributeNames(),
    wrapperAttributeValue: node.getAttribute(RUBY_PUNCT_RUN_WRAPPER_ATTRIBUTE),
    classes: Array.from(node.classList),
    children: Array.from(node.childNodes).map(describeDisplayWrapperChild),
  })
}

/** 表示専用 wrapper 境界を除いた、identity 比較用の child node 列。 */
export function collectLocalImeLocalWindowDisplayNeutralChildren(
  dom: HTMLElement,
): Node[] {
  const children: Node[] = []
  for (const child of Array.from(dom.childNodes)) {
    if (isRubyPunctuationRunWrapper(child)) {
      // 1 段だけ展開する。入れ子 wrapper は production では作られないので追わない。
      for (const inner of Array.from(child.childNodes)) children.push(inner)
      continue
    }
    children.push(child)
  }
  return children
}

export type LocalImeLocalWindowDomProof = {
  hostRoot: HTMLElement
  editorSurface: HTMLElement
  paragraphDoms: readonly HTMLElement[]
  paragraphChildren: readonly (readonly Node[])[]
  blockPositions: readonly number[]
}

export type LocalImeLocalWindowDomProofResult =
  | { ok: true; proof: LocalImeLocalWindowDomProof }
  | { ok: false; reason: 'surface' | 'host-root' | 'paragraph-dom' | 'paragraph-shape' }

export function captureLocalImeLocalWindowDomProof(input: {
  view: EditorView
  editorSurface: HTMLElement | null
  blockPositions: readonly number[]
  paragraphs: readonly ProseMirrorNode[]
}): LocalImeLocalWindowDomProofResult {
  const { view, editorSurface } = input
  if (!editorSurface?.isConnected || !editorSurface.contains(view.dom)) {
    return { ok: false, reason: 'surface' }
  }
  if (
    !view.dom.isConnected || !view.dom.classList.contains('ProseMirror') ||
    view.dom.parentElement?.classList.contains('editor-core-host') !== true
  ) return { ok: false, reason: 'host-root' }
  if (
    input.blockPositions.length === 0 ||
    input.blockPositions.length !== input.paragraphs.length
  ) return { ok: false, reason: 'paragraph-dom' }
  const doms: HTMLElement[] = []
  for (let index = 0; index < input.blockPositions.length; index += 1) {
    let candidate: Node | null = null
    try { candidate = view.nodeDOM(input.blockPositions[index]) } catch { /* reject below */ }
    if (!(candidate instanceof HTMLElement) || candidate.parentElement !== view.dom) {
      return { ok: false, reason: 'paragraph-dom' }
    }
    if (candidate.tagName !== 'P' || candidate.querySelector(BLOCKED)) {
      return { ok: false, reason: 'paragraph-shape' }
    }
    const specialInline = proveParagraphSpecialInlineDom(
      view,
      input.paragraphs[index],
      input.blockPositions[index],
      candidate,
    )
    if (!specialInline || !areConditionalElementsExplained(candidate, specialInline)) {
      return { ok: false, reason: 'paragraph-shape' }
    }
    doms.push(candidate)
  }
  return {
    ok: true,
    proof: {
      hostRoot: view.dom,
      editorSurface,
      paragraphDoms: doms,
      paragraphChildren: doms.map(
        (dom) => collectLocalImeLocalWindowDisplayNeutralChildren(dom),
      ),
      blockPositions: input.blockPositions,
    },
  }
}

export function validateLocalImeLocalWindowDomProof(input: {
  view: EditorView
  proof: LocalImeLocalWindowDomProof
  paragraphs: readonly ProseMirrorNode[]
}): boolean {
  const { proof, view } = input
  if (!view.dom.isConnected || proof.hostRoot !== view.dom || !proof.editorSurface.contains(view.dom)) {
    return false
  }
  if (
    proof.blockPositions.length === 0 ||
    proof.blockPositions.length !== proof.paragraphDoms.length ||
    proof.blockPositions.length !== proof.paragraphChildren.length ||
    proof.blockPositions.length !== input.paragraphs.length
  ) return false
  for (let index = 0; index < proof.blockPositions.length; index += 1) {
    if (view.state.doc.nodeAt(proof.blockPositions[index]) !== input.paragraphs[index]) return false
    let current: Node | null = null
    try { current = view.nodeDOM(proof.blockPositions[index]) } catch { return false }
    if (current !== proof.paragraphDoms[index] || current.parentNode !== view.dom) return false
    const children = collectLocalImeLocalWindowDisplayNeutralChildren(
      proof.paragraphDoms[index],
    )
    if (
      children.length !== proof.paragraphChildren[index].length ||
      children.some((child, childIndex) => child !== proof.paragraphChildren[index][childIndex])
    ) return false
  }
  return true
}

export function readLocalImeLocalWindowRect(
  proof: LocalImeLocalWindowDomProof,
  logicalBlockAxis: 'x' | 'y',
): { left: number; top: number; width: number; height: number; baseBlockExtent: number } | null {
  const surfaceRect = proof.editorSurface.getBoundingClientRect()
  const rects = proof.paragraphDoms.map((dom) => dom.getBoundingClientRect())
  if (rects.some((rect) => rect.width <= 0 || rect.height <= 0)) return null
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const values = [left, right, top, bottom, surfaceRect.left, surfaceRect.top]
  if (!values.every(Number.isFinite) || right <= left || bottom <= top) return null
  return {
    left: left - surfaceRect.left + proof.editorSurface.scrollLeft,
    top: top - surfaceRect.top + proof.editorSurface.scrollTop,
    width: right - left,
    height: bottom - top,
    baseBlockExtent: logicalBlockAxis === 'x' ? right - left : bottom - top,
  }
}
