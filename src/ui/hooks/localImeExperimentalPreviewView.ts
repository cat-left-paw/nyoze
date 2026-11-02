/**
 * 「長文編集モード（実験的）」の製品の入口が設定UIへ渡すviewの型。方式ごとのadapterが共有する。
 */
import type { LocalImeLocalWindowProductRuntimeState } from '../../editor-core/features/localImeLocalWindowRuntimeState'
import type {
  LocalImeExperimentalPreviewControls,
  LocalImeExperimentalPreviewProductStatus,
} from '../../editor-core/features/localImeExperimentalPreviewState'
import type { ExperimentalInputSurfacePreeditDisplay, UiLanguageMode } from '../../settings/types'
import type { InputPathSwitchBlockedReason } from './inputPathSwitchNotice'

export const LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON =
  'experimental-local-ime-preview-disable'

export type LocalImeExperimentalPreviewNoticeKind =
  | 'attention'
  | 'awaiting-composition'
  | 'busy'
  /** PIS: 切り替えを止めた（方式は変えていない）。 */
  | 'switch-blocked'
  /** PIS（E4）: 変換が終わらないまま、もう一度OFFを選んだ。破棄して切り替えるかの確認。 */
  | 'confirm-discard-composition'

export type LocalImeExperimentalPreviewView = {
  settingVisible: boolean
  settingInteractive: boolean
  preferenceEnabled: boolean
  effectiveEnabled: boolean
  runtimeState: LocalImeLocalWindowProductRuntimeState
  /** recovery-suspended is deliberately false even while the runtime retains draft. */
  toggleOn: boolean
  productStatus: LocalImeExperimentalPreviewProductStatus
  controls: LocalImeExperimentalPreviewControls
  forceResetPending: boolean
  recoveryDraftCopyAvailable: boolean
  notice: LocalImeExperimentalPreviewNoticeKind | null
  /** PIS（ENTRY-UI1）: `notice`が`switch-blocked`のときの理由。文を選ぶ。 */
  switchBlockedReason: InputPathSwitchBlockedReason | null
  /**
   * PIS（ENTRY-UI1・PREEDIT-DISPLAY1）の固有の表示。製品の入口がPISのときだけ非null。
   * Local Windowの開発用の経路はnullで、設定の画面は従来の表示（説明文・「状態」の行）のまま。
   */
  inputSurface: {
    preeditDisplay: ExperimentalInputSurfacePreeditDisplay
    onChangePreeditDisplay: (next: ExperimentalInputSurfacePreeditDisplay) => void
  } | null
  onChangeEnabled: (next: boolean) => void
  onStopSession: () => void
  onRetryRecovery: () => void
  onCopyRecoveryDraft: () => void
  onRequestForceReset: () => void
  onConfirmForceReset: () => void
  onCancelForceReset: () => void
  onDismissNotice: () => void
}

export type ProductEntryOptions = {
  preferenceEnabled: boolean
  setPreferenceEnabled: (next: boolean) => void
  /** PREEDIT-DISPLAY1: 変換中の文字の表示の設定（PISだけが使う）。 */
  preeditDisplay: ExperimentalInputSurfacePreeditDisplay
  setPreeditDisplay: (next: ExperimentalInputSurfacePreeditDisplay) => void
  /** ENTRY-UI1: 入力欄の名前を表示の言語に合わせる（PISだけが使う）。 */
  uiLanguageMode: UiLanguageMode
}
