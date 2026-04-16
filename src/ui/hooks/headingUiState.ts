import type { HeadingInfo } from '../../editor-core/types'

export function areHeadingListsEqual(
  a: readonly HeadingInfo[],
  b: readonly HeadingInfo[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].level !== b[i].level ||
      a[i].text !== b[i].text ||
      a[i].pos !== b[i].pos
    ) {
      return false
    }
  }
  return true
}

export function arePositionSetsEqual(
  a: ReadonlySet<number>,
  b: ReadonlySet<number>,
): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}
