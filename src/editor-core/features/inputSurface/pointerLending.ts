import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { EditOwner } from './editOwner'
import type { InputSurface, SurfaceRecord } from './inputSurface'
import { isModifierOnly, type SurfaceEvent } from './surfaceState'
import type { HostFocusPermission } from './focusSafety'
import { resolveChecklistClickPos, resolveFoldToggleHeadingPos } from '../clickRouting'
import { FOLD_TOGGLE_CLASS } from '../../extensions/headingFold'

type GestureLease = { pointerId: number; identity: string; inputStarted: boolean; keepCaret: boolean }

/** PM内部APIへの依存をここへ閉じる。selectionの完了はこの同期flushだけで判断する。 */
export function flushHostDomObserver(view: EditorView): boolean {
  const observer = (view as EditorView & { domObserver?: { flush(): void } }).domObserver
  if (!observer) return false
  observer.flush()
  return true
}

/**
 * Hostのclick handlerがcaretを動かさずに扱うwidget（チェックリストのcheckbox・見出しの折りたたみ）。
 * 判定はHostの`createEditorClickHandler`と同じ純関数。ここではcaretを置き直さず、Hostと同じ選択のまま貸し出す
 * （HostのDOMの選択は入力面の間は古いので、PMの`view.focus()`で選択をDOMへ書いてからfocusする。
 * checkboxのmousedownがnativeに動かしたDOMの選択は、Hostと同じくpointerupでPMへ読み込まない）。
 */
function isCaretKeepingWidgetTarget(view: EditorView, target: Node): boolean {
  const element = target instanceof Element ? target : target.parentElement
  if (!element) return false
  return resolveFoldToggleHeadingPos(element, FOLD_TOGGLE_CLASS) !== null ||
    resolveChecklistClickPos(element, (node, offset) => view.posAtDOM(node, offset)) !== null
}

export function createPointerLending(options: {
  view: EditorView
  surface: InputSurface
  currentOwner(): EditOwner
  isEligible(): boolean
  transition(event: SurfaceEvent): void
  showRange(): void
  clearRange(): void
  record: SurfaceRecord
  focusHost(reason: HostFocusPermission, focus?: () => void): void
}) {
  const { view, surface, record } = options
  const doc = view.dom.ownerDocument
  let lease: GestureLease | null = null
  let hostComposing = false
  const onDown = (event: PointerEvent) => {
    if (!event.isTrusted || !(event.target instanceof Node) || !view.dom.contains(event.target) || !options.isEligible()) return
    // P5: Hostの未確定入力はnativeに任せる。selection / focus / lease / stateを触らない。
    if (hostComposing || view.composing) {
      record('pointerdown-host-composing', { button: event.button, shift: event.shiftKey })
      return
    }
    if (lease) {
      // 最大1 lease。別pointerのpressで既存gestureを上書きしない。
      if (lease.pointerId !== event.pointerId) return
      lease = null
    }
    if (event.button === 2) {
      options.clearRange()
      options.transition({ type: 'handoff' })
      options.focusHost('context-menu')
      record('secondary-host-keyboard')
      return
    }
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return
    if (options.currentOwner().prepareForPointerGesture() !== 'ready') return
    // composition中のclickも遮断しない。確定snapshotはここで変更しない。
    const keepCaret = !event.shiftKey && isCaretKeepingWidgetTarget(view, event.target)
    if (!event.shiftKey && !keepCaret) {
      const hit = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!hit) { record('pointer-hit-unavailable'); return }
      const selection = TextSelection.near(view.state.doc.resolve(hit.pos))
      view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false))
    }
    options.clearRange()
    lease = { pointerId: event.pointerId, identity: options.currentOwner().identity, inputStarted: hostComposing || view.composing, keepCaret }
    options.transition({ type: 'pointerdown' })
    if (event.shiftKey) options.focusHost('pointer-shift')
    else options.focusHost('pointer-primary', keepCaret ? () => view.focus() : () => view.dom.focus({ preventScroll: true }))
    record('pointerdown', { pointerId: event.pointerId, shift: event.shiftKey })
    // nativeの元eventをそのままHostへ継続する。
  }
  const onUp = (event: PointerEvent) => {
    if (!event.isTrusted || !lease || lease.pointerId !== event.pointerId) return
    const start = performance.now(), active = lease
    lease = null
    if (active.identity !== options.currentOwner().identity || !options.isEligible()) {
      options.transition({ type: 'deactivate' })
      return
    }
    const inputStarted = active.inputStarted || hostComposing || view.composing || surface.isComposing()
    // Host入力中はobserver / selection / focusを入力面側から変更しない（P5）。
    const flushed = inputStarted || active.keepCaret ? true : flushHostDomObserver(view)
    options.transition({ type: 'pointerup', range: !view.state.selection.empty, inputStarted: inputStarted || !flushed })
    if (!inputStarted && flushed) {
      options.currentOwner().setPointerAffinity({ x: event.clientX, y: event.clientY })
      options.showRange()
      surface.focus()
    } else options.clearRange()
    record('pointerup', { durationMs: performance.now() - start, inputStarted, flushed, range: !view.state.selection.empty })
  }
  const cancel = () => {
    if (!lease) return
    lease = null
    options.transition({ type: 'pointercancel' })
    record('pointercancel')
  }
  const onCancel = (event: PointerEvent) => { if (lease?.pointerId === event.pointerId) cancel() }
  const onKey = (event: KeyboardEvent) => {
    if (lease && event.isTrusted && !isModifierOnly(event.key)) {
      lease.inputStarted = true
      record('host-focus-retained', { reason: 'i7-gesture-input' satisfies HostFocusPermission })
      record('lent-keydown', { key: event.key, keyCode: event.keyCode, trusted: true })
    }
  }
  const onCompositionStart = () => {
    hostComposing = true
    if (lease) { lease.inputStarted = true; record('host-focus-retained', { reason: 'i7-gesture-input' satisfies HostFocusPermission }) }
    record('host-compositionstart')
  }
  const onCompositionEnd = () => { hostComposing = false; record('host-compositionend') }
  doc.addEventListener('pointerdown', onDown, true)
  doc.addEventListener('pointerup', onUp, true)
  doc.addEventListener('pointercancel', onCancel, true)
  doc.addEventListener('keydown', onKey, true)
  view.dom.addEventListener('compositionstart', onCompositionStart)
  view.dom.addEventListener('compositionend', onCompositionEnd)
  return {
    cancel,
    hasLease: () => !!lease,
    hostComposing: () => hostComposing,
    destroy() {
      cancel()
      doc.removeEventListener('pointerdown', onDown, true)
      doc.removeEventListener('pointerup', onUp, true)
      doc.removeEventListener('pointercancel', onCancel, true)
      doc.removeEventListener('keydown', onKey, true)
      view.dom.removeEventListener('compositionstart', onCompositionStart)
      view.dom.removeEventListener('compositionend', onCompositionEnd)
    },
  }
}
