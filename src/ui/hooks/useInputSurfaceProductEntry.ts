/**
 * PIS-S10-ENTRY1a: 製品の入口の方式がPersistent Input Surfaceのときのadapter。
 *
 * - あるべき方式は、mainの固定値と設定から、pureな決定関数が決める。
 * - 実際の方式は`inputPathRuntime`が持つ。**switchとcheckboxの表示は、設定の値ではなく実際の方式から出す**
 *   （切り替えが止められた・失敗したときに、表示と実際が食い違わない）。
 * - 明示の操作は、止められたらnoticeを出す。設定の同期（読み込み）は、止められても何も出さず、
 *   自動で再試行しない。
 * - Local Windowのruntime（AUTOARM、recovery port）には触れない。
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { requestLocalImeDocumentActionWithOwner } from '../../editor-core/features/localImeDocumentActionBarrier'
import {
  readClassicInputPathPreference,
  resolveInputPathDecision,
} from '../../editor-core/features/inputPathDecision'
import {
  consumeDeferredInputSurfaceCreationFailure,
  getInputPath,
  readInputStrategyCapability,
  readInputSurfaceComposition,
  requestInputPathChange,
  subscribeInputPath,
} from '../../editor-core/features/inputSurface/inputPathRuntime'
import { getInputSurfaceNoticeSnapshot } from '../../editor-core/features/inputSurface/documentAction'
import { setInputSurfaceAccessibleName, setInputSurfacePreeditDisplay } from '../../editor-core/features/inputSurface/surfacePreferences'
import type { LocalImeExperimentalPreviewControls } from '../../editor-core/features/localImeExperimentalPreviewState'
import { getUiText } from '../i18n/uiText'
import { resolveInputPathSwitchBlocked, type InputPathSwitchBlockedInput, type InputPathSwitchBlockedReason } from './inputPathSwitchNotice'
import {
  LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON,
  type LocalImeExperimentalPreviewView,
  type ProductEntryOptions,
} from './localImeExperimentalPreviewView'

const NO_CONTROLS: LocalImeExperimentalPreviewControls = {
  showStop: false,
  showRetry: false,
  showForceReset: false,
  showAttentionNotice: false,
  recoveryHasRetainedPayload: false,
  showHaltedNotice: false,
}
const noop = () => undefined

export function useInputSurfaceProductEntry(options: ProductEntryOptions): LocalImeExperimentalPreviewView {
  const { preferenceEnabled, setPreferenceEnabled, preeditDisplay, setPreeditDisplay, uiLanguageMode } = options
  const [capability] = useState(readInputStrategyCapability)
  // ENTRY-UI1: 止めた理由（文を選ぶ）。止めていなければnull。
  const [switchBlocked, setSwitchBlocked] = useState<InputPathSwitchBlockedReason | null>(null)
  const decision = useMemo(
    () => resolveInputPathDecision({
      capability,
      preferredPath: readClassicInputPathPreference(!preferenceEnabled),
    }),
    [capability, preferenceEnabled],
  )
  const actualOn = useSyncExternalStore(subscribeInputPath, getInputPath) === 'input-surface'

  // E4: 入力面で変換中のOFFが止められた後。**同じ変換が続いている間に**もう一度OFFを選んだら確認を出す。
  // 止められたときの変換の番号を持つ（変換が終わって別の変換になれば、数え直す）。
  const offAwaitingCompositionRef = useRef<number | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const clearDiscardOffer = useCallback(() => { offAwaitingCompositionRef.current = null; setConfirmDiscard(false) }, [])

  // ENTRY-UI1・PREEDIT-DISPLAY1: 入力面へ渡す値（入力面はsettingsもi18nも読まない）。
  // 変換中の文字の表示は、入力面が次の`compositionstart`で読む。名前は、変わったらその場で書き直される。
  useEffect(() => { setInputSurfacePreeditDisplay(preeditDisplay) }, [preeditDisplay])
  useEffect(() => { setInputSurfaceAccessibleName(getUiText(uiLanguageMode, 'inputSurface.accessibleName')) }, [uiLanguageMode])
  /** 止めた理由から文を決める。E4の確認（同じ変換のまま2回目のOFF）もここで数える。 */
  const block = useCallback((input: InputPathSwitchBlockedInput) => {
    const decision = resolveInputPathSwitchBlocked(input)
    if (decision.kind === 'offer-discard') {
      setConfirmDiscard(offAwaitingCompositionRef.current === decision.cycle)
      offAwaitingCompositionRef.current = decision.cycle
      setSwitchBlocked(null)
      return
    }
    clearDiscardOffer()
    setSwitchBlocked(decision.kind === 'notice' ? decision.reason : null)
  }, [clearDiscardOffer])

  // 設定の同期（読み込み・ほかの入口からの変更）。止められても方式は変えず、再試行しない。
  // 入力面を作れなかった・最初のfocusに失敗したときだけ、設定をOFFへ戻す（表示と設定を実際に合わせる）。
  useEffect(() => {
    if (!decision.settingInteractive) return
    if (decision.path === getInputPath()) return
    const outcome = requestInputPathChange(decision.path)
    if (!outcome.ok && decision.path === 'input-surface' && (outcome.reason === 'create-failed' || outcome.reason === 'focus-failed')) setPreferenceEnabled(false)
  }, [decision.path, decision.settingInteractive, setPreferenceEnabled])
  // 後へ回した入力面の生成（Paragraph Plainを出たとき）が失敗して、方式が従来の入力へ戻された場合。
  // 1回だけ読める通知で受ける（診断の値は制御に使わない）。
  useEffect(() => {
    if (!actualOn && consumeDeferredInputSurfaceCreationFailure()) setPreferenceEnabled(false)
  }, [actualOn, setPreferenceEnabled])

  const onChangeEnabled = useCallback((next: boolean) => {
    if (!decision.settingInteractive) return
    const nextPath = next ? 'input-surface' : 'host'
    if (getInputPath() === nextPath) {
      // すでにその方式。設定の値だけが食い違っていれば合わせる。
      setSwitchBlocked(null)
      clearDiscardOffer()
      setPreferenceEnabled(next)
      return
    }
    if (!next) {
      // 入力面で変換中・保持文字あり・文書の操作の途中は、既存のbarrierが止めて、入力面のnoticeを出す。
      // 自動では続けない。
      const preparation = requestLocalImeDocumentActionWithOwner(LOCAL_IME_EXPERIMENTAL_PREVIEW_DISABLE_REASON)
      if (preparation.result.status !== 'ready') {
        // 保持文字のない変換は、同じ変換のまま2回目のOFFで、破棄して切り替えるかを確認する（E4）。
        // 保持文字と同居している変換は、E4では破棄できない。確認を出さず、止められた切り替えのnoticeにする。
        block({
          source: 'barrier', ownerId: preparation.ownerId, status: preparation.result.status,
          composition: readInputSurfaceComposition(), surfaceNoticeKind: getInputSurfaceNoticeSnapshot().kind,
        })
        return
      }
    }
    clearDiscardOffer()
    const outcome = requestInputPathChange(nextPath)
    if (!outcome.ok) {
      block({ source: 'switch', reason: outcome.reason, composition: readInputSurfaceComposition(), surfaceNoticeKind: getInputSurfaceNoticeSnapshot().kind })
      return
    }
    setSwitchBlocked(null)
    setPreferenceEnabled(next)
  }, [block, clearDiscardOffer, decision.settingInteractive, setPreferenceEnabled])

  /** E4: 利用者が確認した。変換中の文字を破棄して、従来の入力へ切り替える。Hostへ確定しない。 */
  const onConfirmDiscardComposition = useCallback(() => {
    // 確認を出したときと同じ変換が続いている場合だけ、破棄する。別の変換になっていれば破棄しない。
    const awaited = offAwaitingCompositionRef.current
    const composition = readInputSurfaceComposition()
    const sameComposition = awaited !== null && composition?.cycle === awaited && composition.discardable
    clearDiscardOffer()
    if (getInputPath() !== 'input-surface') return
    const outcome = requestInputPathChange('host', sameComposition ? { discardComposition: true } : undefined)
    if (!outcome.ok) {
      block({ source: 'switch', reason: outcome.reason, composition: readInputSurfaceComposition(), surfaceNoticeKind: getInputSurfaceNoticeSnapshot().kind })
      return
    }
    setSwitchBlocked(null)
    setPreferenceEnabled(false)
  }, [block, clearDiscardOffer, setPreferenceEnabled])

  return {
    settingVisible: decision.settingVisible,
    settingInteractive: decision.settingInteractive,
    preferenceEnabled,
    effectiveEnabled: decision.settingVisible && actualOn,
    runtimeState: decision.settingVisible && actualOn ? 'enabled-waiting' : 'disabled',
    toggleOn: decision.settingVisible && actualOn,
    productStatus: 'inactive',
    controls: NO_CONTROLS,
    forceResetPending: false,
    recoveryDraftCopyAvailable: false,
    notice: confirmDiscard && actualOn ? 'confirm-discard-composition' : switchBlocked ? 'switch-blocked' : null,
    switchBlockedReason: confirmDiscard && actualOn ? null : switchBlocked,
    inputSurface: { classicInputOn: !actualOn, onChangeClassicInput: (next) => onChangeEnabled(!next), preeditDisplay, onChangePreeditDisplay: setPreeditDisplay },
    onChangeEnabled,
    onStopSession: noop,
    onRetryRecovery: noop,
    onCopyRecoveryDraft: noop,
    onRequestForceReset: noop,
    onConfirmForceReset: onConfirmDiscardComposition,
    onCancelForceReset: clearDiscardOffer,
    onDismissNotice: () => { setSwitchBlocked(null); clearDiscardOffer() },
  }
}
