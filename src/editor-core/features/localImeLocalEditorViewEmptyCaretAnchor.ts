import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const PROSEMIRROR_TRAILING_BREAK_CLASS = 'ProseMirror-trailingBreak'

/**
 * ProseMirror が空 textblock に描く sole trailing `<br>` だけを identity で返す。
 * 子がちょうど 1 個で、それが `br.ProseMirror-trailingBreak` のときだけ成功する。
 * 固定座標・隣接 paragraph・coordsAtPos 近似・文字幅推定は使わない。
 */
function resolveSoleTrailingBreak(paragraphEl: HTMLElement): HTMLElement | null {
  if (paragraphEl.childNodes.length !== 1) return null
  const onlyChild = paragraphEl.firstChild
  if (!(onlyChild instanceof HTMLElement)) return null
  if (onlyChild.tagName !== 'BR') return null
  if (!onlyChild.classList.contains(PROSEMIRROR_TRAILING_BREAK_CLASS)) return null
  return onlyChild
}

/**
 * LOCAL-WINDOW-PSEUDOCARET1: 複数 top-level paragraph を持つ local `EditorView` で、
 * collapsed selection が属する空 paragraph の trailing `<br>` を exact に解決する。
 *
 * Chromium は空 textblock の collapsed Range に client rect を返さないため、
 * DOM caret rect が取れないこの一点だけの fallback anchor になる。
 * 1-block paragraph overlay の resolver は流用せず、top-level 複数 block に対応する。
 */
export function resolveLocalImeLocalEditorViewEmptyCaretAnchor(
  view: EditorView,
): HTMLElement | null {
  if (view.isDestroyed) return null
  const selection = view.state.selection
  if (!(selection instanceof TextSelection) || !selection.empty) return null
  const $from = selection.$from
  if ($from.depth !== 1) return null
  const paragraph = $from.parent
  if (paragraph.type.name !== 'paragraph') return null
  if (paragraph.content.size !== 0 || paragraph.childCount !== 0) return null
  const paragraphPos = $from.before(1)
  const caretPos = selection.from
  if (caretPos !== paragraphPos + 1) return null

  let nodeDom: Node | null
  try {
    nodeDom = view.nodeDOM(paragraphPos)
  } catch {
    return null
  }
  if (!(nodeDom instanceof HTMLElement) || nodeDom.tagName !== 'P') return null
  const localRoot = view.dom
  if (!(localRoot instanceof HTMLElement) || !localRoot.isConnected || !localRoot.contains(nodeDom)) {
    return null
  }
  const trailingBreak = resolveSoleTrailingBreak(nodeDom)
  if (!trailingBreak || !trailingBreak.isConnected || !localRoot.contains(trailingBreak)) return null
  try {
    const domPos = view.domAtPos(caretPos)
    if (domPos.node !== nodeDom || domPos.offset !== 0) return null
    if (view.posAtDOM(nodeDom, 0, 1) !== caretPos) return null
  } catch {
    return null
  }
  return trailingBreak
}
