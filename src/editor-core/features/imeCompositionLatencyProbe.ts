/**
 * IME composition latency probe — session controller。
 *
 * `EventTarget` を1つ受け取り、`compositionstart` / `compositionupdate` /
 * `compositionend` を **read-only** で観測して数値だけを集める。
 *
 * baseline（`.ProseMirror`）と将来の PoC（局所 contenteditable slot）へ
 * **同じ実装**を attach するため、ProseMirror / React / Electron へ依存しない。
 *
 * 不変条件:
 * - `preventDefault` / `stopPropagation` を呼ばない。
 * - PM transaction、DOM selection、React state を一切触らない。
 * - `start()` を呼ぶまで listener / PerformanceObserver / rAF / timer を作らない。
 * - `destroy()` 後に stale callback が次 session の統計へ混入しない。
 * - 例外を入力処理へ波及させない（listener 本体を try/catch で隔離）。
 *
 * 計測点（1 `compositionupdate` あたり）:
 * 1. `event.timeStamp`（`normalizeEventTimestamp` で `performance.now()` 軸へ正規化）
 * 2. probe handler entry の `performance.now()`
 * 3. 次の `requestAnimationFrame` callback 時刻
 * 4. その rAF 内から予約した `setTimeout(0)` の実行時刻（**post-paint 近似**）
 *
 * 同じ4点を `compositionend` にも適用し、確定復帰 sample は変換中の
 * `compositionupdate` sample と別系列で保持する。
 */

import {
  buildImeCompositionLatencyReport,
  computeLatencyMs,
  createTimestampModeCounts,
  normalizeEventTimestamp,
  type ImeCompositionLatencyReport,
  type ImeCompositionCommitLatencySample,
  type ImeCompositionLatencySample,
  type ImeCompositionLatencySessionCounters,
  type ImeCompositionLongTaskSummary,
} from './imeCompositionLatencyStats'

/** 実 DOM の `HTMLElement` / `EventTarget` が構造的に満たす最小 interface。 */
export type ImeCompositionProbeTarget = Pick<
  EventTarget,
  'addEventListener' | 'removeEventListener'
>

/** listener が読む最小 event 形状（unit test では fake target が同形を渡す）。 */
type ImeProbeEventLike = {
  readonly type?: string
  readonly timeStamp?: number
}

export type ImeProbeLongTaskObserver = {
  /**
   * まだ callback へ配送されていない Long Task を回収して queue を空にする
   * (`PerformanceObserver.takeRecords()` 相当)。
   *
   * `stop()` 直前に発生した Long Task が欠落するのを防ぎ、`reset()` では
   * 旧 session の queue を「回収して捨てる」ことで新 session への混入を防ぐ。
   */
  drain: () => readonly number[]
  disconnect: () => void
}

export type ImeCompositionProbeDiagnostic = {
  kind:
    | 'start'
    | 'stop'
    | 'reset'
    | 'destroy'
    | 'composition-start'
    | 'composition-update'
    | 'composition-end'
    | 'sample-settled'
    | 'sample-dropped'
    | 'latency-rejected'
    | 'listener-error'
  /** session 内の sample 通し番号（該当する場合のみ）。 */
  index?: number
  /** 固定 enum 相当の短い理由文字列。本文・パスは載せない。 */
  reason?: string
}

export type ImeCompositionLatencyProbeOptions = {
  target: ImeCompositionProbeTarget
  /** 比較 arm の label。既定 `'baseline'`。 */
  mode?: string
  /** attach 先の種別。生の selector は report へ載せない。 */
  targetKind?: string
  /** 保持する sample 数の上限。超過分は計測せず `droppedSampleCount` で数える。 */
  maxSamples?: number
  /** `report()` が pending sample の完了を待つ既定 timeout。 */
  pendingTimeoutMs?: number
  now?: () => number
  timeOriginMs?: number | null
  requestFrame?: (callback: () => void) => number
  cancelFrame?: (handle: number) => void
  scheduleTimeout?: (callback: () => void, delayMs: number) => number
  clearScheduledTimeout?: (handle: number) => void
  createLongTaskObserver?: (
    onDurations: (durations: readonly number[]) => void,
  ) => ImeProbeLongTaskObserver | null
  /** 外部診断 hook。例外は隔離され、入力処理へ波及しない。 */
  onDiagnostic?: (event: ImeCompositionProbeDiagnostic) => void
}

export type ImeCompositionLatencyReportOptions = {
  pendingTimeoutMs?: number
}

export type ImeCompositionLatencyProbeHandle = {
  start: () => boolean
  stop: (reason?: string) => void
  reset: (reason?: string) => void
  destroy: (reason?: string) => void
  isActive: () => boolean
  isDestroyed: () => boolean
  /** 同期 snapshot。pending が残っていれば `complete: false`。 */
  snapshot: () => ImeCompositionLatencyReport
  /** pending sample の完了（または timeout）を待ってから snapshot を返す。 */
  report: (
    options?: ImeCompositionLatencyReportOptions,
  ) => Promise<ImeCompositionLatencyReport>
  pendingCounts: () => { raf: number; timer: number }
}

export const DEFAULT_IME_PROBE_MAX_SAMPLES = 2_000
export const DEFAULT_IME_PROBE_PENDING_TIMEOUT_MS = 2_000

const COMPOSITION_EVENT_TYPES = [
  'compositionstart',
  'compositionupdate',
  'compositionend',
] as const

const ADD_LISTENER_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: true,
}
const REMOVE_LISTENER_OPTIONS: EventListenerOptions = { capture: true }

type PendingSample = {
  kind: 'update' | 'commit'
  generation: number
  sample: ImeCompositionLatencySample | ImeCompositionCommitLatencySample
  eventTimeMs: number
  handlerNowMs: number
  rafNowMs: number | null
  frameHandle: number | null
  timerHandle: number | null
  settled: boolean
}

function resolveDefaultNow(): () => number {
  const performanceRef = globalThis.performance
  if (performanceRef && typeof performanceRef.now === 'function') {
    return () => performanceRef.now()
  }
  return () => Date.now()
}

function resolveDefaultTimeOriginMs(): number | null {
  const performanceRef = globalThis.performance
  const origin = performanceRef?.timeOrigin
  return typeof origin === 'number' && Number.isFinite(origin) ? origin : null
}

function resolveDefaultLongTaskObserverFactory(): (
  onDurations: (durations: readonly number[]) => void,
) => ImeProbeLongTaskObserver | null {
  return (onDurations) => {
    const ObserverCtor = globalThis.PerformanceObserver
    if (typeof ObserverCtor !== 'function') return null
    try {
      const supported: readonly string[] | undefined = ObserverCtor.supportedEntryTypes
      if (supported && !supported.includes('longtask')) return null
      const observer = new ObserverCtor((list) => {
        const durations = list.getEntries().map((entry) => entry.duration)
        onDurations(durations)
      })
      observer.observe({ entryTypes: ['longtask'] })
      return {
        drain: () => {
          try {
            return observer.takeRecords().map((entry) => entry.duration)
          } catch {
            return []
          }
        },
        disconnect: () => observer.disconnect(),
      }
    } catch {
      // Long Task 未対応環境では観測なしで継続する。
      return null
    }
  }
}

/**
 * 単一 session を扱う probe を生成する。生成時点では listener も observer も
 * 作らない（`start()` で初めて attach する）。
 */
export function createImeCompositionLatencyProbe(
  options: ImeCompositionLatencyProbeOptions,
): ImeCompositionLatencyProbeHandle {
  const target = options.target
  const mode = options.mode ?? 'baseline'
  const targetKind = options.targetKind ?? 'custom'
  const maxSamples =
    Number.isFinite(options.maxSamples) && (options.maxSamples ?? 0) > 0
      ? Math.floor(options.maxSamples as number)
      : DEFAULT_IME_PROBE_MAX_SAMPLES
  const defaultPendingTimeoutMs =
    Number.isFinite(options.pendingTimeoutMs) && (options.pendingTimeoutMs ?? 0) >= 0
      ? (options.pendingTimeoutMs as number)
      : DEFAULT_IME_PROBE_PENDING_TIMEOUT_MS

  const now = options.now ?? resolveDefaultNow()
  const timeOriginMs =
    options.timeOriginMs !== undefined
      ? options.timeOriginMs
      : resolveDefaultTimeOriginMs()

  const requestFrame =
    options.requestFrame ??
    ((callback: () => void) => globalThis.requestAnimationFrame(() => callback()))
  const cancelFrame =
    options.cancelFrame ?? ((handle: number) => globalThis.cancelAnimationFrame(handle))
  const scheduleTimeout =
    options.scheduleTimeout ??
    ((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs) as unknown as number)
  const clearScheduledTimeout =
    options.clearScheduledTimeout ??
    ((handle: number) => globalThis.clearTimeout(handle))
  const createLongTaskObserver =
    options.createLongTaskObserver ?? resolveDefaultLongTaskObserverFactory()

  let generation = 0
  let attached = false
  let destroyed = false
  let startedAtMs: number | null = null
  let endedAtMs: number | null = null
  let previousUpdateHandlerNowMs: number | null = null

  let samples: ImeCompositionLatencySample[] = []
  let commitSamples: ImeCompositionCommitLatencySample[] = []
  let pendings: PendingSample[] = []
  let longTaskObserver: ImeProbeLongTaskObserver | null = null
  let longTask: ImeCompositionLongTaskSummary = {
    supported: false,
    count: 0,
    totalMs: 0,
    maxMs: null,
  }
  let counters = createCounters()
  const pendingSettleWaiters = new Set<() => void>()

  function createCounters(): ImeCompositionLatencySessionCounters {
    return {
      compositionStartCount: 0,
      compositionUpdateCount: 0,
      compositionEndCount: 0,
      sampleCount: 0,
      completeSampleCount: 0,
      droppedSampleCount: 0,
      commitSampleCount: 0,
      completeCommitSampleCount: 0,
      droppedCommitSampleCount: 0,
      rejectedLatencyCount: 0,
      pendingRafCount: 0,
      pendingTimerCount: 0,
      timestampModeCounts: createTimestampModeCounts(),
      commitTimestampModeCounts: createTimestampModeCounts(),
      lastResetReason: null,
      lastStopReason: null,
      longTaskObserverSupported: false,
    }
  }

  function emitDiagnostic(event: ImeCompositionProbeDiagnostic): void {
    const hook = options.onDiagnostic
    if (!hook) return
    try {
      hook(event)
    } catch {
      // 外部診断 hook の例外は計測・入力処理へ波及させない。
    }
  }

  function measure(fromMs: number, toMs: number | null, index: number): number | null {
    if (toMs === null) return null
    const value = computeLatencyMs(fromMs, toMs)
    if (value === null) {
      counters.rejectedLatencyCount += 1
      emitDiagnostic({ kind: 'latency-rejected', index })
    }
    return value
  }

  function notifyPendingSettledIfIdle(): void {
    if (counters.pendingRafCount > 0 || counters.pendingTimerCount > 0) return
    if (pendingSettleWaiters.size === 0) return
    for (const waiter of [...pendingSettleWaiters]) {
      try {
        waiter()
      } catch {
        // waiter は内部実装のみ。例外は無視して他の waiter を止めない。
      }
    }
  }

  function settlePending(pending: PendingSample): void {
    if (pending.settled) return
    pending.settled = true
    const { sample } = pending
    const index = sample.index
    sample.eventToHandlerMs = measure(pending.eventTimeMs, pending.handlerNowMs, index)
    sample.eventToRafMs = measure(pending.eventTimeMs, pending.rafNowMs, index)
    sample.handlerToRafMs = measure(pending.handlerNowMs, pending.rafNowMs, index)
    pendings = pendings.filter((entry) => entry !== pending)
    if (sample.eventToPostPaintProxyMs !== null && sample.eventToRafMs !== null) {
      sample.complete = true
      if (pending.kind === 'update') counters.completeSampleCount += 1
      else counters.completeCommitSampleCount += 1
    }
    emitDiagnostic({ kind: 'sample-settled', index })
    notifyPendingSettledIfIdle()
  }

  function cancelAllPending(): void {
    for (const pending of pendings) {
      if (pending.frameHandle !== null) {
        try {
          cancelFrame(pending.frameHandle)
        } catch {
          // best effort
        }
        pending.frameHandle = null
      }
      if (pending.timerHandle !== null) {
        try {
          clearScheduledTimeout(pending.timerHandle)
        } catch {
          // best effort
        }
        pending.timerHandle = null
      }
      pending.settled = true
    }
    pendings = []
    counters.pendingRafCount = 0
    counters.pendingTimerCount = 0
    notifyPendingSettledIfIdle()
  }

  function beginSample(
    kind: 'update' | 'commit',
    eventTimeStamp: number,
    handlerNowMs: number,
  ): void {
    const currentCount =
      kind === 'update' ? counters.sampleCount : counters.commitSampleCount
    if (currentCount >= maxSamples) {
      if (kind === 'update') counters.droppedSampleCount += 1
      else counters.droppedCommitSampleCount += 1
      emitDiagnostic({ kind: 'sample-dropped', reason: 'max-samples' })
      return
    }
    const normalized = normalizeEventTimestamp({
      eventTimeStamp,
      handlerNowMs,
      timeOriginMs,
    })
    if (kind === 'update') counters.timestampModeCounts[normalized.mode] += 1
    else counters.commitTimestampModeCounts[normalized.mode] += 1

    const index = currentCount
    if (kind === 'update') counters.sampleCount += 1
    else counters.commitSampleCount += 1

    const sincePreviousUpdateMs =
      kind !== 'update' || previousUpdateHandlerNowMs === null
        ? null
        : measure(previousUpdateHandlerNowMs, handlerNowMs, index)
    if (kind === 'update') previousUpdateHandlerNowMs = handlerNowMs

    const common = {
      index,
      timestampMode: normalized.mode,
      eventToHandlerMs: null,
      eventToRafMs: null,
      eventToPostPaintProxyMs: null,
      handlerToRafMs: null,
      rafToPostPaintProxyMs: null,
      complete: false,
    }
    const sample: ImeCompositionLatencySample | ImeCompositionCommitLatencySample =
      kind === 'update' ? { ...common, sincePreviousUpdateMs } : common
    if (kind === 'update') samples.push(sample as ImeCompositionLatencySample)
    else commitSamples.push(sample as ImeCompositionCommitLatencySample)

    const pending: PendingSample = {
      kind,
      generation,
      sample,
      eventTimeMs: normalized.valueMs,
      handlerNowMs,
      rafNowMs: null,
      frameHandle: null,
      timerHandle: null,
      settled: false,
    }
    pendings.push(pending)
    counters.pendingRafCount += 1

    const capturedGeneration = generation
    pending.frameHandle = requestFrame(() => {
      if (destroyed || capturedGeneration !== generation || pending.settled) return
      pending.frameHandle = null
      pending.rafNowMs = now()
      counters.pendingRafCount -= 1
      counters.pendingTimerCount += 1
      // post-paint proxy: rAF callback の直後に予約する macrotask。
      // 厳密な presentation timestamp ではなく近似値である。
      pending.timerHandle = scheduleTimeout(() => {
        if (destroyed || capturedGeneration !== generation || pending.settled) return
        pending.timerHandle = null
        const postPaintProxyNowMs = now()
        counters.pendingTimerCount -= 1
        pending.sample.eventToPostPaintProxyMs = measure(
          pending.eventTimeMs,
          postPaintProxyNowMs,
          pending.sample.index,
        )
        pending.sample.rafToPostPaintProxyMs = measure(
          pending.rafNowMs ?? Number.NaN,
          postPaintProxyNowMs,
          pending.sample.index,
        )
        settlePending(pending)
      }, 0)
    })
  }

  function handleCompositionEvent(event: ImeProbeEventLike): void {
    try {
      if (destroyed || !attached) return
      const type = typeof event?.type === 'string' ? event.type : ''
      const handlerNowMs = now()
      if (type === 'compositionstart') {
        counters.compositionStartCount += 1
        previousUpdateHandlerNowMs = null
        emitDiagnostic({ kind: 'composition-start' })
        return
      }
      if (type === 'compositionend') {
        counters.compositionEndCount += 1
        emitDiagnostic({ kind: 'composition-end' })
        const rawTimeStamp =
          typeof event?.timeStamp === 'number' ? event.timeStamp : Number.NaN
        beginSample('commit', rawTimeStamp, handlerNowMs)
        previousUpdateHandlerNowMs = null
        return
      }
      if (type !== 'compositionupdate') return
      counters.compositionUpdateCount += 1
      emitDiagnostic({ kind: 'composition-update' })
      const rawTimeStamp = typeof event?.timeStamp === 'number' ? event.timeStamp : Number.NaN
      beginSample('update', rawTimeStamp, handlerNowMs)
    } catch {
      // 診断 probe の例外は IME 入力へ波及させない。
      emitDiagnostic({ kind: 'listener-error' })
    }
  }

  function attachListeners(): void {
    if (attached) return
    for (const type of COMPOSITION_EVENT_TYPES) {
      target.addEventListener(type, handleCompositionEvent, ADD_LISTENER_OPTIONS)
    }
    attached = true
  }

  function detachListeners(): void {
    if (!attached) return
    for (const type of COMPOSITION_EVENT_TYPES) {
      target.removeEventListener(type, handleCompositionEvent, REMOVE_LISTENER_OPTIONS)
    }
    attached = false
  }

  function accumulateLongTaskDurations(durations: readonly number[]): void {
    for (const duration of durations) {
      if (!Number.isFinite(duration) || duration < 0) continue
      longTask = {
        supported: true,
        count: longTask.count + 1,
        totalMs: longTask.totalMs + duration,
        maxMs: longTask.maxMs === null ? duration : Math.max(longTask.maxMs, duration),
      }
    }
  }

  function startLongTaskObserver(): void {
    if (longTaskObserver) return
    // observer 生成時の generation を捕まえ、reset / destroy 後に遅れて配送される
    // 旧 session の entry を次 session の集計へ混ぜない。
    const observerGeneration = generation
    longTaskObserver = createLongTaskObserver((durations) => {
      if (destroyed) return
      if (observerGeneration !== generation) return
      accumulateLongTaskDurations(durations)
    })
    const supported = longTaskObserver !== null
    longTask = { ...longTask, supported }
    counters.longTaskObserverSupported = supported
  }

  /**
   * observer を止める。`collect: true` なら未配送 entry を回収して集計へ入れ
   * （stop 直前の Long Task 欠落を防ぐ）、`false` なら回収して捨てる
   * （reset での session 分離）。
   */
  function stopLongTaskObserver(options: { collect: boolean }): void {
    if (!longTaskObserver) return
    let pending: readonly number[] = []
    try {
      pending = longTaskObserver.drain()
    } catch {
      // drain 失敗は best effort（欠落しても入力処理へは波及させない）。
    }
    if (options.collect && pending.length > 0) {
      accumulateLongTaskDurations(pending)
    }
    try {
      longTaskObserver.disconnect()
    } catch {
      // best effort
    }
    longTaskObserver = null
  }

  function snapshot(incompleteReason: string | null = null): ImeCompositionLatencyReport {
    return buildImeCompositionLatencyReport({
      mode,
      targetKind,
      timeOriginMs,
      startedAtMs,
      endedAtMs,
      incompleteReason: destroyed ? (incompleteReason ?? 'destroyed') : incompleteReason,
      counters,
      longTask,
      samples,
      commitSamples,
    })
  }

  function waitForPendingSettle(timeoutMs: number): Promise<boolean> {
    if (counters.pendingRafCount === 0 && counters.pendingTimerCount === 0) {
      return Promise.resolve(true)
    }
    return new Promise<boolean>((resolve) => {
      let finished = false
      let timeoutHandle: number | null = null
      const waiter = () => finish(true)
      const finish = (settled: boolean) => {
        if (finished) return
        finished = true
        pendingSettleWaiters.delete(waiter)
        if (timeoutHandle !== null) {
          try {
            clearScheduledTimeout(timeoutHandle)
          } catch {
            // best effort
          }
          timeoutHandle = null
        }
        resolve(settled)
      }
      pendingSettleWaiters.add(waiter)
      timeoutHandle = scheduleTimeout(() => finish(false), timeoutMs)
    })
  }

  return {
    start() {
      if (destroyed) return false
      if (attached) return true
      generation += 1
      samples = []
      commitSamples = []
      pendings = []
      counters = createCounters()
      previousUpdateHandlerNowMs = null
      longTask = { supported: false, count: 0, totalMs: 0, maxMs: null }
      startedAtMs = now()
      endedAtMs = null
      startLongTaskObserver()
      attachListeners()
      emitDiagnostic({ kind: 'start' })
      return true
    },

    stop(reason?: string) {
      if (!attached) return
      detachListeners()
      // 停止直前に発生した Long Task も回収してから切断する。
      stopLongTaskObserver({ collect: true })
      endedAtMs = now()
      counters.lastStopReason = reason ?? 'stop'
      emitDiagnostic({ kind: 'stop', reason })
      // pending rAF / timer は意図的に生かしたまま settle させる。
      // ここで捨てると末尾 sample を失い不完全な P95 になる。
    },

    reset(reason?: string) {
      generation += 1
      cancelAllPending()
      // 旧 session の未配送 Long Task を回収して捨て、observer を作り直す。
      // 作り直さないと、reset 前に queue された entry が新 session へ入る。
      stopLongTaskObserver({ collect: false })
      samples = []
      commitSamples = []
      counters = createCounters()
      counters.lastResetReason = reason ?? 'reset'
      previousUpdateHandlerNowMs = null
      longTask = { supported: false, count: 0, totalMs: 0, maxMs: null }
      if (attached) startLongTaskObserver()
      startedAtMs = attached ? now() : null
      endedAtMs = null
      emitDiagnostic({ kind: 'reset', reason })
    },

    destroy(reason?: string) {
      if (destroyed) return
      generation += 1
      destroyed = true
      detachListeners()
      // destroy でも取りこぼしを残さない（未 stop で destroy された場合の tail）。
      stopLongTaskObserver({ collect: true })
      cancelAllPending()
      if (endedAtMs === null) endedAtMs = now()
      counters.lastStopReason = reason ?? 'destroy'
      pendingSettleWaiters.clear()
      emitDiagnostic({ kind: 'destroy', reason })
    },

    isActive() {
      return attached && !destroyed
    },

    isDestroyed() {
      return destroyed
    },

    snapshot() {
      return snapshot()
    },

    async report(reportOptions?: ImeCompositionLatencyReportOptions) {
      const timeoutMs =
        Number.isFinite(reportOptions?.pendingTimeoutMs) &&
        (reportOptions?.pendingTimeoutMs ?? -1) >= 0
          ? (reportOptions?.pendingTimeoutMs as number)
          : defaultPendingTimeoutMs
      const settled = await waitForPendingSettle(timeoutMs)
      return snapshot(settled ? null : 'pending-timeout')
    },

    pendingCounts() {
      return {
        raf: counters.pendingRafCount,
        timer: counters.pendingTimerCount,
      }
    },
  }
}
