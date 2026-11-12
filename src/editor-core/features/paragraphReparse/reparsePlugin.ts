/**
 * EDITOR-PARAGRAPH-REPARSE1: 段落を離れたとき、直前まで編集していた段落の記法を読み直して表示に反映する plugin（案 1）。
 *
 * 状態（`ReparseState`）:
 * - `marked`: 編集した（本文を変えた）対象の textblock の開始位置。1 つだけ。位置は `tr.mapping` で追い、消えたら捨てる。
 * - `held`: 離れたが、まだ読み直していない段落（読み直せない場面・pointer を押している間は待つ）。古い順。上限 `HELD_MAX`。
 * - `ready`: この transaction の直後に読み直す段落（`apply` が決め、plugin view の `update` が読む。
 *   次の transaction で `apply` が捨てる）。`apply` は純粋で、dry-run（`state.applyTransaction`）でも状態を壊さない。
 *   読み直した結果が「置き換えなし」でも、`held` から外れているので、同じ段落を何度も読み直さない（状態を変える
 *   transaction を作らずに済む）。
 *
 * 「印」を付ける: 本文を変え（`docChanged`）、Undo / Redo・文書の読み込み・Paragraph Plain の確定・この機能自身の
 * 置き換えでなく、変更の範囲が、transaction の後の caret（`selection.head`）を含む対象の textblock に触れるとき
 * （その textblock が空でなければ）。Undo / Redo で戻した段落には印を付けない（もう一度離れても読み直さない）。
 *
 * 「離れた」: 選択（from〜to）が印の textblock の範囲と重ならなくなったとき。範囲選択・NodeSelection・AllSelection が
 * その textblock にかかっている間は離れていない。
 *
 * 読み直しの時点（どちらも、読み直しは**独立した root の transaction**として dispatch する）:
 * - 選択を移した transaction の直後（矢印・Enter・Home / End・アウトライン・検索など）。`apply` が `ready` を決め、
 *   plugin view の `update` が、同じ task の microtask で dispatch する（timer ではない。次の event より前に済む）。
 *   `appendTransaction` は使わない: appended の transaction は、root の transaction が `addToHistory: false`
 *   （PIS の矢印・pointer の選択移動）だと、prosemirror-history に記録されず（`appended.getMeta('addToHistory') === false`）、
 *   Undo の単位にならない。
 * - pointer で離れたときは、pointer を押している間は読み直さず（押している間に後ろの文字が動くと、押したまま少し動かした
 *   だけで範囲選択になる）、ボタンを離した後（window の bubble の `pointerup` / `pointercancel`）に、その時点の state で
 *   判定し直して dispatch する。
 * - 読み直せない場面（`canReparseNow()` が false: 変換中・PIS の保持文字・段落プレーン編集・Source Mode・read-only・
 *   Local Window）は、`held` で待つ。timer・polling・rAF は使わない。次の transaction（または pointer を離したとき）で判定し直す。
 *
 * 置き換えるものがなければ transaction を作らない。保存・離脱の経路は変えない（読み直しの有無で保存される文字は同じ）。
 * 文書全体の走査・文書直下の子ごとの `doc.resolve()` はしない（`apply` は変更のあった範囲と、印の textblock だけを見る）。
 */
import { Plugin, PluginKey, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { StepMap } from '@tiptap/pm/transform'
import { isParagraphReparseTarget, type ParagraphReparseContext } from './reparseCandidate'
import {
  buildParagraphReparseTransaction,
  PARAGRAPH_REPARSE_META_KEY,
  type ParagraphReparseMeta,
} from './reparseTransaction'

/**
 * 外の機能の transaction の meta（`noteAnchorProtection.ts` の同名の定数と同じ値。features の相互 import を避けるため
 * 値で持ち、unit が一致を固定している）。文書の読み込み・Paragraph Plain の確定（段落の Markdown の再解釈）は印・待ちを捨て、
 * prosemirror-history の Undo / Redo の transaction は印を付けない。
 */
export const REPARSE_EXTERNAL_META_KEYS = {
  documentLoad: 'noteAnchorDocumentLoad',
  paragraphPlainCommit: 'noteAnchorParagraphPlainCommit',
  history: 'history$',
  appended: 'appendedTransaction',
} as const
const DOCUMENT_LOAD_META_KEY = REPARSE_EXTERNAL_META_KEYS.documentLoad
const PARAGRAPH_PLAIN_COMMIT_META_KEY = REPARSE_EXTERNAL_META_KEYS.paragraphPlainCommit
const HISTORY_TRANSACTION_META_KEY = REPARSE_EXTERNAL_META_KEYS.history
const APPENDED_META_KEY = REPARSE_EXTERNAL_META_KEYS.appended

const HELD_MAX = 4

export type ReparseState = {
  marked: number | null
  held: readonly number[]
  ready: number | null
}

const EMPTY_STATE: ReparseState = { marked: null, held: [], ready: null }

export const paragraphReparsePluginKey = new PluginKey<ReparseState>('paragraphReparse')

export type ParagraphReparsePluginOptions = {
  getContext(): ParagraphReparseContext
  /** 読み直してよい場面か（変換中・保持文字・Paragraph Plain・Source Mode・read-only・Local Window でない）。 */
  canReparseNow(): boolean
  /** 文書全体の保存の文字列（保存と同じ書き出し）。置き換えの前後で同じでなければ置き換えない（最後の安全網）。 */
  serializeDocument(doc: PMNode): string
  /** 読み直しを、いまの dispatch の直後に実行する入口。省略時は `queueMicrotask`（unit は同期の queue を渡す）。 */
  schedule?(task: () => void): void
}

/** 押している pointer の記録（押している間は読み直さない）。unit が DOM なしで操作できるように、plugin の外へ分けてある。 */
export type ParagraphReparsePointerTracker = {
  down(pointerId: number): void
  up(pointerId: number): void
  clear(): void
  isDown(): boolean
}

export function createParagraphReparsePointerTracker(): ParagraphReparsePointerTracker {
  const pointers = new Set<number>()
  return {
    down: (pointerId) => void pointers.add(pointerId),
    up: (pointerId) => void pointers.delete(pointerId),
    clear: () => pointers.clear(),
    isDown: () => pointers.size > 0,
  }
}

/** `dispatch` と `state` だけを使う、view の最小の形（unit が本物の view なしで動かせる）。 */
export type ParagraphReparseViewLike = {
  readonly state: EditorState
  readonly isDestroyed?: boolean
  dispatch(tr: Transaction): void
}

/**
 * ボタンを離した後（pointerup / pointercancel）に、その時点の state で判定し直して、待っていた段落を 1 つ読み直す。
 * 読み直すものがなければ transaction を作らない。
 */
export function reparseHeldAfterPointerRelease(
  view: ParagraphReparseViewLike,
  options: ParagraphReparsePluginOptions,
  tracker: ParagraphReparsePointerTracker,
): boolean {
  if (tracker.isDown() || view.isDestroyed) return false
  const state = paragraphReparsePluginKey.getState(view.state)
  if (!state || state.held.length === 0 || !options.canReparseNow()) return false
  const { doc, selection } = view.state
  for (const pos of state.held) {
    const node = blockAt(doc, pos)
    if (!node || selectionOverlapsBlock(selection, pos, node)) continue
    const tr = buildParagraphReparseTransaction(view.state, pos, options.getContext(), {
      source: 'leave',
      mapSelection: false,
      serializeDocument: options.serializeDocument,
    })
    if (tr) {
      view.dispatch(tr)
      return true
    }
  }
  return false
}

function blockAt(doc: PMNode, pos: number | null): PMNode | null {
  if (pos === null || pos < 0 || pos > doc.content.size) return null
  const node = doc.nodeAt(pos)
  return isParagraphReparseTarget(node) ? node : null
}

/** 選択が、その textblock の中身の範囲と重なっているか（範囲・NodeSelection・AllSelection を含む）。 */
function selectionOverlapsBlock(selection: Selection, blockPos: number, node: PMNode): boolean {
  const start = blockPos + 1
  const end = blockPos + node.nodeSize - 1
  return selection.from <= end && selection.to >= start
}

function mapPosition(tr: Transaction, pos: number | null): number | null {
  if (pos === null) return null
  const result = tr.mapping.mapResult(pos, 1)
  return result.deleted ? null : result.pos
}

/** `changeTouchesRange` の費用の計測用（試験が、手順の数に比例することを確かめる）。 */
export type ChangeTouchCounter = { ranges: number; inverseMaps: number }

/**
 * 手順の列（`tr.mapping.maps`）の変更の範囲が、変更後の文書の座標の [blockStart, blockEnd] に触れるか。
 * 最後の手順から順に、その手順の新しい範囲と重なるかを見て、重ならなければ範囲を `map.invert()` で 1 つ前の座標へ写す。
 * 手順の数 n に対して O(n)（以前は、手順ごとに残りの手順をすべて通していて O(n²)。「すべて置換」の 2 万手順で約 1.5 秒かかった）。
 */
export function changeTouchesRange(
  maps: readonly StepMap[],
  blockStart: number,
  blockEnd: number,
  counter?: ChangeTouchCounter,
): boolean {
  let from = blockStart
  let to = blockEnd
  for (let index = maps.length - 1; index >= 0; index -= 1) {
    const map = maps[index]
    let touched = false
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (counter) counter.ranges += 1
      if (from <= newEnd && to >= newStart) touched = true
    })
    if (touched) return true
    if (index > 0) {
      const inverse = map.invert()
      from = inverse.map(from, -1)
      to = inverse.map(to, 1)
      if (counter) counter.inverseMaps += 1
    }
  }
  return false
}

function pushHeld(held: readonly number[], pos: number): readonly number[] {
  if (held.includes(pos)) return held
  const next = [...held, pos]
  return next.length > HELD_MAX ? next.slice(next.length - HELD_MAX) : next
}

export function createParagraphReparsePlugin(
  options: ParagraphReparsePluginOptions,
  tracker: ParagraphReparsePointerTracker = createParagraphReparsePointerTracker(),
): Plugin<ReparseState> {
  const isBlockedNow = () => tracker.isDown() || !options.canReparseNow()

  return new Plugin<ReparseState>({
    key: paragraphReparsePluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply(tr, value, _oldState, newState): ReparseState {
        if (tr.getMeta(DOCUMENT_LOAD_META_KEY) || tr.getMeta(PARAGRAPH_PLAIN_COMMIT_META_KEY)) return EMPTY_STATE
        // 何も待っておらず、本文も変わらない transaction（矢印・選択だけの移動など）は、そのまま返す。
        if (value.marked === null && value.held.length === 0 && value.ready === null && !tr.docChanged) return value
        const root = !tr.getMeta(APPENDED_META_KEY)
        const own = tr.getMeta(PARAGRAPH_REPARSE_META_KEY) as ParagraphReparseMeta | undefined
        let { marked, held, ready } = value
        if (root) ready = null
        if (own) {
          // 置き換え済みの段落は、もう待たない（own.pos は置き換え前の座標）。
          if (marked === own.pos) marked = null
          if (ready === own.pos) ready = null
          if (held.includes(own.pos)) held = held.filter((pos) => pos !== own.pos)
        }
        if (tr.docChanged) {
          marked = mapPosition(tr, marked)
          ready = mapPosition(tr, ready)
          if (held.length > 0) {
            held = held.map((pos) => mapPosition(tr, pos)).filter((pos): pos is number => pos !== null)
          }
        }
        const { doc, selection } = newState
        // 戻ってきた: 待っていた段落と選択が重なったら、印へ戻す。
        if (held.length > 0) {
          const kept: number[] = []
          for (const pos of held) {
            const node = blockAt(doc, pos)
            if (!node) continue
            if (selectionOverlapsBlock(selection, pos, node)) {
              if (marked === null) marked = pos
              continue
            }
            kept.push(pos)
          }
          held = kept
        }
        // 離れた: 印の段落を待ちの列へ送る。
        if (marked !== null) {
          const node = blockAt(doc, marked)
          if (!node) marked = null
          else if (!selectionOverlapsBlock(selection, marked, node)) {
            held = pushHeld(held, marked)
            marked = null
          }
        }
        // 読み直す段落を決める（root の transaction だけ。1 つの transaction で 1 つ。古い順）。
        if (root && !own && ready === null && held.length > 0 && !isBlockedNow()) {
          ready = held[0]
          held = held.slice(1)
        }
        // 印を付ける: 本文を変えた transaction で、caret の段落に触れたとき。
        if (
          tr.docChanged &&
          !own &&
          !tr.getMeta(HISTORY_TRANSACTION_META_KEY)
        ) {
          const $head = selection.$head
          const parent = $head.parent
          if ($head.depth >= 1 && isParagraphReparseTarget(parent) && parent.content.size > 0) {
            const start = $head.before()
            if (changeTouchesRange(tr.mapping.maps, start, start + parent.nodeSize)) {
              marked = start
              if (held.includes(start)) held = held.filter((pos) => pos !== start)
            }
          }
        }
        if (marked === value.marked && ready === value.ready && held === value.held) return value
        return { marked, held, ready }
      },
    },
    view(editorView) {
      const win = editorView.dom.ownerDocument.defaultView
      if (!win) return {}
      const schedule = options.schedule ?? ((task: () => void) => queueMicrotask(task))
      /** 同じ状態で何度も予約しない（`ready` は次の transaction まで状態に残る）。 */
      let scheduledFor: { doc: PMNode; pos: number } | null = null
      const onDown = (event: Event) => {
        const pointerId = (event as PointerEvent).pointerId
        if (typeof pointerId === 'number') tracker.down(pointerId)
      }
      const release = (event: Event) => {
        const pointerId = (event as PointerEvent).pointerId
        if (typeof pointerId === 'number') tracker.up(pointerId)
      }
      // 押したまま pointerup を受け取れなかったとき（button が 0 の pointermove、window の blur、context menu、drag の終了）に、
      // 待ちっぱなしにしない。
      const onMove = (event: Event) => {
        const pointerEvent = event as PointerEvent
        if (pointerEvent.buttons === 0) tracker.up(pointerEvent.pointerId)
      }
      const clear = () => tracker.clear()
      const onReleased = () => void reparseHeldAfterPointerRelease(editorView, options, tracker)
      // window の capture は document の capture より先に走る。PIS の pointer の貸し出し（document の capture）が
      // pointerdown で選択を動かす前に、押している印を付ける。ボタンを離した後の読み直しは bubble（貸し出しの後）。
      win.addEventListener('pointerdown', onDown, true)
      win.addEventListener('pointerup', release, true)
      win.addEventListener('pointercancel', release, true)
      win.addEventListener('pointermove', onMove, true)
      win.addEventListener('blur', clear)
      win.addEventListener('contextmenu', clear, true)
      win.addEventListener('dragend', clear, true)
      win.addEventListener('pointerup', onReleased)
      win.addEventListener('pointercancel', onReleased)
      return {
        update(view) {
          const state = paragraphReparsePluginKey.getState(view.state)
          if (!state || state.ready === null) return
          if (scheduledFor && scheduledFor.doc === view.state.doc && scheduledFor.pos === state.ready) return
          const doc = view.state.doc
          const pos = state.ready
          scheduledFor = { doc, pos }
          schedule(() => {
            // 予約した後に本文が変わっていたら（同じ task の中で別の dispatch があった）、位置を信用せずやめる。
            if (view.isDestroyed || view.state.doc !== doc || tracker.isDown() || !options.canReparseNow()) return
            const tr = buildParagraphReparseTransaction(view.state, pos, options.getContext(), {
              source: 'leave',
              mapSelection: false,
              serializeDocument: options.serializeDocument,
            })
            if (tr) view.dispatch(tr)
          })
        },
        destroy() {
          tracker.clear()
          win.removeEventListener('pointerdown', onDown, true)
          win.removeEventListener('pointerup', release, true)
          win.removeEventListener('pointercancel', release, true)
          win.removeEventListener('pointermove', onMove, true)
          win.removeEventListener('blur', clear)
          win.removeEventListener('contextmenu', clear, true)
          win.removeEventListener('dragend', clear, true)
          win.removeEventListener('pointerup', onReleased)
          win.removeEventListener('pointercancel', onReleased)
        },
      }
    },
  })
}

/** コマンド（案 2）が対象にする textblock。選択の from と to が同じ対象の textblock の中にあるときだけ。 */
export function resolveReparseCommandBlock(state: EditorState): { pos: number; node: PMNode } | null {
  const { $from, $to } = state.selection
  if ($from.depth < 1 || $to.depth < 1) return null
  if (!state.selection.empty && $from.parent !== $to.parent) return null
  const parent = $from.parent
  if (!isParagraphReparseTarget(parent)) return null
  if ($to.parent !== parent || $from.before() !== $to.before()) return null
  return { pos: $from.before(), node: parent }
}
