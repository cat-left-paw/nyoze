import type { SelectionMirror } from './selectionMirror'
import type { OwnerInsertionSnapshot } from './editOwner'
import { releasesRecentInput, type CompositionKey } from './compositionIntent'

/** Eの表示通知だけ。rAFの回数・完了は、所有や確定の根拠にしない。 */
export function createMirrorSelectionNotifier(options: {
  element: HTMLElement
  isCurrent(copy: SelectionMirror, node: Text): boolean
  canRestoreSelection(node: Text): boolean
  currentSnapshot(): OwnerInsertionSnapshot | null
  record(kind: string, detail?: Record<string, unknown>): void
}) {
  const doc = options.element.ownerDocument, win = doc.defaultView!
  let frame = 0, pending: { copy: SelectionMirror; node: Text; phase: 'full' | 'caret' } | null = null
  const cancel = (restore = false) => {
    // beginからの取消は触らない。idleの失効でcaretだけが残る場合だけ戻す。
    if (restore && pending?.phase === 'caret' && options.canRestoreSelection(pending.node)) setSelection(pending.node, true)
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0; pending = null
  }
  const setSelection = (node: Text, full: boolean) => {
    const range = doc.createRange()
    range.setStart(node, 0); range.setEnd(node, full ? node.data.length : 0)
    const selection = doc.getSelection()
    selection?.removeAllRanges(); selection?.addRange(range)
    options.record('mirror-selection-refresh', { phase: full ? 'full' : 'caret' })
  }
  return {
    cancel,
    start(copy: SelectionMirror, node: Text) {
      cancel()
      const cycle: NonNullable<typeof pending> = { copy, node, phase: 'full' }
      pending = cycle
      frame = win.requestAnimationFrame(() => {
        frame = 0
        if (pending !== cycle || !options.isCurrent(copy, node)) { cancel(); return }
        setSelection(node, false); cycle.phase = 'caret'
        frame = win.requestAnimationFrame(() => {
          frame = 0
          if (pending !== cycle || !options.isCurrent(copy, node)) { cancel(true); return }
          setSelection(node, true); pending = null
        })
      })
    },
    beforeKey(event: Omit<CompositionKey, 'snapshot'> & { key: string }) {
      if (event.isComposing) { cancel(); return }
      if (!pending) return
      const snapshot = options.currentSnapshot()
      const { isComposing, keyCode, ctrlKey, metaKey, code, key } = event
      if (!releasesRecentInput({ isComposing, keyCode, ctrlKey, metaKey, code, key, snapshot }, snapshot)) return
      // 最初の全体選択でも予約を取り消す。keydownとcompositionstartは別task/IPCになり得る。
      // caret段階だけ、その場で全体へ戻す。再変換の合図では通知を続ける。
      cancel(true)
    },
  }
}
