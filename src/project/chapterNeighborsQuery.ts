import type { BookOutlineItem } from './bookOutlineTypes'

export type { BookOutlineItem }

export type ChapterNeighborsComputation =
  | { kind: 'no-current-book' }
  | {
      kind: 'ready'
      current: BookOutlineItem | null
      previous: BookOutlineItem | null
      next: BookOutlineItem | null
    }

/** missing 章は navigation target として扱わない（構造上は IPC に残す）。 */
export function navigableChapterNeighbor(item: BookOutlineItem | null): BookOutlineItem | null {
  if (item === null || item.missing) return null
  return item
}
