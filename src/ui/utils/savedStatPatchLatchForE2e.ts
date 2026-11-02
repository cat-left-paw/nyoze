/**
 * NYOZE_E2E-only latches for the post-save savedStat / leave-snapshot clobber race.
 *
 * Production never arms these. timer / polling / quiet period は持たない。
 *
 * 1. patch hold: getFileStat 完了後〜patchTab 前
 * 2. apply hold: leave snapshot を capture したあと、functional update 前
 *
 * 元の不具合は「新しい stat patch の後から古い snapshot が上書きする」順。
 * apply を止めたまま patch を先に通し、その後で古い snapshot を適用する。
 */

export type SavedStatPatchHoldSnapshot = {
  readonly armed: boolean
  readonly waiting: boolean
}

let patchArmed = false
let patchWaiting = false
let patchReleaseWait: (() => void) | null = null
let patchWaitPromise: Promise<void> | null = null

export function snapshotSavedStatPatchHoldForE2e(): SavedStatPatchHoldSnapshot {
  return { armed: patchArmed, waiting: patchWaiting }
}

export function armSavedStatPatchHoldForE2e(): boolean {
  if (patchArmed) return false
  patchArmed = true
  patchWaiting = false
  patchWaitPromise = new Promise<void>((resolve) => {
    patchReleaseWait = resolve
  })
  return true
}

export async function awaitSavedStatPatchHoldForE2e(): Promise<void> {
  if (!patchArmed || !patchWaitPromise) return
  patchWaiting = true
  await patchWaitPromise
}

export function releaseSavedStatPatchHoldForE2e(): boolean {
  if (!patchArmed) return false
  patchReleaseWait?.()
  patchArmed = false
  patchWaiting = false
  patchReleaseWait = null
  patchWaitPromise = null
  return true
}

export function clearSavedStatPatchHoldForE2e(): void {
  patchReleaseWait?.()
  patchArmed = false
  patchWaiting = false
  patchReleaseWait = null
  patchWaitPromise = null
}

let applyArmed = false
let applyWaiting = false
let pendingApply: (() => void) | null = null

export function snapshotTabLeaveSnapshotApplyHoldForE2e(): SavedStatPatchHoldSnapshot {
  return { armed: applyArmed, waiting: applyWaiting }
}

export function armTabLeaveSnapshotApplyHoldForE2e(): boolean {
  if (applyArmed) return false
  applyArmed = true
  applyWaiting = false
  pendingApply = null
  return true
}

/** armed なら apply を保留して true。production は常に false。 */
export function deferTabLeaveSnapshotApplyForE2e(apply: () => void): boolean {
  if (!applyArmed) return false
  if (pendingApply) return false
  applyWaiting = true
  pendingApply = apply
  return true
}

export function releaseTabLeaveSnapshotApplyHoldForE2e(): boolean {
  if (!applyArmed) return false
  const run = pendingApply
  applyArmed = false
  applyWaiting = false
  pendingApply = null
  run?.()
  return true
}

export function clearTabLeaveSnapshotApplyHoldForE2e(): void {
  applyArmed = false
  applyWaiting = false
  pendingApply = null
}

/**
 * EDITOR-TAB-HISTORY1 E2E only: 次の `restoreTab` を、副作用の前に 1 回だけ失敗させる（離脱の取り消し）。
 * 離れる側の capsule が残る場面を作るための test-only latch。production は常に false。
 */
let restoreTabFailureArmed = false

export function armRestoreTabFailureForE2e(): boolean {
  if (restoreTabFailureArmed) return false
  restoreTabFailureArmed = true
  return true
}

/** armed なら消費して true（`restoreTab` が失敗を返す）。 */
export function consumeRestoreTabFailureForE2e(): boolean {
  if (!restoreTabFailureArmed) return false
  restoreTabFailureArmed = false
  return true
}

// SAVE-TARGET-IDENTITY1: disk write succeeded, UI finalization has not run yet.
let completionResolve: (() => void) | null = null
let completionPromise: Promise<void> | null = null
let completionWaiting = false
export function armSaveCompletionHoldForE2e(): boolean {
  if (completionPromise) return false
  completionPromise = new Promise<void>(resolve => { completionResolve = resolve })
  return true
}
export async function awaitSaveCompletionHoldForE2e(): Promise<void> {
  if (!completionPromise) return
  completionWaiting = true
  await completionPromise
}
export function releaseSaveCompletionHoldForE2e(): boolean {
  if (!completionPromise) return false
  completionResolve?.()
  completionResolve = null
  completionPromise = null
  completionWaiting = false
  return true
}
export function snapshotSaveCompletionHoldForE2e(): SavedStatPatchHoldSnapshot {
  return { armed: completionPromise !== null, waiting: completionWaiting }
}

// One explicitly armed sample of the additional D2 serialization. No timer,
// identity decision or product port depends on this measurement.
let measureNextMarkdown = false
let markdownMeasurement: { milliseconds: number; characters: number } | null = null
export function armSaveCompletionMarkdownMeasurementForE2e(): void {
  measureNextMarkdown = true
  markdownMeasurement = null
}
export function readSaveCompletionMarkdownForE2e(read: () => string | undefined): string | undefined {
  if (!measureNextMarkdown) return read()
  measureNextMarkdown = false
  const started = performance.now()
  const markdown = read()
  markdownMeasurement = { milliseconds: performance.now() - started, characters: markdown?.length ?? 0 }
  return markdown
}
export function snapshotSaveCompletionMarkdownMeasurementForE2e() { return markdownMeasurement }
