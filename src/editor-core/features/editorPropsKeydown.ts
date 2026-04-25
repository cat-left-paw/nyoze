import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { LineBreakPolicy } from '../types'
import { handleHomeEndKey, resetHomeEndState } from './homeEndNavigation'
import { handlePageUpDownKey } from './pageUpDownNavigation'
import { handleHeadingFoldStartArrowKey } from './headingFoldStartArrowNavigation'
import { handleRubyBoundaryArrowKey } from './rubyBoundaryArrowNavigation'
import { handleListTabKey } from './listTabNavigation'

type Dispatch = (tr: Transaction) => void
type LogPush = (event: string, detail: string) => void

type CreateEditorPropsKeyDownHandlerOptions = {
  getIsComposing: (viewComposing: boolean) => boolean
  getLineBreakPolicy: () => LineBreakPolicy
  deleteHorizontalRuleWithKey: (
    state: EditorState,
    event: KeyboardEvent,
    dispatch?: Dispatch,
  ) => string | null
  shouldBlockShiftEnterInRegularBody: (
    state: EditorState,
    lineBreakPolicy: LineBreakPolicy,
  ) => boolean
  shouldInsertHardBreakOnShiftEnterInRegularBody: (
    state: EditorState,
    lineBreakPolicy: LineBreakPolicy,
  ) => boolean
  pushLog: LogPush
}

export function createEditorPropsKeyDownHandler({
  getIsComposing,
  getLineBreakPolicy,
  deleteHorizontalRuleWithKey,
  shouldBlockShiftEnterInRegularBody,
  shouldInsertHardBreakOnShiftEnterInRegularBody,
  pushLog,
}: CreateEditorPropsKeyDownHandlerOptions): (view: EditorView, event: KeyboardEvent) => boolean {
  return (view: EditorView, event: KeyboardEvent): boolean => {
    // Home / End 2段階移動（通常エディタ専用）
    if (event.key === 'Home' || event.key === 'End') {
      return handleHomeEndKey(view, event, {
        getIsComposing: () => getIsComposing(view.composing),
        pushLog,
      })
    }
    // Home/End 以外のキーで2段階状態をリセット
    resetHomeEndState()

    if (
      handlePageUpDownKey(view, event, {
        getIsComposing: () => getIsComposing(view.composing),
        pushLog,
      })
    ) {
      return true
    }

    if (
      handleHeadingFoldStartArrowKey(view, event, {
        getIsComposing: () => getIsComposing(view.composing),
        pushLog,
      })
    ) {
      return true
    }

    if (
      handleRubyBoundaryArrowKey(view, event, {
        getIsComposing: () => getIsComposing(view.composing),
        pushLog,
      })
    ) {
      return true
    }

    // リスト文脈の Tab / Shift+Tab（フォーカス流出防止 + indent/outdent）
    if (
      handleListTabKey(view, event, {
        getIsComposing: () => getIsComposing(view.composing),
      })
    ) {
      return true
    }

    if (!getIsComposing(view.composing)) {
      const deleted = deleteHorizontalRuleWithKey(view.state, event, (tr) => view.dispatch(tr))
      if (deleted) {
        event.preventDefault()
        pushLog('command', `deleteHorizontalRule(${deleted})`)
        return true
      }
    }

    // Block Mod-Enter so the HardBreak extension's default shortcut does not
    // insert a hard break in paragraph / heading.  The visible line break it
    // creates desynchronises the document structure and Paragraph Plain view.
    if (
      event.key === 'Enter' &&
      (event.metaKey || event.ctrlKey) &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault()
      pushLog('lineBreakGuard', 'blocked Mod-Enter hardBreak in regular editor')
      return true
    }

    if (
      event.key === 'Enter' &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const lineBreakPolicy = getLineBreakPolicy()
      if (
        shouldInsertHardBreakOnShiftEnterInRegularBody(
          view.state,
          lineBreakPolicy,
        )
      ) {
        const hardBreakType = view.state.schema.nodes.hardBreak
        if (!hardBreakType) return false
        event.preventDefault()
        const tr = view.state.tr.replaceSelectionWith(hardBreakType.create())
        view.dispatch(tr.scrollIntoView())
        pushLog('lineBreakGuard', 'inserted hardBreak in strict paragraph/heading')
        return true
      }
      if (shouldBlockShiftEnterInRegularBody(view.state, lineBreakPolicy)) {
        event.preventDefault()
        pushLog('lineBreakGuard', 'blocked Shift+Enter in regular paragraph/heading')
        return true
      }
    }

    return false
  }
}
