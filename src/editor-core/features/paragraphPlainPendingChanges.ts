export type ParagraphPlainPendingChangesListener = (pending: boolean) => void

/** Notification only. Every decision still reads the controller's synchronous probe. */
export function createParagraphPlainPendingChangesNotifier(read: () => boolean) {
  let previous = false
  const listeners = new Set<ParagraphPlainPendingChangesListener>()
  return {
    check() {
      const next = read()
      if (next === previous) return
      previous = next
      for (const listener of listeners) listener(next)
    },
    subscribe(listener: ParagraphPlainPendingChangesListener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    clear() { listeners.clear() },
  }
}
