/**
 * OVERLAY-STATUS1 / LOCAL-WINDOW-PRODUCT-LABEL-STATUS1:
 * 左ペイン下部の文字数付近へ出す、長文編集モードの控えめな状態表示。
 *
 * 診断 HUD ではない。off / ready / editing を小さな icon と tooltip で示し、
 * hidden（unavailable / recovery / Kill / breaker / 制御面非表示）では DOM 自体を出さない。
 * tooltip は native `title` ではなく既存 `useFloatingTooltip`（toolbar chip と同見た目）。
 * クリック可能な第二toggleではない。
 */

import { IconFlaskOff, IconPencil, IconPencilOff } from '@tabler/icons-react'
import type { UiLanguageMode } from '../../settings/types'
import type { LocalImeLocalEditingPresentationSource } from '../../editor-core/features/localImeLocalEditingPresentationStatus'
import { resolveLocalImeLocalEditingPresentationStatus } from '../../editor-core/features/localImeLocalEditingPresentationStatus'
import { createUiTextGetter } from '../i18n/uiText'
import { useFloatingTooltip } from '../hooks/useFloatingTooltip'
import { useLocalImeLocalEditingStatus } from '../hooks/useLocalImeLocalEditingStatus'
import { PaneTablerIcon } from './PaneTablerIcon'

export function LocalImeLocalEditingStatusIcon({
  uiLanguageMode,
  presentationSource,
}: {
  uiLanguageMode: UiLanguageMode
  presentationSource: LocalImeLocalEditingPresentationSource
}) {
  const coarseStatus = useLocalImeLocalEditingStatus()
  const status = resolveLocalImeLocalEditingPresentationStatus({
    ...presentationSource,
    coarseStatus,
  })
  const t = createUiTextGetter(uiLanguageMode)
  const label =
    status === 'hidden'
      ? ''
      : status === 'off'
        ? t('localImeExperimentalPreview.status.off')
        : status === 'ready'
          ? t('localImeExperimentalPreview.status.ready')
          : t('localImeExperimentalPreview.status.editing')
  const { anchorProps, tooltip } = useFloatingTooltip(label)

  if (status === 'hidden') return null

  const icon =
    status === 'off' ? IconFlaskOff : status === 'ready' ? IconPencilOff : IconPencil

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
