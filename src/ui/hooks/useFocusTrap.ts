import { useLayoutEffect, useRef } from 'react'
import { getInputSurfaceFocusPort, isInputSurfaceFocusOwner } from '../../editor-core/features/inputSurface/focusOwner'
import type { RefObject } from 'react'

/**
 * BETA-A11Y1: Selector for elements that can receive keyboard focus.
 * Exported for testing.
 */
export const FOCUSABLE_SELECTOR =
  'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'

export function computeInitialFocusTargetIndex(
  focusableCount: number,
  activeInsideTrap: boolean,
): number {
  if (focusableCount === 0) return -1
  if (activeInsideTrap) return -1
  return 0
}

export function computeFocusTrapTargetIndex(
  focusableCount: number,
  activeIndex: number,
  shiftKey: boolean,
): number {
  if (focusableCount === 0) return -1
  const first = 0
  const last = focusableCount - 1
  if (shiftKey) {
    return activeIndex === first ? last : -1
  }
  return activeIndex === last ? first : -1
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.offsetParent !== null)
}

/**
 * BETA-A11Y1: Trap Tab / Shift+Tab within a container element.
 *
 * - While disabled: tracks the last focused element outside the trap.
 * - On enable: if focus is still outside the modal, moves it to the first
 *   focusable child (while respecting autoFocus that already moved it inside).
 * - Tab / Shift+Tab cycles among focusable children.
 * - On unmount: restores previously focused element.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const lastFocusedWhileDisabledRef = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (enabled) return

    const updateLastFocused = (target: EventTarget | null): void => {
      if (target instanceof HTMLElement) {
        // React autoFocusはlayout effectのcleanupより先に発火することがある。
        // 入力面から開くmodalでは、trap内のinputを復帰先へ上書きしない。
        if (isInputSurfaceFocusOwner(lastFocusedWhileDisabledRef.current) && containerRef.current?.contains(target)) return
        lastFocusedWhileDisabledRef.current = target
      }
    }

    updateLastFocused(document.activeElement)

    function onFocusIn(event: FocusEvent): void {
      // 同期安全網がnested focusinで入力面へ戻した後、外側のHost eventが続く。
      // その古いtargetで実際のopenerを上書きしない。
      updateLastFocused(isInputSurfaceFocusOwner(document.activeElement) ? document.activeElement : event.target)
    }

    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [containerRef, enabled])

  useLayoutEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const activeInsideTrap = activeElement ? container.contains(activeElement) : false
    previousFocusRef.current = activeInsideTrap
      ? lastFocusedWhileDisabledRef.current
      : activeElement

    const focusable = getFocusableElements(container)
    const targetIndex = computeInitialFocusTargetIndex(
      focusable.length,
      activeInsideTrap,
    )
    if (targetIndex >= 0) {
      focusable[targetIndex]?.focus()
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Tab') return
      const liveContainer = containerRef.current
      if (!liveContainer) return

      const focusable = getFocusableElements(liveContainer)

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const activeIndex =
        document.activeElement instanceof HTMLElement
          ? focusable.indexOf(document.activeElement)
          : -1
      const targetIndex = computeFocusTrapTargetIndex(
        focusable.length,
        activeIndex,
        event.shiftKey,
      )
      if (targetIndex >= 0) {
        event.preventDefault()
        focusable[targetIndex]?.focus()
      }
    }

    container?.addEventListener('keydown', onKeyDown)

    return () => {
      container?.removeEventListener('keydown', onKeyDown)
      const prev = previousFocusRef.current
      if (prev?.isConnected) {
        // 元の focus が入力面なら、いまの入力の方式の持ち主へ戻す（PIS-SETTINGS-FOCUS-RETURN1。
        // 設定で従来の入力へ切り替えて閉じたとき、使えない入力面へ focus して BODY へ落ちていた）。
        const port = isInputSurfaceFocusOwner(prev) ? getInputSurfaceFocusPort(prev) : null
        if (!port || port.restoreEditorFocus() === 'none') prev.focus()
      }
    }
  }, [containerRef, enabled])
}
