/**
 * Opt-in Paragraph Plain micro-profiler for renderer debugging / Playwright benchmarks.
 * Do not rely on semantics in production; prefer `window.__NYOZE_ENABLE_PP_PROFILER__` or
 * `localStorage.setItem('nyoze:pp-profiler', '1')` to enable.
 */

export type ParagraphPlainProfileOp = 'click-switch' | 'enter-reentry' | 'arrow-switch'

export type ParagraphPlainProfileSample = {
  op: ParagraphPlainProfileOp
  phase: string
  ms: number
  meta?: string
  ts: number
}

const STORAGE_KEY = 'nyoze:pp-profiler'

const samples: ParagraphPlainProfileSample[] = []
let activeOp: ParagraphPlainProfileOp | null = null

/** When true: next flushParagraphPlainOverlayUpdate should complete the active session after work. */
let endScheduledForFlush = false

let windowApiInstalled = false

function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** @internal Exported for deterministic unit tests. */
export function paragraphPlainProfilerResetForTests(): void {
  samples.length = 0
  activeOp = null
  endScheduledForFlush = false
  windowApiInstalled = false
}

export function isParagraphPlainProfilerEnabled(): boolean {
  try {
    if (typeof globalThis !== 'undefined') {
      const w = globalThis as unknown as { __NYOZE_ENABLE_PP_PROFILER__?: boolean }
      if (w.__NYOZE_ENABLE_PP_PROFILER__ === true) return true
    }
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') return true
  } catch {
    // localStorage / security errors: treat as disabled
  }
  return false
}

export function paragraphPlainProfilerHasActiveSession(): boolean {
  return activeOp != null
}

function push(op: ParagraphPlainProfileOp, phase: string, ms: number, meta?: string): void {
  samples.push({ op, phase, ms, meta, ts: perfNow() })
}

export function paragraphPlainProfilerBeginSession(
  op: ParagraphPlainProfileOp,
  opts?: { sessionMeta?: string },
): void {
  if (!isParagraphPlainProfilerEnabled()) return
  if (typeof window !== 'undefined') {
    ensureParagraphPlainProfilerWindowApi(window)
  }
  if (activeOp != null) return
  activeOp = op
  push(op, 'session.begin', 0, opts?.sessionMeta)
}

export function paragraphPlainProfilerCancelSession(reason?: string): void {
  if (!isParagraphPlainProfilerEnabled() || activeOp == null) return
  push(activeOp, 'session.cancel', 0, reason)
  activeOp = null
  endScheduledForFlush = false
}

/**
 * Prefer calling from scheduleParagraphPlainOverlayUpdate when routing completes and the next flush should end profiling.
 */
export function paragraphPlainProfilerMarkEndScheduledForFlush(): void {
  if (!isParagraphPlainProfilerEnabled()) return
  if (activeOp == null) return
  endScheduledForFlush = true
}

export function paragraphPlainProfilerPeekEndScheduledForFlush(): boolean {
  return endScheduledForFlush
}

export function paragraphPlainProfilerClearEndScheduledForFlush(): void {
  endScheduledForFlush = false
}

/** Complete profiling session after a flush (paired with paragraphPlainProfilerMarkEndScheduledForFlush). */
export function paragraphPlainProfilerCompleteSessionAfterFlush(): void {
  if (!isParagraphPlainProfilerEnabled() || activeOp == null) return
  push(activeOp, 'session.end', 0)
  activeOp = null
}

export function paragraphPlainProfilerRunPhase<T>(
  phase: string,
  fn: () => T,
  meta?: string,
): T {
  if (!isParagraphPlainProfilerEnabled()) {
    return fn()
  }
  if (typeof window !== 'undefined') {
    ensureParagraphPlainProfilerWindowApi(window)
  }
  if (activeOp == null) {
    return fn()
  }
  const t0 = perfNow()
  try {
    return fn()
  } finally {
    push(activeOp, phase, perfNow() - t0, meta)
  }
}

/** Record a synthetic zero-duration bookmark (already computed duration elsewhere). */
export function paragraphPlainProfilerMark(phase: string, meta?: string): void {
  if (!isParagraphPlainProfilerEnabled() || activeOp == null) return
  push(activeOp, phase, 0, meta)
}

/** Read-only snapshot of collected samples for window API / assertions. */
export function paragraphPlainProfilerGetSamplesSnapshot(): ParagraphPlainProfileSample[] {
  return samples.slice()
}

export function paragraphPlainProfilerClearSamples(): void {
  samples.length = 0
}

function installParagraphPlainProfilerWindowApi(win: Window & typeof globalThis): void {
  const api = {
    isEnabled: isParagraphPlainProfilerEnabled,
    getSamples: () => paragraphPlainProfilerGetSamplesSnapshot(),
    clear: () => {
      paragraphPlainProfilerClearSamples()
    },
    /** Group by consecutive session.begin … session.end (session.cancel ends a group abruptly). */
    getSessions(): ParagraphPlainProfileSample[][] {
      const out: ParagraphPlainProfileSample[][] = []
      let cur: ParagraphPlainProfileSample[] = []
      for (const row of paragraphPlainProfilerGetSamplesSnapshot()) {
        cur.push(row)
        if (row.phase === 'session.end' || row.phase === 'session.cancel') {
          out.push(cur)
          cur = []
        }
      }
      if (cur.length > 0) out.push(cur)
      return out
    },
    cancelActiveSession: (reason?: string) => paragraphPlainProfilerCancelSession(reason),
  }

  win.__NYOZE_PP_PROFILE__ = samples
  win.__nyozeParagraphPlainProfiler = api
}

/**
 * Ensures Window debug globals exist when profiler is enabled.
 * Keeps writable array alias so callers can mutate by pushing internally.
 */
export function ensureParagraphPlainProfilerWindowApi(win?: Window | null): void {
  const winObj =
    typeof win !== 'undefined' && win != null ? win : typeof window !== 'undefined' ? window : null
  if (winObj == null || !isParagraphPlainProfilerEnabled()) return

  if (!windowApiInstalled) {
    installParagraphPlainProfilerWindowApi(winObj as Window & typeof globalThis)
    windowApiInstalled = true
  }
  const wpp = winObj as unknown as { __NYOZE_PP_PROFILE__: ParagraphPlainProfileSample[] }
  wpp.__NYOZE_PP_PROFILE__ = samples
}
