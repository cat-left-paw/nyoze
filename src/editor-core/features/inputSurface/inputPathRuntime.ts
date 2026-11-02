import { normalizeInputStrategyCapabilityView, type InputPath, type InputStrategyCapabilityView } from '../inputPathDecision'
import type { InputSurfaceCreateFailureReason } from './inputSurfaceCreation'

/**
 * PIS-S10-ENTRY1a: 実行中の入力の方式を持つ、ただ1つのstore。
 *
 * - capability（起動時に決まる値）はmainの固定値で、ここでは読むだけ。
 * - path（実行中に変わる値）は、製品の入口のhookが`requestInputPathChange()`で変える。
 *   editorがある間は、登録された切り替えのcontroller（`inputPathController.ts`）が境界を判定する。
 * - timer・polling・rAFを使わない。切り替えは同期で、成功したときだけpathが変わる。
 */
export type InputPathChangeReason =
  | 'not-capable' | 'forced' | 'host-composing' | 'host-pending-input' | 'surface-payload' | 'create-failed' | 'focus-failed'
export type InputPathChangeOutcome = { ok: true; path: InputPath } | { ok: false; path: InputPath; reason: InputPathChangeReason }
export type InputPathChangeOptions = {
  /** E4: 利用者が確認した。入力面の変換中の文字を破棄してから、従来の入力へ切り替える。 */
  discardComposition?: boolean
}
/** 入力面で変換中だけ非null。`cycle`は変換の開始のたびに進む。`discardable`はE4で破棄できるか。 */
export type InputSurfaceCompositionState = { cycle: number; discardable: boolean }
export type InputPathController = {
  switchTo(next: InputPath, options?: InputPathChangeOptions): InputPathChangeOutcome
  surfaceComposition?(): InputSurfaceCompositionState | null
}

/** 開発用の診断（読むだけ）。製品のnoticeや自動の切り替え・設定の制御には使わない。読むのは試験専用の入口だけ。 */
export type InputPathDiagnostics = {
  switched: number
  blocked: Partial<Record<InputPathChangeReason, number>>
  compositionDiscarded: number
  deferredCreations: number
  domSelectionMismatch: number
  lastBlocked: InputPathChangeReason | null
  /** PREEDIT-FOLLOW1: 入力面を作れなかった理由（typed）の回数と、最後の理由。 */
  createFailures: Partial<Record<InputSurfaceCreateFailureReason, number>>
  lastCreateFailure: InputSurfaceCreateFailureReason | null
}
const diagnostics: InputPathDiagnostics = { switched: 0, blocked: {}, compositionDiscarded: 0, deferredCreations: 0, domSelectionMismatch: 0, lastBlocked: null, createFailures: {}, lastCreateFailure: null }
type InputPathDiagnosticEvent =
  | { kind: 'switched' } | { kind: 'composition-discarded' } | { kind: 'deferred-creation' } | { kind: 'dom-selection-mismatch' }
  | { kind: 'blocked'; reason: InputPathChangeReason }
  | { kind: 'create-failure'; reason: InputSurfaceCreateFailureReason }
export function noteInputPathDiagnostic(event: InputPathDiagnosticEvent): void {
  switch (event.kind) {
    case 'switched': diagnostics.switched++; break
    case 'composition-discarded': diagnostics.compositionDiscarded++; break
    case 'deferred-creation': diagnostics.deferredCreations++; break
    case 'dom-selection-mismatch': diagnostics.domSelectionMismatch++; break
    case 'blocked':
      diagnostics.blocked[event.reason] = (diagnostics.blocked[event.reason] ?? 0) + 1
      diagnostics.lastBlocked = event.reason
      break
    case 'create-failure':
      diagnostics.createFailures[event.reason] = (diagnostics.createFailures[event.reason] ?? 0) + 1
      diagnostics.lastCreateFailure = event.reason
  }
}
export function readInputPathDiagnostics(): InputPathDiagnostics {
  return { ...diagnostics, blocked: { ...diagnostics.blocked }, createFailures: { ...diagnostics.createFailures } }
}

let capability: InputStrategyCapabilityView | null = null
let path: InputPath | null = null
let controller: InputPathController | null = null
// 後へ回した入力面の生成（Paragraph Plainを出たとき）と、editorの生成時の最初の生成の失敗の、1回だけ読める通知。
let deferredCreationFailed = false
const listeners = new Set<() => void>()

export function readInputStrategyCapability(): InputStrategyCapabilityView {
  capability ??= normalizeInputStrategyCapabilityView(typeof window === 'undefined' ? null : window.nyozeBridge?.inputStrategy)
  return capability
}

/**
 * Local Windowのruntime（controller・AUTOARM・recovery port・barrierの参加者）を作ってよい起動か。
 * 作者Pilotと、開発用の指定で製品の入口をLocal Windowへ戻した起動だけ。製品の入口がPISのときは作らない。
 */
export function shouldAttachLocalWindowRuntime(): boolean {
  const current = readInputStrategyCapability()
  return current.authorPilot || current.productStrategy === 'local-window'
}

/** 現在の入力の方式。開発用の強制ONは常にPIS。製品の入口がPISでなければ常に従来の入力。 */
export function getInputPath(): InputPath {
  const current = readInputStrategyCapability()
  if (current.productStrategy !== 'input-surface') return 'host'
  if (current.forced) return 'input-surface'
  return path ?? 'host'
}

export function subscribeInputPath(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** controllerだけが呼ぶ（境界の判定の後）。 */
export function commitInputPath(next: InputPath): void {
  const current = readInputStrategyCapability()
  if (current.productStrategy !== 'input-surface' || current.forced) return
  if (getInputPath() === next) return
  path = next
  for (const listener of Array.from(listeners)) listener()
}

export function registerInputPathController(next: InputPathController): () => void {
  controller = next
  return () => { if (controller === next) controller = null }
}

/** 製品の入口からの切り替えの要求。止められたときはpathを変えず、理由を返す。 */
export function requestInputPathChange(next: InputPath, options?: InputPathChangeOptions): InputPathChangeOutcome {
  const current = readInputStrategyCapability()
  if (current.productStrategy !== 'input-surface') return { ok: false, path: 'host', reason: 'not-capable' }
  if (current.forced) return { ok: false, path: 'input-surface', reason: 'forced' }
  if (getInputPath() === next) return { ok: true, path: next }
  if (controller) return controller.switchTo(next, options)
  // editorがまだない。生成時にこの値を読む。
  commitInputPath(next)
  return { ok: true, path: next }
}

/** 入力面の現在の変換（E4の判定用。同期の事実を読むだけ）。変換中でなければnull。 */
export function readInputSurfaceComposition(): InputSurfaceCompositionState | null {
  return controller?.surfaceComposition?.() ?? null
}

/** controllerだけが呼ぶ: 後へ回した生成が失敗して、方式を従来の入力へ戻す直前。 */
export function noteDeferredInputSurfaceCreationFailed(): void { deferredCreationFailed = true }
/** 入口のhookが読む。trueを返すのは、失敗1回につき1回だけ。 */
export function consumeDeferredInputSurfaceCreationFailure(): boolean {
  const failed = deferredCreationFailed
  deferredCreationFailed = false
  return failed
}

/** unit test専用。 */
export function resetInputPathRuntimeForTest(): void {
  capability = null; path = null; controller = null; deferredCreationFailed = false; listeners.clear()
  Object.assign(diagnostics, { switched: 0, blocked: {}, compositionDiscarded: 0, deferredCreations: 0, domSelectionMismatch: 0, lastBlocked: null, createFailures: {}, lastCreateFailure: null })
}
