/**
 * IME composition latency probe の renderer 側 host。
 *
 * - probe singleton の生成 / 破棄
 * - attach 先 element の解決（selector → `EventTarget`）
 * - E2E / 開発診断からの薄い facade
 *
 * **通常起動時には何もしない。** `startImeCompositionLatencyProbe()` が
 * 呼ばれるまで listener / PerformanceObserver / rAF / timer を1つも作らない。
 * 公開入口は `useE2eBridge` 側の `NYOZE_E2E` guard 下だけに置く。
 *
 * report に生の selector 文字列は載せない（`targetKind` の固定 enum だけ）。
 */

import {
  createImeCompositionLatencyProbe,
  type ImeCompositionLatencyProbeHandle,
  type ImeCompositionLatencyReportOptions,
  type ImeCompositionProbeTarget,
} from './imeCompositionLatencyProbe'
import type { ImeCompositionLatencyReport } from './imeCompositionLatencyStats'

/** baseline arm の既定 attach 先（ProseMirror 編集面）。 */
export const IME_PROBE_BASELINE_TARGET_SELECTOR = '.editor-core-host > .ProseMirror'
const TARGET_KIND_BY_SELECTOR: Readonly<Record<string, string>> = {
  [IME_PROBE_BASELINE_TARGET_SELECTOR]: 'prosemirror-root',
}

const LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

export type StartImeCompositionLatencyProbeOptions = {
  /** 比較 arm の label。`[a-z0-9-]` のみ、最大 40 文字。既定 `'baseline'`。 */
  mode?: string
  /** attach 先 selector。既定は `.ProseMirror`。 */
  targetSelector?: string
  maxSamples?: number
  pendingTimeoutMs?: number
}

export type StartImeCompositionLatencyProbeResult =
  | { ok: true; targetKind: string; mode: string }
  | { ok: false; error: string }

let activeProbe: ImeCompositionLatencyProbeHandle | null = null

/**
 * label を固定文字種へ制限する。文書本文・パス由来の文字列が report へ
 * 紛れ込む経路を作らないための入口 sanitize。
 */
export function sanitizeImeProbeLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  return LABEL_PATTERN.test(normalized) ? normalized : fallback
}

export function resolveImeProbeTargetKind(selector: string): string {
  return TARGET_KIND_BY_SELECTOR[selector] ?? 'custom'
}

/** @internal E2E / unit test 用。既存 probe を破棄して未起動状態へ戻す。 */
export function destroyImeCompositionLatencyProbe(reason?: string): boolean {
  if (!activeProbe) return false
  activeProbe.destroy(sanitizeImeProbeLabel(reason, 'destroy'))
  activeProbe = null
  return true
}

export function startImeCompositionLatencyProbe(
  options?: StartImeCompositionLatencyProbeOptions,
): StartImeCompositionLatencyProbeResult {
  if (activeProbe && activeProbe.isActive()) {
    return { ok: false, error: 'already-active' }
  }
  if (typeof document === 'undefined') {
    return { ok: false, error: 'no-document' }
  }

  const rawSelector = options?.targetSelector
  const selector =
    typeof rawSelector === 'string' && rawSelector.trim().length > 0
      ? rawSelector.trim()
      : IME_PROBE_BASELINE_TARGET_SELECTOR

  let element: Element | null = null
  try {
    element = document.querySelector(selector)
  } catch {
    return { ok: false, error: 'invalid-selector' }
  }
  if (!element) {
    return { ok: false, error: 'target-not-found' }
  }

  const mode = sanitizeImeProbeLabel(options?.mode, 'baseline')
  const targetKind = resolveImeProbeTargetKind(selector)

  // 直前の probe が残っていれば必ず破棄してから作り直す（listener 二重登録防止）。
  destroyImeCompositionLatencyProbe('restart')

  const probe = createImeCompositionLatencyProbe({
    target: element as ImeCompositionProbeTarget,
    mode,
    targetKind,
    maxSamples: options?.maxSamples,
    pendingTimeoutMs: options?.pendingTimeoutMs,
  })
  if (!probe.start()) {
    return { ok: false, error: 'start-failed' }
  }
  activeProbe = probe
  return { ok: true, targetKind, mode }
}

export function stopImeCompositionLatencyProbe(reason?: string): boolean {
  if (!activeProbe) return false
  activeProbe.stop(sanitizeImeProbeLabel(reason, 'stop'))
  return true
}

export function resetImeCompositionLatencyProbe(reason?: string): boolean {
  if (!activeProbe) return false
  activeProbe.reset(sanitizeImeProbeLabel(reason, 'reset'))
  return true
}

export function snapshotImeCompositionLatencyProbe(): ImeCompositionLatencyReport | null {
  return activeProbe ? activeProbe.snapshot() : null
}

export async function reportImeCompositionLatencyProbe(
  options?: ImeCompositionLatencyReportOptions,
): Promise<ImeCompositionLatencyReport | null> {
  if (!activeProbe) return null
  return activeProbe.report(options)
}

export function isImeCompositionLatencyProbeActive(): boolean {
  return activeProbe !== null && activeProbe.isActive()
}

export function getImeCompositionLatencyProbePendingCounts(): {
  raf: number
  timer: number
} | null {
  return activeProbe ? activeProbe.pendingCounts() : null
}
