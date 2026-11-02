/** Display-only batching. Document actions explicitly flush; timers grant no authority. */
export function createCoreUiSyncGate(readOptions: () => {
  enabled: boolean
  minSyncIntervalMs: number
  onFullSync(): number | undefined
  onLightSync(): boolean | void
  onDeferredSyncStart?(): void
}, clock = {
  now: () => performance.now(),
  schedule: (run: () => void, delay: number) => setTimeout(run, delay),
  cancel: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
}) {
  const isComposingRef = { current: false }
  let pending = false, destroyed = false, lastLight = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let epoch = 0
  const cancel = () => {
    epoch++
    if (timer !== null) clock.cancel(timer)
    timer = null
  }
  const flush = (reason: string) => {
    void reason
    cancel()
    if (!pending || destroyed) return undefined
    pending = false
    return readOptions().onFullSync()
  }
  const schedule = (delay: number) => {
    cancel()
    const expected = epoch
    timer = clock.schedule(() => {
      if (epoch !== expected || destroyed || isComposingRef.current) return
      timer = null
      flush('display-idle')
    }, delay)
  }
  const defer = () => {
    if (pending) return
    pending = true
    readOptions().onDeferredSyncStart?.()
  }
  return {
    isComposingRef,
    hasPending: () => pending,
    flush,
    activate() { destroyed = false },
    compositionStart() {
      cancel()
      isComposingRef.current = true
      lastLight = clock.now()
    },
    compositionEnd() {
      isComposingRef.current = false
      // Wait for EditorCore / PM composition microtasks, as in Phase A.
      if (readOptions().enabled || pending) schedule(0)
    },
    update(docChanged = true) {
      if (destroyed) return
      const options = readOptions()
      // setEditable and other lifecycle notifications are not input edits.
      if (!docChanged) { cancel(); pending = false; options.onFullSync(); return }
      if (isComposingRef.current) {
        if (!options.enabled) { cancel(); pending = false; options.onFullSync(); return }
        defer()
        const interval = Number.isFinite(options.minSyncIntervalMs)
          ? Math.min(500, Math.max(300, Math.round(options.minSyncIntervalMs))) : 400
        if (clock.now() - lastLight < interval) return
        lastLight = clock.now()
        options.onLightSync()
        return
      }
      if (options.onLightSync() === false) {
        cancel()
        pending = false
        options.onFullSync()
        return
      }
      defer()
      schedule(400)
    },
    destroy() { destroyed = true; pending = false; cancel() },
  }
}
