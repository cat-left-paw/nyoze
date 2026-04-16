import { useCallback, useEffect, useRef, useState } from 'react'
import type { LogEntry } from '../../editor-core/types'

const MAX_SAMPLES = 240
const HUD_REFRESH_INTERVAL_MS = 120

type SampleStats = {
  count: number
  avg: number | null
  p50: number | null
  p95: number | null
  max: number | null
}

type ImeProfilerSessionMarker = {
  id: number
  startedAt: number
  longTaskCountStart: number
  longTaskDurationStart: number
  updateSamples: number[]
  paintSamples: number[]
}

export type ImeProfilerHudSnapshot = {
  update: SampleStats
  paint: SampleStats
  longTaskCount: number
  longTaskDurationMs: number
  lastUpdateMs: number | null
  lastPaintMs: number | null
}

export type ImeProfilerSessionSummary = {
  sessionId: number
  elapsedMs: number
  update: SampleStats
  paint: SampleStats
  longTaskCount: number
  longTaskDurationMs: number
}

type UseImeProfilerOptions = {
  enabled: boolean
  showHud: boolean
  logSummary: boolean
  onSessionSummary?: (summary: ImeProfilerSessionSummary) => void
}

type UseImeProfilerResult = {
  handleCoreLog: (entry: LogEntry) => void
  handleCoreUpdate: () => void
  hudSnapshot: ImeProfilerHudSnapshot | null
}

function pushSample(target: number[], value: number): void {
  target.push(value)
  if (target.length > MAX_SAMPLES) {
    target.shift()
  }
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index] ?? null
}

export function summarizeImeProfilerSamples(values: number[]): SampleStats {
  if (values.length === 0) {
    return { count: 0, avg: null, p50: null, p95: null, max: null }
  }
  const sum = values.reduce((acc, value) => acc + value, 0)
  return {
    count: values.length,
    avg: sum / values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.reduce((acc, value) => (value > acc ? value : acc), values[0] ?? 0),
  }
}

export function createImeProfilerSessionMarker(
  id: number,
  startedAt: number,
  longTaskCountStart: number,
  longTaskDurationStart: number,
): ImeProfilerSessionMarker {
  return {
    id,
    startedAt,
    longTaskCountStart,
    longTaskDurationStart,
    updateSamples: [],
    paintSamples: [],
  }
}

export function appendImeProfilerSessionSample(
  marker: ImeProfilerSessionMarker | null,
  kind: 'update' | 'paint',
  value: number,
): void {
  if (!marker) return
  if (kind === 'update') {
    marker.updateSamples.push(value)
  } else {
    marker.paintSamples.push(value)
  }
}

export function summarizeImeProfilerSession(
  marker: ImeProfilerSessionMarker,
  elapsedMs: number,
  longTaskCountNow: number,
  longTaskDurationNow: number,
): ImeProfilerSessionSummary {
  return {
    sessionId: marker.id,
    elapsedMs,
    update: summarizeImeProfilerSamples(marker.updateSamples),
    paint: summarizeImeProfilerSamples(marker.paintSamples),
    longTaskCount: longTaskCountNow - marker.longTaskCountStart,
    longTaskDurationMs: longTaskDurationNow - marker.longTaskDurationStart,
  }
}

export function useImeProfiler({
  enabled,
  showHud,
  logSummary,
  onSessionSummary,
}: UseImeProfilerOptions): UseImeProfilerResult {
  const [hudSnapshot, setHudSnapshot] = useState<ImeProfilerHudSnapshot | null>(null)

  const configRef = useRef({ enabled, showHud, logSummary })
  const onSessionSummaryRef = useRef(onSessionSummary)
  const updateLatenciesRef = useRef<number[]>([])
  const paintLatenciesRef = useRef<number[]>([])
  const lastUpdateMsRef = useRef<number | null>(null)
  const lastPaintMsRef = useRef<number | null>(null)
  const pendingStartRef = useRef<number | null>(null)
  const longTaskCountRef = useRef(0)
  const longTaskDurationRef = useRef(0)
  const sessionSeqRef = useRef(0)
  const activeSessionRef = useRef<ImeProfilerSessionMarker | null>(null)
  const publishTimerRef = useRef<number | null>(null)

  configRef.current = { enabled, showHud, logSummary }
  onSessionSummaryRef.current = onSessionSummary

  const publishHud = useCallback(() => {
    publishTimerRef.current = null
    if (!configRef.current.enabled || !configRef.current.showHud) {
      setHudSnapshot(null)
      return
    }
    setHudSnapshot({
      update: summarizeImeProfilerSamples(updateLatenciesRef.current),
      paint: summarizeImeProfilerSamples(paintLatenciesRef.current),
      longTaskCount: longTaskCountRef.current,
      longTaskDurationMs: longTaskDurationRef.current,
      lastUpdateMs: lastUpdateMsRef.current,
      lastPaintMs: lastPaintMsRef.current,
    })
  }, [])

  const scheduleHudPublish = useCallback(() => {
    if (!configRef.current.showHud) return
    if (publishTimerRef.current !== null) return
    publishTimerRef.current = window.setTimeout(() => {
      publishHud()
    }, HUD_REFRESH_INTERVAL_MS)
  }, [publishHud])

  const clearAllMeasurements = useCallback(() => {
    updateLatenciesRef.current = []
    paintLatenciesRef.current = []
    lastUpdateMsRef.current = null
    lastPaintMsRef.current = null
    pendingStartRef.current = null
    longTaskCountRef.current = 0
    longTaskDurationRef.current = 0
    activeSessionRef.current = null
    if (publishTimerRef.current !== null) {
      window.clearTimeout(publishTimerRef.current)
      publishTimerRef.current = null
    }
    setHudSnapshot(null)
  }, [])

  useEffect(() => {
    if (enabled) return
    clearAllMeasurements()
  }, [clearAllMeasurements, enabled])

  useEffect(
    () => () => {
      if (publishTimerRef.current !== null) {
        window.clearTimeout(publishTimerRef.current)
        publishTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    if (!enabled) return
    if (typeof PerformanceObserver === 'undefined') return

    const observer = new PerformanceObserver((list) => {
      if (!configRef.current.enabled) return
      for (const entry of list.getEntries()) {
        if (entry.entryType !== 'longtask') continue
        longTaskCountRef.current += 1
        longTaskDurationRef.current += entry.duration
      }
      scheduleHudPublish()
    })

    try {
      observer.observe({ entryTypes: ['longtask'] } as PerformanceObserverInit)
    } catch {
      return () => {
        observer.disconnect()
      }
    }

    return () => {
      observer.disconnect()
    }
  }, [enabled, scheduleHudPublish])

  const emitSessionSummaryIfNeeded = useCallback(() => {
    const marker = activeSessionRef.current
    if (!marker) return
    const summary = summarizeImeProfilerSession(
      marker,
      performance.now() - marker.startedAt,
      longTaskCountRef.current,
      longTaskDurationRef.current,
    )
    if (configRef.current.logSummary) {
      console.info('[Nyoze][IMEProfiler] composition-session', summary)
    }
    onSessionSummaryRef.current?.(summary)
  }, [])

  const handleCoreLog = useCallback(
    (entry: LogEntry) => {
      if (!configRef.current.enabled) return
      const now = performance.now()
      if (entry.event === 'compositionstart') {
        pendingStartRef.current = now
        sessionSeqRef.current += 1
        activeSessionRef.current = createImeProfilerSessionMarker(
          sessionSeqRef.current,
          now,
          longTaskCountRef.current,
          longTaskDurationRef.current,
        )
        scheduleHudPublish()
        return
      }
      if (entry.event === 'compositionupdate') {
        pendingStartRef.current = now
        return
      }
      if (entry.event === 'compositionend') {
        emitSessionSummaryIfNeeded()
        activeSessionRef.current = null
        scheduleHudPublish()
      }
    },
    [emitSessionSummaryIfNeeded, scheduleHudPublish],
  )

  const handleCoreUpdate = useCallback(() => {
    if (!configRef.current.enabled) return
    const pendingStart = pendingStartRef.current
    if (pendingStart === null) return
    pendingStartRef.current = null
    const updateMs = performance.now() - pendingStart
    lastUpdateMsRef.current = updateMs
    pushSample(updateLatenciesRef.current, updateMs)
    appendImeProfilerSessionSample(activeSessionRef.current, 'update', updateMs)
    requestAnimationFrame(() => {
      if (!configRef.current.enabled) return
      const paintMs = performance.now() - pendingStart
      lastPaintMsRef.current = paintMs
      pushSample(paintLatenciesRef.current, paintMs)
      appendImeProfilerSessionSample(activeSessionRef.current, 'paint', paintMs)
      scheduleHudPublish()
    })
    scheduleHudPublish()
  }, [scheduleHudPublish])

  return {
    handleCoreLog,
    handleCoreUpdate,
    hudSnapshot: enabled && showHud ? hudSnapshot : null,
  }
}
