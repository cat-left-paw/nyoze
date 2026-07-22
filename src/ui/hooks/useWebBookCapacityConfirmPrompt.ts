import { useCallback, useRef, useState } from 'react'
import type { WebBookCapacityReport } from '../../../electron/webBookCapacity'

export type WebBookCapacityConfirmDecision =
  | { action: 'continue' }
  | { action: 'switch-to-package' }
  | { action: 'cancel' }

/**
 * WB-IMG-3A: soft capacity confirmation before Save / folder dialog.
 * Same Promise request/resolve pattern as export options / save failure.
 */
export function useWebBookCapacityConfirmPrompt() {
  const [capacity, setCapacity] = useState<WebBookCapacityReport | null>(null)
  const resolverRef = useRef<((decision: WebBookCapacityConfirmDecision) => void) | null>(null)

  const requestCapacityConfirm = useCallback(
    (report: WebBookCapacityReport): Promise<WebBookCapacityConfirmDecision> =>
      new Promise((resolve) => {
        resolverRef.current?.({ action: 'cancel' })
        resolverRef.current = resolve
        setCapacity(report)
      }),
    [],
  )

  const resolveCapacityConfirm = useCallback((decision: WebBookCapacityConfirmDecision) => {
    setCapacity(null)
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(decision)
  }, [])

  const cancelCapacityConfirm = useCallback(() => {
    resolveCapacityConfirm({ action: 'cancel' })
  }, [resolveCapacityConfirm])

  return {
    capacity,
    requestCapacityConfirm,
    resolveCapacityConfirm,
    cancelCapacityConfirm,
  }
}
