import type { EditorState, Transaction } from '@tiptap/pm/state'
import { isModifiedLinkClick, resolveModifiedLinkClick } from './linkOpen'

type Dispatch = (tr: Transaction) => void
type LogPush = (event: string, detail: string) => void
type OpenExternalUrl = (url: string) => Promise<boolean>

type CreateEditorClickHandlerOptions = {
  getIsComposing: () => boolean
  foldToggleClass: string
  getState: () => EditorState
  posAtDOM: (node: Node, offset: number) => number
  dispatch: Dispatch
  resolveClickTargetElement: (target: EventTarget | null) => Element | null
  resolveFoldToggleHeadingPos: (targetElement: Element, foldToggleClass: string) => number | null
  selectHorizontalRuleAtEventTarget: (
    state: EditorState,
    target: EventTarget | null,
    posAtDOM: (node: Node, offset: number) => number,
    dispatch?: Dispatch,
  ) => number | null
  resolveChecklistClickPos: (
    targetElement: Element,
    posAtDOM: (node: Node, offset: number) => number,
  ) => number | null
  toggleChecklistItemAtDocPos: (
    state: EditorState,
    listItemPos: number,
    dispatch?: Dispatch,
  ) => boolean
  toggleHeadingFold: (headingPos: number) => void
  emitFoldChange: () => void
  /** エディタ内の折りたたみトグル直前（Typewriter ジャンプ抑制など） */
  onHeadingFoldToggled?: () => void
  openExternalUrl?: OpenExternalUrl
  pushLog: LogPush
}

export function createEditorClickHandler({
  getIsComposing,
  foldToggleClass,
  getState,
  posAtDOM,
  dispatch,
  resolveClickTargetElement,
  resolveFoldToggleHeadingPos,
  selectHorizontalRuleAtEventTarget,
  resolveChecklistClickPos,
  toggleChecklistItemAtDocPos,
  toggleHeadingFold,
  emitFoldChange,
  onHeadingFoldToggled,
  openExternalUrl,
  pushLog,
}: CreateEditorClickHandlerOptions): (event: MouseEvent) => void {
  return (event: MouseEvent) => {
    const isComposing = getIsComposing()
    const rawTarget = event.target
    const targetElement = resolveClickTargetElement(rawTarget)
    if (!targetElement) return

    const linkAnchor = targetElement.closest('a[href]')
    if (
      linkAnchor &&
      isModifiedLinkClick({
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      })
    ) {
      event.preventDefault()
      event.stopPropagation()
      if (isComposing) {
        pushLog('linkOpen', 'blocked')
        return
      }

      const href = resolveModifiedLinkClick({
        href: linkAnchor.getAttribute('href'),
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      })
      if (!href || !openExternalUrl) {
        pushLog('linkOpen', 'blocked')
        return
      }

      pushLog('linkOpen', 'openExternal')
      void openExternalUrl(href).then((ok) => {
        if (!ok) pushLog('linkOpen', 'failed')
      }).catch(() => {
        pushLog('linkOpen', 'failed')
      })
      return
    }

    if (isComposing) return

    const headingPos = resolveFoldToggleHeadingPos(targetElement, foldToggleClass)
    if (headingPos !== null) {
      onHeadingFoldToggled?.()
      toggleHeadingFold(headingPos)
      pushLog('command', `toggleHeadingFold(click) pos=${headingPos}`)
      // Fold state is display-only, so notify fold listeners without dirtying the doc.
      emitFoldChange()
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const state = getState()
    const horizontalRulePos = selectHorizontalRuleAtEventTarget(
      state,
      rawTarget,
      posAtDOM,
      dispatch,
    )
    if (horizontalRulePos !== null) {
      event.preventDefault()
      event.stopPropagation()
      pushLog('selectionUpdate', `horizontalRule selected pos=${horizontalRulePos}`)
      return
    }

    const checklistPos = resolveChecklistClickPos(targetElement, posAtDOM)
    if (checklistPos === null) return

    const changed = toggleChecklistItemAtDocPos(state, checklistPos, dispatch)
    if (!changed) return
    event.preventDefault()
    pushLog('command', 'toggleChecklistChecked(click)')
  }
}
