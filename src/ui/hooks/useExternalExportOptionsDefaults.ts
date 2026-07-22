import { useCallback, useEffect, useState } from 'react'
import {
  getExternalExportOptionsInitialSelection,
  normalizeExternalExportOptionsDefaults,
  setExternalExportOptionsDefault,
  type ExternalExportOptionsDefaultsStore,
  type ExternalExportFormat,
  type ExternalExportOptionsScope,
  type ExternalExportOptionsSelection,
} from '../../settings/externalExportOptionsDefaults'
import { loadSettingsJson, patchSettingsJson } from '../../settings/storage'

/**
 * 外部書き出し options 確認 modal の scope × format 別既定値を
 * `settings.json` から読み書きする。Confirm 時に保存し、次回 modal の
 * 初期選択へ復元する（export 成否には依存しない）。
 */
export function useExternalExportOptionsDefaults() {
  const [store, setStore] = useState<ExternalExportOptionsDefaultsStore>({})

  useEffect(() => {
    let cancelled = false
    void loadSettingsJson().then((settings) => {
      if (cancelled || !settings) return
      setStore(normalizeExternalExportOptionsDefaults(settings.externalExportOptionsDefaults))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const getInitialSelection = useCallback(
    (scope: ExternalExportOptionsScope, format: ExternalExportFormat) =>
      getExternalExportOptionsInitialSelection(store, scope, format),
    [store],
  )

  const saveDefault = useCallback(
    (
      scope: ExternalExportOptionsScope,
      format: ExternalExportFormat,
      selection: ExternalExportOptionsSelection,
    ) => {
      setStore((current) => {
        const next = setExternalExportOptionsDefault(current, scope, format, selection)
        void patchSettingsJson({ externalExportOptionsDefaults: next })
        return next
      })
    },
    [],
  )

  return { store, getInitialSelection, saveDefault }
}
