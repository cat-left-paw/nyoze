type TimerHandle = ReturnType<typeof setTimeout>

type CreateSearchRefreshSchedulerOptions = {
  delayMs: number
  getIsComposing: () => boolean
  hasActiveQuery: () => boolean
  runRefresh: () => void
  scheduleTimeout?: (callback: () => void, delayMs: number) => TimerHandle
  clearScheduledTimeout?: (handle: TimerHandle) => void
}

export function createSearchRefreshScheduler({
  delayMs,
  getIsComposing,
  hasActiveQuery,
  runRefresh,
  scheduleTimeout = (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearScheduledTimeout = (handle) => clearTimeout(handle),
}: CreateSearchRefreshSchedulerOptions): {
  schedule: () => boolean
  flushNow: () => boolean
  cancel: () => void
  hasPending: () => boolean
} {
  let pending = false
  let timer: TimerHandle | null = null

  function clearTimer(): void {
    if (timer === null) return
    clearScheduledTimeout(timer)
    timer = null
  }

  function armTimer(): void {
    clearTimer()
    timer = scheduleTimeout(() => {
      timer = null
      flushNow()
    }, delayMs)
  }

  function schedule(): boolean {
    if (!hasActiveQuery()) {
      pending = false
      clearTimer()
      return false
    }
    pending = true
    armTimer()
    return true
  }

  function flushNow(): boolean {
    clearTimer()
    if (!pending) return false
    if (!hasActiveQuery()) {
      pending = false
      return false
    }
    if (getIsComposing()) {
      armTimer()
      return false
    }
    pending = false
    runRefresh()
    return true
  }

  function cancel(): void {
    pending = false
    clearTimer()
  }

  return {
    schedule,
    flushNow,
    cancel,
    hasPending: () => pending,
  }
}
