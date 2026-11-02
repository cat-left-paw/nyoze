import { resolveDirtyState, type DirtyTrackedTab } from '../hooks/dirtyTracking'

export type DocumentIdentity = { tabId: string; documentInstanceId: string }
export type SourceModeSession = { ownerTabId: string }
export type IdentityTab = { id: string; documentInstanceId: string }
export type SaveIdentityRefusal = 'target-missing' | 'target-document-replaced' | 'editor-document-mismatch' | 'source-owner-mismatch'
export type SaveIdentityFailureDetail = { identityRefusal: SaveIdentityRefusal; errorKind: 'write-failed'; errorMessage: string }
export type SaveContentDecision = { kind: 'draft' | 'core' } | { kind: 'refused'; reason: SaveIdentityRefusal }

export const createDocumentInstanceId = (): string => globalThis.crypto.randomUUID()

export function matchesDocumentIdentity(identity: DocumentIdentity | null, tab: IdentityTab | undefined): boolean {
  return !!identity && !!tab && identity.tabId === tab.id && identity.documentInstanceId === tab.documentInstanceId
}

/** Render-time Source Mode flags and tab snapshots are deliberately not inputs. */
export function resolveSaveContentDecision(input: {
  sourceSession: SourceModeSession | null; hasSourceEditor: boolean;
  editorDocument: DocumentIdentity | null; target: IdentityTab | undefined;
}): SaveContentDecision {
  if (!input.target) return { kind: 'refused', reason: 'target-missing' }
  if (input.sourceSession && input.sourceSession.ownerTabId !== input.target.id) {
    return { kind: 'refused', reason: 'source-owner-mismatch' }
  }
  if (!matchesDocumentIdentity(input.editorDocument, input.target)) {
    return { kind: 'refused', reason: 'editor-document-mismatch' }
  }
  return { kind: input.sourceSession && input.hasSourceEditor ? 'draft' : 'core' }
}

/** Also used after each async stat request; a tab ID alone is insufficient. */
export const canFinalizeDocumentSave = matchesDocumentIdentity

/** The payload is already captured. Editor focus and Source Mode no longer decide the write. */
export function saveTargetRefusal(target: DocumentIdentity, row: IdentityTab | undefined): SaveIdentityRefusal | null {
  if (!row) return 'target-missing'
  return canFinalizeDocumentSave(target, row) ? null : 'target-document-replaced'
}

export function savedDocumentPatch<T extends IdentityTab & DirtyTrackedTab & { markdownSnapshot: string }>(
  tab: T, written: string, current: string, draft: string | null,
): Pick<T, 'cleanMarkdownSnapshot' | 'markdownSnapshot' | 'dirty'> {
  const baseline = { ...tab, cleanMarkdownSnapshot: written }
  // Use the shared note contribution and dirty policy for both editing surfaces.
  const coreDirty = resolveDirtyState(baseline, current) ?? baseline.dirty
  const draftDirty = draft === null ? false : (resolveDirtyState(baseline, draft) ?? baseline.dirty)
  return { cleanMarkdownSnapshot: written, markdownSnapshot: current, dirty: coreDirty || draftDirty }
}

/** One synchronous record of the document actually installed in the editor. */
export function createDocumentIdentityState() {
  let editor: DocumentIdentity | null = null
  let source: SourceModeSession | null = null
  return {
    readEditor: () => editor,
    readSource: () => source,
    install(tab: IdentityTab) { editor = { tabId: tab.id, documentInstanceId: tab.documentInstanceId } },
    invalidate() { editor = null },
    // Core.loadMarkdown(false) refuses before replacing the Doc. A thrown load
    // stays invalid. Capsule restore(false) may already have swapped the Doc and
    // must never use loadRefused().
    beginLoad() { const previous = editor; editor = null; return previous },
    loadRefused(previous: DocumentIdentity | null) { editor = previous },
    finishSameDocumentReload(previous: DocumentIdentity | null) { editor = previous },
    openSource(ownerTabId: string) { source = { ownerTabId } },
    closeSource() { source = null },
  }
}

export type DocumentIdentityState = ReturnType<typeof createDocumentIdentityState>
