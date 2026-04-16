/**
 * Home / End 2段階移動 — 通常エディタ専用
 *
 * 1回目: 表示行頭/末（DOM ベース）
 * 2回目: 論理行頭/末（ブロック先頭/末尾）
 *
 * Source Mode / Paragraph Plain はこのモジュールを経由しない。
 */

import type { EditorView } from '@tiptap/pm/view'
import { TextSelection } from '@tiptap/pm/state'
import { resolveRubyAwareVisualLineEdge } from './rubyHomeEndVisualEdge'

// ---- 2段階状態 --------------------------------------------------------

type Phase = 'visual' | 'logical'
type Direction = 'home' | 'end'

interface StepState {
  direction: Direction
  /** カーソルが属するブロック(論理行)の doc 内 pos */
  blockStart: number
  phase: Phase
}

let lastStep: StepState | null = null

/**
 * handleHomeEndKey 内の dispatch 中 true。
 * onSelectionUpdate で自己起因の変更を無視するために使う。
 */
let selfDispatching = false

/** 外部から呼ぶリセット（タブ切替・文書ロード・plain mode 切替など） */
export function resetHomeEndState(): void {
  lastStep = null
}

/**
 * onSelectionUpdate から呼ばれる。
 * 自己起因（Home/End dispatch）の場合はスキップし、
 * 外部起因（マウスクリック等）の場合は2段階状態をリセットする。
 */
export function notifySelectionChanged(): void {
  if (selfDispatching) return
  lastStep = null
}

// ---- ブロック位置ヘルパー -----------------------------------------------

function resolveBlockRange(view: EditorView, pos: number): { start: number; end: number } | null {
  const resolved = view.state.doc.resolve(pos)
  for (let depth = resolved.depth; depth > 0; depth--) {
    if (!resolved.node(depth).isBlock) continue
    return {
      start: resolved.start(depth),
      end: resolved.end(depth),
    }
  }
  return null
}

// ---- 表示行 移動 (DOM ベース) -------------------------------------------

/**
 * DOM の Selection API を使って表示行頭/末を取得し、PM pos に変換する。
 * 変換に失敗した場合は null を返す（安全側）。
 *
 * End 方向では posAtDOM の bias=1 (after) を使い、折り返し境界で
 * カーソルが次行先頭に飛ぶのを防ぐ。
 */
function resolveVisualLineEdge(
  view: EditorView,
  direction: Direction,
): number | null {
  const domSel = view.dom.ownerDocument.defaultView?.getSelection()
  if (!domSel || domSel.rangeCount === 0) return null

  const range = domSel.getRangeAt(0)
  if (!range.collapsed) return null

  // Selection.modify で表示行端へ仮移動し、位置を取得してから元に戻す
  const anchorNode = domSel.anchorNode
  const anchorOffset = domSel.anchorOffset
  if (!anchorNode) return null

  try {
    const lineEdge = direction === 'home' ? 'backward' : 'forward'
    domSel.modify('move', lineEdge, 'lineboundary')

    const edgeNode = domSel.anchorNode
    const edgeOffset = domSel.anchorOffset
    if (!edgeNode) {
      // 復元
      domSel.collapse(anchorNode, anchorOffset)
      return null
    }

    // bias: End → 1 (after / 行末側に寄せる), Home → -1 (before / 行頭側に寄せる)
    const bias = direction === 'end' ? 1 : -1
    let pmPos: number
    try {
      pmPos = view.posAtDOM(edgeNode, edgeOffset, bias)
    } catch {
      domSel.collapse(anchorNode, anchorOffset)
      return null
    }

    // 復元
    domSel.collapse(anchorNode, anchorOffset)

    return pmPos
  } catch {
    // Selection.modify は非標準 — 安全側
    return null
  }
}

// ---- dispatch ヘルパー --------------------------------------------------

/** selfDispatching フラグを管理しつつ dispatch する */
function dispatchWithFlag(view: EditorView, pos: number): void {
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, pos),
  )
  selfDispatching = true
  try {
    view.dispatch(tr.scrollIntoView())
  } finally {
    selfDispatching = false
  }
}

/**
 * PM dispatch 後、折り返し境界で caret が「次行先頭」に表示される問題を補正する。
 * 1文字戻って lineboundary で再前進することで、ブラウザに「行末」アフィニティを強制する。
 * PM の内部 selection pos は変わらない（DOM caret の視覚位置のみ調整）。
 */
function nudgeCaretToLineEnd(view: EditorView): void {
  const domSel = view.dom.ownerDocument.defaultView?.getSelection()
  if (!domSel || domSel.rangeCount === 0) return
  try {
    domSel.modify('move', 'backward', 'character')
    domSel.modify('move', 'forward', 'lineboundary')
  } catch {
    // Selection.modify は非標準 — 安全側
  }
}

// ---- メインハンドラ -----------------------------------------------------

type LogPush = (event: string, detail: string) => void

export interface HandleHomeEndOptions {
  getIsComposing: () => boolean
  pushLog: LogPush
}

/**
 * Home / End キーハンドラ。handled なら true を返す。
 * 通常エディタ用の editorProps.handleKeyDown から呼ばれる。
 */
export function handleHomeEndKey(
  view: EditorView,
  event: KeyboardEvent,
  options: HandleHomeEndOptions,
): boolean {
  if (event.key !== 'Home' && event.key !== 'End') return false

  // 修飾キー付き（Shift / Ctrl / Alt / Meta）は標準挙動に委ねる
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    resetHomeEndState()
    return false
  }

  // IME 中は抑止
  if (options.getIsComposing() || event.isComposing) {
    resetHomeEndState()
    return false
  }

  const { state } = view
  const { selection } = state

  // collapsed でなければ標準に委ねる
  if (!selection.empty) {
    resetHomeEndState()
    return false
  }

  const direction: Direction = event.key === 'Home' ? 'home' : 'end'
  const cursorPos = selection.from

  const block = resolveBlockRange(view, cursorPos)
  if (!block) {
    resetHomeEndState()
    return false
  }

  // 同じブロック・同じ方向で連続押下なら phase を進める
  const isContinuation =
    lastStep !== null &&
    lastStep.direction === direction &&
    lastStep.blockStart === block.start &&
    lastStep.phase === 'visual'

  if (isContinuation) {
    // 2回目: 論理行頭/末
    const targetPos = direction === 'home' ? block.start : block.end
    if (targetPos !== cursorPos) {
      dispatchWithFlag(view, targetPos)
    }
    lastStep = { direction, blockStart: block.start, phase: 'logical' }
    event.preventDefault()
    options.pushLog('homeEnd', `${direction} logical pos=${targetPos}`)
    return true
  }

  // 1回目: 表示行頭/末
  const visualPos =
    resolveRubyAwareVisualLineEdge(view, direction, block.start, block.end) ??
    resolveVisualLineEdge(view, direction)

  if (visualPos != null) {
    // ブロック範囲内にクランプ
    const clamped = Math.max(block.start, Math.min(block.end, visualPos))

    // カーソルが既に表示行端にいる場合、すぐ論理行端へ
    if (clamped === cursorPos) {
      const logicalPos = direction === 'home' ? block.start : block.end
      if (logicalPos !== cursorPos) {
        dispatchWithFlag(view, logicalPos)
        lastStep = { direction, blockStart: block.start, phase: 'logical' }
        event.preventDefault()
        options.pushLog('homeEnd', `${direction} skip-to-logical pos=${logicalPos}`)
        return true
      }
      // 既に論理行端にもいる — 何もしない
      lastStep = { direction, blockStart: block.start, phase: 'logical' }
      event.preventDefault()
      options.pushLog('homeEnd', `${direction} already at logical edge`)
      return true
    }

    dispatchWithFlag(view, clamped)
    if (direction === 'end') nudgeCaretToLineEnd(view)
    lastStep = { direction, blockStart: block.start, phase: 'visual' }
    event.preventDefault()
    options.pushLog('homeEnd', `${direction} visual pos=${clamped}`)
    return true
  }

  // DOM ベース取得に失敗 — 論理行端へフォールバック
  const fallbackPos = direction === 'home' ? block.start : block.end
  if (fallbackPos !== cursorPos) {
    dispatchWithFlag(view, fallbackPos)
  }
  lastStep = { direction, blockStart: block.start, phase: 'logical' }
  event.preventDefault()
  options.pushLog('homeEnd', `${direction} fallback-logical pos=${fallbackPos}`)
  return true
}

// ---- テスト / 内部検査用エクスポート ------------------------------------

/** テスト用: 現在の2段階状態を返す */
export function _getHomeEndState(): StepState | null {
  return lastStep ? { ...lastStep } : null
}
