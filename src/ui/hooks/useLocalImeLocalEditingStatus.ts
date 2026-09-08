/**
 * OVERLAY-STATUS1: 局所入力の製品向け coarse status だけを購読する薄い hook。
 *
 * 責務境界:
 * - runtime が `hidden | ready | editing` へ射影し、変化したときだけ通知する。
 * - この hook は coarse status だけを購読する。HUD / perf snapshot、PM 本文、
 *   selection、geometry は購読しない。
 * - timer / polling / observer / rAF / animation は持たない。
 * - paragraph 数 / identity を知らないので、将来の Local Editing Window でも
 *   同じ hook を使える。
 */

import { useEffect, useState } from 'react'
import {
  getLocalImeLocalEditingStatus,
  subscribeLocalImeLocalEditingStatus,
} from '../../editor-core/features/localImePilotRuntime'
import type { LocalImeLocalEditingStatus } from '../../editor-core/features/localImeLocalEditingStatusState'

export function useLocalImeLocalEditingStatus(): LocalImeLocalEditingStatus {
  const [status, setStatus] = useState<LocalImeLocalEditingStatus>(
    getLocalImeLocalEditingStatus,
  )

  useEffect(() => {
    setStatus(getLocalImeLocalEditingStatus())
    return subscribeLocalImeLocalEditingStatus(setStatus)
  }, [])

  return status
}
