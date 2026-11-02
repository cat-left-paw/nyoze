import { GapCursor } from '@tiptap/pm/gapcursor'
import type { ResolvedPos } from '@tiptap/pm/model'

/**
 * `prosemirror-gapcursor`の静的メソッド。ランタイムには存在し、gapcursorのkeymap・click・`createSelectionBetween`が使うが、
 * 1.4.0の型宣言（`dist/index.d.ts`）には載っていない。型だけをここで補い、使う場所を1つにする。
 * 無い版では、GapCursorを「作らない・有効と判定しない」側へ倒す（fail-closed）。`tests/pis-s10-nav-gap1.test.ts`が存在と意味を固定する。
 */
type GapCursorStatics = {
  valid?(pos: ResolvedPos): boolean
  findGapCursorFrom?(pos: ResolvedPos, dir: number, mustMove?: boolean): ResolvedPos | null
}
const statics = GapCursor as unknown as GapCursorStatics

/** その位置がGapCursorを置ける位置か（親がtextblockでなく、前後のnodeがどちらも閉じている）。 */
export function isGapCursorPosition($pos: ResolvedPos): boolean {
  return statics.valid?.($pos) ?? false
}

/** `$pos`から`dir`の向きにある、最初のGapCursorの位置。`mustMove`なら、`$pos`そのものは候補にしない。 */
export function findGapCursorPosition($pos: ResolvedPos, dir: 1 | -1, mustMove: boolean): ResolvedPos | null {
  return statics.findGapCursorFrom?.($pos, dir, mustMove) ?? null
}
