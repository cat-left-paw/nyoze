import { useCallback, useEffect, useRef, useState } from 'react'
import { readInputStrategyCapability } from '../../editor-core/features/inputSurface/inputPathRuntime'
import { loadSettingsJson, patchSettingsJson } from '../../settings/storage'

/** PIS-DEFAULT-ON1: 初期値はmainの同期読み取り。操作した値だけを保存する。 */
export function useClassicInputSetting() {
  const [classicInputEnabled, setValue] = useState(() => readInputStrategyCapability().startupClassicInputEnabled === true)
  const changedByUser = useRef(false)
  useEffect(() => {
    let cancelled = false
    void loadSettingsJson().then(settings => {
      if (!cancelled && !changedByUser.current && settings) setValue(settings.classicInputEnabled === true)
    })
    return () => { cancelled = true }
  }, [])
  const setClassicInputEnabled = useCallback((value: boolean) => {
    changedByUser.current = true
    setValue(value === true)
    void patchSettingsJson({ classicInputEnabled: value === true })
  }, [])
  const setInputSurfaceEnabled = useCallback((next: boolean) => setClassicInputEnabled(!next), [setClassicInputEnabled])
  return { classicInputEnabled, setClassicInputEnabled, setInputSurfaceEnabled }
}
