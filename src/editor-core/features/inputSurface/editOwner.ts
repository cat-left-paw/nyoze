import type { Node as PMNode } from '@tiptap/pm/model'
import type { NavigationOp, NavigationReceipt } from './navigation/rules'
import type { SelectionMirror } from './selectionMirror'
import type { CommitTargetRestriction } from './commitTargetRestriction'
export type { NavigationOp, NavigationReceipt } from './navigation/rules'
export type { CommitTargetRestriction } from './commitTargetRestriction'

export type OwnerInsertionSnapshot = {
  readonly identity: string
  readonly docRef: PMNode
  readonly from: number
  readonly to: number
}
/**
 * `protected-target`: 確定先の位置だけで拒否される場面（`CommitTargetRestriction`: TCYの保護、付箋のマーカーを含む範囲、
 * 段落を置けないblockのatomの直後）。直接入力は捨て、compositionの確定は保持する。
 */
export type OwnerCommitReceipt = 'committed' | 'stale' | 'newline-in-payload' | 'dispatch-rejected' | 'protected-target'
export type OwnerCaretGeometry = { left: number; right: number; top: number; bottom: number }
/** 変換中の文字をownerの表示と同じ位置へ組むための、前後の文脈（表示専用。INLINE-2）。 */
export type OwnerPreeditContext = {
  readonly before: string
  readonly after: string
  /** 文脈の1行目の行と、挿入位置の行の距離（block方向、px、0以上）。 */
  readonly blockOffset: number
  /** 文脈の1行目の字下げ（CSSの値）。 */
  readonly indent: string
  /** 後ろを打ち切った場合は`wrap`、段落末まで含む場合はownerの`text-wrap`。 */
  readonly textWrap: string
}

/** Owner-neutral editing port. Document-action integration is reserved for S6. */
export interface EditOwner {
  readonly kind: 'host' | 'local-window'
  readonly identity: string
  snapshotInsertion(): OwnerInsertionSnapshot | null
  proveSnapshot(snapshot: OwnerInsertionSnapshot): boolean
  commitText(snapshot: OwnerInsertionSnapshot, text: string, unchangedOriginal?: SelectionMirror | null): OwnerCommitReceipt
  /**
   * PIS-INPUT-BLOCK-WARN1: 確定先の位置だけで確定が拒否されるか。`commitText`の拒否（`protected-target`）と、
   * 入力面の事前の判定（直接入力のbeforeinput、変換のcompositionstart）が、この1つの関数を呼ぶ。位置の局所だけを読む。
   */
  resolveCommitTargetRestriction?(snapshot: OwnerInsertionSnapshot): CommitTargetRestriction | null
  /** 再変換へ渡せるtext-only範囲。DOMを読まない。 */
  selectionMirror?(): SelectionMirror | null
  presentComposition?(text: string | null, snapshot?: OwnerInsertionSnapshot): void
  /** `presentComposition`の予約領域が実際に表示されている。 */
  isCompositionPresented?(): boolean
  /** 折り返しの位置で、挿入位置のcaretが前の行の行末側に表示されている（S3の行末のaffinity）。 */
  insertionCaretAtWrapEnd?(): boolean
  /** 予約領域の最初の文字の矩形（ownerのlayoutから読むだけ）。読めなければnull。 */
  compositionPresentationRect?(): OwnerCaretGeometry | null
  /** 予約領域を置く前のlayoutから読む。単純な文字の文脈と証明できなければnull。 */
  insertionPreeditContext?(): OwnerPreeditContext | null
  handleKeyDown(event: KeyboardEvent): 'handled' | 'unhandled'
  handleClipboardCopyCut(event: ClipboardEvent): boolean
  handleClipboardPaste(event: ClipboardEvent, plain: boolean): boolean
  navigate(op: NavigationOp): NavigationReceipt
  clearNavigationGoal(): void
  caretRect(purpose?: 'pseudo-caret'): OwnerCaretGeometry | null
  insertionCaretRect(): OwnerCaretGeometry | null
  insertionTextblock(): HTMLElement | null
  nextMarkNames(): readonly string[]
  revealInsertionPosition(): boolean
  caretElement(): Element
  setPointerAffinity(point: { x: number; y: number }): void
  rangeForPresentation(): Range | null
  prepareForPointerGesture(): 'ready' | 'blocked'
}
