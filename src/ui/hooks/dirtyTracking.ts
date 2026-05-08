import type { InternalDocId } from '../internalDocs/internalDocIds'

export type DirtyTrackedTab = {
  dirty: boolean
  cleanMarkdownSnapshot: string
  internalDocId?: InternalDocId
}

export function isMarkdownDifferentFromClean(
  cleanMarkdownSnapshot: string,
  currentMarkdown: string,
): boolean {
  // Fast path for large Full Plain drafts:
  // most edits change the total length, so avoid a full string equality scan
  // until the lengths line up again.
  if (currentMarkdown.length !== cleanMarkdownSnapshot.length) return true
  return currentMarkdown !== cleanMarkdownSnapshot
}

export function resolveDirtyState(
  tab: DirtyTrackedTab | undefined,
  currentMarkdown: string,
): boolean | null {
  if (!tab) return null
  if (tab.internalDocId) {
    const nextDirty = false
    if (tab.dirty === nextDirty) return null
    return nextDirty
  }
  const nextDirty = isMarkdownDifferentFromClean(
    tab.cleanMarkdownSnapshot,
    currentMarkdown,
  )
  if (tab.dirty === nextDirty) return null
  return nextDirty
}

export function resolveDirtyStateFromDocChangeSignal(
  tab: DirtyTrackedTab | undefined,
): boolean | null {
  if (!tab) return null
  if (tab.internalDocId) return null
  if (tab.dirty) return null
  return true
}
