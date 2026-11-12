import type { Editor } from '@tiptap/core'
import type { InputSurface, SurfaceRecord } from './inputSurface'
import { createHostFocusPermissions, judgeHostFocus, resolveEditorFocusRestoreTarget, shouldRestoreContextMenuFocus, type HostFocusPermission } from './focusSafety'
import { registerInputSurfaceFocusPort } from './focusOwner'
import { AllSelection } from '@tiptap/pm/state'

/** focus要求・typed許可・同期安全網。ownershipの完了を遅延処理で推測しない。 */
export function createInputSurfaceFocusIntegration(options: {
  editor: Editor; surface: InputSurface; isEligible(): boolean
  /** 入力の方式が従来の入力（Host）で、Host の本文が編集できる（Source Mode・段落プレーン編集などでない）。 */
  isHostEligible(): boolean
  hasLease(): boolean; hostComposing(): boolean; record: SurfaceRecord
}) {
  const { editor, surface, record } = options, view = editor.view
  const permissions = createHostFocusPermissions(record)
  const composing = () => surface.isComposing() || options.hostComposing() || view.composing
  let restoring = false
  const focusHost = (reason: HostFocusPermission, focus: () => void = () => view.focus()) => permissions.run(reason, focus)
  const focusSurface = () => {
    if (!options.isEligible() || composing()) return false
    surface.setEnabled(true)
    return surface.focus()
  }
  const selectAll = () => {
    if (!options.isEligible()) return false
    if (composing()) return true
    if (surface.text()) {
      view.dom.ownerDocument.getSelection()?.selectAllChildren(surface.element)
      record('select-all-retained-text')
      return true
    }
    if (!focusSurface()) { record('select-all-focus-failed'); return true }
    const selection = new AllSelection(view.state.doc)
    if (!view.state.selection.eq(selection)) view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false))
    record('select-all-surface')
    return true
  }
  const unregister = registerInputSurfaceFocusPort(view.dom, surface.element, {
    isEligible: options.isEligible,
    isComposing: composing,
    hasFocus: () => view.dom.ownerDocument.activeElement === surface.element || view.hasFocus(),
    focus: focusSurface,
    restoreEditorFocus() {
      const target = resolveEditorFocusRestoreTarget({ surfaceEligible: options.isEligible(), hostEligible: options.isHostEligible(), composing: composing() })
      if (target === 'surface') focusSurface()
      // PM の view.focus() は、PM の選択から DOM の caret を置き直す（scroll しない）。
      else if (target === 'host') view.focus()
      record('restore-editor-focus', { target })
      return target
    },
    selectAll,
    focusForContextMenuClipboard() {
      if (focusSurface()) return 'surface'
      record('context-menu-clipboard-focus-blocked', { composing: composing() })
      return 'blocked'
    },
    contextMenuClosed(menuRoot) {
      if (!options.isEligible() || composing() || options.hasLease()) return
      const doc = view.dom.ownerDocument, active = doc.activeElement
      const focusOwner = active === doc.body ? 'body' : active === view.dom ? 'host'
        : active === surface.element ? 'surface' : active && menuRoot?.contains(active) ? 'menu' : 'other-ui'
      if (!shouldRestoreContextMenuFocus(focusOwner)) {
        record('context-menu-close-kept-ui-focus', { tag: active?.tagName })
        return
      }
      record('context-menu-close')
      focusSurface()
    },
  })
  return {
    focusHost,
    focusSurface,
    selectAll,
    onHostFocus() {
      const permission = permissions.consume()
      const decision = judgeHostFocus({ permitted: permission !== null, eligible: options.isEligible(),
        surfaceComposing: surface.isComposing() || !!surface.text(), hostComposing: options.hostComposing() || view.composing })
      if (decision === 'allow') return true
      const stack = new Error('Host focus request').stack
      if (decision === 'record-composition') { record('host-focus-during-composition', { stack }); return true }
      if (restoring) { record('host-focus-loop', { stack }); return false }
      restoring = true
      try {
        record('host-focus-restored', { stack })
        focusSurface()
      } finally { restoring = false }
      return false
    },
    destroy: unregister,
  }
}
