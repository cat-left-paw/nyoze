import type { LogEntry } from '../../editor-core/types'

type UseImePhaseBRubySuspendOptions = {
  enabled: boolean
  rubyVisible: boolean
}

type UseImePhaseBRubySuspendResult = {
  handleCoreLog: (entry: LogEntry) => void
  forceResumeRuby: (reason: string) => void
  isRubySuspendedDuringComposition: boolean
}

const noop = () => {}

/**
 * Phase B: ruby-suspend during IME composition.
 *
 * This feature (hiding ruby text while composing) was found to corrupt Chromium's
 * IME session on compositionstart by triggering a React re-render of the editor
 * subtree. The UX was also unwanted (ruby flickering on every keystroke).
 *
 * The hook is kept as a no-op to preserve the call-site interface and the debug
 * setting in settings.json, but it never mutates state or causes re-renders.
 */
export function useImePhaseBRubySuspend(
  options: UseImePhaseBRubySuspendOptions,
): UseImePhaseBRubySuspendResult {
  void options
  return {
    handleCoreLog: noop,
    forceResumeRuby: noop,
    isRubySuspendedDuringComposition: false,
  }
}
