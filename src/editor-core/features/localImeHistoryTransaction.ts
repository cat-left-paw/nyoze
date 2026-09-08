/** ProseMirror history transaction の Local Window / host 共通判定。 */
export const PROSEMIRROR_HISTORY_META_KEY = 'history$'

export function isProseMirrorHistoryTransaction(
  transaction: { getMeta: (key: string) => unknown } | null | undefined,
): boolean {
  if (!transaction) return false
  return transaction.getMeta(PROSEMIRROR_HISTORY_META_KEY) !== undefined
}
