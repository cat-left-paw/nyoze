import type { EditorView } from '@tiptap/pm/view'

type PendingDomObserver = {
  flush?: () => void
}

export type LocalImePendingDomFlushResult =
  | { ok: true }
  | { ok: false; reason: 'stale-before' | 'capability-unavailable' | 'flush-threw' | 'stale-after' }

/**
 * Local Window の close 直前にだけ使う ProseMirror 内部依存 adapter。
 *
 * observer の稼働状態は変えず、flush 前後の local view identity が current の
 * 場合だけ成功する。legacy paragraph overlay の lifecycle は持たない。
 */
export function flushLocalImePendingDomChanges(input: {
  view: EditorView
  validateSource: () => boolean
  /** nonpackaged E2E only。adapter呼出中へ実PM transactionを決定注入する。 */
  beforeFlushForTest?: () => void
}): LocalImePendingDomFlushResult {
  if (!input.validateSource()) return { ok: false, reason: 'stale-before' }
  const observer = (input.view as unknown as { domObserver?: PendingDomObserver }).domObserver
  if (!observer || typeof observer.flush !== 'function') {
    return { ok: false, reason: 'capability-unavailable' }
  }
  try {
    input.beforeFlushForTest?.()
    observer.flush.call(observer)
  } catch {
    return { ok: false, reason: 'flush-threw' }
  }
  if (!input.validateSource()) return { ok: false, reason: 'stale-after' }
  return { ok: true }
}
