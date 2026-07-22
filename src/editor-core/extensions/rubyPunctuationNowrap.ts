import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import {
  findRubyPunctuationRuns,
  type RubyPunctuationRun,
} from '../io/rubyPunctuationRun'

/**
 * 青空ルビ直後の対象約物 1 grapheme を、表示 DOM 上だけ不可分単位として扱う extension。
 *
 * 方式:
 *   1. `aozoraRuby` node に {@link RUBY_PUNCT_BASE_CLASS} を、直後約物 1 grapheme に
 *      {@link RUBY_PUNCT_TAIL_CLASS} を decoration で付与する。tail は inline decoration の
 *      `nodeName: 'span'` で独立した DOM 要素になり、後続テキストと切り離される。
 *   2. plugin view が、各 run の `[ruby DOM ... tail span]` を nowrap な
 *      {@link RUBY_PUNCT_RUN_WRAPPER_CLASS} wrapper でくくる。これにより
 *      ルビ親文字と直後約物が同一の不可分 inline-block となり、行頭/次列頭落ちを防ぐ。
 *
 * 安全策:
 *   - PM doc / Markdown / clipboard / 保存内容は変更しない（decoration と表示専用 wrapper のみ）。
 *   - selection / IME が run 境界に掛かっている間は wrapper を作らない。
 *     これにより special inline boundary sentinel の IME 経路や caret 参照を壊さない。
 *   - wrapper はあくまで表示専用で、doc が変われば PM が再描画し、update で貼り直す。
 */

export const RUBY_PUNCT_RUN_WRAPPER_CLASS = 'tategaki-ruby-punct-run'
export const RUBY_PUNCT_BASE_CLASS = 'tategaki-ruby-punct-base'
export const RUBY_PUNCT_TAIL_CLASS = 'tategaki-ruby-punct-tail'

const RUN_WRAPPER_FLAG = 'data-nyoze-ruby-punct-run'

export const rubyPunctuationNowrapPluginKey = new PluginKey(
  'nyozeRubyPunctuationNowrap',
)

export function buildRubyPunctuationDecorations(
  doc: ProseMirrorNode,
): DecorationSet {
  const runs = findRubyPunctuationRuns(doc)
  if (runs.length === 0) return DecorationSet.empty

  const decorations: Decoration[] = []
  for (const run of runs) {
    decorations.push(
      Decoration.node(run.rubyFrom, run.rubyTo, {
        class: RUBY_PUNCT_BASE_CLASS,
        'data-nyoze-ruby-punct': 'base',
      }),
    )
    decorations.push(
      Decoration.inline(run.punctuationFrom, run.punctuationTo, {
        nodeName: 'span',
        class: RUBY_PUNCT_TAIL_CLASS,
        'data-nyoze-ruby-punct': 'tail',
      }),
    )
  }
  return DecorationSet.create(doc, decorations)
}

/** selection / IME が run 境界に掛かっているか（掛かっている間は wrapper を作らない）。 */
function isRunUnderEdit(view: EditorView, run: RubyPunctuationRun): boolean {
  if (view.composing) return true
  const { from, to } = view.state.selection
  return from <= run.punctuationTo && to >= run.rubyFrom
}

function isRunWrapper(node: Node | null): node is HTMLElement {
  return (
    node instanceof HTMLElement && node.hasAttribute(RUN_WRAPPER_FLAG)
  )
}

/** wrapper の中身を元の位置に戻して wrapper を取り除く。 */
function unwrapRun(wrapper: HTMLElement): void {
  const parent = wrapper.parentNode
  if (!parent) return
  while (wrapper.firstChild) {
    parent.insertBefore(wrapper.firstChild, wrapper)
  }
  parent.removeChild(wrapper)
}

/**
 * base 要素から tail 要素までの隣接 sibling（間の sentinel を含む）を
 * nowrap wrapper でくくる。間に tail が見つからなければ何もしない。
 */
function wrapRun(base: HTMLElement): void {
  // すでに正しく wrap 済みなら何もしない。
  if (isRunWrapper(base.parentElement)) return

  const collected: ChildNode[] = [base]
  let tail: HTMLElement | null = null
  let cursor: ChildNode | null = base.nextSibling
  while (cursor) {
    collected.push(cursor)
    if (
      cursor instanceof HTMLElement &&
      cursor.classList.contains(RUBY_PUNCT_TAIL_CLASS)
    ) {
      tail = cursor
      break
    }
    cursor = cursor.nextSibling
  }
  if (!tail) return

  const parent = base.parentNode
  if (!parent) return

  const wrapper = document.createElement('span')
  wrapper.className = RUBY_PUNCT_RUN_WRAPPER_CLASS
  wrapper.setAttribute(RUN_WRAPPER_FLAG, '1')
  parent.insertBefore(wrapper, base)
  for (const node of collected) {
    wrapper.appendChild(node)
  }
}

type DomObserverControl = {
  stop?: () => void
  start?: () => void
}

/**
 * wrapper の DOM 挿入/解除は PM の DOMObserver に「doc 変更」と誤読されないよう、
 * observer を止めてから行う（PM が DOM を読み戻して doc を壊すのを防ぐ）。
 */
function withObserverPaused(view: EditorView, run: () => void): void {
  const observer = (view as unknown as { domObserver?: DomObserverControl })
    .domObserver
  observer?.stop?.()
  try {
    run()
  } finally {
    observer?.start?.()
  }
}

function applyRunWrappers(view: EditorView): void {
  const runs = findRubyPunctuationRuns(view.state.doc)

  // 1. 既存 wrapper のうち、base を失った / 編集中になったものを解除する。
  for (const wrapper of view.dom.querySelectorAll<HTMLElement>(
    `span[${RUN_WRAPPER_FLAG}]`,
  )) {
    const base = wrapper.querySelector<HTMLElement>(`.${RUBY_PUNCT_BASE_CLASS}`)
    const matchedRun = base
      ? runs.find((run) => view.nodeDOM(run.rubyFrom) === base)
      : undefined
    if (!matchedRun || isRunUnderEdit(view, matchedRun)) {
      unwrapRun(wrapper)
    }
  }

  // 2. 編集中でない run の base が未 wrap なら wrap する。
  for (const run of runs) {
    if (isRunUnderEdit(view, run)) continue
    const base = view.nodeDOM(run.rubyFrom)
    if (!(base instanceof HTMLElement)) continue
    if (isRunWrapper(base.parentElement)) continue
    wrapRun(base)
  }
}

function syncRunWrappers(view: EditorView): void {
  withObserverPaused(view, () => applyRunWrappers(view))
}

export function createRubyPunctuationNowrapPlugin(): Plugin {
  let cachedDoc: ProseMirrorNode | null = null
  let cachedDecorations: DecorationSet = DecorationSet.empty

  const safeSync = (view: EditorView) => {
    try {
      syncRunWrappers(view)
    } catch {
      // 表示専用の最適化なので、失敗しても編集機能には影響させない。
    }
  }

  return new Plugin({
    key: rubyPunctuationNowrapPluginKey,
    props: {
      decorations(state) {
        if (cachedDoc === state.doc) return cachedDecorations
        cachedDoc = state.doc
        cachedDecorations = buildRubyPunctuationDecorations(state.doc)
        return cachedDecorations
      },
    },
    view(view) {
      // 初期表示分を反映。
      queueMicrotask(() => safeSync(view))
      return {
        update(updatedView) {
          // decoration 反映後の DOM に対して wrapper を貼り直す。
          queueMicrotask(() => safeSync(updatedView))
        },
        destroy() {
          withObserverPaused(view, () => {
            for (const wrapper of view.dom.querySelectorAll<HTMLElement>(
              `span[${RUN_WRAPPER_FLAG}]`,
            )) {
              unwrapRun(wrapper)
            }
          })
        },
      }
    },
  })
}

export const RubyPunctuationNowrap = Extension.create({
  name: 'rubyPunctuationNowrap',

  addProseMirrorPlugins() {
    return [createRubyPunctuationNowrapPlugin()]
  },
})
