import type { EditOwner, OwnerInsertionSnapshot } from './editOwner'
import { sameMirrorRange } from './selectionMirror'
import { allowsKeylessAfterInput, armRecentInput, beginReconversion, disarmRecentInput, emptyReconversionState, finishMirrorInput, finishReconversion, rejectReconversion, noteInputFinished, releaseReconversion, surfacePayloadText, syncReconversion } from './reconversionState'
import { isComposingTypingKey, isContinuedKeyComposition, isKeyStartedComposition, releasesAllModifiers, releasesRecentInput, type CompositionKey, type ContinuedCompositionKey } from './compositionIntent'
import { createMirrorSelectionNotifier } from './mirrorSelectionNotifier'

/** 写しは既存のwrite phaseで置く。2つのrAFは同じ写しの選択通知だけで、所有・確定には使わない。 */
export function createSelectionMirrorController(options: {
  element: HTMLElement
  currentOwner(): EditOwner
  mayMirror(): boolean
  canNotify(): boolean
  record(kind: string, detail?: Record<string, unknown>): void
}) {
  const { element } = options, doc = element.ownerDocument
  let state = emptyReconversionState()
  let deferredWrites = 0
  let lastKey: CompositionKey | null = null
  // IMPLICIT-COMMIT1: 変換中の文字のキー（K）と、その後の前の変換の終了。`lastKey`とは別に持つ（終了で`lastKey`は外れる）。
  let continuedKey: ContinuedCompositionKey | null = null
  let navigationHeld = false, stale = false
  const rawText = () => element.textContent ?? ''
  const text = () => surfacePayloadText(state, rawText())
  const report = (reason: string | null) => { if (reason) options.record('reconversion-rejected', { reason }) }
  const notifier = createMirrorSelectionNotifier({
    element, record: options.record,
    currentSnapshot: () => options.currentOwner().snapshotInsertion(),
    canRestoreSelection(node) {
      return state.content.kind === 'mirror' && options.canNotify() && doc.activeElement === element
        && element.firstChild === node && element.childNodes.length === 1
    },
    isCurrent(copy, node) {
      return state.content.kind === 'mirror' && !stale && options.canNotify() && options.mayMirror()
        && sameMirrorRange(state.content.copy, copy) && state.content.copy.text === copy.text
        && sameMirrorRange(copy, options.currentOwner().snapshotInsertion())
        && doc.activeElement === element && element.firstChild === node && element.childNodes.length === 1 && node.data === copy.text
    },
  })
  const clearMirror = () => {
    notifier.cancel(); stale = false
    element.replaceChildren()
    // idleの写しは、除去でもbrowser processへ選択の変化を伝える。
    // blur・pointerでfocusが外へ出た場合は、入力面へ選択を作り直さない。
    if (doc.activeElement !== element) return
    const range = doc.createRange()
    range.setStart(element, 0); range.collapse(true)
    const selection = doc.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
  }
  return {
    text, rawText,
    kind: () => state.content.kind,
    snapshot: () => ({ kind: state.content.kind, consumed: !!state.consumed, rejected: !!state.rejected, recent: !!state.recent, stale }),
    noteKey(event: KeyboardEvent) {
      const current = options.currentOwner().snapshotInsertion()
      lastKey = { isComposing: event.isComposing, keyCode: event.keyCode, ctrlKey: event.ctrlKey, metaKey: event.metaKey, code: event.code, snapshot: current }
      if (releasesRecentInput({ ...lastKey, key: event.key }, current)) state = { ...state, recent: null }
      // KEYLESS-CONTINUATION1: 変換の外のキー（修飾キー・再変換の合図）で印を有効化する。変換中のキー・keyupでは有効化しない。
      else if (!event.isComposing && state.recent && !state.recent.armed) {
        state = armRecentInput(state)
        options.record('recent-armed', { key: event.key, code: event.code })
      }
      continuedKey = isComposingTypingKey(lastKey) ? { phase: 'composing', code: event.code } : null
    },
    /** rolloverで別のキーのkeyupが先に来ても、Kの記録は外さない。 */
    noteKeyUp(event: KeyboardEvent) {
      if (continuedKey?.code === event.code) continuedKey = null
      // KEYLESS-CONTINUATION1: 変換の外で修飾キーをすべて離したら、印の有効化を外す（次に修飾キーを押せば、また有効化する）。
      if (releasesAllModifiers(event) && state.recent?.armed) {
        state = disarmRecentInput(state)
        options.record('recent-disarmed', { key: event.key, code: event.code })
      }
    },
    noteInputFinished(outcome: { committed: boolean }) {
      const current = options.currentOwner().snapshotInsertion()
      state = noteInputFinished(state, current, outcome)
      if (continuedKey?.phase === 'ending') continuedKey = { phase: 'ended', code: continuedKey.code, snapshot: state.recent }
    },
    beforeKey: notifier.beforeKey,
    holdNavigation() { navigationHeld = true },
    releaseNavigation() { navigationHeld = false; return stale },
    rejectDeletion() { state = rejectReconversion(state, options.currentOwner().snapshotInsertion()); report('mirror-delete') },
    isReconversion: () => state.content.kind === 'composition' && state.content.origin === 'mirror',
    /** N1はdispatchの後にもreveal用の矩形を読む。その同期の読み取りを終えるまで、DOMの写しを書かない。 */
    withDeferredWrites<T>(action: () => T): T {
      deferredWrites++
      try { return action() } finally { deferredWrites-- }
    },
    /** 読み取りはownerのstateだけ。DOMは返したwrite closureの中で書く。 */
    prepare(allowed: boolean): () => boolean {
      const owner = options.currentOwner(), current = owner.snapshotInsertion()
      const candidate = allowed && options.mayMirror() && doc.activeElement === element && !text()
        ? owner.selectionMirror?.() ?? null : null
      if (navigationHeld) {
        const copy = state.content.kind === 'mirror' ? state.content.copy : null
        stale = !!copy !== !!candidate || !!copy && (!sameMirrorRange(copy, candidate) || copy.text !== candidate?.text)
        return () => false
      }
      return () => {
        const before = state.content
        // compositionstart後、配置のために呼ばれても、IMEの文字は書き換えない。
        if (deferredWrites || before.kind === 'composition' || before.kind === 'retained') return false
        state = syncReconversion(state, current, candidate)
        stale = false
        const after = state.content
        if (after.kind === 'mirror') {
          if (before.kind === 'mirror' && sameMirrorRange(before.copy, after.copy) && before.copy.text === after.copy.text) return false
          // 文字だけを書き換えると、browser processがIMEへ渡す選択の控えが古いままになる。
          // 写しが変わるたびに初回と同じSelection APIの経路で全体を選び直す。
          const selection = doc.getSelection()
          element.replaceChildren(doc.createTextNode(after.copy.text))
          const range = doc.createRange(); range.selectNodeContents(element)
          selection?.removeAllRanges(); selection?.addRange(range)
          notifier.start(after.copy, element.firstChild as Text)
          options.record('selection-mirror', { length: after.copy.text.length, from: after.copy.from, to: after.copy.to })
        } else if (before.kind === 'mirror') clearMirror()
        return before.kind !== after.kind
      }
    },
    begin(snapshot: OwnerInsertionSnapshot | null, data: string) {
      notifier.cancel()
      const content = state.content, node = element.firstChild, selection = doc.getSelection()
      const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : null
      const whole = content.kind === 'mirror' && element.childNodes.length === 1 && node?.nodeType === 3
        && rawText() === content.copy.text && selection?.rangeCount === 1 && !selection.isCollapsed
        && ((range?.startContainer === element && range.startOffset === 0 && range.endContainer === element && range.endOffset === 1)
          || (range?.startContainer === node && range.startOffset === 0 && range.endContainer === node && range.endOffset === content.copy.text.length))
      const keyStarted = isKeyStartedComposition(lastKey, snapshot)
      // IMPLICIT-COMMIT1: Kの中で前の変換が終わって始まった変換も、打鍵で始まった変換（recent・D8の拒否にしない）。
      const continued = !keyStarted && isContinuedKeyComposition(continuedKey, snapshot)
      const keyed = keyStarted || continued
      if (continued) options.record('composition-continued-key', { code: continuedKey!.code })
      if (allowsKeylessAfterInput(state, snapshot, keyed)) options.record('keyless-after-input-allowed', { from: snapshot?.from, to: snapshot?.to })
      lastKey = null; continuedKey = null; navigationHeld = false
      const result = beginReconversion(state, snapshot, !!whole && !stale, data, keyed)
      stale = false
      const retained = content.kind !== 'mirror' && !!text()
      state = result.state; report(result.reason)
      return retained
    },
    end(snapshot: OwnerInsertionSnapshot | null, data: string) {
      // 確定先は開始snapshotのまま。拒否の鍵だけは、終了を観測した時点のsnapshot。
      const current = state.content.kind === 'composition' && state.content.origin !== 'normal' ? options.currentOwner().snapshotInsertion() : snapshot
      const result = finishReconversion(state, snapshot, data, rawText(), current)
      lastKey = null
      // Kの後の1回目の終了だけ。記録は終了の処理の後の`noteInputFinished()`で取る。
      continuedKey = continuedKey?.phase === 'composing' ? { phase: 'ending', code: continuedKey.code } : null
      if (result) { state = result.state; report(result.reason) }
      else state = { ...state, content: { kind: 'empty' } }
      return result
    },
    direct(data: string | null) {
      if (state.content.kind !== 'mirror') return null
      const result = finishMirrorInput(state, options.currentOwner().snapshotInsertion(), data, rawText())
      if (result) { state = result.state; report(result.reason) }
      return result
    },
    empty() { state = { ...state, content: { kind: 'empty' } } },
    retained() { state = { ...emptyReconversionState(), content: { kind: 'retained' } } },
    /** 拒否後の復元では、開始/終了で立てた拒否帳簿を解除しない。 */
    restoreRetained() { state = { ...state, content: { kind: 'retained' } } },
    invalidate() {
      notifier.cancel()
      const before = state.content
      lastKey = null; continuedKey = null
      state = releaseReconversion(state)
      if (before.kind === 'mirror') {
        if (navigationHeld) { state = { ...state, content: before }; stale = true }
        else clearMirror()
      }
    },
    releaseRejection() { const released = !!state.rejected; state = { ...state, rejected: null }; return released },
    destroy: notifier.cancel,
  }
}
