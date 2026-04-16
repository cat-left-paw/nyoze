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
