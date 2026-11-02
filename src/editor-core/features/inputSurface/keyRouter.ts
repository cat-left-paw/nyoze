import type { EditorView } from '@tiptap/pm/view'
import { resolveSupportedEditorWritingMode } from '../writingModeNavigationMapping'
import { resetHomeEndState } from '../homeEndNavigation'
import type { EditOwner, NavigationOp } from './editOwner'
import { resolveNavigationKey } from './navigation/keyOperation'
import type { InputSurface, SurfaceRecord } from './inputSurface'
import { classifySurfaceKey, isCompositionMismatch, isModifierOnly, type SurfaceEvent } from './surfaceState'
import type { HostFocusPermission } from './focusSafety'
import { blocksUnclaimedWindowsCharacter } from './compositionIntent'
import { createMirrorNativeCommandGuard } from './mirrorNativeCommand'

export function createKeyRouter(options: {
  view: EditorView
  surface: InputSurface
  currentOwner(): EditOwner
  isEligible(): boolean
  transition(event: SurfaceEvent): void
  refresh(): void
  record: SurfaceRecord
  focusHost(reason: HostFocusPermission): void
  selectAll(): boolean
  onNavigationIntent?(event: KeyboardEvent, op: NavigationOp): void
}) {
  const { view, surface, record } = options
  const win = view.dom.ownerDocument.defaultView!
  const isMac = () => /Mac/.test(win.navigator.platform)
  // 写しがある間の、PM・アプリが処理しないControl付きのキーのnativeの既定（Macのkey binding）を止める（OS-INPUT1 段階C）。
  const mirrorGuard = createMirrorNativeCommandGuard(win, event => record('mirror-native-command-blocked', { key: event.key, code: event.code }))
  const guardMirrorNativeCommand = (event: KeyboardEvent) => mirrorGuard.arm(event, { mac: isMac(), mirror: surface.contentState().kind === 'mirror', composing: surface.isComposing() })
  const onKeyDown = (event: KeyboardEvent) => {
    // Host focus中のeventには一切触れない（P5）。
    if (!event.isTrusted || event.target !== surface.element || surface.element.ownerDocument.activeElement !== surface.element || !options.isEligible()) return
    record('surface-keydown', { key: event.key, keyCode: event.keyCode, trusted: event.isTrusted })
    if (isCompositionMismatch(surface.isComposing() || event.isComposing, event)) {
      event.preventDefault()
      event.stopPropagation()
      record('ime-desync', { key: event.key, keyCode: event.keyCode })
      return
    }
    if (surface.isComposing() || event.isComposing || event.keyCode === 229) return
    const blockUnclaimedWindowsKey = () => {
      if (!blocksUnclaimedWindowsCharacter(event, /Mac/.test(view.dom.ownerDocument.defaultView!.navigator.platform), surface.isComposing())) return false
      event.preventDefault(); record('unclaimed-windows-character-blocked', { key: event.key }); return true
    }
    if (surface.text()) { blockUnclaimedWindowsKey(); return }
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && /^a$/i.test(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      options.selectAll()
      options.refresh()
      record('select-all-key')
      return
    }
    if (event.key !== 'Home' && event.key !== 'End') resetHomeEndState()
    const route = classifySurfaceKey(event)
    if (route !== 'navigation' && !isModifierOnly(event.key)) options.currentOwner().clearNavigationGoal()
    if (route === 'retain') { if (!blockUnclaimedWindowsKey()) guardMirrorNativeCommand(event); return }
    if (route === 'owner') {
      const handled = options.currentOwner().handleKeyDown(event) === 'handled'
      // 編集キーのnative defaultを空のCEへ流さない。historyの二重routingも防ぐ。
      event.preventDefault()
      event.stopPropagation()
      options.refresh()
      record('owner-key', { key: event.key, handled })
      return
    }
    if (route === 'navigation') {
      const mode = resolveSupportedEditorWritingMode(surface.element.style.writingMode)
      const op = mode && resolveNavigationKey(event, mode, /Mac/.test(view.dom.ownerDocument.defaultView!.navigator.platform))
      if (op) {
        options.onNavigationIntent?.(event, op)
        event.preventDefault()
        const started = performance.now()
        const receipt = surface.withDeferredMirrorWrite(() => options.currentOwner().navigate(op))
        options.refresh()
        record('navigation', { key: event.key, extend: op.extend, axis: op.axis, ...receipt, handlerMs: performance.now() - started })
        return
      }
      // Only unresolved modifier navigation reaches the explicit I8 list below.
      if (!event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); record('navigation-mode-unavailable'); return }
    }
    if (route === 'shortcut') {
      const handled = options.currentOwner().handleKeyDown(event) === 'handled'
      if (handled) { event.preventDefault(); options.refresh(); record('shortcut-key', { key: event.key, handled }); return }
      if (blockUnclaimedWindowsKey()) return
      if (event.key === 'Tab') {
        // Forward native Tab reaches the body-appended surface again, unlike Host-only.
        // REVIEWFIX1's permitted fallback keeps it here without a transient handoff.
        if (!event.shiftKey) { event.preventDefault(); record('tab-default-blocked'); return }
        // I8: let the same trusted key's native default traverse from the Host.
        const before = view.state.selection, doc = view.state.doc
        options.transition({ type: 'handoff' })
        options.focusHost('i8-shift-tab')
        if (view.state.doc !== doc || !view.state.selection.eq(before)) {
          event.preventDefault()
          record('tab-handoff-proof-failed')
          return
        }
        record('tab-native-handoff', { backward: event.shiftKey })
        return
      }
      if (!((event.metaKey || event.ctrlKey || event.altKey) && /^(Backspace|Delete)$/.test(event.key))) { guardMirrorNativeCommand(event); return }
    }
    const before = view.state.selection, doc = view.state.doc
    options.transition({ type: 'handoff' })
    // I8: PM focusで現在のselectionをDOMへ反映する。同じtrusted eventをportへ渡す。
    options.focusHost(/^(Backspace|Delete)$/.test(event.key) ? 'i8-modifier-delete' : 'i8-modifier-navigation')
    if (!view.state.selection.eq(before)) {
      const canRestore = view.state.doc === doc
      if (canRestore) view.dispatch(view.state.tr.setSelection(before).setMeta('addToHistory', false))
      record('handoff-selection-changed', { restored: canRestore && view.state.selection.eq(before) })
    }
    if (view.state.doc !== doc || !view.state.selection.eq(before)) {
      event.preventDefault()
      event.stopPropagation()
      record('handoff-proof-failed')
      return
    }
    const handled = options.currentOwner().handleKeyDown(event) === 'handled'
    if (handled) { event.preventDefault(); event.stopPropagation() }
    record('keyboard-handoff', { key: event.key, handled })
  }
  surface.element.addEventListener('keydown', onKeyDown)
  return { destroy: () => { surface.element.removeEventListener('keydown', onKeyDown); mirrorGuard.destroy() } }
}
