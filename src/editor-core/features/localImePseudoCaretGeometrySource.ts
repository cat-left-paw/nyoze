import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { resolveSupportedEditorWritingMode } from './writingModeNavigationMapping'

/**
 * Local Window がpseudo caretのsourceとして有効なmodeだけ。
 * `closing` / `recovery-required` / `off` はここに含めない — これらは
 * LOCAL-WINDOW-PSEUDOCARET1 の契約により native caret へ必ず戻す。
 */
export type LocalImeLocalWindowPseudoCaretGeometrySourceMode =
  | 'active-clean'
  | 'active-dirty'
  | 'composing'

export type LocalImeLocalWindowPseudoCaretGeometrySource = {
  kind: 'local-ime-local-window'
  mode: LocalImeLocalWindowPseudoCaretGeometrySourceMode
  generation: number
  documentIdentity: string
  writingMode: string
  surface: HTMLElement
  overlay: HTMLElement
  /** local window の `EditorView` 本体。focus / destroyed / selection の正本。 */
  localView: EditorView
  /** `localView.dom` と同一であることを検証する identity anchor（`.ProseMirror`）。 */
  localRoot: HTMLElement
  /**
   * 空の top-level paragraph に collapsed caret があるときだけ、ProseMirror が描く
   * sole trailing `<br>`。非空・条件未成立では常に `null`。
   */
  emptyCaretAnchor: HTMLElement | null
}

export type LocalImePseudoCaretGeometrySource =
  LocalImeLocalWindowPseudoCaretGeometrySource

export function isLocalImeLocalWindowPseudoCaretGeometrySource(
  source: LocalImePseudoCaretGeometrySource,
): source is LocalImeLocalWindowPseudoCaretGeometrySource {
  return source.kind === 'local-ime-local-window'
}

/** `applyExternalPlan` が native caret 透明化を貼る DOM 要素。kind だけで決まる。 */
export function resolveLocalImePseudoCaretGeometrySourceFocusRoot(
  source: LocalImePseudoCaretGeometrySource,
): HTMLElement {
  return source.localRoot
}

/** Local Windowがliveのときだけ既存pseudo caretへ表示sourceを渡す。 */
export function selectLocalImePseudoCaretExternalGeometrySource(input: {
  localWindow: LocalImeLocalWindowPseudoCaretGeometrySource | null
}): LocalImePseudoCaretGeometrySource | null {
  return input.localWindow
}

/** local EditorView を持つ source で共通の DOM / focus identity。selection 方針は含めない。 */
export type LocalImeLocalEditorViewPseudoCaretIdentityProof = {
  focusRoot: HTMLElement
  emptyCaretAnchor: HTMLElement | null
}

export function proveLocalImeLocalEditorViewPseudoCaretIdentity(input: {
  documentIdentity: string
  localView: EditorView
  localRoot: HTMLElement
  overlay: HTMLElement
  emptyCaretAnchor: HTMLElement | null
}): LocalImeLocalEditorViewPseudoCaretIdentityProof | null {
  if (!input.documentIdentity) return null
  const { localView, localRoot, overlay } = input
  if (
    localView.isDestroyed ||
    localView.dom !== localRoot ||
    !localRoot.isConnected ||
    !overlay.isConnected ||
    !overlay.contains(localRoot) ||
    !localView.hasFocus() ||
    localRoot.ownerDocument.activeElement !== localRoot
  ) {
    return null
  }
  const emptyCaretAnchor = input.emptyCaretAnchor
  if (
    emptyCaretAnchor &&
    (!emptyCaretAnchor.isConnected || !localRoot.contains(emptyCaretAnchor))
  ) {
    return null
  }
  return {
    focusRoot: localRoot,
    emptyCaretAnchor: emptyCaretAnchor ?? null,
  }
}

export type LocalImeLocalWindowPseudoCaretGeometrySourceIdentity = {
  focusRoot: HTMLElement
  writingMode: string
  generation: number
  documentIdentity: string
  emptyCaretAnchor: HTMLElement | null
}

/**
 * Local Window source の identity。非 composition では collapsed `TextSelection`
 * だけを許可する。
 * composition 中だけ browser / PM の一時 range を許容する。
 */
export function resolveLocalImeLocalWindowPseudoCaretGeometrySourceIdentity(
  source: LocalImeLocalWindowPseudoCaretGeometrySource,
): LocalImeLocalWindowPseudoCaretGeometrySourceIdentity | null {
  const writingMode = resolveSupportedEditorWritingMode(source.writingMode)
  if (!writingMode) return null
  const proved = proveLocalImeLocalEditorViewPseudoCaretIdentity(source)
  if (!proved) return null
  const selection = source.localView.state.selection
  if (source.mode !== 'composing') {
    if (!(selection instanceof TextSelection) || !selection.empty) return null
  }
  return {
    focusRoot: proved.focusRoot,
    writingMode,
    generation: source.generation,
    documentIdentity: source.documentIdentity,
    emptyCaretAnchor: proved.emptyCaretAnchor,
  }
}
