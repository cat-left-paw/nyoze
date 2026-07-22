import { useCallback, useRef, useState } from 'react'
import {
  DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION,
  type ExternalExportFormat,
  type ExternalExportOptionsScope,
  type ExternalExportOptionsSelection,
} from '../../settings/externalExportOptionsDefaults'

export {
  DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION,
  type CommonExternalExportOptionsSelection,
  type ExternalExportFormat,
  type ExternalExportOptionsScope,
  type ExternalExportOptionsSelection,
} from '../../settings/externalExportOptionsDefaults'

export type ExternalExportOptionsPromptState = {
  scope: ExternalExportOptionsScope
  format: ExternalExportFormat
}

/**
 * active document export (LeME / でんでん / 青空文庫風) と Book 全体 export の
 * options 確認 UI 用の open/resolve 状態。Save failure modal 等と同じ
 * 「request が Promise を返し、モーダル側が resolve する」パターンで、
 * scope / format ごとに個別の state を持たず 1 つの pending request だけを扱う
 * （新しい request は前回の pending request を `null` で解決してから開始する）。
 */
export function useExternalExportOptionsPrompt(options?: {
  resolveInitialSelection?: (
    prompt: ExternalExportOptionsPromptState,
  ) => ExternalExportOptionsSelection
}) {
  const resolveInitialSelection = options?.resolveInitialSelection
  const [prompt, setPrompt] = useState<ExternalExportOptionsPromptState | null>(null)
  const resolverRef = useRef<((selection: ExternalExportOptionsSelection | null) => void) | null>(
    null,
  )

  const requestExportOptions = useCallback(
    (
      scope: ExternalExportOptionsScope,
      format: ExternalExportFormat,
    ): Promise<ExternalExportOptionsSelection | null> =>
      new Promise((resolve) => {
        resolverRef.current?.(null)
        resolverRef.current = resolve
        setPrompt({ scope, format })
      }),
    [],
  )

  const confirmExportOptions = useCallback((selection: ExternalExportOptionsSelection) => {
    setPrompt(null)
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(selection)
  }, [])

  const cancelExportOptions = useCallback(() => {
    setPrompt(null)
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(null)
  }, [])

  const getInitialSelection = useCallback(
    (state: ExternalExportOptionsPromptState) =>
      resolveInitialSelection?.(state) ?? DEFAULT_EXTERNAL_EXPORT_OPTIONS_SELECTION,
    [resolveInitialSelection],
  )

  return {
    prompt,
    requestExportOptions,
    confirmExportOptions,
    cancelExportOptions,
    getInitialSelection,
  }
}
