import type { createUiTextGetter } from '../i18n/uiText'
import type { ProjectUnregisterState } from '../hooks/useProjectUnregister'
import { ProjectUnregisterConfirmModal } from './ProjectUnregisterConfirmModal'

type TextGetter = ReturnType<typeof createUiTextGetter>

type ProjectUnregisterControlsProps = {
  unregisterState: ProjectUnregisterState
  t: TextGetter
  onCancelUnregister: () => void
  onConfirmUnregister: () => void
}

/**
 * 作品登録解除の確認 modal。trigger は ProjectTitleEditor の edit form 内。
 */
export function ProjectUnregisterControls({
  unregisterState,
  t,
  onCancelUnregister,
  onConfirmUnregister,
}: ProjectUnregisterControlsProps) {
  const open =
    unregisterState.kind === 'confirming' || unregisterState.kind === 'unregistering'
  const busy = unregisterState.kind === 'unregistering'

  return (
    <ProjectUnregisterConfirmModal
      open={open}
      busy={busy}
      t={t}
      onConfirm={onConfirmUnregister}
      onCancel={onCancelUnregister}
    />
  )
}
