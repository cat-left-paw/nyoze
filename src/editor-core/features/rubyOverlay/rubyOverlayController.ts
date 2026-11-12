import type { Editor } from '@tiptap/core'
import { resolveSupportedEditorWritingMode, type SupportedEditorWritingMode } from '../writingModeNavigationMapping'
import { findBlockRange, type Band } from './blockRange'
import {
  DRAW_BUFFER_RATIO,
  LIVE_REFILL_MARGIN_RATIO,
  PARAGRAPH_PLAIN_TARGET_SELECTOR,
  PRUNE_BUFFER_RATIO,
  RUBY_OVERLAY_ATTRIBUTE,
  RUBY_OVERLAY_LAYER_ATTRIBUTE,
  RUBY_OVERLAY_READING_ATTRIBUTE,
  RUBY_READING_SELECTOR,
  RUBY_SELECTOR,
} from './constants'
import { COPIED_STYLE_PROPERTIES, buildCopiedCssText, resolveReadingFontSize } from './copiedStyle'
import { observeRubyOverlayLayout } from './observeLayout'

/**
 * EDITOR-RUBY-OVERLAY-P1: ルビの読みを、画面の近くの分だけ、`.editor-surface` の子の 1 つの層へ描く。
 *
 * 目的: ルビの親文字（`position: relative`）と読み（`position: absolute` + `transform`）は、ルビ 1 つにつき 2 つの PaintLayer になり、
 * 縦書きのホイールの hit test がルビの数に比例して重くなる（16,000 ルビで 1 回 15 ms）。既定の表示では、CSS で
 * 親文字の `position` を外し読みを `display: none` にして（`styles.css`）、読みはここで描く。
 *
 * - 本文の DOM（schema・renderHTML・parseHTML）・PM Doc・Markdown・clipboard は変えない。読みの要素は DOM に残る。
 * - 層は scroll する host（`.editor-surface`）の子の `position: absolute`（内容の座標）。描いた読みは scroll に付いて動き、
 *   scroll の間に JavaScript は要らない。層・属性は生成のときに 1 回だけ作り、destroy まで同じ親・同じ要素のまま。
 * - 描き直しは、typed なきっかけだけで受ける（timer・polling は使わない。rAF は表示のためだけ）:
 *   本文の変更（transaction・PM の DOM の変更）、大きさ（surface・PM root の ResizeObserver、window の resize）、
 *   組版・見た目の設定（`.editor-panel` と `documentElement` の属性、フォントの読み込み）、scroll（足りない分を足す）。
 * - 読み取り（矩形・computed style）をまとめて先に行い、書き込みを後にまとめる。
 *
 * 非 packaged の切る指定（`NYOZE_RUBY_OVERLAY=0`）の起動では作らない。
 */

/** `live`: scroll（描いていない範囲だけを足す）。`content`: 本文・大きさの変更（描いた読みの位置も測り直す）。`style`: 見た目の設定（写す style も読み直す）。 */
export type RubyOverlayUpdateKind = 'live' | 'content' | 'style'
const RANK: Record<RubyOverlayUpdateKind, number> = { live: 0, content: 1, style: 2 }

const VERTICAL_TRANSFORM = 'translate(calc(-1 * var(--editor-ruby-offset)), -50%)'
const HORIZONTAL_TRANSFORM = 'translate(-50%, calc(-100% + var(--editor-ruby-offset)))'
const POSITION_EPSILON = 0.001
/** 本文（ルビの親文字）の位置に効く property の transition。opacity・transform・color などは、位置を変えないので追わない。 */
const LAYOUT_TRANSITION_PROPERTY = /^(margin|padding|width|height|inline-size|block-size|min-|max-|inset|top$|left$|right$|bottom$|font|letter-spacing|word-spacing|line-height|text-indent|border-.*-width|gap|flex|all$)/

type Reading = {
  el: HTMLSpanElement
  rt: Element
  text: string
  vertical: boolean
  baseEm: number
  /** 親文字の箱の中心（内容の座標）。 */
  cx: number
  cy: number
  left: number
  top: number
  opacity: number
}

type GroupStyle = { cssText: string; baseEm: number; opacity: number }

export type RubyOverlayDiagnostics = {
  /** 層の子の数。 */
  layerChildCount: number
  /** 描いている読みの数（`drawn` の大きさ）。 */
  drawnCount: number
  covered: { lo: number; hi: number } | null
  updates: { total: number; live: number; content: number; style: number; liveSkipped: number; hidden: number }
  created: number
  removed: number
  lastDurationMs: number
  /** 直近の更新の時間（古い順、最大 `DURATION_RING` 件）。 */
  /** `ms` は描き直しの全体。`forcedMs` は、最初の読み取り（style・layout の再計算を強いる）までの時間（その frame でブラウザがどのみち払う分）。 */
  /**
   * P1: `frameTime` はその描き直しの frame の時刻（`document.timeline.currentTime`。同じ frame の rAF・ResizeObserver で同じ値）、
   * `scroll` は描き直しが読んだ surface の scroll 位置（`[scrollLeft, scrollTop]`）、`covered` は描き直しの後の描いた範囲（内容の座標）。
   * 試験の診断（B の遠い scroll の 1 frame の欠けの分類）だけに使う。
   */
  durations: { kind: RubyOverlayUpdateKind; startedAt: number; ms: number; forcedMs: number; created: number; frameTime: number | null; scroll: [number, number]; covered: { lo: number; hi: number } }[]
  hidden: boolean
}

const DURATION_RING = 400

/** 診断用: frame の時刻（同じ frame の中では同じ値）。数値にできないときは null。 */
function frameTimeOf(doc: Document): number | null {
  const value = doc.timeline?.currentTime
  return typeof value === 'number' ? value : null
}

export type RubyOverlayHandle = {
  /** 層・属性・購読をすべて外す。 */
  destroy(): void
  /** 試験用: 描いている (ruby, 読み) の対。DOM の要素を返すので、`page.evaluate` の中でだけ使う。 */
  entries(): { ruby: HTMLElement; reading: HTMLElement }[]
  diagnostics(reset?: boolean): RubyOverlayDiagnostics
  layer: HTMLElement
}

let activeHandle: RubyOverlayHandle | null = null

/** 試験・診断用。flag OFF（または未生成）のときは `null`。 */
export function getActiveRubyOverlayForE2e(): RubyOverlayHandle | null {
  return activeHandle
}

export function isRubyOverlayEnabled(): boolean {
  return typeof window !== 'undefined' && window.nyozeBridge?.rubyOverlay?.enabled === true
}

/**
 * flag が ON のときだけ、Host の root（`element`）へ属性を 1 回付け、層を作る。OFF のときは何もしない（`null`）。
 * 呼ぶのは、editor を作った直後の 1 か所だけ。
 */
export function attachRubyOverlay(editor: Editor, element: HTMLElement): RubyOverlayHandle | null {
  if (!isRubyOverlayEnabled()) return null
  const view = editor.view
  const surface = view.dom.closest('.editor-surface') as HTMLElement | null
  if (!surface) return null
  const panel = surface.closest('.editor-panel') as HTMLElement | null
  const doc = view.dom.ownerDocument
  const win = doc.defaultView!

  // CSS（`styles.css`）はこの属性の下だけ。view を作るときに 1 回だけ付け、途中で付け外ししない。
  element.setAttribute(RUBY_OVERLAY_ATTRIBUTE, '1')

  const layer = doc.createElement('div')
  layer.setAttribute(RUBY_OVERLAY_LAYER_ATTRIBUTE, '')
  layer.setAttribute('aria-hidden', 'true')
  layer.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;overflow:visible;pointer-events:none;user-select:none;' +
    // ANCHOR1: scroll host の直下の表示専用の絶対配置の要素は、scroll anchoring の目印から外す。
    'overflow-anchor:none;'
  surface.appendChild(layer)

  const drawn = new Map<HTMLElement, Reading>()
  let covered: { lo: number; hi: number } | null = null
  let lastMode: SupportedEditorWritingMode | null = null
  let hidden = false
  let destroyed = false
  let pendingKind: RubyOverlayUpdateKind | null = null
  let rafId = 0
  const counters = { total: 0, live: 0, content: 0, style: 0, liveSkipped: 0, hidden: 0, created: 0, removed: 0 }
  let durations: RubyOverlayDiagnostics['durations'] = []
  let lastDurationMs = 0

  const readingElementOf = (ruby: HTMLElement): Element | null => {
    const last = ruby.lastElementChild
    if (last && last.classList.contains('tategaki-aozora-ruby-rt')) return last
    return ruby.querySelector(RUBY_READING_SELECTOR)
  }

  const clearAll = () => {
    if (!drawn.size && !layer.firstChild) return
    layer.replaceChildren()
    counters.removed += drawn.size
    drawn.clear()
  }

  const isHiddenByState = (): boolean => {
    if (panel?.getAttribute('data-ruby-visible') === '0') return true
    // Source Mode は `.editor-surface` を隠す（display: none）。
    return surface.clientWidth === 0 || surface.clientHeight === 0
  }

  /** 画面（描く範囲・外す範囲の基準）の、内容の座標での範囲。scroll の量と大きさだけで決まり、layout を強いない。 */
  const viewportInContent = (mode: SupportedEditorWritingMode) =>
    mode === 'vertical-rl'
      ? { lo: surface.scrollLeft, size: surface.clientWidth }
      : { lo: surface.scrollTop, size: surface.clientHeight }

  const needsRefill = (mode: SupportedEditorWritingMode): boolean => {
    if (!covered) return true
    const { lo, size } = viewportInContent(mode)
    const margin = size * LIVE_REFILL_MARGIN_RATIO
    return lo - margin < covered.lo || lo + size + margin > covered.hi
  }

  const opacityOf = (parent: Element, cache: Map<Element, number>): number => {
    let product = 1
    for (let el: Element | null = parent; el && el !== surface; el = el.parentElement) {
      let own = cache.get(el)
      if (own === undefined) {
        const parsed = parseFloat(win.getComputedStyle(el).opacity)
        own = Number.isFinite(parsed) ? parsed : 1
        cache.set(el, own)
      }
      product *= own
    }
    return product
  }

  const run = (requested: RubyOverlayUpdateKind): void => {
    let kind = requested
    const started = performance.now()
    if (!view.dom.isConnected) return

    // ---- 表示しない状態 ----
    if (isHiddenByState()) {
      clearAll()
      covered = null
      hidden = true
      counters.hidden += 1
      return
    }
    hidden = false
    if (kind === 'live') {
      if (lastMode === null || !covered) kind = 'content'
      else if (!needsRefill(lastMode)) {
        counters.liveSkipped += 1
        return
      }
    }
    const mode = kind === 'live' ? lastMode! : resolveSupportedEditorWritingMode(win.getComputedStyle(view.dom).writingMode)
    if (!mode) {
      clearAll()
      covered = null
      lastMode = null
      return
    }
    const isVertical = mode === 'vertical-rl'

    // ---- 読み取り ----
    const surfaceRect = surface.getBoundingClientRect()
    // ここまでが、style・layout の再計算を強いる読み取り（その frame でブラウザがどのみち払う分）。
    const forcedMs = performance.now() - started
    const scrollLeft = surface.scrollLeft
    const scrollTop = surface.scrollTop
    const originX = surfaceRect.left + surface.clientLeft - scrollLeft
    const originY = surfaceRect.top + surface.clientTop - scrollTop
    const originAxis = isVertical ? originX : originY
    const viewportLo = isVertical ? surfaceRect.left + surface.clientLeft : surfaceRect.top + surface.clientTop
    const viewportSize = isVertical ? surface.clientWidth : surface.clientHeight
    const drawBand: Band = { lo: viewportLo - viewportSize * DRAW_BUFFER_RATIO, hi: viewportLo + viewportSize * (1 + DRAW_BUFFER_RATIO) }
    const pruneBand: Band = { lo: viewportLo - viewportSize * PRUNE_BUFFER_RATIO, hi: viewportLo + viewportSize * (1 + PRUNE_BUFFER_RATIO) }
    const inBand = (rect: DOMRect, band: Band) => (isVertical ? rect.right >= band.lo && rect.left <= band.hi : rect.bottom >= band.lo && rect.top <= band.hi)

    const blocks = view.dom.children
    const [start, end] = findBlockRange(blocks.length, (index) => blocks[index]!.getBoundingClientRect(), drawBand, isVertical)

    type Item = { ruby: HTMLElement; rect: DOMRect; reading: Reading | undefined }
    const items = new Map<HTMLElement, Item>()
    const remove: HTMLElement[] = []
    for (let i = start; i < end; i += 1) {
      for (const ruby of blocks[i]!.querySelectorAll<HTMLElement>(RUBY_SELECTOR)) {
        const known = drawn.get(ruby)
        if (known && kind === 'live') continue
        const rect = ruby.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        if (!inBand(rect, drawBand)) continue
        // 段落プレーン編集の入力欄は、その段落の本文の上に重なる。読みは重ねない。
        if (ruby.closest(PARAGRAPH_PLAIN_TARGET_SELECTOR)) continue
        items.set(ruby, { ruby, rect, reading: known })
      }
    }
    if (kind === 'live') {
      const pruneLo = pruneBand.lo - originAxis
      const pruneHi = pruneBand.hi - originAxis
      for (const [ruby, reading] of drawn) {
        const center = isVertical ? reading.cx : reading.cy
        if (!ruby.isConnected || center < pruneLo || center > pruneHi) remove.push(ruby)
      }
    } else {
      for (const [ruby, reading] of drawn) {
        if (items.has(ruby)) continue
        if (!ruby.isConnected) { remove.push(ruby); continue }
        const rect = ruby.getBoundingClientRect()
        if ((rect.width === 0 && rect.height === 0) || !inBand(rect, pruneBand) || ruby.closest(PARAGRAPH_PLAIN_TARGET_SELECTOR)) { remove.push(ruby); continue }
        items.set(ruby, { ruby, rect, reading })
      }
      // 描く範囲に入っていない（外す範囲の中）が、段落プレーン編集の段落になった読みは、上で外した。
    }

    // 写す style・大きさ・薄さは、親文字の親の要素ごとに 1 回だけ読む（同じ親の下のルビは同じ computed style）。
    const full = kind === 'style'
    const groups = new Map<Element, GroupStyle>()
    const opacityCache = new Map<Element, number>()
    type Plan = { item: Item; rt: Element; group: GroupStyle; restyle: boolean }
    const plans: Plan[] = []
    for (const item of items.values()) {
      const parent = item.ruby.parentElement
      const rt = readingElementOf(item.ruby)
      if (!parent || !rt) {
        if (item.reading) remove.push(item.ruby)
        continue
      }
      const restyle = full || !item.reading || item.reading.vertical !== isVertical
      let group = groups.get(parent)
      if (!group || (restyle && !group.cssText)) {
        let cssText = ''
        let baseEm = item.reading?.baseEm ?? 0
        if (restyle) {
          // 読みが継ぐ値は、ルビ（親文字の要素）と同じ。読みの要素そのものは、flag の CSS で大きさ 0 の文字にしてあるので、
          // その computed style（font-size: 0 など）は写さない。読みの大きさは `--editor-ruby-size`（親文字に対する比）から求める。
          const computed = win.getComputedStyle(item.ruby)
          const values: Record<string, string> = {}
          for (const name of COPIED_STYLE_PROPERTIES) values[name] = computed.getPropertyValue(name)
          baseEm = parseFloat(computed.fontSize)
          values['font-size'] = `${resolveReadingFontSize(computed.getPropertyValue('--editor-ruby-size'), baseEm, win)}px`
          // `.editor-panel[data-writing-mode]` の規則が読みへ与える値。横書きの読みは `text-orientation: initial`。
          values['writing-mode'] = mode
          values['text-orientation'] = isVertical ? computed.getPropertyValue('text-orientation') : 'mixed'
          cssText = buildCopiedCssText(values)
        }
        group = { cssText, baseEm, opacity: opacityOf(parent, opacityCache) }
        groups.set(parent, group)
      }
      plans.push({ item, rt, group, restyle })
    }

    // ---- 書き込み ----
    const fragment = doc.createDocumentFragment()
    let created = 0
    for (const { item, rt, group, restyle } of plans) {
      const cx = (item.rect.left + item.rect.right) / 2 - originX
      const cy = (item.rect.top + item.rect.bottom) / 2 - originY
      let reading = item.reading
      if (!reading) {
        const el = doc.createElement('span')
        el.setAttribute(RUBY_OVERLAY_READING_ATTRIBUTE, '')
        const text = rt.textContent ?? ''
        el.textContent = text
        el.style.cssText = group.cssText
        reading = { el, rt, text, vertical: isVertical, baseEm: group.baseEm, cx, cy, left: Number.NaN, top: Number.NaN, opacity: 1 }
        drawn.set(item.ruby, reading)
        fragment.appendChild(el)
        created += 1
      } else if (restyle) {
        reading.el.style.cssText = group.cssText
        reading.vertical = isVertical
        reading.baseEm = group.baseEm
        reading.left = Number.NaN
        reading.top = Number.NaN
        reading.opacity = 1
        reading.el.style.transform = ''
      }
      const text = rt.textContent ?? ''
      if (text !== reading.text) {
        reading.text = text
        reading.el.textContent = text
      }
      reading.rt = rt
      reading.cx = cx
      reading.cy = cy
      const left = isVertical ? cx + reading.baseEm / 2 : cx
      const top = isVertical ? cy : cy - reading.baseEm / 2
      if (!(Math.abs(left - reading.left) < POSITION_EPSILON)) { reading.el.style.left = `${left}px`; reading.left = left }
      if (!(Math.abs(top - reading.top) < POSITION_EPSILON)) { reading.el.style.top = `${top}px`; reading.top = top }
      if (!reading.el.style.transform) reading.el.style.transform = isVertical ? VERTICAL_TRANSFORM : HORIZONTAL_TRANSFORM
      if (group.opacity !== reading.opacity) {
        reading.el.style.opacity = group.opacity === 1 ? '' : String(group.opacity)
        reading.opacity = group.opacity
      }
    }
    if (fragment.firstChild) layer.appendChild(fragment)
    for (const ruby of remove) {
      const reading = drawn.get(ruby)
      if (!reading) continue
      reading.el.remove()
      drawn.delete(ruby)
      counters.removed += 1
    }
    counters.created += created
    covered = { lo: drawBand.lo - originAxis, hi: drawBand.hi - originAxis }
    lastMode = mode

    const ms = performance.now() - started
    counters.total += 1
    counters[kind] += 1
    lastDurationMs = ms
    durations.push({ kind, startedAt: started, ms, forcedMs, created, frameTime: frameTimeOf(doc), scroll: [scrollLeft, scrollTop], covered: { ...covered } })
    if (durations.length > DURATION_RING) durations = durations.slice(-DURATION_RING)
  }

  const flush = () => {
    rafId = 0
    const kind = pendingKind
    pendingKind = null
    if (destroyed || !kind) return
    run(kind)
  }
  /** 描き直しを要求する。rAF は表示のためだけ（所有・完了の根拠にしない）。要求は 1 つにまとめ、強い種類が勝つ。 */
  const schedule = (kind: RubyOverlayUpdateKind) => {
    if (destroyed) return
    if (pendingKind === null || RANK[kind] > RANK[pendingKind]) pendingKind = kind
    if (!rafId) rafId = win.requestAnimationFrame(flush)
  }

  /** 待っている rAF を取り下げ、待っていた要求と合わせて、その場で描き直す（layout の後・paint の前に呼ばれる通知用）。 */
  const runNow = (kind: RubyOverlayUpdateKind) => {
    if (destroyed) return
    const merged = pendingKind !== null && RANK[pendingKind] > RANK[kind] ? pendingKind : kind
    pendingKind = null
    if (rafId) { win.cancelAnimationFrame(rafId); rafId = 0 }
    run(merged)
  }

  const disposers: Array<() => void> = []

  /** scroll: 画面が描いた範囲の端に近づいたときだけ、足りない分を足す。描いた読みは動かさない（内容の座標なので scroll に付いて動く）。 */
  const observeScroll = () => {
    const onScroll = () => schedule('live')
    surface.addEventListener('scroll', onScroll, { passive: true })
    disposers.push(() => surface.removeEventListener('scroll', onScroll))
  }

  /** 本文の変更: Host の view の更新（transaction）と、transaction を伴わない PM の DOM の変更（変換中の DOM・割り込み表示の widget・sentinel・属性・折りたたみの class）。 */
  const observeContent = () => {
    const onTransaction = () => schedule('content')
    editor.on('transaction', onTransaction)
    disposers.push(() => editor.off('transaction', onTransaction))
    const observer = new win.MutationObserver(() => schedule('content'))
    observer.observe(view.dom, { childList: true, subtree: true, characterData: true, attributes: true })
    disposers.push(() => observer.disconnect())
    // DOM の変更も大きさの変更も伴わず、CSS の transition の間に本文の位置が動くことがある（見出しの折りたたみの印は、
    // 書字方向の切り替え・文書の読み込みで margin が 150 ms かけて動き、見出しの文字がずれる）。
    // 本文の位置に効く property の transition が始まったら（`transitionrun`）、その Animation が終わる（finished）まで、
    // frame ごとに描き直す。続ける条件は Animation 自身の状態（`playState`）で、timer・無条件の polling ではない。
    const tracked = new Set<Animation>()
    let trackRaf = 0
    const trackFrame = () => {
      trackRaf = 0
      if (destroyed) return
      for (const animation of tracked) if (!animation.pending && animation.playState !== 'running') tracked.delete(animation)
      if (!tracked.size) return
      // P1: この frame の Animation の値で、その場で描く。rAF の中から `schedule` すると描画は次の frame の rAF になり、
      // 同じ frame の ResizeObserver の `runNow` がその予約を取り消すと、次の frame が描かれずに transition の 1 frame だけ
      // 読みが遅れる（B の「遅れ」で観測）。この callback は frame ごとに 1 回なので、描くのも frame ごとに 1 回。
      runNow('content')
      trackRaf = win.requestAnimationFrame(trackFrame)
    }
    const onTransitionRun = (event: Event) => {
      const { propertyName, target } = event as TransitionEvent
      if (!LAYOUT_TRANSITION_PROPERTY.test(propertyName) || !(target instanceof Element)) return
      for (const candidate of target.getAnimations()) {
        if ((candidate as Animation & { transitionProperty?: string }).transitionProperty !== propertyName) continue
        const done = () => { tracked.delete(candidate); schedule('content') }
        tracked.add(candidate)
        candidate.finished.then(done, done)
      }
      if (tracked.size && !trackRaf) {
        schedule('content')
        trackRaf = win.requestAnimationFrame(trackFrame)
      }
    }
    view.dom.addEventListener('transitionrun', onTransitionRun)
    disposers.push(() => { view.dom.removeEventListener('transitionrun', onTransitionRun); if (trackRaf) win.cancelAnimationFrame(trackRaf); tracked.clear() })
    // 終わり・取り消しも、typed なきっかけとして受ける（`finished` を取り損ねた transition・animation の保険）。
    const onTransitionEnd = () => schedule('content')
    for (const type of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) {
      view.dom.addEventListener(type, onTransitionEnd)
      disposers.push(() => view.dom.removeEventListener(type, onTransitionEnd))
    }
  }

  /**
   * 大きさの変更: 窓・ペインの開閉・zoom・書字方向による組み直し（surface と PM root の大きさ）。
   * ResizeObserver の通知は layout の後・paint の前に届くので、rAF へ回さず（1 frame 遅れる）その場で描き直す。
   */
  const observeSize = () => {
    const resizeObserver = new win.ResizeObserver(() => runNow('content'))
    resizeObserver.observe(surface)
    resizeObserver.observe(view.dom)
    disposers.push(() => resizeObserver.disconnect())
    const onResize = () => schedule('content')
    win.addEventListener('resize', onResize)
    disposers.push(() => win.removeEventListener('resize', onResize))
  }

  /** 組版・見た目の設定（文字の大きさ・行の高さ・字間・フォント・ルビの大きさ・書字方向・テーマ・ルビの表示）とフォントの読み込み。 */
  const observeStyle = () => {
    const observer = new win.MutationObserver(() => schedule('style'))
    observer.observe(doc.documentElement, { attributes: true })
    if (panel) observer.observe(panel, { attributes: true })
    observer.observe(surface, { attributes: true })
    disposers.push(() => observer.disconnect())
    const fonts = doc.fonts
    if (fonts && typeof fonts.addEventListener === 'function') {
      const onFonts = () => schedule('style')
      fonts.addEventListener('loadingdone', onFonts)
      disposers.push(() => fonts.removeEventListener('loadingdone', onFonts))
    }
  }

  observeScroll()
  observeContent()
  observeSize()
  observeStyle()
  disposers.push(observeRubyOverlayLayout({ surface, root: view.dom, schedule: () => schedule('content'), afterLayout: () => runNow('content') }))
  schedule('style')

  const handle: RubyOverlayHandle = {
    layer,
    entries: () => [...drawn].map(([ruby, reading]) => ({ ruby, reading: reading.el })),
    diagnostics(reset = false) {
      const snapshot: RubyOverlayDiagnostics = {
        layerChildCount: layer.childElementCount,
        drawnCount: drawn.size,
        covered: covered ? { ...covered } : null,
        updates: { total: counters.total, live: counters.live, content: counters.content, style: counters.style, liveSkipped: counters.liveSkipped, hidden: counters.hidden },
        created: counters.created,
        removed: counters.removed,
        lastDurationMs,
        durations: [...durations],
        hidden,
      }
      if (reset) {
        counters.total = counters.live = counters.content = counters.style = counters.liveSkipped = counters.hidden = 0
        counters.created = counters.removed = 0
        durations = []
      }
      return snapshot
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (rafId) win.cancelAnimationFrame(rafId)
      rafId = 0
      pendingKind = null
      for (const dispose of disposers.splice(0)) dispose()
      layer.remove()
      drawn.clear()
      element.removeAttribute(RUBY_OVERLAY_ATTRIBUTE)
      if (activeHandle === handle) activeHandle = null
    },
  }
  activeHandle = handle
  return handle
}
