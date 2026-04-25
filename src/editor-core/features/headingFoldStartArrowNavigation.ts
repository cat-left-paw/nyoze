/**
 * 見出し行先頭の折り畳みトグル（Widget decoration, pos+1 / side: -1）付近で、
 * 縦書きの通常矢印 ArrowLeft が次の表示行へ進まないケースを補正する。
 *
 * 1) DOM Selection.modify(…,'line') → posAtDOM で PM 座標を取得
 *    縦書き(vertical-rl)では 'left'+'line' が「次の表示行」と逆方向（右へ1行）に
 *    解決される実機があったため、line 移動は 'right' を使う
 * 2) 1 が効かなければ、次ブロック先頭（本文の先頭など）へ、hardBreak なしの
 *    見出しに限りフォールバック
 */

import { Selection, TextSelection, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { resolveFoldRange } from '../extensions/headingFold'

type LogPush = (event: string, detail: string) => void

/** vertical-rl(+line) で ArrowLeft 補正に使う Selection.modify の第2引数（テストと突き合わせ） */
export const HEADING_FOLD_VERTICAL_ARROW_LEFT_LINE_MODIFY_DIRECTION = 'right' as const

function isBareArrowKey(event: KeyboardEvent): boolean {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

function isVerticalWritingView(view: EditorView): boolean {
  const win = view.dom?.ownerDocument?.defaultView
  if (!win) return false
  return win.getComputedStyle(view.dom as HTMLElement).writingMode?.startsWith('vertical') ?? false
}

function headingContainsHardBreak(heading: PMNode): boolean {
  let found = false
  heading.forEach((child) => {
    if (child.type.name === 'hardBreak') found = true
  })
  return found
}

/**
 * カーソル位置から、対応する見出しノードの先頭 pos（resolveFoldRange と同じ基準）
 */
export function resolveHeadingPosForFold(state: EditorState, from: number): number | null {
  const $p = state.doc.resolve(from)
  for (let d = 1; d <= $p.depth; d++) {
    if ($p.node(d).type.name === 'heading') {
      const hPos = $p.before(d)
      const node = state.doc.nodeAt(hPos)
      if (node && node.type.name === 'heading') return hPos
    }
  }
  return null
}

/**
 * 折り畳み可能 (fold range あり) な見出しの**先頭文字**用:
 * 縦矢印補正で、hardBreak を含まない単一行相当なら次ブロックへ逃がす。
 */
export function resolveHeadingFoldArrowLeftBlockFallback(
  state: EditorState,
  from: number,
): Selection | null {
  const $pos = state.doc.resolve(from)
  if ($pos.parent.type.name !== 'heading' || $pos.parentOffset !== 0) return null

  let headingDepth = -1
  for (let d = 1; d <= $pos.depth; d++) {
    if ($pos.node(d).type.name === 'heading') {
      headingDepth = d
      break
    }
  }
  if (headingDepth < 0) return null

  if (headingContainsHardBreak($pos.parent)) return null

  const after = $pos.after(headingDepth)
  if (after >= state.doc.content.size) return null
  return Selection.findFrom(state.doc.resolve(after), 1, true)
}

type HandleOpts = {
  getIsComposing: () => boolean
  pushLog: LogPush
}

export function handleHeadingFoldStartArrowKey(
  view: EditorView,
  event: KeyboardEvent,
  { getIsComposing, pushLog }: HandleOpts,
): boolean {
  if (!isBareArrowKey(event)) return false
  if (getIsComposing() || event.isComposing) return false
  if (event.key !== 'ArrowLeft') return false
  if (!isVerticalWritingView(view)) return false

  const { state } = view
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) return false

  const from = selection.from
  const hPos = resolveHeadingPosForFold(state, from)
  if (hPos == null) return false
  if (!resolveFoldRange(state.doc, hPos)) return false

  if (state.doc.resolve(from).parentOffset !== 0) return false

  const fallback = resolveHeadingFoldArrowLeftBlockFallback(state, from)
  if (!fallback) return false

  const domWin = view.dom?.ownerDocument?.defaultView
  const domSel = domWin?.getSelection()
  if (!domSel) return false

  event.preventDefault()

  const before = from
  let nextPos = before
  try {
    // vertical-rl: 'left' + 'line' は 次の表示行 ではなく視覚的に反対側に動く
    // （ArrowLeft の意図と逆）。'right' + 'line' が 次行 相当に揃う。
    domSel.modify('move', HEADING_FOLD_VERTICAL_ARROW_LEFT_LINE_MODIFY_DIRECTION, 'line')
    const fn = domSel.focusNode
    const fo = domSel.focusOffset
    if (fn) {
      nextPos = view.posAtDOM(fn, fo, 1)
    }
  } catch {
    // posAtDOM で失敗したらブロック遷移へ
  }

  if (nextPos !== before) {
    try {
      const tr = state.tr
        .setSelection(TextSelection.create(state.doc, nextPos))
        .scrollIntoView()
      view.dispatch(tr)
      pushLog('headingFold', `arrowLeft line ${before}->${nextPos}`)
      return true
    } catch {
      // ブロック遷移へ
    }
  }

  view.dispatch(state.tr.setSelection(fallback).scrollIntoView())
  pushLog('headingFold', `arrowLeft nextBlock ${before}->${fallback.$from?.pos ?? from}`)
  return true
}
