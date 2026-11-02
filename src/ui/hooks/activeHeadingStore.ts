import type { SetStateAction } from 'react'

/** One view-only value; only the two outline consumers subscribe to it. */
export function createActiveHeadingStore() {
  let value = -1
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(update: SetStateAction<number>) {
      const next = typeof update === 'function' ? update(value) : update
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
  }
}
export type ActiveHeadingStore = ReturnType<typeof createActiveHeadingStore>
