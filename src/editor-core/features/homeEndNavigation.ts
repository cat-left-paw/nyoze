/**
 * Home / End 2段階移動 — 通常エディタ専用
 *
 * 1回目: 表示行頭/末（DOM ベース）
 * 2回目: 論理行頭/末（ブロック先頭/末尾）
 *
 * Source Mode / Paragraph Plain はこのモジュールを経由しない。
 */

import type { EditorView } from '@tiptap/pm/view'
import { TextSelection, type Selection, type Transaction } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { resolveRubyAwareVisualLineEdge } from './rubyHomeEndVisualEdge'

// ---- 2段階状態 --------------------------------------------------------

export type HomeEndNavigationPhase = 'visual' | 'logical'
export type HomeEndNavigationDirection = 'home' | 'end'
export type HomeEndNavigationDomAffinity = 'line-end' | null

interface StepState {
  direction: HomeEndNavigationDirection
  /** カーソルが属するブロック(論理行)の doc 内 pos */
  blockStart: number
  phase: HomeEndNavigationPhase
}

export type HomeEndNavigationCommandPlan = {
  readonly expectedDoc: ProseMirrorNode
  readonly expectedSelection: Selection
  readonly expectedTransactionCount: 0 | 1
  readonly moved: boolean
  readonly boundaryNoop: boolean
  readonly homeEndPhaseResult: HomeEndNavigationPhase
  readonly endAffinity: HomeEndNavigationDomAffinity
}

export type HomeEndNavigationCommandResult =
  | ({ readonly handled: true } & HomeEndNavigationCommandPlan)
  | { readonly handled: false }

let lastStep: StepState | null = null

/**
 * 自己起因の selection 変更中の深さ。
 * handleHomeEndKey の dispatch に加え、局所 IME slot の teardown / re-arm 由来の
 * onSelectionUpdate でも 2 段階状態を消さないために使う（depth counter）。
 */
let selfMutationDepth = 0

/**
 * 直近の Home/End が置いた selection.from。
 * slot teardown / re-arm が同じ位置で onSelectionUpdate を再発火しても
 * 2 段階 state を消さない。位置が変わったときだけ reset する。
 */
let lastHomeEndSelectionFrom: number | null = null

/** 外部から呼ぶリセット（タブ切替・文書ロード・plain mode 切替など） */
export function resetHomeEndState(): void {
  lastStep = null
  lastHomeEndSelectionFrom = null
}

/** slot Home/End handoff 全体を囲み、teardown / focus 復帰でも lastStep を保つ。 */
export function beginHomeEndSelectionMutation(): void {
  selfMutationDepth += 1
}

export function endHomeEndSelectionMutation(): void {
  selfMutationDepth = Math.max(0, selfMutationDepth - 1)
}

export function runWithHomeEndSelectionMutation<T>(fn: () => T): T {
  beginHomeEndSelectionMutation()
  try {
    return fn()
  } finally {
    endHomeEndSelectionMutation()
  }
}

/**
 * onSelectionUpdate から呼ばれる。
 * 自己起因（Home/End dispatch / slot handoff 保護区間）の場合はスキップし、
 * 外部起因で selection 位置が変わった場合だけ 2 段階状態をリセットする。
 * `selectionFrom` が直近 Home/End と同じなら、slot re-arm の echo として残す。
 */
export function notifySelectionChanged(selectionFrom?: number): void {
  if (selfMutationDepth > 0) return
  if (
    selectionFrom !== undefined &&
    lastHomeEndSelectionFrom !== null &&
    selectionFrom === lastHomeEndSelectionFrom
  ) {
    return
  }
  lastStep = null
  lastHomeEndSelectionFrom = null
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
  direction: HomeEndNavigationDirection,
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

/** selfMutationDepth を管理しつつ dispatch する */
function dispatchWithFlag(
  view: EditorView,
  pos: number,
  dispatchTransaction: (transaction: Transaction) => void,
): void {
  const tr = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, pos),
  )
  lastHomeEndSelectionFrom = pos
  beginHomeEndSelectionMutation()
  try {
    dispatchTransaction(tr.scrollIntoView())
  } finally {
    endHomeEndSelectionMutation()
  }
}

/**
 * PM dispatch 後、同じpositionを共有する折返し両側のうちEndだけを表示行末へ
 * DOM caret affinity補正する。直前文字へ一度寄せてlineboundaryへ戻す既存authority primitive。
 * Homeは従来のhost DOM selection挙動を維持し、このprimitiveを起動しない。
 * PM の内部 selection pos は変わらない（DOM caret の視覚位置のみ調整）。
 */
export function applyHomeEndNavigationDomAffinity(
  view: EditorView,
  affinity: HomeEndNavigationDomAffinity,
): void {
  if (affinity === null) return
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
  /** test / typed handoff用。production既定は常に `view.dispatch()`。 */
  dispatchTransaction?: (transaction: Transaction) => void
  /** Local Windowはpost-proof/session confirm後の最終同期点までDOM affinityを遅延する。 */
  deferDomAffinity?: boolean
}

/**
 * Home / End キーハンドラ。handled なら true を返す。
 * 通常エディタ用の editorProps.handleKeyDown から呼ばれる。
 */
export function runHomeEndNavigationCommand(
  view: EditorView,
  event: KeyboardEvent,
  options: HandleHomeEndOptions,
): HomeEndNavigationCommandResult {
  if (event.key !== 'Home' && event.key !== 'End') return { handled: false }

  // 修飾キー付き（Shift / Ctrl / Alt / Meta）は標準挙動に委ねる
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
    resetHomeEndState()
    return { handled: false }
  }

  // IME 中は抑止
  if (options.getIsComposing() || event.isComposing) {
    resetHomeEndState()
    return { handled: false }
  }

  const { state } = view
  const { selection } = state

  // collapsed でなければ標準に委ねる
  if (!selection.empty) {
    resetHomeEndState()
    return { handled: false }
  }

  const direction: HomeEndNavigationDirection = event.key === 'Home' ? 'home' : 'end'
  const cursorPos = selection.from
  const expectedDoc = state.doc
  const dispatchTransaction = options.dispatchTransaction ?? ((transaction) => view.dispatch(transaction))

  const complete = (
    targetPos: number,
    phase: HomeEndNavigationPhase,
    logDetail: string,
    endAffinity: HomeEndNavigationDomAffinity = null,
  ): HomeEndNavigationCommandResult => {
    const moved = targetPos !== cursorPos
    const expectedSelection = moved
      ? TextSelection.create(expectedDoc, targetPos)
      : selection
    if (moved) dispatchWithFlag(view, targetPos, dispatchTransaction)
    else lastHomeEndSelectionFrom = cursorPos
    lastStep = { direction, blockStart: block!.start, phase }
    event.preventDefault()
    options.pushLog('homeEnd', logDetail)
    if (!options.deferDomAffinity) applyHomeEndNavigationDomAffinity(view, endAffinity)
    return {
      handled: true,
      expectedDoc,
      expectedSelection,
      expectedTransactionCount: moved ? 1 : 0,
      moved,
      boundaryNoop: !moved && phase === 'logical',
      homeEndPhaseResult: phase,
      endAffinity,
    }
  }

  const block = resolveBlockRange(view, cursorPos)
  if (!block) {
    resetHomeEndState()
    return { handled: false }
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
    return complete(targetPos, 'logical', `${direction} logical pos=${targetPos}`)
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
        return complete(
          logicalPos,
          'logical',
          `${direction} skip-to-logical pos=${logicalPos}`,
        )
      }
      // 既に論理行端にもいる — 何もしない
      return complete(
        cursorPos,
        'logical',
        `${direction} already at logical edge`,
      )
    }

    return complete(
      clamped,
      'visual',
      `${direction} visual pos=${clamped}`,
      direction === 'end' ? 'line-end' : null,
    )
  }

  // DOM ベース取得に失敗 — 論理行端へフォールバック
  const fallbackPos = direction === 'home' ? block.start : block.end
  return complete(
    fallbackPos,
    'logical',
    `${direction} fallback-logical pos=${fallbackPos}`,
  )
}

export function handleHomeEndKey(
  view: EditorView,
  event: KeyboardEvent,
  options: HandleHomeEndOptions,
): boolean {
  return runHomeEndNavigationCommand(view, event, options).handled
}

// ---- テスト / 内部検査用エクスポート ------------------------------------

/** テスト用: 現在の2段階状態を返す */
export function _getHomeEndState(): StepState | null {
  return lastStep ? { ...lastStep } : null
}
