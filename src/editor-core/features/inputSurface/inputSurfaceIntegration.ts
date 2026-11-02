import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { createHostOwner } from './hostOwner'
import { createOwnerResolver } from './ownerResolver'
import { createInputSurface } from './inputSurface'
import { createPointerLending } from './pointerLending'
import { createKeyRouter } from './keyRouter'
import { createRangePresenter } from './rangePresenter'
import { isInputSurfaceCapable, isInputSurfacePathActive } from './inputSurfaceGate'
import { transitionSurface, type SurfaceEvent, type SurfaceState } from './surfaceState'
import type { NavigationOp } from './editOwner'
import { createInputSurfaceFocusIntegration } from './focusIntegration'
import { createInputSurfaceClipboard } from './clipboard'
import { createInputSurfaceDocumentAction } from './documentAction'
import { isInputSurfacePseudoCaretLive, type InputSurfacePseudoCaretGeometrySource } from './pseudoCaretSource'
import { createHostCompositionPresentation } from './compositionPresentation'
import { createCaretReveal, type CaretRevealCounters } from './caretReveal'
import { resolvePageUpDownScrollHost } from '../pageUpDownNavigation'
import { InputSurfaceCreationError } from './inputSurfaceCreation'
import { createVisualFocusCompositionSync } from './visualFocusCompositionSync'

export { isInputSurfaceCapable, isInputSurfacePathActive } from './inputSurfaceGate'

export type InputSurfaceSnapshot = {
  state: SurfaceState
  composing: boolean
  text: string
  content: { kind: string; consumed: boolean; rejected: boolean }
  failure: string | null
  lease: boolean
  hostComposing: boolean
  identity: string
  selection: { anchor: number; head: number; from: number; to: number }
  transactions: { total: number; docChanged: number; selectionOnly: number }
  highlightName: string
  highlightSupported: boolean
  /** B033: PMが求めたscrollを、入力面の選択のときにPISが代わりに行った回数（rAF単位）。 */
  reveal: CaretRevealCounters
  compositionPresentation: ReturnType<ReturnType<typeof createHostCompositionPresentation>['snapshot']>
  records: { kind: string; at: number; state: SurfaceState; detail: Record<string, unknown> }[]
}
declare global {
  interface Window { __NYOZE_INPUT_SURFACE_DIAGNOSTICS__?: () => InputSurfaceSnapshot }
}

/** OFFではDOM・state・listenerを生成せずnullを返す。接続の責務をここへ集める。 */
export function createInputSurfaceIntegration(options: {
  editor: Editor
  getSourceMode(): boolean
  getParagraphPlain(): boolean
  getLocalWindowActive(): boolean
  onParagraphPlainModeChange(listener: () => void): () => void
  onNavigationIntent?(event: KeyboardEvent, op: NavigationOp): void
  deferNavigationReveal?(createReveal: () => () => void): boolean
  onBeforeInput?(event: InputEvent): void
  onCompositionFinished?(): void
  onDisplayChange?(reason?: 'geometry'): void
  /** 変換中の文字のcaretのDOMの位置を返す入口を、生成のときに1回渡す（破棄でnull）。現在行の帯の追従のため。 */
  onCompositionCaretSource?(source: (() => { root: HTMLElement; node: Node; offset: number } | null) | null): void
}) {
  if (!isInputSurfaceCapable()) return null
  const { editor } = options, view = editor.view
  const doc = view.dom.ownerDocument, win = doc.defaultView!
  // PREEDIT-FOLLOW1: 入力面の親は、`revealCaret`がscrollするのと同じ要素。見つからなければ、何も作らずに生成の失敗とする
  // （代わりの親へ戻す分岐は持たない）。plugin・listenerの登録より前に判定する。
  const scrollHost = resolvePageUpDownScrollHost(view)
  if (!scrollHost) throw new InputSurfaceCreationError('scroll-host-unavailable')
  let state: SurfaceState = 'inactive'
  let documentGeneration = 0
  let destroyed = false
  const transactions = { total: 0, docChanged: 0, selectionOnly: 0 }
  const records: InputSurfaceSnapshot['records'] = []
  const record = (kind: string, detail: Record<string, unknown> = {}) => {
    records.push({ kind, at: performance.now(), state, detail })
    if (records.length > 512) records.shift()
  }
  const presentation = createHostCompositionPresentation(view, () => `pis-document-${documentGeneration}`)
  editor.registerPlugin(presentation.plugin)
  const hostOwner = createHostOwner(view, () => `pis-document-${documentGeneration}`, record, presentation, reveal => options.deferNavigationReveal?.(() => {
    // enabled/予約の判定後だけsnapshotを読む。OFFには追加のstate/geometry読取りを持ち込まない。
    const generation = documentGeneration, selection = view.state.selection, document = view.state.doc
    return () => {
      // frameまでに文書・方式・focus・選択・compositionが変わったら、古い打鍵で動かさない。
      if (view.isDestroyed || generation !== documentGeneration || !eligible() || surface.isComposing() || view.composing || pointer.hostComposing() || pointer.hasLease() ||
        doc.activeElement !== surface.element || view.state.doc !== document || !view.state.selection.eq(selection)) return
      reveal()
    }
  }) ?? false)
  editor.registerPlugin(hostOwner.deletionGuard.plugin)
  const owner = createOwnerResolver(hostOwner)
  const eligible = () => !destroyed && isInputSurfacePathActive() && editor.isEditable && !options.getSourceMode() && !options.getParagraphPlain() && !options.getLocalWindowActive()
  const transition = (event: SurfaceEvent) => {
    state = transitionSurface(state, event)
    if (state !== 'surface-range') presenter.clear()
    record('state', { event: event.type })
    options.onDisplayChange?.('geometry')
  }
  let documentAction: ReturnType<typeof createInputSurfaceDocumentAction> | null = null
  let syncVisualFocusComposition: ((composing: boolean) => void) | null = null
  const surface = createInputSurface({
    host: view.dom,
    scrollHost,
    currentOwner: owner.current,
    maySetCaret: () => state === 'surface' || state === 'surface-range',
    mayMirror: () => eligible() && state === 'surface-range',
    onCommit: () => refresh(true),
    onCompositionFinished: () => { record('surface-composition-finished'); documentAction?.onCompositionFinished(); options.onCompositionFinished?.() },
    onStateChange: () => { documentAction?.onSurfaceStateChange(); syncVisualFocusComposition?.(surface.isComposing()); updateRangePresentation(); options.onDisplayChange?.() },
    onDisplayChange: options.onDisplayChange,
    onBeforeInput: options.onBeforeInput,
    record,
  })
  documentAction = createInputSurfaceDocumentAction(surface, record)
  syncVisualFocusComposition = createVisualFocusCompositionSync(editor)
  const presenter = createRangePresenter(view.dom, owner.current, record)
  // 予約領域にHostの範囲Highlightを塗ると、透明な入力面の下から選択色が見える。
  // すべての既存入口と、表示終了の通知で同じ同期の事実を使う。
  const updateRangePresentation = () => presenter.update(state === 'surface-range' && !surface.isReconversionPresented())
  // B033: DOMの選択が入力面にある間、PMのscrollToSelectionは何もしない。印を付けたtransactionを次のrAFで代わりにrevealする。
  const reveal = createCaretReveal({
    view, surface: surface.element, isEligible: eligible, getGeneration: () => documentGeneration,
    isSurfaceComposing: () => surface.isComposing(), currentOwner: owner.current, onRevealed: () => onDisplay(), record,
  })
  let wasEligible = eligible()
  const refresh = (deferGeometry = false) => {
    if (!eligible()) { wasEligible = false; pointer.cancel(); transition({ type: 'deactivate' }); surface.setEnabled(false); return }
    surface.setEnabled(true)
    if (!wasEligible) {
      wasEligible = true
      // 明示mode変更通知からの復帰。別UIのfocusは奪わない。
      const active = doc.activeElement
      if (active === doc.body || active === surface.element || (active && (view.dom.contains(active) || active.closest('.source-mode-host,textarea.tategaki-plain-overlay')))) surface.focus()
    }
    // 同じfocus ownerのままの文書loadではfocusinが再発火しない。
    if (doc.activeElement === surface.element) transition({ type: 'surface-focus', range: !view.state.selection.empty })
    transition({ type: 'selection', range: !view.state.selection.empty })
    updateRangePresentation()
    if (state === 'surface' || state === 'surface-range') {
      // Commit authority/state are synchronous. Only empty receiver geometry
      // joins the existing display frame, after this key's DOM writes finish.
      if (deferGeometry) scheduleDisplay()
      else surface.place()
    }
  }
  const pointer = createPointerLending({
    view, surface, currentOwner: owner.current, isEligible: eligible, transition,
    showRange: updateRangePresentation,
    clearRange: presenter.clear, record,
    focusHost: (reason, action) => focus.focusHost(reason, action),
  })
  const focus = createInputSurfaceFocusIntegration({ editor, surface, isEligible: eligible, hasLease: pointer.hasLease, hostComposing: pointer.hostComposing, record })
  const router = createKeyRouter({ view, surface, currentOwner: owner.current, isEligible: eligible, transition, refresh, record, focusHost: focus.focusHost, selectAll: focus.selectAll, onNavigationIntent: options.onNavigationIntent })
  const clipboard = createInputSurfaceClipboard({
    surface, currentOwner: owner.current, isEligible: eligible,
    isComposing: () => surface.isComposing() || pointer.hostComposing() || view.composing,
    selectionEmpty: () => view.state.selection.empty, refresh, record,
  })
  const onFocus = (event: FocusEvent) => {
    if (!eligible()) { refresh(); return }
    if (event.target === surface.element) {
      transition({ type: 'surface-focus', range: !view.state.selection.empty })
      updateRangePresentation()
      surface.resumeMirror()
      surface.place()
    } else if (event.target === view.dom) {
      if (focus.onHostFocus()) transition({ type: 'host-focus' })
    } else {
      pointer.cancel()
      transition({ type: 'deactivate' })
    }
  }
  const onBlur = () => { surface.invalidateMirror(); options.onDisplayChange?.('geometry') }
  let lastTransaction: Transaction | null = null
  const onTransaction = ({ transaction, appendedTransactions }: { transaction: Transaction; appendedTransactions?: Transaction[] }) => {
    lastTransaction = transaction
    for (const tr of [transaction, ...(appendedTransactions ?? [])]) {
      transactions.total++
      if (tr.docChanged) transactions.docChanged++
      else if (tr.selectionSet) transactions.selectionOnly++
    }
    // 予約領域は、本文の変更と同じ適用で消える。変換中なら、同じtaskの中で、変換中の文字の背景を塗りへ戻す
    // （timer・rAFは使わない。予約領域が残っていれば、塗らないまま）。
    if (surface.isComposing()) surface.refreshPreeditPaint()
    reveal.note([transaction, ...(appendedTransactions ?? [])])
    // The synchronous commit callback refreshes after clearing preedit. Avoid
    // placing the still-populated input surface at the newly committed caret.
    if (!surface.isCommitting()) refresh()
  }
  const onUpdate = ({ transaction }: { transaction: Transaction }) => {
    // setEditable emits update with a fresh, undispatched transaction. Keep
    // that lifecycle notification; only the already-observed dispatch is a duplicate.
    if (transaction !== lastTransaction) refresh()
  }
  const onCreate = () => { if (eligible()) { transition({ type: 'surface-focus', range: !view.state.selection.empty }); surface.focus() } }
  const onDisplay = () => {
    if (state === 'surface' || state === 'surface-range') { surface.place(); updateRangePresentation() }
    options.onDisplayChange?.('geometry')
  }
  let displayFrame = 0
  const scheduleDisplay = () => {
    if (displayFrame) return
    displayFrame = win.requestAnimationFrame(() => { displayFrame = 0; onDisplay() })
  }
  let previousSourceMode = options.getSourceMode(), previousParagraphPlain = options.getParagraphPlain()
  const syncModes = () => {
    const sourceMode = options.getSourceMode(), paragraphPlain = options.getParagraphPlain()
    const exitedMode = (previousSourceMode && !sourceMode) || (previousParagraphPlain && !paragraphPlain)
    previousSourceMode = sourceMode
    previousParagraphPlain = paragraphPlain
    refresh()
    // modeの明示通知による終了。復帰先を要素の種類から推測しない。
    if (exitedMode && !pointer.hasLease()) focus.focusSurface()
  }
  const unsubscribeParagraphPlain = options.onParagraphPlainModeChange(syncModes)
  editor.on('transaction', onTransaction)
  editor.on('update', onUpdate)
  editor.on('create', onCreate)
  doc.addEventListener('focusin', onFocus, true)
  surface.element.addEventListener('blur', onBlur)
  win.addEventListener('scroll', scheduleDisplay, true)
  win.addEventListener('resize', scheduleDisplay)
  win.visualViewport?.addEventListener('resize', scheduleDisplay)
  doc.fonts?.addEventListener('loadingdone', scheduleDisplay)
  const snapshot = (): InputSurfaceSnapshot => ({
    state, composing: surface.isComposing(), text: surface.text(), content: surface.contentState(), failure: surface.failure(), lease: pointer.hasLease(),
    hostComposing: pointer.hostComposing(), identity: owner.current().identity,
    selection: { anchor: view.state.selection.anchor, head: view.state.selection.head, from: view.state.selection.from, to: view.state.selection.to },
    transactions: { ...transactions }, highlightName: presenter.name, highlightSupported: presenter.supported, reveal: reveal.counters(),
    compositionPresentation: presentation.snapshot(),
    records: records.slice(),
  })
  /**
   * PIS-S10-CURRENT-LINE2 (a): 変換中の文字のcaretのDOMの位置（現在行の帯が、見えている字の行へ追従するため）。
   * 入力面が変換中で、文字があり、DOMの選択のfocusが入力面の中にあるときだけ返す。読むだけで、選択・focusは変えない。
   */
  const getCompositionCaretDomPoint = (): { root: HTMLElement; node: Node; offset: number } | null => {
    if (!eligible() || !surface.isComposing() || !surface.text()) return null
    const selection = doc.getSelection()
    const node = selection?.focusNode
    if (!selection || !node || !surface.element.contains(node)) return null
    if (node !== surface.element) return { root: surface.element, node, offset: selection.focusOffset }
    // 入力面の要素そのものを指す選択は、その前（先頭なら後ろ）のText nodeの中の位置へ直す（帯はText nodeの中の字を読む）。
    const child = surface.element.childNodes[Math.max(0, selection.focusOffset - 1)]
    if (!(child instanceof Text)) return null
    return { root: surface.element, node: child, offset: selection.focusOffset > 0 ? child.data.length : 0 }
  }
  options.onCompositionCaretSource?.(getCompositionCaretDomPoint)
  // 試験専用のread-only診断。E2Eの起動（`nyozeBridge.e2e`。packagedでは存在しない）でだけ登録する。
  // 製品の入口（PIS-S10-ENTRY1a）は通常の起動・packagedでも入力面を作るので、gateを外さないこと。
  if (win.nyozeBridge?.e2e) win.__NYOZE_INPUT_SURFACE_DIAGNOSTICS__ = snapshot
  refresh()
  return {
    sync: syncModes,
    displayChanged: onDisplay,
    getPseudoCaretExternalGeometrySource(): InputSurfacePseudoCaretGeometrySource | null {
      if (!isInputSurfacePseudoCaretLive({ enabled: true, eligible: eligible(), documentFocused: doc.hasFocus(),
        surfaceFocused: doc.activeElement === surface.element, connected: surface.element.isConnected,
        state, composing: surface.isComposing() })) return null
      return {
        kind: 'input-surface', generation: documentGeneration, documentIdentity: owner.current().identity,
        surface: scrollHost,
        focusRoot: surface.element, writingMode: surface.element.style.writingMode,
        composing: surface.isComposing(), geometry: surface.isComposing() || !!surface.text() ? 'dom-caret' : 'owner-caret',
        caretRect: () => owner.current().caretRect('pseudo-caret'),
        preparePendingEmptyPlacement: () => {
          if (!displayFrame || surface.isComposing() || surface.text()) return null
          // Both caret and receiver geometry are read before either position
          // write. Without a live pseudo caret, the existing frame remains.
          const applyPlacement = surface.preparePlacement()
          if (!applyPlacement) return null
          win.cancelAnimationFrame(displayFrame)
          displayFrame = 0
          return () => { applyPlacement(); updateRangePresentation() }
        },
      }
    },
    hasPayloadBearingState: () => documentAction?.hasPayloadBearingState() ?? false,
    /** EDITOR-TAB-HISTORY1: preeditの表示（widget decoration）が残っているか。capsuleを作らない条件。 */
    isCompositionPresented: () => presentation.snapshot() !== null,
    isSurfaceComposing: () => surface.isComposing(),
    surfaceCompositionState: () => surface.compositionState(),
    isSurfaceFocused: () => doc.activeElement === surface.element,
    /** E4: 利用者の確認の後だけ。変換中の文字を捨てる（Hostへ確定しない）。 */
    discardComposition: () => surface.discardComposition(),
    /**
     * 入力の方式が変わった直後（同期）。
     * - 従来の入力へ: 入力面を無効にし（pointerの貸し出しは取り消し、Highlightは消える）、入力面が持っていた
     *   focusだけをHostへ渡す。PMのselectionは変えない（PMがDOMの選択へ書く）。
     * - PISへ: Hostのroot・bodyがfocusを持つときだけ入力面へ入る。別のUI（modal・検索欄）のfocusは奪わない。
     */
    pathChanged() {
      const surfaceFocused = doc.activeElement === surface.element
      refresh()
      if (!eligible()) {
        if (surfaceFocused) view.focus()
      } else if (!pointer.hasLease() && (doc.activeElement === view.dom || doc.activeElement === doc.body)) focus.focusSurface()
      record('input-path-changed', { active: isInputSurfacePathActive(), surfaceFocused, state })
    },
    guardDocumentChange(reason: string) {
      if (documentAction?.prepare(reason).status === 'ready') return true
      record('document-change-blocked', { reason })
      if (reason === 'core-destroy') record('document-action-destroy-with-payload', { composing: surface.isComposing(), retained: !!surface.text() })
      return false
    },
    documentChanged() {
      reveal.cancel()
      surface.endCompositionPresentation()
      documentGeneration++
      surface.invalidateMirror()
      pointer.cancel()
      transition({ type: 'deactivate' })
      record('document-change', { retained: surface.text() })
    },
    documentLoaded() { surface.refreshTypography(); refresh() },
    destroy() {
      options.onCompositionCaretSource?.(null)
      documentAction?.destroy()
      destroyed = true
      unsubscribeParagraphPlain()
      editor.off('transaction', onTransaction)
      editor.off('update', onUpdate)
      editor.off('create', onCreate)
      doc.removeEventListener('focusin', onFocus, true)
      surface.element.removeEventListener('blur', onBlur)
      win.removeEventListener('scroll', scheduleDisplay, true)
      win.removeEventListener('resize', scheduleDisplay)
      win.visualViewport?.removeEventListener('resize', scheduleDisplay)
      doc.fonts?.removeEventListener('loadingdone', scheduleDisplay)
      if (displayFrame) win.cancelAnimationFrame(displayFrame)
      reveal.destroy()
      pointer.destroy()
      focus.destroy()
      router.destroy()
      clipboard.destroy()
      presenter.destroy()
      surface.destroy()
      presentation.destroy()
      editor.unregisterPlugin(presentation.key)
      editor.unregisterPlugin(hostOwner.deletionGuard.key)
      if (win.__NYOZE_INPUT_SURFACE_DIAGNOSTICS__ === snapshot) delete win.__NYOZE_INPUT_SURFACE_DIAGNOSTICS__
    },
  }
}
