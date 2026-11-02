import type { InternalDocId } from '../internalDocs/internalDocIds'

export type DirtyTrackedTab = {
  /** tab identity（STICKY-NOTE-LIFECYCLE1 の寄与の判定に使う。省略時は寄与を読まない）。 */
  id?: string
  dirty: boolean
  cleanMarkdownSnapshot: string
  internalDocId?: InternalDocId
}

/**
 * STICKY-NOTE-LIFECYCLE1: 本文の Markdown 以外の「未確定の操作」（付箋の仮の削除、
 * durable でない付箋の追加）が tab を dirty にする寄与。正本は登録側（hook）の ref で、
 * ここは同期に読むだけ。timer / polling は使わない。
 */
export type TabDirtyContributionContext = {
  /** 本文が保存時の内容と同じか（REVIEWFIX2 R4: 同じなら、登録側は保存を待たずに確定してよい）。 */
  readonly bodyMatchesClean: boolean
  readonly cleanMarkdown: string
}
export type TabDirtyContributionProbe = (tabId: string, context: TabDirtyContributionContext) => boolean
let tabDirtyContribution: TabDirtyContributionProbe | null = null

export function setTabDirtyContribution(probe: TabDirtyContributionProbe | null): void {
  tabDirtyContribution = probe
}

export function hasTabDirtyContribution(tabId: string, context: TabDirtyContributionContext): boolean {
  return tabDirtyContribution?.(tabId, context) ?? false
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
  const different = isMarkdownDifferentFromClean(tab.cleanMarkdownSnapshot, currentMarkdown)
  const nextDirty =
    different ||
    (tab.id !== undefined &&
      hasTabDirtyContribution(tab.id, { bodyMatchesClean: !different, cleanMarkdown: tab.cleanMarkdownSnapshot }))
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
