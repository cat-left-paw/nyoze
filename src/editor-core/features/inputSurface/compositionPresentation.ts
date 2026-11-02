import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { OwnerInsertionSnapshot } from './editOwner'
import { normalizeRubyInsertionRange } from './rubyInsertionPosition'
import { resolveSelectionMirror } from './selectionMirror'
import { resolveHostRangeCommitMarks } from './rangeCommitMarks'

type Cycle = {
  readonly id: number
  readonly snapshot: OwnerInsertionSnapshot
  readonly pos: number
  decorations: DecorationSet
  // 表示の複写だけ。Doc/確定payloadではない。factoryも同じ最新値を読む。
  text: string
  dom: HTMLElement | null
}

/** flag ONのHostOwnerだけが登録する、本文に入らないpreeditの予約領域。 */
export function createHostCompositionPresentation(view: EditorView, getIdentity: () => string) {
  const key = new PluginKey<Cycle | null>('input-surface-composition')
  let nextCycle = 0, destroyed = false, mounted = false
  // Hostの子paragraphだけ。Docから証明した末尾cycleのnode decorationで抑止する。
  // 規則は寿命中不変、Host root / 祖先は変更しない。
  const style = view.dom.ownerDocument.createElement('style')
  style.dataset.nyozeInputSurfaceCompositionEnd = 'true'
  style.textContent = '.editor-panel:is([data-writing-mode="vertical-rl"], [data-writing-mode="vertical-lr"]) .editor-surface .editor-core-host > .ProseMirror p[data-nyoze-input-surface-preedit-end="true"]::after { content: none; }'
    + '\n.editor-core-host > .ProseMirror [data-nyoze-input-surface-reconversion-hidden="true"] { display: none !important; }'
  view.dom.ownerDocument.head.appendChild(style)
  const current = () => key.getState(view.state) ?? null
  const valid = (snapshot: OwnerInsertionSnapshot) => !destroyed && !view.isDestroyed && view.editable &&
    snapshot.identity === getIdentity() && snapshot.docRef === view.state.doc
  const ready = () => {
    const cycle = current()
    return mounted && !!cycle && valid(cycle.snapshot) && !!cycle.dom?.isConnected && view.dom.contains(cycle.dom)
  }
  const plugin = new Plugin<Cycle | null>({
    key,
    state: {
      init: () => null,
      apply(tr, cycle, _oldState, state) {
        // 原因を問わず、本文の変更と同じ適用で消す。mapping/再確定しない。
        if (tr.docChanged) return null
        const action = tr.getMeta(key) as { snapshot: OwnerInsertionSnapshot; text: string } | 'clear' | undefined
        if (action === 'clear') return null
        if (!action) return cycle
        const { snapshot, text } = action
        const range = snapshot.from !== snapshot.to
        if (destroyed || snapshot.identity !== getIdentity() || snapshot.docRef !== state.doc ||
          state.selection.from !== snapshot.from || state.selection.to !== snapshot.to ||
          range && !resolveSelectionMirror(snapshot, state.selection, true)) return null
        const pos = range ? snapshot.from : normalizeRubyInsertionRange(state, snapshot.from, snapshot.to).from
        const marks = range ? resolveHostRangeCommitMarks(state, snapshot.from, snapshot.to) ?? [] : state.storedMarks ?? state.doc.resolve(pos).marks()
        const record: Cycle = { id: ++nextCycle, snapshot, pos, text, dom: null, decorations: DecorationSet.empty }
        const widget = Decoration.widget(pos, () => {
          const dom = view.dom.ownerDocument.createElement('span')
          dom.dataset.nyozeInputSurfacePreeditWidget = 'true'
          dom.setAttribute('aria-hidden', 'true')
          dom.contentEditable = 'false'
          dom.style.pointerEvents = 'none'
          // 方式A: 場所だけを確保し、文字・IMEの飾りは入力面が描く。
          dom.style.setProperty('color', 'transparent', 'important')
          dom.style.setProperty('-webkit-text-fill-color', 'transparent', 'important')
          dom.style.setProperty('text-decoration-color', 'transparent', 'important')
          dom.style.setProperty('text-shadow', 'none', 'important')
          dom.style.setProperty('background-color', 'transparent', 'important')
          dom.textContent = record.text
          record.dom = dom
          return dom
        }, {
          key: `input-surface-preedit-${record.id}`, side: 1, relaxedSide: true,
          marks, ignoreSelection: true, stopEvent: () => true,
          destroy(dom) { if (record.dom === dom) record.dom = null },
        })
        const decorations = [widget], $pos = state.doc.resolve(pos)
        if (range) decorations.push(Decoration.inline(snapshot.from, snapshot.to, { 'data-nyoze-input-surface-reconversion-hidden': 'true' }))
        // Mark wrapperの有無によらず、PMの段落末の位置だけを根拠にする。
        // 本文の途中ではBETA-TY-VLB1のgenerated ZWSPを維持する。
        if (!range && $pos.parent.type.name === 'paragraph' && pos === $pos.end()) {
          decorations.push(Decoration.node($pos.before(), $pos.after(), { 'data-nyoze-input-surface-preedit-end': 'true' }))
        }
        record.decorations = DecorationSet.create(state.doc, decorations)
        return record
      },
    },
    props: { decorations: state => key.getState(state)?.decorations ?? DecorationSet.empty },
    view: () => {
      mounted = true
      return {
        // PMのplugin再構成でも呼ばれる。cycleはstate/factoryに保持する。
        destroy() { mounted = false },
      }
    },
  })
  const clear = () => {
    if (!destroyed && !view.isDestroyed && current()) view.dispatch(view.state.tr.setMeta(key, 'clear').setMeta('addToHistory', false))
  }
  return {
    key, plugin, clear,
    isReserved: ready,
    present(text: string | null, snapshot?: OwnerInsertionSnapshot) {
      if (text === null) { clear(); return }
      if (snapshot) {
        if (!valid(snapshot) || view.state.selection.from !== snapshot.from || view.state.selection.to !== snapshot.to) return
        view.dispatch(view.state.tr.setMeta(key, { snapshot, text }).setMeta('addToHistory', false))
        return
      }
      const cycle = current()
      if (!cycle) return
      if (!valid(cycle.snapshot)) { clear(); return }
      if (cycle.text === text) return
      cycle.text = text
      if (cycle.dom) cycle.dom.textContent = text
    },
    /**
     * INLINE-2B: 予約領域の最初の文字の矩形。Hostのlayoutから読むだけで、DOM・Selection・stateは変えない。
     * 表示されていない、空、矩形を読めない場合はnull。
     */
    firstCharacterRect() {
      const node = ready() ? current()!.dom!.firstChild : null
      if (!node || node.nodeType !== 3) return null
      const data = (node as Text).data, code = data.charCodeAt(0)
      if (!data) return null
      const range = view.dom.ownerDocument.createRange()
      range.setStart(node, 0)
      range.setEnd(node, code >= 0xd800 && code <= 0xdbff && data.length > 1 ? 2 : 1)
      const rect = range.getBoundingClientRect()
      return rect.width || rect.height ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null
    },
    snapshot() {
      const cycle = current()
      return cycle ? { cycle: cycle.id, identity: cycle.snapshot.identity, pos: cycle.pos, text: cycle.text, reserved: ready() } : null
    },
    destroy() { clear(); destroyed = true; style.remove() },
  }
}
export type CompositionPresentation = ReturnType<typeof createHostCompositionPresentation>
