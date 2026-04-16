import type { ImeProfilerSessionSummary } from './useImeProfiler'

const IME_PROFILER_JSON_LOG_STORAGE_KEY = 'nyoze.debug.imeProfilerJsonLog.v1'
const MAX_LOG_ENTRIES = 360

export type ImeProfilerJsonLogEntry = {
  at: string
  documentId: string
  buildType: 'dev' | 'prod'
  hudEnabled: boolean
  phaseAEnabled: boolean
  phaseAMinSyncIntervalMs: number
  rubyVisible: boolean
  rubySuspendDuringComposition: boolean
  inputChars: number | null
  paintP95Ms: number | null
  updateP95Ms: number | null
  longTaskCount: number
  longTaskDurationMs: number
  setRawValuesPaintP95Ms: number[]
  summary: ImeProfilerSessionSummary
}

type ImeProfilerJsonLogEntryMeta = {
  documentId: string
  buildType: 'dev' | 'prod'
  hudEnabled: boolean
  phaseAEnabled: boolean
  phaseAMinSyncIntervalMs: number
  rubyVisible: boolean
  rubySuspendDuringComposition: boolean
  inputChars: number | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function appendImeProfilerJsonLogEntry(
  entries: ImeProfilerJsonLogEntry[],
  summary: ImeProfilerSessionSummary,
  meta: ImeProfilerJsonLogEntryMeta,
  at = new Date().toISOString(),
): ImeProfilerJsonLogEntry[] {
  const rawValues = [
    ...entries
      .filter((entry) =>
        entry.documentId === meta.documentId &&
        entry.buildType === meta.buildType &&
        entry.hudEnabled === meta.hudEnabled &&
        entry.phaseAEnabled === meta.phaseAEnabled &&
        entry.phaseAMinSyncIntervalMs === meta.phaseAMinSyncIntervalMs &&
        entry.rubyVisible === meta.rubyVisible &&
        entry.rubySuspendDuringComposition === meta.rubySuspendDuringComposition &&
        entry.inputChars === meta.inputChars &&
        isFiniteNumber(entry.paintP95Ms),
      )
      .map((entry) => entry.paintP95Ms as number)
      .slice(-2),
  ]
  if (isFiniteNumber(summary.paint.p95)) {
    rawValues.push(summary.paint.p95)
  }

  const nextEntry: ImeProfilerJsonLogEntry = {
    at,
    documentId: meta.documentId,
    buildType: meta.buildType,
    hudEnabled: meta.hudEnabled,
    phaseAEnabled: meta.phaseAEnabled,
    phaseAMinSyncIntervalMs: meta.phaseAMinSyncIntervalMs,
    rubyVisible: meta.rubyVisible,
    rubySuspendDuringComposition: meta.rubySuspendDuringComposition,
    inputChars: meta.inputChars,
    paintP95Ms: summary.paint.p95,
    updateP95Ms: summary.update.p95,
    longTaskCount: summary.longTaskCount,
    longTaskDurationMs: summary.longTaskDurationMs,
    setRawValuesPaintP95Ms: rawValues.slice(-3),
    summary,
  }

  const next = [...entries, nextEntry]
  return next.length > MAX_LOG_ENTRIES ? next.slice(next.length - MAX_LOG_ENTRIES) : next
}

export function readImeProfilerJsonLogs(): ImeProfilerJsonLogEntry[] {
  try {
    const raw = window.localStorage.getItem(IME_PROFILER_JSON_LOG_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as ImeProfilerJsonLogEntry[] : []
  } catch {
    return []
  }
}

export function writeImeProfilerJsonLogs(entries: ImeProfilerJsonLogEntry[]): void {
  try {
    window.localStorage.setItem(IME_PROFILER_JSON_LOG_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // ignore
  }
}
