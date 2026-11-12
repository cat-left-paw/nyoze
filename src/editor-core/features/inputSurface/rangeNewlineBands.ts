import type { EditorView } from '@tiptap/pm/view'
import { resolveSupportedEditorWritingMode, type SupportedEditorWritingMode } from '../writingModeNavigationMapping'
import { readContentOrigin } from './contentCoordinates'
import { readCaretRect } from './navigation/caretGeometry'
import { newlinePositionsOf, newlinesBetween } from './rangeNewlines'
import type { SurfaceRecord } from './inputSurface'

/**
 * PIS-RANGE-DISPLAY1: 範囲に入った改行（空行・段落の末尾・hardBreak・コードの改行）の帯。
 *
 * CSS Custom Highlightは文字のない場所（改行）を塗れず、本文のDOM・CSSへ`::after`などを足すと行分けが変わる
 * （縦書きは既存の`p::after`のZWSPがあり、横書き・見出しは新しい`::after`で組みが変わる）。そのため帯は、
 * 入力面と同じscroll hostの子の別の層（`position: absolute`・内容の座標）に、`readCaretRect`の矩形から描く。
 * 本文のDOM（PMのview.domの中）・editorのroot・祖先には、何も書かない。PMのdecoration・transaction・updateStateも使わない。
 *
 * - 表示の事実は1つ: 範囲のHighlightが登録されている間だけ（`isShown()`。presenterの`update` / `clear`が同じ記録を更新する）。
 *   Highlightを消す`clear()`は、同じ呼び出しの中で帯も同期に消す。
 * - 矩形の読み取りと帯の配置は、既存の表示のframeの中（`render()`）で行う。transactionの直後に同期で矩形を読まない。
 *   timer・polling・新しいrAFは持たない（frameの要求は`requestFrame`で、既存の1つのrAFへ合流する）。
 * - scrollだけでは計算し直さない（内容の座標なので、ブラウザが追従する）。計算し直す鍵は、Doc・範囲（from / to）と、
 *   `invalidate()`（transaction・resize・font読み込み・paneの幾何の通知）。書字方向の変更は、`--editor-writing-mode`を書いた直後の
 *   `refreshInputSurfaceDisplay()`（paneの幾何の通知と同じ入口）で`invalidate()`に届くので、鍵では比べない。
 */

export const RANGE_NEWLINE_ATTRIBUTE = 'data-nyoze-range-newline'
/**
 * 帯の長さの代わりの値（font-sizeに対するem）。nativeの改行の帯の長さは、その行の最後のfontのspaceの送り（letter-spacingを含む）
 * で、等幅フォント（コード）では約0.6em、本文の明朝では約1/3 emと、fontで違うので、普段は`spaceAdvance`で測る
 * （canvasの`measureText(' ')`＋letter-spacing。DOMのspaceの幅と0.01 pxまで合う）。測れないときだけ、この値を使う。
 */
export const NEWLINE_BAND_EM = 1 / 3
/** 範囲の中の改行がこれを超えたら、帯を描かない（全選択の長文）。 */
export const MAX_RANGE_NEWLINE_BANDS = 300

export type RangeNewlineBandCounters = {
  /** 矩形を読み直した回数（`render()`の計算）。scrollだけのframeでは増えない。 */
  computations: number
  /** `render()`が鍵の一致で何もしなかった回数。 */
  skipped: number
  /** 現在の帯の数。 */
  bands: number
  /** 範囲の中の改行が上限を超えて、描かなかった回数。 */
  overLimit: number
  /** 矩形を読めず（折りたたまれた段落など）、描かなかった改行の数（直近の計算）。 */
  unreadable: number
  /** 直近の計算の、矩形の読み取りと配置の時間。 */
  lastDurationMs: number
}

type Applied = { left: number; top: number; width: number; height: number }

export function createRangeNewlineBands(options: {
  view: EditorView
  scrollHost: HTMLElement
  /** presenterのHighlight名。帯の色は、この値の属性selectorの規則（presenterの`<style>`）で共有する。 */
  name: string
  isShown(): boolean
  requestFrame(): void
  record: SurfaceRecord
  limit?: number
}) {
  const { view, scrollHost, name, record } = options
  const limit = options.limit ?? MAX_RANGE_NEWLINE_BANDS
  const doc = view.dom.ownerDocument, win = doc.defaultView!
  // 入力面の生成のときに1回だけ作り、editorの破棄まで同じ親・同じ要素のままにする。大きさのない箱で、帯だけがその子。
  const layer = doc.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, {
    position: 'absolute', left: '0px', top: '0px', width: '0px', height: '0px', margin: '0', padding: '0', border: '0',
    pointerEvents: 'none', overflow: 'visible',
    // 現在行の帯（0）より上、入力面（19）・擬似キャレット（20）より下。帯は字のない場所に出るので、本文の字を隠さない。
    zIndex: '1',
    // ANCHOR1: scroll hostの直下の表示専用の絶対配置の要素は、scroll anchoringの目印から外す。
    overflowAnchor: 'none',
  })
  scrollHost.appendChild(layer)

  const counters: RangeNewlineBandCounters = { computations: 0, skipped: 0, bands: 0, overLimit: 0, unreadable: 0, lastDurationMs: 0 }
  const pool: HTMLElement[] = []
  const applied: Applied[] = []
  /** 最後に計算したときの鍵。transaction・幾何の通知で`dirty`にして、計算し直す。 */
  let rendered: { doc: unknown; from: number; to: number; mode: SupportedEditorWritingMode } | null = null
  let dirty = false
  let destroyed = false

  const clear = () => {
    rendered = null
    dirty = false
    if (!pool.length) return
    layer.replaceChildren()
    pool.length = 0
    applied.length = 0
    counters.bands = 0
  }
  const element = (index: number) => {
    let band = pool[index]
    if (!band) {
      band = doc.createElement('div')
      band.setAttribute(RANGE_NEWLINE_ATTRIBUTE, name)
      band.style.position = 'absolute'
      band.style.pointerEvents = 'none'
      pool[index] = band
    }
    return band
  }
  const isRendered = () => {
    if (!rendered || dirty) return false
    const { doc: stateDoc, selection } = view.state
    return rendered.doc === stateDoc && rendered.from === selection.from && rendered.to === selection.to
  }

  let canvas: CanvasRenderingContext2D | null | undefined
  type Metrics = { size: number; space: number }
  const metricsByElement = new Map<Element, Metrics | null>()
  const spaceByFont = new Map<string, number>()
  /**
   * 改行の位置のDOMの要素（最後の字・要素を含む要素。空のtextblockならそのtextblock）のfont-sizeと、spaceの送り。
   * 読むだけ（computed styleとcanvas。DOMに書かない）。同じ要素・同じfontは、計算（`render()`）の間だけ使い回す。
   */
  const metricsOf = (n: number): Metrics | null => {
    let element: Element | null = null
    try {
      const at = view.domAtPos(n, -1)
      element = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : at.node as Element
    } catch { return null }
    if (!element) return null
    const known = metricsByElement.get(element)
    if (known !== undefined) return known
    const style = win.getComputedStyle(element)
    const size = parseFloat(style.fontSize)
    let metrics: Metrics | null = null
    if (Number.isFinite(size) && size > 0) {
      const letterSpacing = parseFloat(style.letterSpacing) || 0
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      let space = spaceByFont.get(font)
      if (space === undefined) {
        space = Number.NaN
        if (canvas === undefined) canvas = doc.createElement('canvas').getContext('2d')
        if (canvas) { canvas.font = font; space = canvas.measureText(' ').width }
        spaceByFont.set(font, space)
      }
      metrics = { size, space: (Number.isFinite(space) && space > 0 ? space : size * NEWLINE_BAND_EM) + letterSpacing }
    }
    metricsByElement.set(element, metrics)
    return metrics
  }

  return {
    /** presenterが範囲のHighlightを登録した。まだ描いていない範囲なら、表示のframeを要求する（読み取りはしない）。 */
    noteRange() { if (!destroyed && !isRendered()) options.requestFrame() },
    /** transaction・resize・font読み込み・paneの幾何の通知: 次の`render()`で矩形を読み直す。 */
    invalidate(requestFrame = true) {
      if (destroyed || !options.isShown()) return
      dirty = true
      if (requestFrame) options.requestFrame()
    },
    clear,
    /** 表示のframeの中で呼ぶ。Highlightがなければ消す。鍵が同じなら何もしない（scrollだけのframe）。 */
    render() {
      if (destroyed) return
      if (!options.isShown()) { clear(); return }
      if (isRendered()) { counters.skipped++; return }
      const state = view.state, { from, to } = state.selection
      const mode = resolveSupportedEditorWritingMode(win.getComputedStyle(view.dom).writingMode)
      if (!mode) { clear(); return }
      const positions = newlinesBetween(newlinePositionsOf(state.doc), from, to, limit)
      rendered = { doc: state.doc, from, to, mode }
      dirty = false
      if (!positions) { counters.overLimit++; clear(); rendered = { doc: state.doc, from, to, mode }; return }
      const started = performance.now()
      counters.computations++
      metricsByElement.clear()
      spaceByFont.clear()
      // 読み取りをすべて終えてから、書き込む（Layoutを増やさない）。
      type Band = { rect: { left: number; right: number; top: number; bottom: number }; size: number; length: number }
      const bands: Band[] = []
      let unreadable = 0
      for (const n of positions) {
        // 擬似キャレットと同じ用途: Ruby・縦中横・付箋・画像で終わる段落の末尾も、矩形が得られる。
        const rect = readCaretRect(view, n, mode, 'head', undefined, 'pseudo-caret')
        const metrics = rect ? metricsOf(n) : null
        if (!rect || !metrics) { unreadable++; continue }
        bands.push({ rect, size: metrics.size, length: metrics.space })
      }
      const origin = readContentOrigin(scrollHost)
      const vertical = mode === 'vertical-rl'
      let count = 0
      for (const { rect, size, length } of bands) {
        // block方向の太さは、同じ行のHighlight（字の箱）に合わせる: caretの矩形のblock方向の大きさ。
        // block方向に縮退した矩形（縦書きの`coordsAtPos`。字の箱の左端の位置だけを返す）は、font-sizeの太さで、その位置から置く。
        const extent = vertical ? rect.right - rect.left : rect.bottom - rect.top
        const thickness = extent > 0.5 ? extent : size
        const blockStart = extent > 0.5 ? (vertical ? rect.left : rect.top) : vertical ? rect.left : rect.top - thickness / 2
        const next: Applied = vertical
          ? { left: blockStart - origin.x, top: rect.top - origin.y, width: thickness, height: length }
          : { left: rect.left - origin.x, top: blockStart - origin.y, width: length, height: thickness }
        const band = element(count)
        const previous = applied[count]
        if (!previous || previous.left !== next.left) band.style.left = `${next.left}px`
        if (!previous || previous.top !== next.top) band.style.top = `${next.top}px`
        if (!previous || previous.width !== next.width) band.style.width = `${next.width}px`
        if (!previous || previous.height !== next.height) band.style.height = `${next.height}px`
        applied[count] = next
        if (!band.isConnected) layer.appendChild(band)
        count++
      }
      while (pool.length > count) { pool.pop()!.remove(); applied.pop() }
      counters.bands = count
      counters.unreadable = unreadable
      counters.lastDurationMs = performance.now() - started
      record('range-newlines', { bands: count, candidates: positions.length, unreadable, durationMs: counters.lastDurationMs })
    },
    counters: (): RangeNewlineBandCounters => ({ ...counters }),
    destroy() { destroyed = true; clear(); layer.remove() },
  }
}
