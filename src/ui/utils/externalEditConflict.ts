export type SavedFileStatValue = { mtimeMs: number; size: number }

/** Baseline file stat captured at load or after save. null for untitled tabs. */
export type SavedFileStat = SavedFileStatValue | null

export type ConflictKind = 'modified' | 'deleted'

export type ConflictAwareWriteFileOptions = {
  expectedStat?: SavedFileStatValue | null
  allowConflictOverwrite?: boolean
}

/**
 * R3.5-2: SaveErrorKind mirrors electron/atomicSave.ts SaveErrorKind so the
 * renderer does not import main-process types.
 */
export type SaveErrorKind =
  | 'validation'
  | 'parent-missing'
  | 'permission'
  | 'disk-full'
  | 'write-failed'
  | 'canceled'

export type ConflictAwareWriteFileResult = {
  saved: boolean
  backupWarning?: string
  conflictKind?: ConflictKind
  errorKind?: SaveErrorKind
  errorMessage?: string
}

/**
 * Compare a baseline file stat (from load/save) against the current stat
 * (fetched just before saving). Returns the conflict kind, or null if no conflict.
 */
export function detectExternalEditConflict(
  baseline: SavedFileStat,
  current: SavedFileStat,
): ConflictKind | null {
  // Untitled tab or never-saved file — nothing to compare.
  if (!baseline) return null
  // File was deleted/moved externally.
  if (!current) return 'deleted'
  // Check mtime and size for external modification.
  if (baseline.mtimeMs !== current.mtimeMs || baseline.size !== current.size)
    return 'modified'
  return null
}

export function buildConflictAwareWriteFileOptions(
  baseline: SavedFileStat,
  allowConflictOverwrite = false,
): ConflictAwareWriteFileOptions | undefined {
  if (!baseline && !allowConflictOverwrite) return undefined

  const options: ConflictAwareWriteFileOptions = {}
  if (baseline) options.expectedStat = baseline
  if (allowConflictOverwrite) options.allowConflictOverwrite = true
  return options
}

/**
 * captured target tab の EOL で一意に構成した期待 disk 本文と、実 disk 本文が
 * byte-equivalent なときだけ true。CRLF↔LF の正規化はしない。
 */
export function isExpectedDiskContent(
  diskMarkdown: string,
  expectedDiskMarkdown: string,
): boolean {
  return diskMarkdown === expectedDiskMarkdown
}

/**
 * save first-wins continuation が、自プロセスの直前saveで更新されたmtimeを
 * 古い React savedStat と見比べて false-conflict しないための採用規則。
 * disk が captured tab EOL で構成した期待 disk 本文と byte-equivalent なときだけ
 * live stat を baseline にする。改行コード変更を含む実外部変更は conflict のまま残す。
 */
export function resolveStaleSaveBaselineAfterConflict(input: {
  readonly conflict: ConflictKind | null
  readonly currentStat: SavedFileStat
  readonly diskMarkdown: string | null
  readonly expectedDiskMarkdown: string | null
}):
  | { readonly kind: 'none' }
  | { readonly kind: 'conflict'; readonly conflict: ConflictKind }
  | { readonly kind: 'stale-baseline'; readonly baseline: SavedFileStatValue } {
  if (input.conflict === null) return { kind: 'none' }
  if (input.conflict === 'deleted') {
    return { kind: 'conflict', conflict: 'deleted' }
  }
  if (
    input.currentStat &&
    input.diskMarkdown !== null &&
    input.expectedDiskMarkdown !== null &&
    isExpectedDiskContent(input.diskMarkdown, input.expectedDiskMarkdown)
  ) {
    return { kind: 'stale-baseline', baseline: input.currentStat }
  }
  return { kind: 'conflict', conflict: input.conflict }
}
