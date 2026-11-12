import type { SurfaceRecord } from './inputSurface'

export type HostFocusPermission =
  | 'pointer-primary' | 'pointer-shift' | 'context-menu' | 'i7-gesture-input'
  | 'i8-shift-tab' | 'i8-modifier-navigation' | 'i8-modifier-delete'

export type ContextMenuFocusOwner = 'body' | 'host' | 'surface' | 'menu' | 'other-ui'

/** 明示close時の空いたfocusだけを取得する。別UIのfocusはそのUIに残す。 */
export function shouldRestoreContextMenuFocus(owner: ContextMenuFocusOwner): boolean {
  return owner === 'body' || owner === 'host' || owner === 'surface' || owner === 'menu'
}

export type EditorFocusRestoreTarget = 'surface' | 'host' | 'none'

/**
 * PIS-SETTINGS-FOCUS-RETURN1: modal を閉じて、開く前の focus（入力面）へ戻すときの戻し先。
 * modal を開いている間に入力の方式が従来の入力（Host）へ変わった場合、入力面は使えないので Host の本文へ戻す。
 * どちらにも戻せないとき（Source Mode・段落プレーン編集・read-only・変換中など）は `none`（呼び出し側が従来どおりに扱う）。
 */
export function resolveEditorFocusRestoreTarget(input: { surfaceEligible: boolean; hostEligible: boolean; composing: boolean }): EditorFocusRestoreTarget {
  if (input.surfaceEligible) return 'surface'
  if (input.hostEligible && !input.composing) return 'host'
  return 'none'
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
