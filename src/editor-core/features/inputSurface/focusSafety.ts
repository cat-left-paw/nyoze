import type { SurfaceRecord } from './inputSurface'

export type HostFocusPermission =
  | 'pointer-primary' | 'pointer-shift' | 'context-menu' | 'i7-gesture-input'
  | 'i8-shift-tab' | 'i8-modifier-navigation' | 'i8-modifier-delete'

export type ContextMenuFocusOwner = 'body' | 'host' | 'surface' | 'menu' | 'other-ui'

/** 明示close時の空いたfocusだけを取得する。別UIのfocusはそのUIに残す。 */
export function shouldRestoreContextMenuFocus(owner: ContextMenuFocusOwner): boolean {
  return owner === 'body' || owner === 'host' || owner === 'surface' || owner === 'menu'
}

/** 許可は同期focus呼び出しの間だけ存在する。状態名から許可を推測しない。 */
export function createHostFocusPermissions(record: SurfaceRecord) {
  let pending: HostFocusPermission | null = null
  return {
    run(reason: HostFocusPermission, focus: () => void) {
      if (pending) throw new Error('reentrant host focus permission')
      pending = reason
      record('host-focus-permission', { reason })
      try { focus() } finally { pending = null }
    },
    consume() {
      const permission = pending
      pending = null
      if (permission) record('host-focus-permitted', { reason: permission })
      return permission
    },
  }
}

export function judgeHostFocus(input: { permitted: boolean; eligible: boolean; surfaceComposing: boolean; hostComposing: boolean }): 'allow' | 'record-composition' | 'restore' {
  if (!input.eligible) return 'allow'
  if (input.surfaceComposing || input.hostComposing) return 'record-composition'
  if (input.permitted) return 'allow'
  return 'restore'
}
