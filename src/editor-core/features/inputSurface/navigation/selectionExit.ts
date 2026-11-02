import { GapCursor } from '@tiptap/pm/gapcursor'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Selection, type EditorState } from '@tiptap/pm/state'
import { findGapCursorPosition } from './gapCursorApi'

/**
 * PIS-S10-NAV-GAP1: textblockの中にcaretがない選択（blockのNodeSelection、GapCursor）からのArrow。
 * PMの内部（`captureKeyDown`）は呼ばず、gapcursorの`findGapCursorFrom`（型宣言にだけない静的メソッド。`gapCursorApi.ts`）と`Selection.findFrom`だけで書く。
 * 向きは`NavigationOp.direction`（N1の写像）をそのまま使う。縦書きでは、本文のArrowと同じ見た目の向きになる（Hostとは←→が逆）。
 */
export type SelectionExit = { kind: 'moved'; selection: Selection } | { kind: 'none' }
export type SelectionExitInput = {
  state: Pick<EditorState, 'doc' | 'selection'>
  direction: 'backward' | 'forward'
  /** Shift付き。範囲は作らず、GapCursorにも入らず、PM既定の移動先（textの端か、隣のatomのNodeSelection）だけへ抜ける。 */
  extend: boolean
  /** その位置に始まるnode（block・atom・textblock）のDOMが表示されているか。折りたたみで隠れたblockへ着地しない（B3）。 */
  isVisible(pos: number): boolean
}

/** 隠れたblockが連なる間の探索の上限。位置は1回ごとに必ず進むので、通常は文書のblock数を超えない。 */
const MAX_STEPS = 10_000

/** このslice（NAV-GAP1）が扱う選択: GapCursor、またはblockのNodeSelection。 */
export function isBlockLevelSelection(selection: Selection): boolean {
  return selection instanceof GapCursor || (selection instanceof NodeSelection && selection.node.isBlock)
}

/** 着地先の表示を調べるための、そのnodeの開始位置。 */
function visibilityProbe(selection: Selection): number | null {
  if (selection instanceof NodeSelection) return selection.from
  if (selection instanceof GapCursor) {
    const { nodeAfter, nodeBefore } = selection.$from
    return nodeAfter ? selection.from : nodeBefore ? selection.from - nodeBefore.nodeSize : null
  }
  const $from = selection.$from
  return $from.depth > 0 ? $from.before() : null
}

type Cursor = { pos: number; mustMove: boolean }

/** 隠れた着地先を飛ばした先。top-levelのblockごと隠れていれば、そのblockの外へ。 */
function continuation(doc: PMNode, selection: Selection, probe: number, dir: 1 | -1, isVisible: (pos: number) => boolean): Cursor {
  const $probe = doc.resolve(probe)
  const topStart = $probe.depth >= 1 ? $probe.before(1) : probe
  const top = doc.nodeAt(topStart)
  if (top && !isVisible(topStart)) return { pos: dir > 0 ? topStart + top.nodeSize : topStart, mustMove: false }
  // top-levelは見えるが、中のblockだけ隠れている。その着地先の外へ進む。
  if (selection instanceof GapCursor) return { pos: selection.from, mustMove: true }
  if (selection instanceof NodeSelection) return { pos: dir > 0 ? selection.to : selection.from, mustMove: false }
  return { pos: dir > 0 ? selection.$from.after() : selection.$from.before(), mustMove: false }
}

export function resolveSelectionExit({ state, direction, extend, isVisible }: SelectionExitInput): SelectionExit {
  const origin = state.selection
  if (!isBlockLevelSelection(origin)) return { kind: 'none' }
  const dir: 1 | -1 = direction === 'forward' ? 1 : -1
  const doc = state.doc
  // PMのgapcursorのkeymapと同じ: 起点は`dir > 0 ? $to : $from`、GapCursorは必ず動く（mustMove）、NodeSelectionは動かなくてよい。
  let cursor: Cursor = { pos: dir > 0 ? origin.to : origin.from, mustMove: origin instanceof GapCursor }
  for (let step = 0; step < MAX_STEPS; step++) {
    const $start = doc.resolve(cursor.pos)
    let found: Selection | null = null
    if (!extend) {
      const $gap = findGapCursorPosition($start, dir, cursor.mustMove)
      if ($gap) found = new GapCursor($gap)
    }
    found ??= Selection.findFrom($start, dir)
    if (!found) return { kind: 'none' }
    const probe = visibilityProbe(found)
    if (probe === null || isVisible(probe)) return { kind: 'moved', selection: found }
    const next = continuation(doc, found, probe, dir, isVisible)
    const progressed = dir * (next.pos - cursor.pos) > 0 || (next.pos === cursor.pos && next.mustMove && !cursor.mustMove)
    if (!progressed) return { kind: 'none' }
    cursor = next
  }
  return { kind: 'none' }
}
