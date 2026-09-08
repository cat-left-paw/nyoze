/**
 * IME composition latency probe — 純粋な timestamp 正規化・統計・report 組み立て。
 *
 * このファイルは DOM / ProseMirror / React / Electron に一切依存しない。
 * baseline（`.ProseMirror`）と将来の PoC（局所 contenteditable slot）で
 * **同一定義**の指標を出すために、計測点の意味づけをここへ集約する。
 *
 * 正本: `docs/local-contenteditable-ime-poc-design-2026-07.md` §13.1 /
 *       `docs/ime-composition-latency-probe.md`
 *
 * 重要な設計上の制約:
 * - report には本文・未確定文字列・確定文字列・ファイルパス・frontmatter・
 *   ユーザー名を入れない。数値と固定 enum 文字列だけを持つ。
 * - `postPaintProxy` は rAF 内から予約した `setTimeout(0)` の実行時刻であり、
 *   厳密な presentation timestamp ではない。名称でそれが分かるようにしている。
 */

export const IME_COMPOSITION_LATENCY_SCHEMA_VERSION = 2
export const IME_COMPOSITION_LATENCY_PROBE_VERSION = '0.2.0'
export const IME_COMPOSITION_LATENCY_UNIT = 'ms' as const

/** `event.timeStamp` をどう解釈したか。 */
export type ImeTimestampMode =
  /** `performance.now()` と同じ time origin の high-resolution timestamp としてそのまま使用。 */
  | 'high-resolution'
  /** epoch ms とみなし `performance.timeOrigin` を引いて変換。 */
  | 'epoch-converted'
  /** 解釈できないため handler entry 時刻を代用（event→handler は 0 になる）。 */
  | 'handler-fallback'

export const IME_TIMESTAMP_MODES: readonly ImeTimestampMode[] = [
  'high-resolution',
  'epoch-converted',
  'handler-fallback',
]

export type NormalizedEventTimestamp = {
  /** `performance.now()` と同じ時間軸に揃えた ms 値。 */
  valueMs: number
  mode: ImeTimestampMode
}

/**
 * これ以上大きい値は high-resolution timestamp ではなく epoch ms とみなす。
 * `performance.now()` が 1e12 ms（約 31 年）に達することは実用上ない。
 */
export const EPOCH_TIMESTAMP_THRESHOLD_MS = 1e12

/** handler entry より未来に見えることを許す幅（timestamp 粒度・丸め対策）。 */
export const FUTURE_TOLERANCE_MS = 2

/** handler entry からこれ以上古い event timestamp は信用しない。 */
export const MAX_EVENT_AGE_MS = 5_000

/** 単一 latency としてありえない上限。超えたら統計へ入れず reject として数える。 */
export const MAX_LATENCY_MS = 60_000

function isPlausibleOnPerformanceTimeline(valueMs: number, handlerNowMs: number): boolean {
  if (!Number.isFinite(valueMs)) return false
  if (valueMs < 0) return false
  if (valueMs > handlerNowMs + FUTURE_TOLERANCE_MS) return false
  if (handlerNowMs - valueMs > MAX_EVENT_AGE_MS) return false
  return true
}

/**
 * `event.timeStamp` を `performance.now()` と同じ時間軸へ正規化する。
 *
 * Chromium では通常 `event.timeStamp` は `performance.now()` と同じ time origin だが、
 * それを無条件には仮定しない。判定できない場合は handler entry 時刻へ fallback し、
 * `mode` を残して診断できるようにする（無言で異常値を統計へ入れない）。
 */
export function normalizeEventTimestamp(input: {
  eventTimeStamp: number
  handlerNowMs: number
  timeOriginMs?: number | null
}): NormalizedEventTimestamp {
  const handlerNowMs = Number.isFinite(input.handlerNowMs) ? input.handlerNowMs : 0
  const fallback: NormalizedEventTimestamp = {
    valueMs: handlerNowMs,
    mode: 'handler-fallback',
  }

  const raw = input.eventTimeStamp
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return fallback

  if (isPlausibleOnPerformanceTimeline(raw, handlerNowMs)) {
    return { valueMs: raw, mode: 'high-resolution' }
  }

  const timeOriginMs = input.timeOriginMs
  if (
    raw >= EPOCH_TIMESTAMP_THRESHOLD_MS &&
    typeof timeOriginMs === 'number' &&
    Number.isFinite(timeOriginMs) &&
    timeOriginMs > 0
  ) {
    const converted = raw - timeOriginMs
    if (isPlausibleOnPerformanceTimeline(converted, handlerNowMs)) {
      return { valueMs: converted, mode: 'epoch-converted' }
    }
  }

  return fallback
}

/**
 * 2 点間の latency。負値・非有限・極端値は `null` を返し、呼び出し側で
 * reject として数えられるようにする（統計へは入れない）。
 */
export function computeLatencyMs(fromMs: number, toMs: number): number | null {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null
  const deltaMs = toMs - fromMs
  if (!Number.isFinite(deltaMs)) return null
  if (deltaMs < 0) return null
  if (deltaMs > MAX_LATENCY_MS) return null
  return deltaMs
}

export type LatencySummary = {
  count: number
  minMs: number | null
  medianMs: number | null
  p95Ms: number | null
  maxMs: number | null
  meanMs: number | null
  totalMs: number
}

/**
 * nearest-rank quantile。`tests/perf-e2e/helpers/performanceStatistics.ts` と
 * 同じ定義を production source 側へ独立実装したもの（`tests/` は import しない）。
 *
 * 偶数個でも median は平均を取らず下側要素を返す。sample 数が少ないときの
 * P95 は「最大値へ寄る」ことになるが、定義が一意で unit test で固定できる。
 */
export function quantileNearestRank(
  values: readonly number[],
  ratio: number,
): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  )
  return sorted[index] ?? null
}

export function summarizeLatencySamples(values: readonly number[]): LatencySummary {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: null,
      medianMs: null,
      p95Ms: null,
      maxMs: null,
      meanMs: null,
      totalMs: 0,
    }
  }
  let totalMs = 0
  let minMs = values[0]
  let maxMs = values[0]
  for (const value of values) {
    totalMs += value
    if (value < minMs) minMs = value
    if (value > maxMs) maxMs = value
  }
  return {
    count: values.length,
    minMs,
    medianMs: quantileNearestRank(values, 0.5),
    p95Ms: quantileNearestRank(values, 0.95),
    maxMs,
    meanMs: totalMs / values.length,
    totalMs,
  }
}

/** 1 回の `compositionupdate` に対応する数値のみの sample。 */
export type ImeCompositionLatencySample = {
  /** session 内の 0 始まり通し番号。文字列内容は一切持たない。 */
  index: number
  timestampMode: ImeTimestampMode
  /** event timestamp → probe handler entry。probe より前に走る listener の時間を含む。 */
  eventToHandlerMs: number | null
  /** event timestamp → 次の `requestAnimationFrame` callback。 */
  eventToRafMs: number | null
  /** event timestamp → rAF 内から予約した `setTimeout(0)`（paint 完了の近似）。 */
  eventToPostPaintProxyMs: number | null
  handlerToRafMs: number | null
  rafToPostPaintProxyMs: number | null
  /** 直前の `compositionupdate` handler entry からの間隔。 */
  sincePreviousUpdateMs: number | null
  /** rAF と post-paint proxy の両方が確定したか。 */
  complete: boolean
}

/**
 * 1 回の `compositionend` に対応する数値のみの sample。
 *
 * `compositionupdate` sample と同じ計測点を使うが、確定復帰の比較値を
 * 変換中の統計へ混ぜないため別系列で保持する。
 */
export type ImeCompositionCommitLatencySample = {
  /** session 内の 0 始まり通し番号。確定文字列は一切持たない。 */
  index: number
  timestampMode: ImeTimestampMode
  eventToHandlerMs: number | null
  eventToRafMs: number | null
  eventToPostPaintProxyMs: number | null
  handlerToRafMs: number | null
  rafToPostPaintProxyMs: number | null
  complete: boolean
}

export type ImeCompositionLatencySessionCounters = {
  compositionStartCount: number
  compositionUpdateCount: number
  compositionEndCount: number
  sampleCount: number
  completeSampleCount: number
  /** maxSamples 超過などで計測を開始しなかった `compositionupdate` 数。 */
  droppedSampleCount: number
  /** `compositionend` 起点の確定復帰 sample 数。 */
  commitSampleCount: number
  completeCommitSampleCount: number
  /** maxSamples 超過などで計測を開始しなかった `compositionend` 数。 */
  droppedCommitSampleCount: number
  /** 負値・極端値として統計から除外した latency 値の数。 */
  rejectedLatencyCount: number
  pendingRafCount: number
  pendingTimerCount: number
  /** `compositionupdate` sample の timestamp 解釈内訳。 */
  timestampModeCounts: Record<ImeTimestampMode, number>
  /** `compositionend` sample の timestamp 解釈内訳。 */
  commitTimestampModeCounts: Record<ImeTimestampMode, number>
  lastResetReason: string | null
  lastStopReason: string | null
  longTaskObserverSupported: boolean
}

export type ImeCompositionLongTaskSummary = {
  supported: boolean
  count: number
  totalMs: number
  maxMs: number | null
}

export type ImeCompositionLatencyReport = {
  schemaVersion: number
  probeVersion: string
  unit: typeof IME_COMPOSITION_LATENCY_UNIT
  /** 比較 arm の label。baseline / 将来の PoC を区別する。 */
  mode: string
  /** attach 先の種別。生の selector 文字列は載せない。 */
  targetKind: string
  timeOriginMs: number | null
  startedAtMs: number | null
  endedAtMs: number | null
  durationMs: number | null
  complete: boolean
  incompleteReason: string | null
  session: ImeCompositionLatencySessionCounters
  latencySummary: {
    eventToHandlerMs: LatencySummary
    eventToRafMs: LatencySummary
    eventToPostPaintProxyMs: LatencySummary
    handlerToRafMs: LatencySummary
    rafToPostPaintProxyMs: LatencySummary
    compositionUpdateIntervalMs: LatencySummary
  }
  /** `compositionend` 起点の確定復帰 latency。変換中の統計とは混ぜない。 */
  commitLatencySummary: {
    eventToHandlerMs: LatencySummary
    eventToRafMs: LatencySummary
    eventToPostPaintProxyMs: LatencySummary
    handlerToRafMs: LatencySummary
    rafToPostPaintProxyMs: LatencySummary
  }
  longTaskSummary: ImeCompositionLongTaskSummary
  samples: ImeCompositionLatencySample[]
  commitSamples: ImeCompositionCommitLatencySample[]
}

export function createTimestampModeCounts(): Record<ImeTimestampMode, number> {
  return {
    'high-resolution': 0,
    'epoch-converted': 0,
    'handler-fallback': 0,
  }
}

export type BuildImeCompositionLatencyReportInput = {
  mode: string
  targetKind: string
  timeOriginMs: number | null
  startedAtMs: number | null
  endedAtMs: number | null
  incompleteReason: string | null
  counters: ImeCompositionLatencySessionCounters
  longTask: ImeCompositionLongTaskSummary
  samples: readonly ImeCompositionLatencySample[]
  commitSamples: readonly ImeCompositionCommitLatencySample[]
}

function collectFiniteValues<T>(
  samples: readonly T[],
  pick: (sample: T) => number | null,
): number[] {
  const values: number[] = []
  for (const sample of samples) {
    const value = pick(sample)
    if (value !== null && Number.isFinite(value)) values.push(value)
  }
  return values
}

/**
 * JSON.stringify 可能な report を組み立てる。DOM node / Event / EditorView /
 * 関数は含めない。
 */
export function buildImeCompositionLatencyReport(
  input: BuildImeCompositionLatencyReportInput,
): ImeCompositionLatencyReport {
  const samples = input.samples.map((sample) => ({ ...sample }))
  const commitSamples = input.commitSamples.map((sample) => ({ ...sample }))
  const hasPending =
    input.counters.pendingRafCount > 0 || input.counters.pendingTimerCount > 0
  const durationMs =
    input.startedAtMs !== null && input.endedAtMs !== null
      ? Math.max(0, input.endedAtMs - input.startedAtMs)
      : null

  return {
    schemaVersion: IME_COMPOSITION_LATENCY_SCHEMA_VERSION,
    probeVersion: IME_COMPOSITION_LATENCY_PROBE_VERSION,
    unit: IME_COMPOSITION_LATENCY_UNIT,
    mode: input.mode,
    targetKind: input.targetKind,
    timeOriginMs: input.timeOriginMs,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    durationMs,
    complete: input.incompleteReason === null && !hasPending,
    incompleteReason:
      input.incompleteReason ?? (hasPending ? 'pending-samples' : null),
    session: {
      ...input.counters,
      timestampModeCounts: { ...input.counters.timestampModeCounts },
      commitTimestampModeCounts: { ...input.counters.commitTimestampModeCounts },
    },
    latencySummary: {
      eventToHandlerMs: summarizeLatencySamples(
        collectFiniteValues(samples, (s) => s.eventToHandlerMs),
      ),
      eventToRafMs: summarizeLatencySamples(
        collectFiniteValues(samples, (s) => s.eventToRafMs),
      ),
      eventToPostPaintProxyMs: summarizeLatencySamples(
        collectFiniteValues(samples, (s) => s.eventToPostPaintProxyMs),
      ),
      handlerToRafMs: summarizeLatencySamples(
        collectFiniteValues(samples, (s) => s.handlerToRafMs),
      ),
      rafToPostPaintProxyMs: summarizeLatencySamples(
        collectFiniteValues(samples, (s) => s.rafToPostPaintProxyMs),
      ),
      compositionUpdateIntervalMs: summarizeLatencySamples(
        collectFiniteValues(samples, (s) => s.sincePreviousUpdateMs),
      ),
    },
    commitLatencySummary: {
      eventToHandlerMs: summarizeLatencySamples(
        collectFiniteValues(commitSamples, (s) => s.eventToHandlerMs),
      ),
      eventToRafMs: summarizeLatencySamples(
        collectFiniteValues(commitSamples, (s) => s.eventToRafMs),
      ),
      eventToPostPaintProxyMs: summarizeLatencySamples(
        collectFiniteValues(commitSamples, (s) => s.eventToPostPaintProxyMs),
      ),
      handlerToRafMs: summarizeLatencySamples(
        collectFiniteValues(commitSamples, (s) => s.handlerToRafMs),
      ),
      rafToPostPaintProxyMs: summarizeLatencySamples(
        collectFiniteValues(commitSamples, (s) => s.rafToPostPaintProxyMs),
      ),
    },
    longTaskSummary: { ...input.longTask },
    samples,
    commitSamples,
  }
}
