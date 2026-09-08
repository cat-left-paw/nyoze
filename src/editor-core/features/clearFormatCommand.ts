/**
 * Clear Format の PM primitive（通常 PM controller と局所 IME adapter が共有）。
 *
 * composing gate / noteAnchor gate は呼び出し側の責務。
 * collapsed かつ TCY 無しは null（0 transaction no-op）。
 * checklist uncheck は呼び出し側が dispatch 後の最新 state で追従する
 * （既存 basicCommandsController.clearFormat と同じ順序）。
 */

import type { EditorState, Transaction } from '@tiptap/pm/state'
import { resolveSelectedTcyRanges } from './tcyFormatting'

type Dispatch = (tr: Transaction) => void

export type ClearFormatMarksResult = {
  mappedFrom: number
  mappedTo: number
  clearedTcyCount: number
}

/**
 * TCY unwrap + removeMark を1 transaction で適用する。
 * @returns null = 実質 no-op / result = dispatch 済みで checklist 追従用の mapped 範囲
 */
export function applyClearFormatMarksAndTcy(
  state: EditorState,
  dispatch: Dispatch,
): ClearFormatMarksResult | null {
  const initialSelection = state.selection
  const clearedTcyRanges = resolveSelectedTcyRanges(state)
  if (initialSelection.empty && clearedTcyRanges.length === 0) {
    return null
  }

  let tr = state.tr
  for (let index = clearedTcyRanges.length - 1; index >= 0; index--) {
    const range = clearedTcyRanges[index]
    if (!range) continue
    tr = tr.replaceWith(range.from, range.to, state.schema.text(range.text))
  }

  const mappedFrom = tr.mapping.map(initialSelection.from, -1)
  const mappedTo = tr.mapping.map(initialSelection.to, 1)
  tr = tr.removeMark(mappedFrom, mappedTo)
  dispatch(tr)
  return {
    mappedFrom,
    mappedTo,
    clearedTcyCount: clearedTcyRanges.length,
  }
}
