/**
 * 通常 PM `click` handler — shared widget intent への薄い委譲。
 */

import type { EditorState, Transaction } from '@tiptap/pm/state'
import {
  classifyEditorWidgetClickIntent,
  commitEditorWidgetClickIntent,
} from './editorWidgetClickIntent'
import {
  resolveClickTargetElement as defaultResolveClickTargetElement,
  resolveFoldToggleHeadingPos,
} from './clickRouting'

type Dispatch = (tr: Transaction) => void
type LogPush = (event: string, detail: string) => void
type OpenExternalUrl = (url: string) => Promise<boolean>

type CreateEditorClickHandlerOptions = {
  getIsComposing: () => boolean
  /**
   * host PM の実 IME composition。`getIsComposing` は local session active も含む。
   * 実 composition 中の fold は 0。未指定は実 composition なしとして扱う。
   */
  getIsHostImeComposing?: () => boolean
  foldToggleClass: string
  getState: () => EditorState
  posAtDOM: (node: Node, offset: number) => number
  dispatch: Dispatch
  /** 互換のため残す。分類は shared intent が clickRouting を直接使う。 */
  resolveClickTargetElement?: (target: EventTarget | null) => Element | null
  resolveFoldToggleHeadingPos?: (
    targetElement: Element,
    foldToggleClass: string,
  ) => number | null
  selectHorizontalRuleAtEventTarget?: (
    state: EditorState,
    target: EventTarget | null,
    posAtDOM: (node: Node, offset: number) => number,
    dispatch?: Dispatch,
  ) => number | null
  resolveChecklistClickPos?: (
    targetElement: Element,
    posAtDOM: (node: Node, offset: number) => number,
  ) => number | null
  toggleChecklistItemAtDocPos?: (
    state: EditorState,
    listItemPos: number,
    dispatch?: Dispatch,
  ) => boolean
  toggleHeadingFold: (headingPos: number) => void
  /** Local IME / Local Window document-action 後の heading identity 再証明。未指定は fold しない。 */
  resolveHeadingFoldForDocumentAction?: (headingPos: number) => number | null
  emitFoldChange: () => void
  onHeadingFoldToggled?: () => void
  onNoteAnchorReveal?: (id: string) => void
  openExternalUrl?: OpenExternalUrl
  pushLog: LogPush
}

export function createEditorClickHandler({
  getIsComposing,
  getIsHostImeComposing,
  foldToggleClass,
  getState,
  posAtDOM,
  dispatch,
  resolveClickTargetElement = defaultResolveClickTargetElement,
  toggleHeadingFold,
  resolveHeadingFoldForDocumentAction,
  emitFoldChange,
  onHeadingFoldToggled,
  onNoteAnchorReveal,
  openExternalUrl,
  pushLog,
}: CreateEditorClickHandlerOptions): (event: MouseEvent) => void {
  return (event: MouseEvent) => {
    const targetElement = resolveClickTargetElement(event.target)
    // Local Window / overlay / slot active 中は共有 getIsComposing が true になる。
    // fold は IME 文字ではなく document-action なので、widget を先に認識して barrier へ渡す。
    // ただし host PM の実 composition は local session と区別し、fold 0 で consume する。
    const foldHeadingPos = targetElement
      ? resolveFoldToggleHeadingPos(targetElement, foldToggleClass)
      : null
    if (foldHeadingPos !== null && getIsHostImeComposing?.() === true) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    let intent = foldHeadingPos !== null
      ? { kind: 'fold-toggle' as const, headingPos: foldHeadingPos }
      : classifyEditorWidgetClickIntent({
          targetElement,
          button: event.button,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: getIsComposing(),
          foldToggleClass,
          state: getState(),
          posAtDOM,
          noteAnchorRevealAvailable: Boolean(onNoteAnchorReveal),
          openExternalAvailable: Boolean(openExternalUrl),
        })
    if (intent.kind === 'none') return

    if (intent.kind === 'fold-toggle') {
      const resolvedPos = resolveHeadingFoldForDocumentAction?.(intent.headingPos) ?? null
      if (resolvedPos == null) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      intent = { kind: 'fold-toggle', headingPos: resolvedPos }
    }

    const committed = commitEditorWidgetClickIntent(intent, {
      state: getState(),
      dispatch,
      toggleHeadingFold,
      emitFoldChange,
      onHeadingFoldToggled,
      onNoteAnchorReveal,
      openExternalUrl,
      pushLog,
    })
    if (!committed.ok && committed.reason === 'noop') return

    event.preventDefault()
    event.stopPropagation()
  }
}
