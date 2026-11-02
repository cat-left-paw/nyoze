import type { Dispatch, SetStateAction } from 'react'

type FileTab = { filePath: string | null; internalDocId?: string }

export function openDocumentPaths(tabs: readonly FileTab[]): string[] {
  return [...new Set(tabs.flatMap(tab => tab.filePath && !tab.internalDocId ? [tab.filePath] : []))]
}

/**
 * Resolve updates outside React's replayable updater. Report synchronously before
 * returning to callers, including a caller that switches libraries in the same task.
 * Content-only updates do not send IPC or read filesystem layout.
 */
export function createOpenDocumentTabState<T extends FileTab>(
  initial: T[],
  report: (paths: string[]) => void,
  publish: (tabs: T[]) => void,
): { set: Dispatch<SetStateAction<T[]>>; reportCurrent: () => void; read: () => T[] } {
  let current = initial
  let signature = JSON.stringify(openDocumentPaths(initial))
  return {
    set(update) {
      const next = typeof update === 'function' ? update(current) : update
      const paths = openDocumentPaths(next)
      const nextSignature = JSON.stringify(paths)
      if (nextSignature !== signature) {
        report(paths)
        signature = nextSignature
      }
      current = next
      publish(next)
    },
    read: () => current,
    reportCurrent() { report(openDocumentPaths(current)) },
  }
}
