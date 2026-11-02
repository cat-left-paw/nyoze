/**
 * OVERLAY-STATUS1 / LOCAL-WINDOW-PRODUCT-LABEL-STATUS1:
 * 左ペイン下部の文字数付近へ出す、長文編集モードの控えめな状態表示。
 *
 * 診断 HUD ではない。off / ready / editing を小さな icon と tooltip で示し、
 * hidden（unavailable / recovery / Kill / breaker / 制御面非表示）では DOM 自体を出さない。
 * tooltip は native `title` ではなく既存 `useFloatingTooltip`（toolbar chip と同見た目）。
 * クリック可能な第二toggleではない。
 *
 * PIS-S10-ENTRY-UI1（D9）: 製品の入口がPISの起動では off / on の2状態。確定できなかった文字が
 * 入力面に残っている間は出さない（入力面の通知が正本）。Local Windowの経路の投影は変えない。
 */

import { useSyncExternalStore } from 'react'
import { IconFlask, IconFlaskOff, IconPencil, IconPencilOff } from '@tabler/icons-react'
import type { UiLanguageMode } from '../../settings/types'
import type { LocalImeLocalEditingPresentationSource } from '../../editor-core/features/localImeLocalEditingPresentationStatus'
import { resolveLocalImeLocalEditingPresentationStatus } from '../../editor-core/features/localImeLocalEditingPresentationStatus'
import { getInputSurfaceNoticeSnapshot, subscribeInputSurfaceNotice } from '../../editor-core/features/inputSurface/documentAction'
import { readInputStrategyCapability } from '../../editor-core/features/inputSurface/inputPathRuntime'
import { createUiTextGetter } from '../i18n/uiText'
import { useFloatingTooltip } from '../hooks/useFloatingTooltip'
import { useLocalImeLocalEditingStatus } from '../hooks/useLocalImeLocalEditingStatus'
import { PaneTablerIcon } from './PaneTablerIcon'

const noSubscription = () => () => {}

export function LocalImeLocalEditingStatusIcon({
  uiLanguageMode,
  presentationSource,
}: {
  uiLanguageMode: UiLanguageMode
  presentationSource: LocalImeLocalEditingPresentationSource
}) {
  const coarseStatus = useLocalImeLocalEditingStatus()
  // 方式は起動のあいだ変わらない。PISのときだけ入力面の通知（同期の事実）を購読する。
  const productStrategy = readInputStrategyCapability().productStrategy
  const pis = productStrategy === 'input-surface'
  const inputSurfaceRetained = useSyncExternalStore(
    pis ? subscribeInputSurfaceNotice : noSubscription,
    () => pis && getInputSurfaceNoticeSnapshot().kind === 'retained',
    () => false,
  )
  const status = resolveLocalImeLocalEditingPresentationStatus({
    ...presentationSource,
    coarseStatus,
    productStrategy,
    inputSurfaceRetained,
  })
  const t = createUiTextGetter(uiLanguageMode)
  const label =
    status === 'hidden'
      ? ''
      : status === 'off'
        ? t('localImeExperimentalPreview.status.off')
        : status === 'on'
          ? t('localImeExperimentalPreview.status.on')
          : status === 'ready'
            ? t('localImeExperimentalPreview.status.ready')
            : t('localImeExperimentalPreview.status.editing')
  const { anchorProps, tooltip } = useFloatingTooltip(label)

  if (status === 'hidden') return null

  const icon =
    status === 'off' ? IconFlaskOff : status === 'on' ? IconFlask : status === 'ready' ? IconPencilOff : IconPencil

  return (
    <>
      <span
        className={`file-explorer-local-ime-status is-${status}`}
        data-testid="local-ime-local-editing-status"
        data-status={status}
        role="img"
        aria-label={label}
        {...anchorProps}
      >
        <PaneTablerIcon icon={icon} size="xs" />
      </span>
      {tooltip}
    </>
  )
}
