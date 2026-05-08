/**
 * Paragraph Plain layout experiments (localStorage debug overrides) and
 * formal app setting (`paragraphPlainBehavior`) merged into effective flags.
 *
 * Formal defaults (no debug): `fast` → scroll off, reserved off; `comfortable` → scroll off, reserved on.
 *
 * Debug keys (renderer localStorage, `=== '1'`):
 * - `nyoze:pp-disable-scroll-reposition`
 * - `nyoze:pp-disable-reserved-block-size`
 * - `nyoze:pp-lightweight-mode`
 *
 * Precedence per axis: debug override > formal app setting > built-in default (`fast`).
 */

import {
  DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR,
  normalizeParagraphPlainBehavior,
  type ParagraphPlainBehavior,
} from '../../settings/paragraphPlainBehavior'

export type { ParagraphPlainBehavior }

export const PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS = {
  disableScrollReposition: 'nyoze:pp-disable-scroll-reposition',
  disableReservedBlockSize: 'nyoze:pp-disable-reserved-block-size',
  lightweightMode: 'nyoze:pp-lightweight-mode',
} as const

/** Formal setting mirrored at runtime (updated from useAppUiState on load / user change). */
let formalBehaviorRuntime: ParagraphPlainBehavior = DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR

export function setParagraphPlainFormalBehaviorRuntime(
  behavior: unknown,
): void {
  formalBehaviorRuntime = normalizeParagraphPlainBehavior(behavior)
}

/** @internal */
export function getParagraphPlainFormalBehaviorRuntimeForTests(): ParagraphPlainBehavior {
  return formalBehaviorRuntime
}

function readLsTruthy(key: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function debugScrollRepositionDisabled(): boolean {
  if (readLsTruthy(PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS.lightweightMode)) return true
  return readLsTruthy(PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS.disableScrollReposition)
}

function debugReservedBlockSizeDisabled(): boolean {
  if (readLsTruthy(PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS.lightweightMode)) return true
  return readLsTruthy(PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS.disableReservedBlockSize)
}

function formalScrollRepositionDisabled(): boolean {
  return (
    formalBehaviorRuntime === 'fast' || formalBehaviorRuntime === 'comfortable'
  )
}

function formalReservedBlockSizeDisabled(): boolean {
  return formalBehaviorRuntime === 'fast'
}

/** @internal Exported for tests; matches legacy name (lightweight debug key). */
export function isParagraphPlainLightweightModeEnabled(): boolean {
  return readLsTruthy(PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS.lightweightMode)
}

export function isParagraphPlainScrollRepositionDisabled(): boolean {
  if (debugScrollRepositionDisabled()) return true
  return formalScrollRepositionDisabled()
}

export function isParagraphPlainReservedBlockSizeDisabled(): boolean {
  if (debugReservedBlockSizeDisabled()) return true
  return formalReservedBlockSizeDisabled()
}

export type ParagraphPlainExperimentsSnapshot = {
  lightweight: boolean
  scrollRepositionDisabled: boolean
  reservedBlockSizeDisabled: boolean
  formalBehavior: ParagraphPlainBehavior
}

export function getParagraphPlainExperimentsSnapshot(): ParagraphPlainExperimentsSnapshot {
  return {
    lightweight: isParagraphPlainLightweightModeEnabled(),
    scrollRepositionDisabled: isParagraphPlainScrollRepositionDisabled(),
    reservedBlockSizeDisabled: isParagraphPlainReservedBlockSizeDisabled(),
    formalBehavior: formalBehaviorRuntime,
  }
}

/** @internal Test hook: clears window API guard, localStorage keys, formal runtime → default. */
export function paragraphPlainExperimentsResetForTests(): void {
  windowApiInstalled = false
  formalBehaviorRuntime = DEFAULT_PARAGRAPH_PLAIN_BEHAVIOR
  try {
    if (typeof localStorage === 'undefined') return
    for (const k of Object.values(PARAGRAPH_PLAIN_EXPERIMENT_STORAGE_KEYS)) {
      localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

let windowApiInstalled = false

export function ensureParagraphPlainExperimentsWindowApi(win?: Window | null): void {
  const w =
    typeof win !== 'undefined' && win != null
      ? win
      : typeof window !== 'undefined'
        ? window
        : null
  if (w == null || windowApiInstalled) return
  ;(w as Window & { __nyozeParagraphPlainExperiments?: unknown }).__nyozeParagraphPlainExperiments =
    {
      getState: getParagraphPlainExperimentsSnapshot,
    }
  windowApiInstalled = true
}
