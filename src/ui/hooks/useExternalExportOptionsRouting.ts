import { useCallback } from 'react'
import { getExternalExportOptionsInitialSelection } from '../../settings/externalExportOptionsDefaults'
import { useExternalExportOptionsDefaults } from './useExternalExportOptionsDefaults'
import {
  useExternalExportOptionsPrompt,
  type ExternalExportFormat,
  type ExternalExportOptionsSelection,
} from './useExternalExportOptionsPrompt'

/**
 * `useExternalExportOptionsPrompt()` を 1 つだけ生成し、active document export
 * (LeME / でんでん / 青空文庫風) と Book export のそれぞれが使う、scope 済みの
 * request 関数へ bind する。両者とも `format` はそれぞれの呼び出し hook 内部で
 * 決め打ちにするため、ここでは scope ごとに 1 つずつの関数があれば足りる。
 * `App.tsx` の配線を薄く保つための routing 用 hook。
 *
 * Confirm 時は scope + format 別の選択値を `settings.json` へ保存する。
 * Cancel では保存しない。保存は export 成否に依存しない（modal Confirm は
 * 「この option で書き出す」意思表示のため）。
 */
export function useExternalExportOptionsRouting() {
  const { store, saveDefault } = useExternalExportOptionsDefaults()

  const resolveInitialSelection = useCallback(
    (prompt: { scope: 'document' | 'book'; format: ExternalExportFormat }) =>
      getExternalExportOptionsInitialSelection(store, prompt.scope, prompt.format),
    [store],
  )

  const {
    prompt,
    requestExportOptions,
    confirmExportOptions,
    cancelExportOptions,
    getInitialSelection,
  } = useExternalExportOptionsPrompt({ resolveInitialSelection })

  const confirmExportOptionsWithPersist = useCallback(
    (selection: ExternalExportOptionsSelection) => {
      const current = prompt
      confirmExportOptions(selection)
      if (current) {
        saveDefault(current.scope, current.format, selection)
      }
    },
    [confirmExportOptions, prompt, saveDefault],
  )

  const requestDocumentExportOptions = useCallback(
    (format: ExternalExportFormat) => requestExportOptions('document', format),
    [requestExportOptions],
  )
  const requestBookExportOptions = useCallback(
    (format: ExternalExportFormat) => requestExportOptions('book', format),
    [requestExportOptions],
  )

  return {
    prompt,
    resolveInitialSelection: getInitialSelection,
    confirmExportOptions: confirmExportOptionsWithPersist,
    cancelExportOptions,
    requestDocumentExportOptions,
    requestBookExportOptions,
  }
}
