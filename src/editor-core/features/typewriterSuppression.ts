export const TYPEWRITER_MANUAL_SCROLL_SUPPRESS_MS = 140

/** Home / End / Page / outline / search / click / fold / viewport 復元などのジャンプ直後に follow を止める */
export const TYPEWRITER_JUMP_NAVIGATION_SUPPRESS_MS = 130

/** エディタ上の primary click 直後（キャレット移動のみ想定）。drag 終了も含むが非空選択時は follow 対象外 */
export const TYPEWRITER_POINTER_CLICK_SUPPRESS_MS = 100

/**
 * Typewriter follow を止めるジャンプ系の発火源（ログ・テスト用の識別子）。
 * Arrow / 通常入力の follow 意図とは別軸で扱う。
 */
export type TypewriterJumpNavigationSource =
  | 'home-end-page'
  | 'page-up-down'
  | 'outline-search-scroll'
  | 'pointer-click'
  | 'fold-toggle'
  | 'viewport-restore'
  | 'programmatic-scroll'

export type TypewriterArrowNavigationKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'

export type TypewriterFollowIntent =
  | 'arrow-navigation'
  | 'text-input'
  | 'text-delete'
  | 'text-enter'

export type TypewriterArrowNavigationIntentContext = {
  key: string
  selectionEmpty: boolean
  isComposing: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  defaultPrevented: boolean
}

export type TypewriterInputIntentContext = {
  inputType: string | null | undefined
  defaultPrevented: boolean
}

export type TypewriterScheduleDecisionContext = {
  enabled: boolean
  docChanged: boolean
  followIntent: TypewriterFollowIntent | null
  selectionEmpty: boolean
  isParagraphPlainActive: boolean
  isSourceModeActive: boolean
  isPointerSelecting: boolean
  isManualScrollSuppressed: boolean
  /** Home/Page/jump/click などの直後ウィンドウ。手動スクロール抑制とは独立 */
  isJumpNavigationSuppressed: boolean
}

export type TypewriterRunDecisionContext = Omit<
  TypewriterScheduleDecisionContext,
  'docChanged' | 'followIntent'
>

export function resolveTypewriterArrowNavigationKey(
  key: string,
): TypewriterArrowNavigationKey | null {
  if (
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight'
  ) {
    return key
  }
  return null
}

export function resolveTypewriterArrowNavigationIntent(
  context: TypewriterArrowNavigationIntentContext,
): TypewriterFollowIntent | null {
  const arrowKey = resolveTypewriterArrowNavigationKey(context.key)
  if (!arrowKey) return null
  if (!context.selectionEmpty) return null
  if (context.isComposing) return null
  if (context.metaKey || context.ctrlKey || context.altKey || context.shiftKey) return null
  if (context.defaultPrevented) return null
  return 'arrow-navigation'
}

export function resolveTypewriterInputIntent(
  context: TypewriterInputIntentContext,
): TypewriterFollowIntent | null {
  if (context.defaultPrevented) return null
  const inputType = context.inputType ?? ''
  if (
    inputType === 'insertText' ||
    inputType === 'insertCompositionText' ||
    inputType === 'insertFromComposition'
  ) {
    return 'text-input'
  }
  if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
    return 'text-enter'
  }
  if (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') {
    return 'text-delete'
  }
  return null
}

export function shouldScheduleTypewriterFollowOnUpdate(
  context: TypewriterScheduleDecisionContext,
): boolean {
  if (!context.enabled) return false
  if (!context.docChanged && context.followIntent === null) return false
  return shouldRunTypewriterFollowNow(context)
}

export function shouldRunTypewriterFollowNow(
  context: TypewriterRunDecisionContext,
): boolean {
  if (!context.enabled) return false
  if (!context.selectionEmpty) return false
  if (context.isParagraphPlainActive) return false
  if (context.isSourceModeActive) return false
  if (context.isPointerSelecting) return false
  if (context.isManualScrollSuppressed) return false
  if (context.isJumpNavigationSuppressed) return false
  return true
}
