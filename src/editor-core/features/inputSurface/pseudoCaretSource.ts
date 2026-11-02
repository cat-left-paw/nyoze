import type { OwnerCaretGeometry } from './editOwner'
import type { SurfaceState } from './surfaceState'

/** 表示だけのsource。PM state・DOM selection・入力のownershipを変更しない。 */
export type InputSurfacePseudoCaretGeometrySource = {
  kind: 'input-surface'
  generation: number
  documentIdentity: string
  surface: HTMLElement
  focusRoot: HTMLElement
  writingMode: string
  composing: boolean
  geometry: 'owner-caret' | 'dom-caret'
  caretRect(): OwnerCaretGeometry | null
  /** 同じ表示callback内で読む。返す位置writeを後へqueueしない。 */
  preparePendingEmptyPlacement?(): (() => void) | null
}

export function isInputSurfacePseudoCaretLive(input: {
  enabled: boolean
  eligible: boolean
  documentFocused: boolean
  surfaceFocused: boolean
  connected: boolean
  state: SurfaceState
  composing: boolean
}): boolean {
  return input.enabled && input.eligible && input.documentFocused && input.surfaceFocused && input.connected &&
    (input.state === 'surface' || (input.state === 'surface-range' && input.composing))
}
