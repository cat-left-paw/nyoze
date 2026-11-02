import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_EXPERIMENTAL_INPUT_SURFACE_PREEDIT_DISPLAY } from '../../settings/defaults'
import { normalizeExperimentalInputSurfacePreeditDisplay } from '../../settings/inputSurfacePreeditDisplay'
import { loadSettingsJson, patchSettingsJson } from '../../settings/storage'
import type { ExperimentalInputSurfacePreeditDisplay } from '../../settings/types'

/**
 * PIS-S10-PREEDIT-DISPLAY1: 長文編集モード（PIS）の、変換中の文字の表示の設定を`settings.json`から読み書きする。
 *
 * - 読み込みの前・fresh profile・不正値は既定の`inline`（押し出す）。
 * - 利用者が変えたとき（「表示設定をリセット」を含む）だけ保存する。読み込んだ値を書き戻さない。
 * - 入力面へ値を渡すのは製品の入口のhook（`useInputSurfaceProductEntry`）。ここは値と保存だけ。
 */
export function useExperimentalInputSurfacePreeditDisplaySetting() {
  const [experimentalInputSurfacePreeditDisplay, setValue] =
    useState<ExperimentalInputSurfacePreeditDisplay>(DEFAULT_EXPERIMENTAL_INPUT_SURFACE_PREEDIT_DISPLAY)
  // 読み込みより先に利用者が変えた場合は、読み込んだ値で上書きしない。
  const [changedByUser, setChangedByUser] = useState(false)

  useEffect(() => {
    if (changedByUser) return
    let cancelled = false
    void loadSettingsJson().then((settings) => {
      if (cancelled || !settings) return
      setValue(normalizeExperimentalInputSurfacePreeditDisplay(settings.experimentalInputSurfacePreeditDisplay))
    })
    return () => { cancelled = true }
  }, [changedByUser])

  const setExperimentalInputSurfacePreeditDisplay = useCallback((next: ExperimentalInputSurfacePreeditDisplay) => {
    const value = normalizeExperimentalInputSurfacePreeditDisplay(next)
    setChangedByUser(true)
    setValue(value)
    void patchSettingsJson({ experimentalInputSurfacePreeditDisplay: value })
  }, [])

  return { experimentalInputSurfacePreeditDisplay, setExperimentalInputSurfacePreeditDisplay }
}
