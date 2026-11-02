import { AllSelection, NodeSelection, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { resetHomeEndState, runHomeEndNavigationCommand, type HomeEndKey } from '../../homeEndNavigation'
import { resolveRubyAwareVisualLineEdge } from '../../rubyHomeEndVisualEdge'
import { resolveRubyBoundaryArrowAnchor } from '../../rubyBoundaryArrowNavigation'
import { resolvePageUpDownScrollHost, runPageUpDownNavigationCommand } from '../../pageUpDownNavigation'
import { resolveSupportedEditorWritingMode, type SupportedEditorWritingMode } from '../../writingModeNavigationMapping'
import { characterSelection } from './characterNavigation'
import { blockCenter, copyRect, inlineStart, readCaretRect } from './caretGeometry'
import { projectAllSelectionToText } from './allSelectionProjection'
import { createLineGeometry } from './lineGeometry'
import { documentEdge, extendDirectionalEdge, navigationAnchor, nextGoal, rangeLineOrigin, retainLineGoal, stopAtAnchor, type NavigationAffinity, type NavigationOp, type NavigationReceipt } from './rules'
import { revealCaret } from './scroll'
import { isBlockLevelSelection, resolveSelectionExit } from './selectionExit'
import { hasTextSelectionOutsideInlineContent, TEXT_SELECTION_OUTSIDE_INLINE_CONTENT } from './selectionValidity'

/** A typed command input, never dispatched as a DOM event. */
function commandKey(key: string): HomeEndKey {
  return { key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, preventDefault() {} }
}

export function createNavigation(view: EditorView, deferReveal?: (reveal: () => void) => boolean) {
  let mode: SupportedEditorWritingMode = 'horizontal-tb'
  let geometry: ReturnType<typeof createLineGeometry> | null = null
  let goal: number | null = null, affinity: NavigationAffinity = 'head'
  let rememberedDoc = view.state.doc, rememberedSelection = view.state.selection
  let dispatching = false
  let pointer: { x: number; y: number } | undefined
  const sync = () => {
    const nextMode = resolveSupportedEditorWritingMode(view.dom.ownerDocument.defaultView!.getComputedStyle(view.dom).writingMode) ?? 'horizontal-tb'
    if (!geometry || nextMode !== mode) { mode = nextMode; geometry = createLineGeometry(view, mode); goal = null; affinity = 'head' }
    if (!dispatching && (rememberedDoc !== view.state.doc || !rememberedSelection.eq(view.state.selection))) {
      goal = null; affinity = 'head'; pointer = undefined
      rememberedDoc = view.state.doc; rememberedSelection = view.state.selection
    }
  }
  const caretRect = (purpose?: 'pseudo-caret') => { sync(); return readCaretRect(view, view.state.selection.head, mode, affinity, pointer, purpose) }
  const insertionCaretRect = (position?: number) => {
    sync()
    const selection = view.state.selection
    if (position !== undefined && position !== selection.head) return readCaretRect(view, position, mode, 'head')
    if (selection.empty) return caretRect()
    const at = selection instanceof AllSelection ? Selection.atStart(view.state.doc).from
      : selection.from
    return readCaretRect(view, at, mode, 'head')
  }
  /**
   * 折り返しの位置で、挿入位置のcaretが前の行の行末側に表示されている（行末のaffinity）。
   * 表示中の矩形と、行頭側の矩形の行が違うかどうかで判定する。読むだけ。
   */
  const insertionCaretAtWrapEnd = (position?: number) => {
    const shown = insertionCaretRect(position)
    const head = readCaretRect(view, position ?? view.state.selection.head, mode, 'head')
    return !!shown && !!head && Math.abs(blockCenter(shown, mode) - blockCenter(head, mode)) > 4
  }
  const navigate = (op: NavigationOp): NavigationReceipt => {
    const started = performance.now()
    sync()
    pointer = undefined
    const actualBefore = view.state.selection, doc = view.state.doc, g = geometry!
    const before = actualBefore instanceof AllSelection ? projectAllSelectionToText(doc) : actualBefore
    if (!before) return { handled: true, moved: false, anchor: actualBefore.anchor, head: actualBefore.head,
      affinity, reason: 'all-selection-no-text-caret', calculationMs: performance.now() - started, dispatchMs: 0, scrollMs: 0 }
    const navigationState = before === actualBefore ? view.state : view.state.apply(view.state.tr.setSelection(before))
    if (actualBefore instanceof AllSelection && op.extend && op.axis === 'character' && op.direction === 'forward') {
      // The selected document already reaches its final character. Native
      // Shift+forward leaves AllSelection intact instead of narrowing it.
      return { handled: true, moved: false, anchor: actualBefore.anchor, head: actualBefore.head,
        affinity, reason: 'all-selection-terminal', calculationMs: performance.now() - started, dispatchMs: 0, scrollMs: 0 }
    }
    let reason = 'unresolved', handled = true, dispatchMs = 0, scrollMs = 0
    // 端点がinline contentの外にあるTextSelectionの設定を拒否したとき、その理由。PageやHome / Endの既存のcommandは
    // dispatchの例外を握って`handled: false`を返すので、reasonは最後にここから上書きする。
    let rejectedSelection: string | null = null
    // textblockの中にcaretがない選択（blockのNodeSelection、GapCursor）。ここからのArrowは、textの座標でなく選択の規則で動く。
    const blockLevel = isBlockLevelSelection(actualBefore)
    const forward = op.direction === 'forward', sign = forward ? 1 : -1
    const dispatch = (tr: Transaction) => {
      if (tr.docChanged || tr.doc !== doc) throw new Error('Navigation attempted a content transaction')
      // navigationが選択を設定する唯一の入口。textblockの外に端点を持つTextSelectionは設定しない（何もしない）。
      if (tr.selectionSet && hasTextSelectionOutsideInlineContent(tr.selection)) {
        rejectedSelection = TEXT_SELECTION_OUTSIDE_INLINE_CONTENT
        throw new Error('Navigation attempted a text selection outside inline content')
      }
      g.endReadBatch() // Selection/decorations can change DOM geometry.
      const start = performance.now()
      dispatching = true
      try { view.dispatch(tr.setMeta('addToHistory', false)) }
      finally { dispatching = false; dispatchMs += performance.now() - start }
    }
    const setSelection = (selection: Selection) => { if (!selection.eq(view.state.selection)) dispatch(view.state.tr.setSelection(selection)) }
    const selectionAt = (head: number) => {
      const anchor = op.extend ? resolveRubyBoundaryArrowAnchor(navigationState, op.direction) : before.anchor
      if (op.extend && (op.axis === 'document' || op.axis === 'line-edge')) {
        const next = extendDirectionalEdge(anchor, before.empty ? anchor : before.head, head, op.direction)
        return TextSelection.create(doc, next.anchor, next.head)
      }
      const target = op.extend && !before.empty && op.axis === 'line' ? stopAtAnchor(anchor, before.head, head) : head
      return TextSelection.create(doc, navigationAnchor(anchor, target, op.extend), target)
    }
    const setHead = (head: number) => setSelection(selectionAt(head))
    const edge = () => {
      const blocks = g.all(), first = blocks.find(g.visible), last = blocks.slice().reverse().find(g.visible)
      return first && last ? documentEdge(first.start, last.end, op.direction) : before.head
    }
    const scrollHost = resolvePageUpDownScrollHost(view)
    const inlineScroll = () => mode === 'vertical-rl' ? scrollHost?.scrollTop ?? 0 : scrollHost?.scrollLeft ?? 0
    if (op.axis !== 'line') goal = null
    if (op.axis !== 'line-edge') resetHomeEndState()
    g.beginReadBatch()
    try {
      if (blockLevel && (op.axis === 'character' || op.axis === 'line')) {
        // NAV-GAP1: 4方向のArrow（Shift付きを含む）。範囲は作らない。選択だけを変え、本文は変えない。
        affinity = 'head'
        const exit = resolveSelectionExit({
          state: view.state, direction: op.direction, extend: op.extend,
          isVisible: pos => !!(view.nodeDOM(pos) as Element | null)?.getClientRects().length,
        })
        if (exit.kind === 'moved') { setSelection(exit.selection); reason = 'selection-exit' } else reason = 'selection-exit-none'
      } else if (blockLevel && (op.axis === 'line-edge' || ((op.axis === 'document' || op.axis === 'page') && op.extend))) {
        // Home / Endは、行の端がない選択では何もしない（包むblockの端へ飛ばない）。Hostのnativeは規則にできない。
        // macのShift+Home / End・Cmd+Shift+↑↓（document軸のextend）とShift+PageUp / PageDown（page軸のextend）も同じ:
        // 起点のanchorがtextblockの外にあるので、端点がblockの境界にある不正なTextSelectionになり、
        // 続く入力が範囲内の水平線ごと置き換えてしまう。
        affinity = 'head'
        reason = 'non-text-selection'
      } else if (op.axis === 'document') { affinity = forward ? 'end' : 'head'; setHead(edge()); reason = 'document-edge' }
      else if (op.axis === 'page') {
        affinity = 'head'
        const result = runPageUpDownNavigationCommand(view, commandKey(forward ? 'PageDown' : 'PageUp') as KeyboardEvent, {
          getIsComposing: () => false, pushLog() {},
          origin: { head: before.head, anchor: op.extend ? before.anchor : undefined, scrollOnly: !before.empty && !op.extend },
          dispatchTransaction: dispatch,
        })
        reason = result.handled ? 'page-existing' : 'page-unavailable'
      } else if (op.axis === 'line-edge') {
        // A fresh range command has no inherited caret affinity (B6).
        const originAffinity = !op.extend && !before.empty ? 'head' : affinity
        affinity = forward ? 'end' : 'head'
        const origin = before.empty ? before.head : forward ? before.to : before.from
        const visualEdge = (direction: 'home' | 'end', block: { start: number; end: number }) => {
          const ruby = resolveRubyAwareVisualLineEdge(view, direction, block.start, block.end)
          if (ruby !== null) return ruby
          const current = g.locate(origin, originAffinity)
          return current ? g.position(current.line, 0, direction)?.pos ?? null : null
        }
        if (op.visualOnly) {
          const block = g.blockAt(origin), target = block && visualEdge(forward ? 'end' : 'home', block)
          if (target !== null && target !== undefined) setHead(target)
          reason = 'modified-visual-edge'
        } else {
          const result = runHomeEndNavigationCommand(view, commandKey(forward ? 'End' : 'Home'), {
            getIsComposing: () => false, pushLog() {}, dispatchTransaction: dispatch, deferDomAffinity: true,
            focusless: { extend: op.extend, origin, selectionForTarget: selectionAt, visualEdge },
          })
          handled = result.handled
          reason = result.handled ? `home-end-${result.homeEndPhaseResult}` : 'line-edge-unavailable'
        }
      } else if (op.axis === 'character') {
        affinity = 'head'
        const block = g.blockAt(before.head)
        if (block) { setSelection(characterSelection(navigationState, block, g.neighborBlock(block, sign), op, mode)); reason = 'character' }
      } else {
        // Chromium's line goal is the range head, including backward selections.
        // Using from/to can start in a different displayed row and skip a row.
        const start = before.head
        const current = g.locate(start, rangeLineOrigin(before.anchor, before.head, goal, affinity))
        if (current) {
          const empty = current.block.start === current.block.end
          const retain = retainLineGoal(mode, op.extend, before.empty)
          const fromEmptyStart = empty && (goal === null || !retain)
          const emptyRect = empty ? (view.nodeDOM(current.block.start - 1) as Element).getBoundingClientRect() : null
          const goalRect = !before.empty && goal === null ? g.read(start, 'head') ?? current.rect : current.rect
          const base = emptyRect ? inlineStart(emptyRect, mode) : inlineStart(goalRect, mode)
          goal = nextGoal(goal, base + inlineScroll(), 'line', retain)
          const targetLine = g.neighbor(current, sign)
          if (!targetLine) { affinity = forward ? 'end' : 'head'; setHead(edge()); reason = 'document-edge' }
          else {
            const target = g.position(targetLine, goal! - inlineScroll(), fromEmptyStart ? 'home' : undefined)
            if (target && g.accept(target.pos, targetLine, target.affinity)) {
              // An empty paragraph has no glyph-defined inline goal. Native
              // establishes that goal at the first non-empty destination.
              if (fromEmptyStart && retain) {
                const landed = g.read(target.pos, target.affinity)
                if (landed) goal = nextGoal(null, inlineStart(landed, mode) + inlineScroll(), 'line')
              }
              affinity = target.affinity; setHead(target.pos); reason = 'adjacent-line'
            } else reason = 'target-line-rejected'
          }
        }
      }
    } catch { handled = false; reason = 'navigation-rejected' }
    finally { g.endReadBatch() }
    if (rejectedSelection) { handled = true; reason = rejectedSelection }
    rememberedDoc = view.state.doc; rememberedSelection = view.state.selection
    const scrollStarted = performance.now()
    if (op.axis !== 'page') {
      const selection = view.state.selection
      // bare Arrowのこの打鍵がfollowを予約した場合だけ、同じframeのfollow後へ渡す。
      // revealCaretは、実行時のcaret・viewportを読み、外に残るときだけ余白0で動かす。
      const deferred = !blockLevel && actualBefore instanceof TextSelection && actualBefore.empty && !op.extend &&
        (op.axis === 'character' || op.axis === 'line') && selection.empty &&
        deferReveal?.(() => revealCaret(view, caretRect()))
      // blockのNodeSelectionは、PMと同じくnodeのDOMの矩形を使う（head位置にはtextのRangeがない）。
      const node = blockLevel && selection instanceof NodeSelection ? view.nodeDOM(selection.from) : null
      if (!deferred) {
        if (node instanceof Element) revealCaret(view, copyRect(node.getBoundingClientRect()), selection.from)
        else revealCaret(view, caretRect())
      }
    }
    scrollMs += performance.now() - scrollStarted
    return { handled, moved: !actualBefore.eq(view.state.selection), anchor: view.state.selection.anchor, head: view.state.selection.head,
      affinity, reason, calculationMs: performance.now() - started - dispatchMs - scrollMs, dispatchMs, scrollMs }
  }
  return { navigate, caretRect, insertionCaretRect, insertionCaretAtWrapEnd, clearGoal: () => { goal = null }, setPointerAffinity(point: { x: number; y: number }) { sync(); pointer = point } }
}
