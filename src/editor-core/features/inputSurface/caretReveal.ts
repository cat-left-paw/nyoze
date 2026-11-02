import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { EditOwner } from './editOwner'
import type { SurfaceRecord } from './inputSurface'
import { PM_SCROLL_MARGIN, revealCaret } from './navigation/scroll'

/**
 * `tr.scrollIntoView()`を付けたtransactionを、PISでもHostと同じに見える範囲へ出す。
 *
 * PMの`scrollToSelection()`は、DOMの選択のfocusNodeが`view.dom`の中にないと何もしない。PISでは選択が
 * 入力面（Hostの外）にあるので、印を付けたtransactionが常にscrollしなかった（B033）。
 * - 受け口は既存の`onTransaction`（pluginを足さない。`registerPlugin`はplugin viewを作り直す）。
 * - 実行は次のrAF 1回。rAFは表示のためだけで、所有・完了の根拠にしない（再検証して、冪等に読むだけ）。
 *   transactionの直後に同期で読むと、直接入力で1打あたりのLayoutが増えた（段階Aの観測）。
 * - revealはscrollだけ。transaction・selection・DOM selection・focusに触れない。
 */

/** DOMの選択のfocusNodeがどこにあるか。PMの`scrollToSelection`と同じ判定（nodeが要素でなければ親）。 */
export type RevealSelectionOwner = 'surface' | 'host' | 'other'

export function resolveRevealSelectionOwner(focusNode: Node | null, host: Node, surface: Node): RevealSelectionOwner {
  if (!focusNode) return 'other'
  const target = focusNode.nodeType === 1 ? focusNode : focusNode.parentNode
  if (!target) return 'other'
  // Hostの中ならPMが自分でscrollする。二重にしない。
  if (host.contains(target)) return 'host'
  return surface.contains(target) ? 'surface' : 'other'
}

export type CaretRevealRequestVerdict =
  | 'request' | 'ineligible' | 'no-scroll-request' | 'host-owns-selection' | 'selection-elsewhere' | 'composing'

/** transactionの時点の判定。`request`のときだけrAFを予約する。 */
export function judgeCaretRevealRequest(input: {
  eligible: boolean; scrollRequested: boolean; owner: RevealSelectionOwner; surfaceComposing: boolean
}): CaretRevealRequestVerdict {
  if (!input.eligible) return 'ineligible'
  if (!input.scrollRequested) return 'no-scroll-request'
  if (input.owner === 'host') return 'host-owns-selection'
  // 検索欄など別のUIにDOMの選択がある間は、HostでもPMはscrollしない。
  if (input.owner === 'other') return 'selection-elsewhere'
  // 変換中は配置・scroll・revealを凍結する（S7a）。確定のtransactionの後は対象。
  if (input.surfaceComposing) return 'composing'
  return 'request'
}

export type CaretRevealRunVerdict =
  | 'run' | 'view-destroyed' | 'ineligible' | 'generation-changed' | 'selection-moved' | 'composing'

/** rAFの時点の判定し直し。成り立たなければ何もしない。 */
export function judgeCaretRevealRun(input: {
  viewDestroyed: boolean; eligible: boolean; sameGeneration: boolean; owner: RevealSelectionOwner; surfaceComposing: boolean
}): CaretRevealRunVerdict {
  if (input.viewDestroyed) return 'view-destroyed'
  if (!input.eligible) return 'ineligible'
  if (!input.sameGeneration) return 'generation-changed'
  if (input.owner !== 'surface') return 'selection-moved'
  if (input.surfaceComposing) return 'composing'
  return 'run'
}

export type CaretRevealCounters = { requested: number; executed: number; scrolled: number; skipped: number; pending: boolean }

export function createCaretReveal(options: {
  view: EditorView
  surface: HTMLElement
  isEligible(): boolean
  getGeneration(): number
  isSurfaceComposing(): boolean
  currentOwner(): EditOwner
  /** scrollした場合だけ、同じcallbackの中で呼ぶ（入力面・範囲の表示・擬似キャレットの更新）。 */
  onRevealed(): void
  record: SurfaceRecord
}) {
  const { view, surface, record } = options
  const doc = view.dom.ownerDocument, win = doc.defaultView!
  const counters = { requested: 0, executed: 0, scrolled: 0, skipped: 0 }
  let frame = 0
  let requestedGeneration = -1
  const owner = () => resolveRevealSelectionOwner(doc.getSelection()?.focusNode ?? null, view.dom, surface)

  const run = () => {
    frame = 0
    counters.executed++
    const verdict = judgeCaretRevealRun({
      viewDestroyed: view.isDestroyed, eligible: options.isEligible(), sameGeneration: requestedGeneration === options.getGeneration(),
      owner: owner(), surfaceComposing: options.isSurfaceComposing(),
    })
    if (verdict !== 'run') { counters.skipped++; record('caret-reveal-skipped', { reason: verdict }); return }
    // PMと同じ順: 先にpropへ渡す。
    if (view.someProp('handleScrollToSelection', handler => handler(view))) { counters.skipped++; record('caret-reveal-skipped', { reason: 'handled-by-prop' }); return }
    const selection = view.state.selection
    let rect: { left: number; right: number; top: number; bottom: number } | null = null
    let position = selection.head
    try {
      if (selection instanceof NodeSelection) {
        // PMはNodeSelectionで、nodeのDOMの矩形を使う。
        const dom = view.nodeDOM(selection.from)
        if (dom instanceof Element) rect = dom.getBoundingClientRect()
        position = selection.from
      } else rect = options.currentOwner().caretRect()
    } catch { rect = null }
    if (!rect) { counters.skipped++; record('caret-reveal-skipped', { reason: 'rect-unavailable' }); return }
    let scrolled = false
    try { scrolled = revealCaret(view, rect, position, { margin: PM_SCROLL_MARGIN }) } catch { scrolled = false }
    if (!scrolled) return
    counters.scrolled++
    record('caret-reveal', { position, kind: selection instanceof NodeSelection ? 'node' : 'caret' })
    options.onRevealed()
  }

  const cancel = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
  }

  return {
    /** `onTransaction`が受けたtransaction（root + appended）。印があれば、次のrAFを1つだけ予約する。 */
    note(transactions: readonly Transaction[]) {
      const scrollRequested = transactions.some(transaction => transaction.scrolledIntoView)
      // 印のないtransaction（selectionだけ、通常の打鍵以外）は、DOMの選択を読まずに戻る。
      if (!scrollRequested) return
      const verdict = judgeCaretRevealRequest({
        eligible: options.isEligible(), scrollRequested, owner: owner(), surfaceComposing: options.isSurfaceComposing(),
      })
      if (verdict !== 'request') return
      requestedGeneration = options.getGeneration()
      if (frame) return
      counters.requested++
      frame = win.requestAnimationFrame(run)
    },
    cancel,
    counters: (): CaretRevealCounters => ({ ...counters, pending: !!frame }),
    destroy: cancel,
  }
}
export type CaretReveal = ReturnType<typeof createCaretReveal>
