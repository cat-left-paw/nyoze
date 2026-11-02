import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'
import { joinBackward } from '@tiptap/pm/commands'
import { GapCursor } from '@tiptap/pm/gapcursor'
import type { EditorView } from '@tiptap/pm/view'
import type { EditOwner, OwnerInsertionSnapshot } from './editOwner'
import { judgeInsertion } from './surfaceState'
import { createNavigation } from './navigation/navigation'
import { buildOwnerRangeDeletionTransaction, resolveOwnerDeletion } from './deletionRules'
import { createOwnerDeletionGuard } from './deletionGuard'
import type { SurfaceRecord } from './inputSurface'
import { resolveHostRangeCommitMarks } from './rangeCommitMarks'
import { withInputSurfaceCutContext } from '../editorPropsClipboardCopy'
import { AllSelection } from '@tiptap/pm/state'
import { resolveSurfacePaste } from './clipboardPolicy'
import { revealCaret } from './navigation/scroll'
import { normalizeRubyInsertionRange } from './rubyInsertionPosition'
import type { CompositionPresentation } from './compositionPresentation'
import { resolveHostPreeditContext } from './preeditContext'
import { isProtectedTcySelection } from '../tcyFormatting'
import { notifyNoteAnchorProtection } from '../noteAnchorProtectionNotice'
import { resolveSelectionMirror, sameMirrorRange, type SelectionMirror } from './selectionMirror'

/** DOMのcaret矩形を先に使う。入力面へfocusしていてもglobal selectionは動かさない。 */
export function createHostOwner(view: EditorView, getIdentity: () => string, record: SurfaceRecord = () => {}, presentation?: CompositionPresentation, deferNavigationReveal?: (reveal: () => void) => boolean): EditOwner & { deletionGuard: ReturnType<typeof createOwnerDeletionGuard> } {
  const navigation = createNavigation(view, deferNavigationReveal)
  const deletionGuard = createOwnerDeletionGuard(record, () => view.state)
  const insertionPosition = () => {
    const selection = view.state.selection
    return selection instanceof AllSelection ? Selection.atStart(view.state.doc).from
      : normalizeRubyInsertionRange(view.state, selection.from, selection.to).from
  }
  return {
    kind: 'host',
    deletionGuard,
    presentComposition: (text, snapshot) => presentation?.present(text, snapshot),
    isCompositionPresented: () => presentation?.isReserved() ?? false,
    compositionPresentationRect: () => presentation?.firstCharacterRect() ?? null,
    insertionCaretAtWrapEnd: () => view.state.selection.empty && navigation.insertionCaretAtWrapEnd(insertionPosition()),
    insertionPreeditContext() {
      if (!presentation || view.isDestroyed || !view.state.selection.empty) return null
      const position = insertionPosition(), caret = navigation.insertionCaretRect(position)
      return caret ? resolveHostPreeditContext(view, position, caret) : null
    },
    get identity() { return getIdentity() },
    selectionMirror() {
      return resolveSelectionMirror(this.snapshotInsertion(), view.state.selection, view.editable && !view.isDestroyed)
    },
    snapshotInsertion() {
      if (!view.editable || view.isDestroyed) return null
      return { identity: getIdentity(), docRef: view.state.doc, from: view.state.selection.from, to: view.state.selection.to }
    },
    proveSnapshot(snapshot) {
      return !view.isDestroyed && view.editable && judgeInsertion(snapshot, { identity: getIdentity(), docRef: view.state.doc }, '') === 'ready'
    },
    commitText(snapshot: OwnerInsertionSnapshot, text: string, unchangedOriginal?: SelectionMirror | null) {
      const verdict = judgeInsertion(snapshot, { identity: getIdentity(), docRef: view.state.doc }, text)
      if (verdict !== 'ready') return verdict
      if (!view.editable || view.isDestroyed) return 'stale'
      try {
        // D7: 同じ語へ戻す取消は本文・history・dirtyを変えない。確定の入口はB10と同じ。
        if (unchangedOriginal && sameMirrorRange(unchangedOriginal, snapshot) && text === unchangedOriginal.text) {
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, snapshot.to)).setMeta('addToHistory', false))
          return view.state.doc === snapshot.docRef && view.state.selection.empty && view.state.selection.head === snapshot.to ? 'committed' : 'dispatch-rejected'
        }
        // GAP-SAFETY1: Hostのbeforeinputと同じ述語。TCYの中・TCYを選択中の入力は確定しない。
        const current = view.state.selection
        const target = current.from === snapshot.from && current.to === snapshot.to ? view.state
          : view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, snapshot.from, snapshot.to)))
        if (isProtectedTcySelection(target)) {
          record('owner-commit-blocked', { reason: 'tcy-protected', from: snapshot.from, to: snapshot.to })
          return 'protected-target'
        }
        // B15: blockのatom（leafのblock node）を選択中の確定は、nodeを消さず、直後の新しい段落へ入れる。
        if (current instanceof NodeSelection && current.from === snapshot.from && current.to === snapshot.to
          && current.node.isBlock && current.node.isLeaf) {
          const after = current.to, $after = view.state.doc.resolve(after), index = $after.index()
          const type = $after.parent.contentMatchAt(index).defaultType
          if (!type?.isTextblock || type.spec.code || !$after.parent.canReplaceWith(index, index, type)) {
            record('owner-commit-blocked', { reason: 'no-paragraph-after-block-atom', from: snapshot.from, to: snapshot.to })
            return 'dispatch-rejected'
          }
          const tr = view.state.tr.insert(after, type.create(null, view.state.schema.text(text)))
          // B033: Hostの`deflt`と同じく、確定は見える範囲への移動を求める（実行は`caretReveal.ts`）。
          view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1 + text.length)).scrollIntoView())
          return view.state.doc !== snapshot.docRef ? 'committed' : 'dispatch-rejected'
        }
        const { from, to } = normalizeRubyInsertionRange(view.state, snapshot.from, snapshot.to)
        const adjusted = from !== snapshot.from || to !== snapshot.to
        const replacesNode = !adjusted && current instanceof NodeSelection && current.from === from && current.to === to
        // PIS-S10-NAV-GAP1 P0: GapCursor（段落のない位置のcaret）への確定。Hostは入れた文字の後ろへcaretが来る。
        const atGapCursor = !adjusted && current instanceof GapCursor && current.from === from && current.to === to
        const deflt = () => {
          const tr = view.state.tr, marks = resolveHostRangeCommitMarks(view.state, from, to)
            ?? (adjusted ? view.state.storedMarks ?? view.state.doc.resolve(from).marks() : undefined)
          if (adjusted) tr.setSelection(TextSelection.create(tr.doc, from, to))
          if (marks) tr.setStoredMarks(marks)
          tr.insertText(text, from, to)
          // 一部の再変換: 元のPM範囲のP/Sは保ち、確定した部分の後ろへcaretを置く。
          if (current instanceof TextSelection && (from !== current.from || to !== current.to)
            && from >= current.from && to <= current.to) tr.setSelection(TextSelection.create(tr.doc, from + text.length))
          if (adjusted) tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(from, -1) + text.length), -1))
          // NodeSelectionは置換後に挿入の前へ写る。Hostと同じく、入れた文字の後ろへcaretを置く。
          if (replacesNode) tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(to)), -1))
          // GapCursorは、挿入した段落の後ろ（次のnodeの前）へ写り、次のatomのNodeSelectionになる。
          // 続けて打つ文字が、そのatomの後ろの新しい段落（B15）へ入って順序が壊れる。新しい段落の中の、入れた文字の後ろへ置く。
          if (atGapCursor) tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(from, 1)), -1))
          // AllSelection maps to another AllSelection across a full-document
          // replacement. Native Host input leaves a collapsed caret after text.
          if (view.state.selection instanceof AllSelection) tr.setSelection(Selection.atEnd(tr.doc))
          // B033: Host（prosemirror-view `input.ts`の`deflt`）と同じ印。transactionの数・history・dirtyは変わらない。
          return tr.scrollIntoView()
        }
        // Hostと同じinput rule / undoInputRuleの経路。処理したhandlerのdispatchを重ねない。
        const handled = view.someProp('handleTextInput', handler => handler(view, from, to, text, deflt))
        if (!handled) view.dispatch(deflt())
        // filtered/dropped dispatchも成功扱いにしない。自動Retryは行わない。
        return view.state.doc !== snapshot.docRef ? 'committed' : 'dispatch-rejected'
      } catch {
        return 'dispatch-rejected'
      }
    },
    handleKeyDown(event) {
      if (!event.isTrusted || !view.editable || view.isDestroyed) return 'unhandled'
      if (event.key !== 'Backspace' && event.key !== 'Delete') {
        return view.someProp('handleKeyDown', handler => handler(view, event)) ? 'handled' : 'unhandled'
      }
      // 修飾deleteのnative fallbackは既存I8のHost handoffへ委ねる。
      if (event.metaKey || event.ctrlKey || event.altKey) return 'unhandled'
      const deleteKey = event.key, state = view.state, plan = resolveOwnerDeletion(state, deleteKey)
      // selectionの投影はdispatchせず、Hostのplugin構成・state fieldsを保つ。
      // guard開始前に作り、実際の削除rootの回数へ含めない。
      const outside = plan.kind === 'boundary'
        ? state.apply(state.tr.setSelection(TextSelection.create(state.doc, plan.caret))) : null
      return deletionGuard.run(state, plan, deleteKey, () => {
        if (plan.kind === 'blocked') {
          record('owner-delete-blocked', { reason: plan.reason })
          // STICKY-NOTE-LIFECYCLE1: Host の keydown と同じ理由の通知（拒否の判定は deletionRules のまま）。
          if (plan.reason === 'note-anchor-protected') notifyNoteAnchorProtection(view, 'delete-key')
          return 'handled'
        }
        if (plan.kind === 'delete') {
          const tr = plan.reason === 'range'
            ? buildOwnerRangeDeletionTransaction(state, plan) : state.tr.delete(plan.from, plan.to)
          if (plan.reason !== 'range') tr.setSelection(Selection.near(tr.doc.resolve(plan.caret), -1))
          view.dispatch(tr.scrollIntoView())
          return 'handled'
        }
        if (plan.kind === 'collapse' || plan.kind === 'boundary') {
          // Ruby内先頭のBackspaceは外側で解釈。中間selection dispatchを作らない。
          if (outside && joinBackward(outside, tr => view.dispatch(tr.scrollIntoView()))) return 'handled'
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, plan.caret)).setMeta('addToHistory', false))
          return 'handled'
        }
        // delegateはtextblock内かつ削除方向に特殊inlineがない場合だけ。
        const handled = view.someProp('handleKeyDown', handler => handler(view, event) || deletionGuard.rejected() || deletionGuard.dispatched())
        if (handled || deletionGuard.rejected() || deletionGuard.dispatched()) return 'handled'
        // 空transactionに続くHost pluginの正規化を反映したstateを使う。
        const current = view.state, fallback = resolveOwnerDeletion(current, deleteKey)
        if (fallback.kind !== 'delegate' || fallback.from === fallback.to) return 'unhandled'
        view.dispatch(current.tr.delete(fallback.from, fallback.to).scrollIntoView())
        return 'handled'
      })
    },
    handleClipboardCopyCut(event) {
      if (!view.editable || view.isDestroyed || view.state.selection.empty) return false
      const runHandlers = () => !!view.someProp('handleDOMEvents', handlers => {
        const handler = handlers[event.type as 'copy' | 'cut']
        return handler ? handler(view, event) || event.defaultPrevented : false
      })
      if (event.type !== 'cut') return runHandlers()
      const state = view.state, plan = resolveOwnerDeletion(state, 'Backspace')
      if (plan.kind !== 'delete') return runHandlers()
      return deletionGuard.run(state, plan, 'Backspace', () => withInputSurfaceCutContext(view, {
        from: plan.from, to: plan.to,
        deleteSelection() {
          const tr = plan.reason === 'range'
            ? buildOwnerRangeDeletionTransaction(view.state, plan) : view.state.tr.delete(plan.from, plan.to)
          if (plan.reason !== 'range') tr.setSelection(Selection.near(tr.doc.resolve(plan.from), -1))
          view.dispatch(tr.scrollIntoView().setMeta('uiEvent', 'cut'))
        },
      }, runHandlers))
    },
    handleClipboardPaste(event, plain) {
      if (!view.editable || view.isDestroyed) return false
      const custom = view.someProp('handleDOMEvents', handlers => {
        const handler = handlers.paste
        return handler ? handler(view, event) || event.defaultPrevented : false
      })
      if (custom || event.defaultPrevented) return true
      const data = event.clipboardData
      if (!data) return false
      const inCode = !!view.state.selection.$from.parent.type.spec.code
      const payload = resolveSurfacePaste(data, plain, inCode)
      if (payload.kind === 'text') return view.pasteText(payload.value, event)
      if (payload.kind === 'html') return view.pasteHTML(payload.value, event)
      return false
    },
    navigate: navigation.navigate,
    clearNavigationGoal: navigation.clearGoal,
    caretRect(purpose) {
      const selection = view.state.selection, position = insertionPosition()
      return selection.empty && position !== selection.head
        ? navigation.insertionCaretRect(position) : navigation.caretRect(purpose)
    },
    insertionCaretRect: () => navigation.insertionCaretRect(insertionPosition()),
    insertionTextblock() {
      const position = insertionPosition()
      const at = view.domAtPos(position)
      const element = at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement : at.node as Element
      return element?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, pre') ?? null
    },
    nextMarkNames() {
      const state = view.state, selection = state.selection
      const { from, to } = normalizeRubyInsertionRange(state, selection.from, selection.to)
      const marks = from === to ? state.storedMarks ?? state.doc.resolve(from).marks()
        : resolveHostRangeCommitMarks(state, from, to) ?? []
      return marks.map(mark => mark.type.name).sort()
    },
    revealInsertionPosition() {
      return revealCaret(view, navigation.insertionCaretRect(insertionPosition()), insertionPosition())
    },
    setPointerAffinity: navigation.setPointerAffinity,
    caretElement() {
      const at = view.domAtPos(insertionPosition())
      return at.node.nodeType === Node.TEXT_NODE ? at.node.parentElement! : at.node as Element
    },
    rangeForPresentation() {
      if (view.state.selection.empty) return null
      try {
        const { from, to } = view.state.selection
        const start = view.domAtPos(from, 1), end = view.domAtPos(to, -1)
        const range = view.dom.ownerDocument.createRange()
        range.setStart(start.node, start.offset)
        range.setEnd(end.node, end.offset)
        return range
      } catch { return null }
    },
    prepareForPointerGesture: () => 'ready',
  }
}
