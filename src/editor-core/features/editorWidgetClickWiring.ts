/**
 * EditorCore 向け — 通常 PM click と局所 IME pointer が共有する widget 依存の組み立て。
 * EditorCore 行数予算を守るため、結線だけをここに寄せる。
 */

import type { Editor } from '@tiptap/core'
import { FOLD_TOGGLE_CLASS } from '../extensions/headingFold'
import { runLocalImeHeadingFoldHandoff } from './localImeHeadingFoldHandoff'

export type EditorWidgetClickWiringDeps = {
  editor: Editor
  emitFoldChange: () => void
  openExternalUrl?: (url: string) => Promise<boolean>
  onHeadingFoldToggled?: () => void
  onNoteAnchorReveal?: (id: string) => void
  pushLog: (event: string, detail: string) => void
}

export function createEditorWidgetClickWiring(
  deps: EditorWidgetClickWiringDeps,
): {
  foldToggleClass: string
  clickHandlerWidget: {
    foldToggleClass: string
    toggleHeadingFold: (headingPos: number) => void
    resolveHeadingFoldForDocumentAction: (headingPos: number) => number | null
    emitFoldChange: () => void
    onHeadingFoldToggled?: () => void
    onNoteAnchorReveal?: (id: string) => void
    openExternalUrl?: (url: string) => Promise<boolean>
    pushLog: (event: string, detail: string) => void
  }
} {
  return {
    foldToggleClass: FOLD_TOGGLE_CLASS,
    clickHandlerWidget: {
      foldToggleClass: FOLD_TOGGLE_CLASS,
      toggleHeadingFold: (headingPos) =>
        deps.editor.commands.toggleHeadingFold(headingPos),
      resolveHeadingFoldForDocumentAction: (headingPos) =>
        runLocalImeHeadingFoldHandoff(() => deps.editor.state.doc, headingPos, {
          hostImeComposing: deps.editor.view.composing,
        }).resolvedPos,
      emitFoldChange: deps.emitFoldChange,
      onHeadingFoldToggled: deps.onHeadingFoldToggled,
      onNoteAnchorReveal: deps.onNoteAnchorReveal,
      openExternalUrl: deps.openExternalUrl,
      pushLog: deps.pushLog,
    },
  }
}
