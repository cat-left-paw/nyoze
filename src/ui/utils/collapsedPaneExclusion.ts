/**
 * PANE-COLLAPSED-TAB-FOCUS1: 閉じた左右ペインの subtree を Tab / pointer /
 * accessibility tree から除外し、閉じた瞬間にそのペイン内へ残った focus だけを
 * 可視の pane toggle へ移す。
 *
 * 汎用 focus framework ではない。判定は呼び出し時点の live 値だけで、
 * timer / polling / rAF / microtask は持たない。
 */

export type InertTarget = {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

export type FocusRescueNode = {
  contains(other: unknown): boolean
}

export type FocusRescueFallback = {
  readonly isConnected: boolean
  focus(options?: FocusOptions): void
}

export type FocusRescueActive = {
  blur(): void
} | null

export type CollapsedPaneFocusRescueInput = {
  readonly collapsed: boolean
  readonly pane: FocusRescueNode | null
  readonly fallback: FocusRescueFallback | null
  readonly activeElement: unknown
  readonly windowFocused: boolean
}

export type CollapsedPaneFocusRescueDecision =
  | {
      readonly action: 'skip'
      readonly reason:
        | 'pane-open'
        | 'pane-missing'
        | 'window-blurred'
        | 'focus-not-inside-pane'
    }
  | { readonly action: 'move-to-fallback' }
  | { readonly action: 'blur-active' }

export function syncSubtreeInert(el: InertTarget | null, inert: boolean): void {
  if (!el) return
  if (inert) el.setAttribute('inert', '')
  else el.removeAttribute('inert')
}

export function planCollapsedPaneFocusRescue(
  input: CollapsedPaneFocusRescueInput,
): CollapsedPaneFocusRescueDecision {
  if (!input.collapsed) return { action: 'skip', reason: 'pane-open' }
  if (!input.pane) return { action: 'skip', reason: 'pane-missing' }
  if (!input.windowFocused) return { action: 'skip', reason: 'window-blurred' }
  if (!input.activeElement || !input.pane.contains(input.activeElement)) {
    return { action: 'skip', reason: 'focus-not-inside-pane' }
  }
  if (input.fallback && input.fallback.isConnected) {
    return { action: 'move-to-fallback' }
  }
  return { action: 'blur-active' }
}

export function applyCollapsedPaneFocusRescue(
  decision: CollapsedPaneFocusRescueDecision,
  fallback: FocusRescueFallback | null,
  activeElement: FocusRescueActive,
): void {
  if (decision.action === 'move-to-fallback') {
    fallback?.focus({ preventScroll: true })
    return
  }
  if (decision.action === 'blur-active') {
    activeElement?.blur()
  }
}

export function applyCollapsedPaneExclusion(input: {
  collapsed: boolean
  pane: (InertTarget & FocusRescueNode) | null
  fallback: FocusRescueFallback | null
  activeElement: (FocusRescueActive & object) | null
  windowFocused: boolean
}): CollapsedPaneFocusRescueDecision {
  const decision = planCollapsedPaneFocusRescue({
    collapsed: input.collapsed,
    pane: input.pane,
    fallback: input.fallback,
    activeElement: input.activeElement,
    windowFocused: input.windowFocused,
  })
  applyCollapsedPaneFocusRescue(decision, input.fallback, input.activeElement)
  syncSubtreeInert(input.pane, input.collapsed)
  return decision
}
