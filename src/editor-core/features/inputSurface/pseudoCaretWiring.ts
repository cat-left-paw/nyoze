import type { PseudoCaretControllerHandle } from '../pseudoCaretController'
import type { NavigationOp } from './editOwner'

/** 変換中の文字のcaretのDOMの位置を返す入口（入力面が持つ。変換中で、文字があり、DOMの選択が入力面の中にあるときだけ返る）。 */
type CompositionCaretSource = () => { root: HTMLElement; node: Node; offset: number } | null

/** 既存display controllerへの通知だけ。新しいscheduler・ownershipを持たない。 */
export function createInputSurfaceDisplayCallbacks(options: {
  pseudoCaretController: PseudoCaretControllerHandle | null
  visualFocusController: {
    scheduleUpdate(): void
    noteInputSurfaceDisplayChange?(): void
    setCompositionCaretSource?(source: CompositionCaretSource | null): void
  } | null
  typewriterModeController: {
    isEnabled(): boolean
    hasScheduledArrowFollow(): boolean
    setNavigationRevealAfterFollow(reveal: () => void): void
    noteBeforeInput(event: Pick<InputEvent, 'inputType' | 'defaultPrevented'>): boolean
    setCompositionCaretSource(source: CompositionCaretSource | null): void
    noteInputSurfaceDisplayChange(): void
    noteKeyboardNavigationIntent(event: KeyboardEvent): void
    noteJumpNavigationSuppress(kind: 'home-end-page' | 'page-up-down'): void
  } | null
  onCompositionFinished(): void
}) {
  return {
    deferNavigationReveal(createReveal: () => () => void): boolean {
      const controller = options.typewriterModeController
      // OFFでは予約状態の入口も読まない。未予約の操作は従来の同期reveal。
      if (!controller?.isEnabled() || !controller.hasScheduledArrowFollow()) return false
      controller.setNavigationRevealAfterFollow(createReveal())
      return true
    },
    onBeforeInput(event: InputEvent) {
      if (options.typewriterModeController?.isEnabled()) options.typewriterModeController.noteBeforeInput(event)
    },
    onCompositionFinished() {
      options.visualFocusController?.scheduleUpdate()
      options.pseudoCaretController?.scheduleUpdate()
      options.onCompositionFinished()
    },
    onDisplayChange: (reason?: 'geometry') => {
      options.pseudoCaretController?.scheduleUpdate()
      // PIS-S10-CURRENT-LINE2 (a): 変換の更新（文字・caretの変化）を、現在行の帯へ渡す。帯の側が、現在行の表示がONで
      // 変換中のときだけ、既存の1つのrAFで更新する。timer・新しいrAFは持たない。
      options.visualFocusController?.noteInputSurfaceDisplayChange?.()
      // scroll・reveal後の位置合わせは、入力の更新ではない。手動scrollの後にfollowを再予約しない。
      if (reason !== 'geometry') options.typewriterModeController?.noteInputSurfaceDisplayChange()
    },
    /** 入力面の生成のときに、変換中の文字のcaretの位置を返す入口を、帯のcontrollerへ渡す（破棄でnull）。 */
    onCompositionCaretSource: (source: CompositionCaretSource | null) => {
      options.visualFocusController?.setCompositionCaretSource?.(source)
      options.typewriterModeController?.setCompositionCaretSource(source)
    },
    onNavigationIntent(event: KeyboardEvent, op: NavigationOp) {
      options.typewriterModeController?.noteKeyboardNavigationIntent(event)
      if (op.axis === 'line-edge' || op.axis === 'document') options.typewriterModeController?.noteJumpNavigationSuppress('home-end-page')
      if (op.axis === 'page') options.typewriterModeController?.noteJumpNavigationSuppress('page-up-down')
      options.pseudoCaretController?.noteKeyboardNavigationIntent(event)
    },
  }
}
