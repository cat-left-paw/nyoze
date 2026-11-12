/**
 * EDITOR-TAB-REORDER1: タブ列の並べ替えの純粋な規則。
 *
 * - タブの配列を並べ替えてよいのは、この module の `reorderTabs` / `applyTabReorderRequest` だけ。
 *   呼び出しは `useAppUiState` の `reorderTab` 1 か所で、必ず `useOpenDocumentTabs` の共通の
 *   setter（`setTabs`）の updater の中から行う（WORKSPACE-SWITCH-OPEN-DOCS1）。
 * - 並べ替えは tab の object を作り直さない（同じ object を別の位置へ置くだけ）。active な tab、
 *   dirty、本文の snapshot、tab 単位の履歴 capsule（tab id が鍵）は変わらない。
 * - DOM・時刻・timer に依らない。drag の判定は `tabDragGesture.ts`、DOM との接続は
 *   `tabDragController.ts` にある。
 */

type TabWithId = { readonly id: string }

/**
 * drag の pointerup が確定する並べ替えの要求。
 * `gap` は drag の開始時点の並びでの挿入位置（0 = 先頭の前、n = 末尾の後）。
 * `orderAtStart` は drag の開始時点に画面に出ていた tab id の並びで、実際の配列と食い違えば
 * 何もしない（drag の間に tab が増減・移動した場合の安全側。File Explorer の削除の計画と同じ考え方）。
 */
export type TabReorderRequest = {
  readonly tabId: string
  readonly gap: number
  readonly orderAtStart: readonly string[]
}

export type TabDropTarget = {
  /** 挿入位置（drag の開始時点の並びでの隙間。0..n）。 */
  readonly gap: number
  /** 並べ替えの後に、動かした tab が置かれる位置。 */
  readonly toIndex: number
}

/**
 * pointer の x から挿入位置を決める。各 tab の矩形の中央より左にある tab の数がそのまま隙間の番号。
 * `centers` は画面上の左から右への順（DOM の順）で並ぶ前提。
 */
export function computeInsertionGap(centers: readonly number[], x: number): number {
  let gap = 0
  for (const center of centers) {
    if (center < x) gap += 1
    else break
  }
  return gap
}

/**
 * 挿入位置 `gap` に落としたとき、動かす tab が実際に動くなら移動先を返す。
 * 動かない（自分自身の前後の隙間）・範囲外の隙間・不正な tab は null。
 */
export function resolveDropTarget(
  fromIndex: number,
  gap: number,
  tabCount: number,
): TabDropTarget | null {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(gap) || !Number.isInteger(tabCount)) return null
  if (fromIndex < 0 || fromIndex >= tabCount) return null
  if (gap < 0 || gap > tabCount) return null
  if (gap === fromIndex || gap === fromIndex + 1) return null
  return { gap, toIndex: gap > fromIndex ? gap - 1 : gap }
}

/**
 * `tabId` の tab を、並べ替えの後の位置 `toIndex`（0..n-1）へ動かす。
 * id が見つからない・位置が範囲外・位置が変わらない場合は **同じ配列（同じ object）** を返す。
 * それ以外は新しい配列で、tab の object はすべて元のまま（順序だけが変わる）。
 */
export function reorderTabs<T extends TabWithId>(
  tabs: readonly T[],
  tabId: string,
  toIndex: number,
): T[] {
  const original = tabs as T[]
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= tabs.length) return original
  const fromIndex = tabs.findIndex((tab) => tab.id === tabId)
  if (fromIndex < 0 || fromIndex === toIndex) return original
  const next = tabs.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved!)
  return next
}

function sameIdOrder(tabs: readonly TabWithId[], ids: readonly string[]): boolean {
  return tabs.length === ids.length && tabs.every((tab, index) => tab.id === ids[index])
}

/**
 * drag の pointerup が出す要求を、現在の配列へ適用する。共通の setter の updater の中で呼ぶ。
 * 開始時点の並びと現在の並びが違う・要求が不正・動かない場合は同じ配列を返す。
 */
export function applyTabReorderRequest<T extends TabWithId>(
  tabs: readonly T[],
  request: TabReorderRequest,
): T[] {
  const original = tabs as T[]
  if (!sameIdOrder(tabs, request.orderAtStart)) return original
  const fromIndex = tabs.findIndex((tab) => tab.id === request.tabId)
  const target = resolveDropTarget(fromIndex, request.gap, tabs.length)
  if (target === null) return original
  return reorderTabs(tabs, request.tabId, target.toIndex)
}

/**
 * 挿入位置の線をどの tab のどちら側へ描くか。隙間 g は「tab g の左端」、末尾の隙間 n は「最後の tab の右端」。
 * 隣り合う tab の間は 1 本だけ（左側の tab の右端ではなく、右側の tab の左端で描く）。
 */
export function resolveDropEdge(
  index: number,
  tabCount: number,
  target: TabDropTarget | null,
): 'before' | 'after' | null {
  if (target === null) return null
  if (target.gap === index && index < tabCount) return 'before'
  if (target.gap === tabCount && index === tabCount - 1) return 'after'
  return null
}
