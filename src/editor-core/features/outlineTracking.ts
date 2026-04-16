import type { Node as PMNode } from '@tiptap/pm/model'
import type { HeadingInfo, HeadingUiSnapshot } from '../types'

/**
 * Given a cursor position and a sorted headings list, returns the index of
 * the heading that "owns" the cursor (i.e. the last heading whose pos <= cursorPos).
 * Returns -1 if the cursor is before the first heading.
 */
export function resolveActiveHeadingIndex(
  headings: HeadingInfo[],
  cursorPos: number,
): number {
  if (headings.length === 0) return -1

  let active = -1
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].pos <= cursorPos) {
      active = i
    } else {
      break
    }
  }
  return active
}

type CollectHeadingUiStateParams = {
  doc: PMNode
  selectionFrom: number
  foldedHeadingPositions?: readonly number[] | null
}

export function collectHeadingUiState({
  doc,
  selectionFrom,
  foldedHeadingPositions,
}: CollectHeadingUiStateParams): HeadingUiSnapshot {
  const headings: HeadingInfo[] = []
  let activeHeadingIndex = -1

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    const level = (node.attrs.level as number) ?? 1
    headings.push({ level, text: node.textContent, pos })
    if (pos <= selectionFrom) {
      activeHeadingIndex = headings.length - 1
    }
    return false
  })

  return {
    headings,
    activeHeadingIndex,
    foldedHeadingPositions: new Set(foldedHeadingPositions ?? []),
  }
}
