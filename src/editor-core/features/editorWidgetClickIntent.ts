/**
 * 通常 PM `click` と局所 IME slot pointer が共有する widget / 修飾リンク intent。
 *
 * side-effect のない classify と、既存 command への commit だけを持つ。
 * controller / click handler へ意味論を複製しない。
 */

import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import {
  resolveChecklistClickPos,
  resolveFoldToggleHeadingPos,
} from './clickRouting'
import { selectHorizontalRuleAtEventTarget } from './horizontalRule'
import {
  isModifiedLinkClick,
  resolveModifiedLinkClick,
  validateOpenableExternalHref,
} from './linkOpen'
import { resolveNoteAnchorIdAtTarget } from './noteAnchorProtection'
import { toggleChecklistItemAtDocPos } from './checklist'

type Dispatch = (tr: Transaction) => void
type OpenExternalUrl = (url: string) => Promise<boolean>

export type EditorWidgetClickIntent =
  | { kind: 'note-anchor-reveal'; noteId: string }
  | { kind: 'modified-link-open'; href: string }
  | { kind: 'modified-link-blocked' }
  | { kind: 'fold-toggle'; headingPos: number }
  | { kind: 'horizontal-rule-select'; pos: number }
  | { kind: 'checklist-toggle'; listItemPos: number }
  | { kind: 'none' }

export type EditorWidgetClickClassifyInput = {
  /** 解決済み Element。注入 DI / fake DOM テスト用。 */
  targetElement: Element | null
  button: number
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing: boolean
  foldToggleClass: string
  state: EditorState
  posAtDOM: (node: Node, offset: number) => number
  noteAnchorRevealAvailable: boolean
  openExternalAvailable: boolean
}

/**
 * 優先順は通常 PM `createEditorClickHandler` と同じ:
 * noteAnchor → modified link → fold → HR → checklist → none。
 */
export function classifyEditorWidgetClickIntent(
  input: EditorWidgetClickClassifyInput,
): EditorWidgetClickIntent {
  const targetElement = input.targetElement
  if (!targetElement) return { kind: 'none' }

  const noteAnchorId = resolveNoteAnchorIdAtTarget(targetElement)
  if (
    noteAnchorId &&
    input.noteAnchorRevealAvailable &&
    input.button === 0 &&
    !input.metaKey &&
    !input.ctrlKey &&
    !input.altKey &&
    !input.shiftKey
  ) {
    return { kind: 'note-anchor-reveal', noteId: noteAnchorId }
  }

  const linkAnchor = targetElement.closest('a[href]')
  if (linkAnchor) {
    if (
      isModifiedLinkClick({
        button: input.button,
        metaKey: input.metaKey,
        ctrlKey: input.ctrlKey,
        altKey: input.altKey,
        shiftKey: input.shiftKey,
        isComposing: input.isComposing,
      })
    ) {
      if (input.isComposing || !input.openExternalAvailable) {
        return { kind: 'modified-link-blocked' }
      }
      const href = resolveModifiedLinkClick({
        href: linkAnchor.getAttribute('href'),
        button: input.button,
        metaKey: input.metaKey,
        ctrlKey: input.ctrlKey,
        altKey: input.altKey,
        shiftKey: input.shiftKey,
        isComposing: input.isComposing,
      })
      if (!href) return { kind: 'modified-link-blocked' }
      return { kind: 'modified-link-open', href }
    }
    // 修飾なしのリンク上 click は widget 対象外（通常 PM selection へ任せる）。
    return { kind: 'none' }
  }

  if (input.isComposing) return { kind: 'none' }

  const headingPos = resolveFoldToggleHeadingPos(
    targetElement,
    input.foldToggleClass,
  )
  if (headingPos !== null) {
    return { kind: 'fold-toggle', headingPos }
  }

  const horizontalRulePos = selectHorizontalRuleAtEventTarget(
    input.state,
    targetElement,
    input.posAtDOM,
  )
  if (horizontalRulePos !== null) {
    return { kind: 'horizontal-rule-select', pos: horizontalRulePos }
  }

  const checklistPos = resolveChecklistClickPos(targetElement, input.posAtDOM)
  if (checklistPos !== null) {
    return { kind: 'checklist-toggle', listItemPos: checklistPos }
  }

  return { kind: 'none' }
}

export type EditorWidgetClickCommitDeps = {
  state: EditorState
  dispatch: Dispatch
  toggleHeadingFold: (headingPos: number) => void
  emitFoldChange: () => void
  onHeadingFoldToggled?: () => void
  onNoteAnchorReveal?: (id: string) => void
  openExternalUrl?: OpenExternalUrl
  pushLog?: (event: string, detail: string) => void
}

export type EditorWidgetClickCommitResult =
  | { ok: true; kind: EditorWidgetClickIntent['kind']; suspendSession: boolean }
  | { ok: false; reason: 'noop' | 'command-rejected' | 'link-blocked' }

export function commitEditorWidgetClickIntent(
  intent: EditorWidgetClickIntent,
  deps: EditorWidgetClickCommitDeps,
): EditorWidgetClickCommitResult {
  const log = deps.pushLog
  switch (intent.kind) {
    case 'none':
      return { ok: false, reason: 'noop' }
    case 'modified-link-blocked':
      log?.('linkOpen', 'blocked')
      return { ok: false, reason: 'link-blocked' }
    case 'note-anchor-reveal': {
      if (!deps.onNoteAnchorReveal) return { ok: false, reason: 'command-rejected' }
      deps.onNoteAnchorReveal(intent.noteId)
      return { ok: true, kind: intent.kind, suspendSession: false }
    }
    case 'modified-link-open': {
      const safe = validateOpenableExternalHref(intent.href)
      if (!safe || !deps.openExternalUrl) {
        log?.('linkOpen', 'blocked')
        return { ok: false, reason: 'link-blocked' }
      }
      log?.('linkOpen', 'openExternal')
      void deps
        .openExternalUrl(safe)
        .then((ok) => {
          if (!ok) log?.('linkOpen', 'failed')
        })
        .catch(() => {
          log?.('linkOpen', 'failed')
        })
      return { ok: true, kind: intent.kind, suspendSession: false }
    }
    case 'fold-toggle': {
      deps.onHeadingFoldToggled?.()
      deps.toggleHeadingFold(intent.headingPos)
      deps.emitFoldChange()
      log?.('command', `toggleHeadingFold(click) pos=${intent.headingPos}`)
      return { ok: true, kind: intent.kind, suspendSession: false }
    }
    case 'horizontal-rule-select': {
      try {
        const tr = deps.state.tr.setSelection(
          NodeSelection.create(deps.state.doc, intent.pos),
        )
        deps.dispatch(tr)
      } catch {
        return { ok: false, reason: 'command-rejected' }
      }
      log?.('selectionUpdate', `horizontalRule selected pos=${intent.pos}`)
      return { ok: true, kind: intent.kind, suspendSession: true }
    }
    case 'checklist-toggle': {
      const changed = toggleChecklistItemAtDocPos(
        deps.state,
        intent.listItemPos,
        deps.dispatch,
      )
      if (!changed) return { ok: false, reason: 'command-rejected' }
      log?.('command', 'toggleChecklistChecked(click)')
      return { ok: true, kind: intent.kind, suspendSession: false }
    }
    default: {
      const _exhaustive: never = intent
      void _exhaustive
      return { ok: false, reason: 'noop' }
    }
  }
}
